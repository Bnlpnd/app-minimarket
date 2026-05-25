-- Sistema de reservas de stock al agregar productos al carrito.
-- Cuando un trabajador agrega un producto al carrito, reserva esa cantidad
-- para que otros trabajadores vean stock_disponible = stock_actual - reservas.
-- Si el pedido se cancela o pasa a en_preparacion, las reservas se liberan.
-- Si el carrito se abandona, las reservas expiran a los 30 minutos.

-- 1. Tabla de reservas
create table if not exists public.stock_reservas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  almacen_id uuid not null references public.almacenes(id) on delete cascade,
  cantidad_base numeric(10,2) not null check (cantidad_base > 0),
  usuario_id uuid,
  pedido_id uuid references public.pedidos(id) on delete cascade,
  sesion_id text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stock_reservas_producto_almacen
  on public.stock_reservas (producto_id, almacen_id);
create index if not exists idx_stock_reservas_pedido
  on public.stock_reservas (pedido_id);
create index if not exists idx_stock_reservas_sesion
  on public.stock_reservas (sesion_id);
create index if not exists idx_stock_reservas_expires
  on public.stock_reservas (expires_at) where pedido_id is null;

drop trigger if exists set_stock_reservas_updated_at on public.stock_reservas;
create trigger set_stock_reservas_updated_at
  before update on public.stock_reservas
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.stock_reservas to anon, authenticated;

-- 2. Vista que suma reservas activas por producto+almacen
-- Una reserva esta activa si: tiene pedido asociado (cualquier estado pendiente)
--   o no ha expirado (carrito en uso).
create or replace view public.vista_stock_reservado as
select
  r.producto_id,
  r.almacen_id,
  sum(r.cantidad_base)::numeric(10,2) as total_reservado
from public.stock_reservas r
where r.pedido_id is not null or r.expires_at > now()
group by r.producto_id, r.almacen_id;

grant select on public.vista_stock_reservado to anon, authenticated;

-- 3. Funcion para limpiar reservas expiradas sin pedido (cleanup periodico)
create or replace function public.limpiar_reservas_expiradas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.stock_reservas
   where pedido_id is null
     and expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  return v_deleted;
end;
$$;

grant execute on function public.limpiar_reservas_expiradas() to anon, authenticated;

