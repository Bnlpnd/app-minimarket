alter table public.app_usuarios
  add column if not exists pago_hora numeric(10,2) not null default 0,
  add column if not exists horas_semana numeric(10,2) not null default 0,
  add column if not exists gastos_semana numeric(10,2) not null default 0;

alter table public.pedidos
  add column if not exists app_registrado_por_id uuid references public.app_usuarios(id) on delete set null,
  add column if not exists app_preparado_por_id uuid references public.app_usuarios(id) on delete set null,
  add column if not exists app_entregado_por_id uuid references public.app_usuarios(id) on delete set null;

alter table public.detalle_pedido
  add column if not exists app_marcado_por_id uuid references public.app_usuarios(id) on delete set null;

create index if not exists idx_pedidos_app_registrado_por
on public.pedidos (app_registrado_por_id);

create index if not exists idx_pedidos_app_preparado_por
on public.pedidos (app_preparado_por_id);

create index if not exists idx_pedidos_app_entregado_por
on public.pedidos (app_entregado_por_id);

create or replace function public.crear_app_usuario(
  p_admin_id uuid,
  p_email text,
  p_password text,
  p_rol text,
  p_nombres text,
  p_apellidos text default null,
  p_telefono text default null,
  p_pago_hora numeric default 0,
  p_horas_semana numeric default 0,
  p_gastos_semana numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  if not exists (
    select 1 from public.app_usuarios
    where id = p_admin_id and rol = 'admin' and activo = true
  ) then
    raise exception 'Solo un admin puede registrar usuarios.';
  end if;

  if p_rol not in ('admin', 'trabajador', 'cliente') then
    raise exception 'Rol no valido.';
  end if;

  if length(coalesce(p_password, '')) < 8 then
    raise exception 'La clave debe tener al menos 8 caracteres.';
  end if;

  insert into public.app_usuarios (
    email,
    password_hash,
    rol,
    nombres,
    apellidos,
    telefono,
    pago_hora,
    horas_semana,
    gastos_semana,
    activo
  )
  values (
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf', 10)),
    p_rol,
    nullif(trim(p_nombres), ''),
    nullif(trim(coalesce(p_apellidos, '')), ''),
    nullif(trim(coalesce(p_telefono, '')), ''),
    greatest(coalesce(p_pago_hora, 0), 0),
    greatest(coalesce(p_horas_semana, 0), 0),
    greatest(coalesce(p_gastos_semana, 0), 0),
    true
  )
  returning id into v_user_id;

  return v_user_id;
end;
$$;

drop function if exists public.crear_app_usuario(uuid, text, text, text, text, text, text);

grant execute on function public.crear_app_usuario(uuid, text, text, text, text, text, text, numeric, numeric, numeric) to anon, authenticated;

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
