-- Almacen modular v1 para app-minimarket.
-- Compatible con la estructura existente: productos.stock_actual se mantiene,
-- pero el stock operativo sale de producto_almacen.

create table if not exists public.almacenes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint almacenes_nombre_unique unique (nombre)
);

create table if not exists public.producto_almacen (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  almacen_id uuid not null references public.almacenes(id) on delete restrict,
  stock_actual numeric(10,2) not null default 0 check (stock_actual >= 0),
  stock_minimo_local numeric(10,2),
  costo_promedio numeric(10,2),
  ubicacion_interna text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint producto_almacen_unique unique (producto_id, almacen_id)
);

create table if not exists public.presentaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentaciones_nombre_unique unique (nombre)
);

create table if not exists public.unidades_base (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unidades_base_nombre_unique unique (nombre)
);

insert into public.almacenes (nombre, descripcion)
values
  ('Tienda', 'Almacen principal para venta y preparacion'),
  ('Casa', 'Almacen secundario de reposicion')
on conflict (nombre) do nothing;

insert into public.presentaciones (nombre)
values
  ('paquete'),
  ('caja'),
  ('plancha'),
  ('saco'),
  ('balde'),
  ('java'),
  ('unidad'),
  ('medio saco'),
  ('bolsa'),
  ('botella'),
  ('bidon'),
  ('doypack'),
  ('frasco'),
  ('lata'),
  ('sobre'),
  ('sachet'),
  ('pote')
on conflict (nombre) do nothing;

insert into public.unidades_base (nombre)
values
  ('litro'),
  ('kilo'),
  ('gramo'),
  ('mililitro'),
  ('unidad'),
  ('sachet'),
  ('casillero'),
  ('paquete'),
  ('bolsa'),
  ('caja')
on conflict (nombre) do nothing;

alter table public.productos
  alter column stock_minimo set default 10,
  alter column precio_venta set default 1.00,
  alter column activo set default true;

update public.productos
set stock_minimo = 10
where stock_minimo is null;

update public.productos
set precio_venta = 1.00
where precio_venta is null;

alter table public.clientes
  add column if not exists direccion_entrega text;

update public.clientes
set direccion_entrega = direccion
where direccion_entrega is null and direccion is not null;

alter table public.pedidos
  add column if not exists tipo_entrega text not null default 'recoger_despues',
  add column if not exists direccion_entrega text,
  add column if not exists referencia_entrega text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_tipo_entrega_check'
      and conrelid = 'public.pedidos'::regclass
  ) then
    alter table public.pedidos
      add constraint pedidos_tipo_entrega_check
      check (tipo_entrega in ('llevar_ahora', 'recoger_despues', 'enviar'));
  end if;
end $$;

alter table public.detalle_pedido
  add column if not exists almacen_id uuid references public.almacenes(id) on delete restrict,
  add column if not exists marcado_por_id uuid,
  add column if not exists fecha_marcado timestamptz;

alter table public.stock_movimientos
  add column if not exists almacen_origen_id uuid references public.almacenes(id) on delete set null,
  add column if not exists almacen_destino_id uuid references public.almacenes(id) on delete set null,
  add column if not exists tipo_movimiento text,
  add column if not exists costo_unitario numeric(10,2),
  add column if not exists referencia text,
  add column if not exists usuario_id uuid,
  add column if not exists observacion text;

update public.stock_movimientos
set tipo_movimiento = case tipo
  when 'entrada' then 'ingreso'
  when 'salida' then 'salida_pedido'
  when 'venta' then 'salida_pedido'
  else tipo
end
where tipo_movimiento is null;

update public.stock_movimientos
set observacion = motivo
where observacion is null and motivo is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_movimientos_tipo_movimiento_check'
      and conrelid = 'public.stock_movimientos'::regclass
  ) then
    alter table public.stock_movimientos
      add constraint stock_movimientos_tipo_movimiento_check
      check (
        tipo_movimiento in (
          'ingreso',
          'salida_venta',
          'salida_pedido',
          'ajuste',
          'transferencia',
          'merma',
          'devolucion'
        )
      );
  end if;
end $$;

insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
select p.id, a.id, coalesce(p.stock_actual, 0)
from public.productos p
cross join public.almacenes a
where a.nombre = 'Tienda'
on conflict (producto_id, almacen_id) do nothing;

insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
select p.id, a.id, 0
from public.productos p
cross join public.almacenes a
where a.nombre = 'Casa'
on conflict (producto_id, almacen_id) do nothing;

create or replace function public.sync_producto_stock_actual(producto_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.productos p
  set stock_actual = coalesce((
    select sum(pa.stock_actual)
    from public.producto_almacen pa
    where pa.producto_id = producto_uuid
  ), 0)
  where p.id = producto_uuid;
end;
$$;

create or replace function public.sync_producto_stock_actual_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_producto_stock_actual(old.producto_id);
    return old;
  end if;

  perform public.sync_producto_stock_actual(new.producto_id);
  return new;
end;
$$;

drop trigger if exists sync_producto_stock_actual_on_producto_almacen on public.producto_almacen;
create trigger sync_producto_stock_actual_on_producto_almacen
after insert or update or delete on public.producto_almacen
for each row execute function public.sync_producto_stock_actual_trigger();

create trigger set_almacenes_updated_at
before update on public.almacenes
for each row execute function public.set_updated_at();

create trigger set_producto_almacen_updated_at
before update on public.producto_almacen
for each row execute function public.set_updated_at();

create trigger set_presentaciones_updated_at
before update on public.presentaciones
for each row execute function public.set_updated_at();

create trigger set_unidades_base_updated_at
before update on public.unidades_base
for each row execute function public.set_updated_at();

create index if not exists idx_producto_almacen_producto
on public.producto_almacen (producto_id);

create index if not exists idx_producto_almacen_almacen
on public.producto_almacen (almacen_id);

create index if not exists idx_stock_movimientos_created_at
on public.stock_movimientos (created_at desc);

create index if not exists idx_stock_movimientos_producto
on public.stock_movimientos (producto_id);

create index if not exists idx_detalle_pedido_almacen
on public.detalle_pedido (almacen_id);

create or replace function public.get_almacen_id(nombre_almacen text)
returns uuid
language sql
stable
as $$
  select id
  from public.almacenes
  where lower(nombre) = lower(nombre_almacen)
  limit 1;
$$;

create or replace function public.transferir_stock(
  p_producto_id uuid,
  p_almacen_origen_id uuid,
  p_almacen_destino_id uuid,
  p_cantidad numeric,
  p_observacion text default null,
  p_usuario_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_origen numeric(10,2);
  stock_destino numeric(10,2);
begin
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if p_almacen_origen_id = p_almacen_destino_id then
    raise exception 'El almacen origen y destino deben ser distintos';
  end if;

  insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
  values (p_producto_id, p_almacen_origen_id, 0)
  on conflict (producto_id, almacen_id) do nothing;

  insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
  values (p_producto_id, p_almacen_destino_id, 0)
  on conflict (producto_id, almacen_id) do nothing;

  select stock_actual
  into stock_origen
  from public.producto_almacen
  where producto_id = p_producto_id and almacen_id = p_almacen_origen_id
  for update;

  if stock_origen < p_cantidad then
    raise exception 'Stock insuficiente en almacen origen. Stock actual: %, requerido: %',
      stock_origen,
      p_cantidad;
  end if;

  update public.producto_almacen
  set stock_actual = stock_actual - p_cantidad
  where producto_id = p_producto_id and almacen_id = p_almacen_origen_id;

  select stock_actual
  into stock_destino
  from public.producto_almacen
  where producto_id = p_producto_id and almacen_id = p_almacen_destino_id
  for update;

  update public.producto_almacen
  set stock_actual = stock_actual + p_cantidad
  where producto_id = p_producto_id and almacen_id = p_almacen_destino_id;

  insert into public.stock_movimientos (
    producto_id,
    almacen_origen_id,
    almacen_destino_id,
    tipo,
    tipo_movimiento,
    cantidad,
    stock_anterior,
    stock_nuevo,
    motivo,
    observacion,
    usuario_id,
    registrado_por_id
  )
  values (
    p_producto_id,
    p_almacen_origen_id,
    p_almacen_destino_id,
    'ajuste',
    'transferencia',
    p_cantidad,
    stock_origen,
    stock_origen - p_cantidad,
    'Transferencia entre almacenes',
    p_observacion,
    p_usuario_id,
    p_usuario_id
  );
end;
$$;

create or replace function public.ajustar_stock(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_stock_contado numeric,
  p_observacion text default null,
  p_usuario_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_previo numeric(10,2);
  diferencia numeric(10,2);
begin
  if p_stock_contado < 0 then
    raise exception 'El stock contado no puede ser negativo';
  end if;

  insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
  values (p_producto_id, p_almacen_id, 0)
  on conflict (producto_id, almacen_id) do nothing;

  select stock_actual
  into stock_previo
  from public.producto_almacen
  where producto_id = p_producto_id and almacen_id = p_almacen_id
  for update;

  diferencia := p_stock_contado - stock_previo;

  update public.producto_almacen
  set stock_actual = p_stock_contado
  where producto_id = p_producto_id and almacen_id = p_almacen_id;

  insert into public.stock_movimientos (
    producto_id,
    almacen_destino_id,
    tipo,
    tipo_movimiento,
    cantidad,
    stock_anterior,
    stock_nuevo,
    motivo,
    observacion,
    usuario_id,
    registrado_por_id
  )
  values (
    p_producto_id,
    p_almacen_id,
    'ajuste',
    'ajuste',
    abs(diferencia),
    stock_previo,
    p_stock_contado,
    'Ajuste manual de inventario',
    p_observacion,
    p_usuario_id,
    p_usuario_id
  );
end;
$$;

create or replace function public.descontar_stock_pedido_en_preparacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  tienda_id uuid;
  almacen_salida uuid;
  stock_previo numeric(10,2);
  stock_final numeric(10,2);
begin
  if new.estado = 'en_preparacion'
     and old.estado is distinct from 'en_preparacion'
     and new.stock_descontado = false then

    tienda_id := public.get_almacen_id('Tienda');

    for item in
      select id, producto_id, cantidad, almacen_id
      from public.detalle_pedido
      where pedido_id = new.id
    loop
      almacen_salida := coalesce(item.almacen_id, tienda_id);

      if almacen_salida is null then
        raise exception 'No existe almacen Tienda para descontar stock';
      end if;

      insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
      values (item.producto_id, almacen_salida, 0)
      on conflict (producto_id, almacen_id) do nothing;

      select stock_actual
      into stock_previo
      from public.producto_almacen
      where producto_id = item.producto_id and almacen_id = almacen_salida
      for update;

      if stock_previo < item.cantidad then
        raise exception 'Stock insuficiente para producto %. Stock actual: %, requerido: %',
          item.producto_id,
          stock_previo,
          item.cantidad;
      end if;

      stock_final := stock_previo - item.cantidad;

      update public.producto_almacen
      set stock_actual = stock_final
      where producto_id = item.producto_id and almacen_id = almacen_salida;

      update public.detalle_pedido
      set almacen_id = almacen_salida
      where id = item.id and almacen_id is null;

      insert into public.stock_movimientos (
        producto_id,
        almacen_origen_id,
        pedido_id,
        tipo,
        tipo_movimiento,
        cantidad,
        stock_anterior,
        stock_nuevo,
        motivo,
        observacion,
        usuario_id,
        registrado_por_id
      )
      values (
        item.producto_id,
        almacen_salida,
        new.id,
        'venta',
        'salida_pedido',
        item.cantidad,
        stock_previo,
        stock_final,
        'Descuento automatico al pasar pedido a en_preparacion',
        'Descuento automatico al pasar pedido a en_preparacion',
        coalesce(new.preparado_por_id, new.registrado_por_id),
        coalesce(new.preparado_por_id, new.registrado_por_id)
      );
    end loop;

    new.stock_descontado := true;
    new.preparado_at := coalesce(new.preparado_at, now());
  end if;

  return new;
end;
$$;

select public.sync_producto_stock_actual(id)
from public.productos;

grant select, insert, update, delete on public.almacenes to anon, authenticated;
grant select, insert, update, delete on public.producto_almacen to anon, authenticated;
grant select, insert, update, delete on public.presentaciones to anon, authenticated;
grant select, insert, update, delete on public.unidades_base to anon, authenticated;
grant execute on function public.transferir_stock(uuid, uuid, uuid, numeric, text, uuid) to anon, authenticated;
grant execute on function public.ajustar_stock(uuid, uuid, numeric, text, uuid) to anon, authenticated;