-- 4. Reservar stock al agregar al carrito
create or replace function public.reservar_stock_carrito(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_cantidad_base numeric,
  p_usuario_id uuid default null,
  p_sesion_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_disponible numeric(10,2);
  v_reservado numeric(10,2);
  v_stock numeric(10,2);
begin
  if p_cantidad_base is null or p_cantidad_base <= 0 then
    raise exception 'La cantidad reservada debe ser mayor que cero';
  end if;

  -- limpieza oportunistica
  perform public.limpiar_reservas_expiradas();

  -- validar stock disponible antes de reservar
  select coalesce(stock_actual, 0) into v_stock
    from public.producto_almacen
   where producto_id = p_producto_id and almacen_id = p_almacen_id;

  if v_stock is null then
    -- no existe la fila; crea con 0 y rechaza la reserva (no hay stock)
    insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
    values (p_producto_id, p_almacen_id, 0)
    on conflict (producto_id, almacen_id) do nothing;
    v_stock := 0;
  end if;

  select coalesce(sum(cantidad_base), 0) into v_reservado
    from public.stock_reservas
   where producto_id = p_producto_id
     and almacen_id = p_almacen_id
     and (pedido_id is not null or expires_at > now());

  v_disponible := v_stock - v_reservado;
  if v_disponible < p_cantidad_base then
    raise exception 'Stock insuficiente. Disponible: %, requerido: %',
      v_disponible, p_cantidad_base;
  end if;

  insert into public.stock_reservas (
    producto_id, almacen_id, cantidad_base, usuario_id, sesion_id
  ) values (
    p_producto_id, p_almacen_id, p_cantidad_base, p_usuario_id, p_sesion_id
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.reservar_stock_carrito(uuid, uuid, numeric, uuid, text)
  to anon, authenticated;

-- 5. Actualizar cantidad reservada (cuando cambia el qty del carrito)
create or replace function public.actualizar_reserva_carrito(
  p_reserva_id uuid,
  p_cantidad_base numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual numeric(10,2);
  v_otras numeric(10,2);
  v_stock numeric(10,2);
  v_producto_id uuid;
  v_almacen_id uuid;
begin
  if p_cantidad_base is null or p_cantidad_base <= 0 then
    raise exception 'La cantidad reservada debe ser mayor que cero';
  end if;

  select producto_id, almacen_id, cantidad_base
    into v_producto_id, v_almacen_id, v_actual
    from public.stock_reservas
   where id = p_reserva_id;

  if v_producto_id is null then
    raise exception 'Reserva no encontrada';
  end if;

  -- validar incremento
  if p_cantidad_base > v_actual then
    select coalesce(stock_actual, 0) into v_stock
      from public.producto_almacen
     where producto_id = v_producto_id and almacen_id = v_almacen_id;

    select coalesce(sum(cantidad_base), 0) into v_otras
      from public.stock_reservas
     where producto_id = v_producto_id
       and almacen_id = v_almacen_id
       and id <> p_reserva_id
       and (pedido_id is not null or expires_at > now());

    if v_stock - v_otras < p_cantidad_base then
      raise exception 'Stock insuficiente para aumentar reserva. Disponible: %, requerido: %',
        v_stock - v_otras, p_cantidad_base;
    end if;
  end if;

  update public.stock_reservas
     set cantidad_base = p_cantidad_base,
         expires_at = greatest(expires_at, now() + interval '30 minutes')
   where id = p_reserva_id;
end;
$$;

grant execute on function public.actualizar_reserva_carrito(uuid, numeric)
  to anon, authenticated;

-- 6. Liberar reserva (al quitar del carrito)
create or replace function public.liberar_reserva(p_reserva_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.stock_reservas where id = p_reserva_id;
end;
$$;

grant execute on function public.liberar_reserva(uuid) to anon, authenticated;

-- 7. Asociar reservas a un pedido (al guardar el pedido)
create or replace function public.asociar_reservas_a_pedido(
  p_reserva_ids uuid[],
  p_pedido_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stock_reservas
     set pedido_id = p_pedido_id,
         expires_at = now() + interval '7 days'
   where id = any(p_reserva_ids);
end;
$$;

grant execute on function public.asociar_reservas_a_pedido(uuid[], uuid)
  to anon, authenticated;

-- 8. Liberar todas las reservas de un usuario o sesion (vaciar carrito)
create or replace function public.liberar_reservas_carrito(
  p_usuario_id uuid default null,
  p_sesion_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if p_usuario_id is null and p_sesion_id is null then
    return 0;
  end if;

  delete from public.stock_reservas
   where pedido_id is null
     and (
       (p_usuario_id is not null and usuario_id = p_usuario_id) or
       (p_sesion_id is not null and sesion_id = p_sesion_id)
     );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  return v_deleted;
end;
$$;

grant execute on function public.liberar_reservas_carrito(uuid, text)
  to anon, authenticated;

-- 9. Trigger que libera reservas al cambiar el estado del pedido
--    a cancelado o en_preparacion.
create or replace function public.liberar_reservas_pedido_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado in ('cancelado', 'en_preparacion')
     and (old.estado is distinct from new.estado) then
    delete from public.stock_reservas where pedido_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists liberar_reservas_pedido_trigger on public.pedidos;
create trigger liberar_reservas_pedido_trigger
  after update of estado on public.pedidos
  for each row execute function public.liberar_reservas_pedido_trigger();

-- 10. Stock minimo default a nivel global: si producto.stock_minimo es null,
--     se usa 10 (lo aplica el cliente; documentado aqui para claridad).
comment on column public.productos.stock_minimo is
  'Umbral de stock bajo. Si es NULL, el cliente usa default 10.';
