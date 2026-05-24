-- Stock por unidad base y precios por paquete.
-- Mantiene los productos existentes y permite enlazar presentaciones como
-- "plancha x6" al producto base que realmente guarda el inventario.

alter table public.productos
  add column if not exists producto_base_id uuid references public.productos(id) on delete set null,
  add column if not exists unidades_equivalentes numeric(10,2) not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_unidades_equivalentes_check'
      and conrelid = 'public.productos'::regclass
  ) then
    alter table public.productos
      add constraint productos_unidades_equivalentes_check
      check (unidades_equivalentes > 0);
  end if;
end $$;

create index if not exists idx_productos_producto_base
on public.productos (producto_base_id);

alter table public.detalle_pedido
  add column if not exists producto_stock_id uuid references public.productos(id) on delete set null,
  add column if not exists cantidad_base numeric(10,2);

create index if not exists idx_detalle_pedido_producto_stock
on public.detalle_pedido (producto_stock_id);

alter table public.producto_precios_mayor
  add column if not exists precio_total numeric(10,2),
  add column if not exists tipo_precio text not null default 'paquete';

update public.producto_precios_mayor
set precio_total = precio_unitario
where precio_total is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'producto_precios_mayor_precio_total_check'
      and conrelid = 'public.producto_precios_mayor'::regclass
  ) then
    alter table public.producto_precios_mayor
      add constraint producto_precios_mayor_precio_total_check
      check (precio_total is null or precio_total >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'producto_precios_mayor_tipo_precio_check'
      and conrelid = 'public.producto_precios_mayor'::regclass
  ) then
    alter table public.producto_precios_mayor
      add constraint producto_precios_mayor_tipo_precio_check
      check (tipo_precio in ('paquete', 'unitario'));
  end if;
end $$;

-- Enlaza el caso detectado: Paracas por unidad/paquete y plancha x6.
do $$
declare
  v_base_id uuid;
begin
  select id
  into v_base_id
  from public.productos
  where lower(nombre_producto) like '%papel%hig%paracas%pack%x4%'
  order by created_at
  limit 1;

  if v_base_id is not null then
    update public.productos
    set producto_base_id = null,
        unidades_equivalentes = 1
    where id = v_base_id;

    update public.productos
    set producto_base_id = v_base_id,
        unidades_equivalentes = 6
    where id <> v_base_id
      and lower(nombre_producto) like '%plancha%papel%hig%paracas%x6%';
  end if;
end $$;

-- Si una presentacion ya tenia stock propio, lo convierte a unidades base
-- y deja la fila derivada en cero para evitar doble conteo.
do $$
declare
  v_row record;
begin
  for v_row in
    select
      p.id as producto_id,
      p.producto_base_id,
      p.unidades_equivalentes,
      pa.almacen_id,
      pa.stock_actual
    from public.productos p
    join public.producto_almacen pa on pa.producto_id = p.id
    where p.producto_base_id is not null
      and pa.stock_actual > 0
  loop
    insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
    values (
      v_row.producto_base_id,
      v_row.almacen_id,
      v_row.stock_actual * v_row.unidades_equivalentes
    )
    on conflict (producto_id, almacen_id)
    do update set stock_actual = public.producto_almacen.stock_actual + excluded.stock_actual;

    update public.producto_almacen
    set stock_actual = 0
    where producto_id = v_row.producto_id
      and almacen_id = v_row.almacen_id;
  end loop;
end $$;

create or replace function public.normalizar_detalle_pedido_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto_stock_id uuid;
  v_unidades_equivalentes numeric(10,2);
begin
  select coalesce(producto_base_id, id), coalesce(unidades_equivalentes, 1)
  into v_producto_stock_id, v_unidades_equivalentes
  from public.productos
  where id = new.producto_id;

  new.producto_stock_id := v_producto_stock_id;
  new.cantidad_base := round((coalesce(new.cantidad, 0) * v_unidades_equivalentes)::numeric, 2);

  return new;
end;
$$;

drop trigger if exists normalizar_detalle_pedido_stock_trigger on public.detalle_pedido;
create trigger normalizar_detalle_pedido_stock_trigger
before insert or update of producto_id, cantidad on public.detalle_pedido
for each row execute function public.normalizar_detalle_pedido_stock();

update public.detalle_pedido d
set producto_stock_id = coalesce(p.producto_base_id, p.id),
    cantidad_base = round((d.cantidad * coalesce(p.unidades_equivalentes, 1))::numeric, 2)
from public.productos p
where p.id = d.producto_id
  and (d.producto_stock_id is null or d.cantidad_base is null);

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
      select
        id,
        producto_id,
        coalesce(producto_stock_id, producto_id) as producto_stock_id,
        coalesce(cantidad_base, cantidad) as cantidad_stock,
        almacen_id
      from public.detalle_pedido
      where pedido_id = new.id
    loop
      almacen_salida := coalesce(item.almacen_id, tienda_id);

      if almacen_salida is null then
        raise exception 'No existe almacen Tienda para descontar stock';
      end if;

      insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
      values (item.producto_stock_id, almacen_salida, 0)
      on conflict (producto_id, almacen_id) do nothing;

      select stock_actual
      into stock_previo
      from public.producto_almacen
      where producto_id = item.producto_stock_id and almacen_id = almacen_salida
      for update;

      if stock_previo < item.cantidad_stock then
        raise exception 'Stock insuficiente para producto %. Stock actual: %, requerido: %',
          item.producto_id,
          stock_previo,
          item.cantidad_stock;
      end if;

      stock_final := stock_previo - item.cantidad_stock;

      update public.producto_almacen
      set stock_actual = stock_final
      where producto_id = item.producto_stock_id and almacen_id = almacen_salida;

      update public.detalle_pedido
      set almacen_id = almacen_salida,
          producto_stock_id = item.producto_stock_id,
          cantidad_base = item.cantidad_stock
      where id = item.id;

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
        item.producto_stock_id,
        almacen_salida,
        new.id,
        'venta',
        'salida_pedido',
        item.cantidad_stock,
        stock_previo,
        stock_final,
        'Descuento automatico al pasar pedido a en_preparacion',
        'Descuento automatico al pasar pedido a en_preparacion',
        coalesce(new.app_preparado_por_id, new.app_registrado_por_id, new.preparado_por_id, new.registrado_por_id),
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

grant execute on function public.normalizar_detalle_pedido_stock() to anon, authenticated;
