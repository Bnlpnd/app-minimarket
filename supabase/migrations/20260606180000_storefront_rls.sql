-- =====================================================================
-- Endurecimiento del area de cliente (storefront).
--
-- Arquitectura: el panel admin/trabajador usa la anon key (rol `anon`),
-- los clientes usan Supabase Auth (rol `authenticated`, con JWT verificado).
-- Por eso las politicas mantienen `anon` permisivo (no rompe al staff) y
-- restringen `authenticated` a SOLO sus propios datos.
--
-- Identidad de cliente: SIEMPRE derivada del correo verificado del JWT
-- (auth.jwt()->>'email'); nunca se confia en ids enviados por el cliente.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- RPC: sincroniza/crea la ficha de cliente desde el JWT autenticado.
-- ---------------------------------------------------------------------
create or replace function public.cliente_sync_self(p_nombres text default null)
returns table (
  id uuid,
  email text,
  rol text,
  nombres text,
  apellidos text,
  cliente_id uuid
)
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_name text := coalesce(
    nullif(trim(coalesce(p_nombres, '')), ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', '')
  );
  v_cliente_id uuid;
  v_usuario public.app_usuarios%rowtype;
begin
  if v_email is null then
    raise exception 'No autenticado';
  end if;
  if v_name is null then
    v_name := split_part(v_email, '@', 1);
  end if;

  select c.id into v_cliente_id
  from public.clientes c
  where lower(c.email) = v_email
  limit 1;
  if v_cliente_id is null then
    insert into public.clientes (nombres, email)
    values (v_name, v_email)
    returning clientes.id into v_cliente_id;
  end if;

  select * into v_usuario
  from public.app_usuarios u
  where lower(u.email) = v_email
  limit 1;
  if not found then
    insert into public.app_usuarios (email, password_hash, rol, nombres, cliente_id, activo)
    values (
      v_email,
      crypt(gen_random_uuid()::text, gen_salt('bf', 10)),
      'cliente',
      v_name,
      v_cliente_id,
      true
    )
    returning * into v_usuario;
  elsif v_usuario.cliente_id is null then
    update public.app_usuarios
       set cliente_id = v_cliente_id, updated_at = now()
     where app_usuarios.id = v_usuario.id
    returning * into v_usuario;
  end if;

  return query
  select v_usuario.id, v_usuario.email, v_usuario.rol::text,
         v_usuario.nombres, v_usuario.apellidos, v_usuario.cliente_id;
end;
$$;

revoke all on function public.cliente_sync_self(text) from public, anon;
grant execute on function public.cliente_sync_self(text) to authenticated;

-- ---------------------------------------------------------------------
-- RPC: crea un pedido para el cliente autenticado, con precios del
-- servidor (no confia en montos del cliente). p_items: [{producto_id, cantidad}]
-- ---------------------------------------------------------------------
create or replace function public.crear_pedido_self(p_items jsonb, p_nota text default null)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_cliente_id uuid;
  v_pedido_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_qty numeric;
  v_prod record;
  v_detalle text := '';
begin
  if v_email is null then
    raise exception 'Debes iniciar sesion';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrito vacio';
  end if;

  select c.id into v_cliente_id
  from public.clientes c
  where lower(c.email) = v_email
  limit 1;
  if v_cliente_id is null then
    insert into public.clientes (nombres, email)
    values (
      coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), split_part(v_email, '@', 1)),
      v_email
    )
    returning clientes.id into v_cliente_id;
  end if;

  insert into public.pedidos (cliente_id, estado, subtotal, total, tipo_entrega, estado_pago, monto_a_cuenta, nota_cliente)
  values (v_cliente_id, 'pendiente', 0, 0, 'recoger_despues', 'debe', 0, nullif(trim(coalesce(p_nota, '')), ''))
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(0, coalesce((v_item ->> 'cantidad')::numeric, 0));
    if v_qty <= 0 then continue; end if;
    select id, nombre_producto, precio_venta into v_prod
    from public.productos
    where id = (v_item ->> 'producto_id')::uuid and activo = true
    limit 1;
    if not found or coalesce(v_prod.precio_venta, 0) <= 0 then continue; end if;

    insert into public.detalle_pedido (pedido_id, producto_id, cantidad, cantidad_base, precio_unitario, preparado)
    values (v_pedido_id, v_prod.id, v_qty, v_qty, v_prod.precio_venta, false);

    v_total := v_total + v_qty * v_prod.precio_venta;
    v_detalle := v_detalle || (case when v_detalle = '' then '' else '; ' end)
      || trim(to_char(v_qty, 'FM999999990.###')) || ' x ' || v_prod.nombre_producto;
  end loop;

  if v_total <= 0 then
    raise exception 'No hay productos validos en el carrito';
  end if;

  update public.pedidos
     set subtotal = v_total, total = v_total, detalle_manual = v_detalle
   where id = v_pedido_id;

  return v_pedido_id;
end;
$$;

revoke all on function public.crear_pedido_self(jsonb, text) from public, anon;
grant execute on function public.crear_pedido_self(jsonb, text) to authenticated;

-- Quitar la RPC param-based anterior (reemplazada por cliente_sync_self)
drop function if exists public.cliente_login_google(text, text);

-- ---------------------------------------------------------------------
-- RLS: anon (staff) permisivo; authenticated (cliente) solo lo suyo.
-- ---------------------------------------------------------------------

-- CLIENTES
alter table public.clientes enable row level security;
drop policy if exists clientes_anon_all on public.clientes;
drop policy if exists clientes_auth_select_own on public.clientes;
create policy clientes_anon_all on public.clientes for all to anon using (true) with check (true);
create policy clientes_auth_select_own on public.clientes for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- PEDIDOS
alter table public.pedidos enable row level security;
drop policy if exists pedidos_anon_all on public.pedidos;
drop policy if exists pedidos_auth_select_own on public.pedidos;
create policy pedidos_anon_all on public.pedidos for all to anon using (true) with check (true);
create policy pedidos_auth_select_own on public.pedidos for select to authenticated
  using (cliente_id in (
    select c.id from public.clientes c where lower(c.email) = lower(auth.jwt() ->> 'email')
  ));

-- DETALLE_PEDIDO
alter table public.detalle_pedido enable row level security;
drop policy if exists detalle_anon_all on public.detalle_pedido;
drop policy if exists detalle_auth_select_own on public.detalle_pedido;
create policy detalle_anon_all on public.detalle_pedido for all to anon using (true) with check (true);
create policy detalle_auth_select_own on public.detalle_pedido for select to authenticated
  using (pedido_id in (
    select p.id from public.pedidos p
    join public.clientes c on c.id = p.cliente_id
    where lower(c.email) = lower(auth.jwt() ->> 'email')
  ));

-- CLIENTE_ABONOS
alter table public.cliente_abonos enable row level security;
drop policy if exists abonos_anon_all on public.cliente_abonos;
drop policy if exists abonos_auth_select_own on public.cliente_abonos;
create policy abonos_anon_all on public.cliente_abonos for all to anon using (true) with check (true);
create policy abonos_auth_select_own on public.cliente_abonos for select to authenticated
  using (cliente_id in (
    select c.id from public.clientes c where lower(c.email) = lower(auth.jwt() ->> 'email')
  ));

-- PAGOS: solo staff (anon). Los clientes no acceden a esta tabla.
alter table public.pagos enable row level security;
drop policy if exists pagos_anon_all on public.pagos;
create policy pagos_anon_all on public.pagos for all to anon using (true) with check (true);

-- APP_USUARIOS: solo staff (anon) y los RPC definer. Cierra la lectura de
-- hashes/datos de usuarios al rol authenticated (clientes).
alter table public.app_usuarios enable row level security;
drop policy if exists app_usuarios_anon_all on public.app_usuarios;
create policy app_usuarios_anon_all on public.app_usuarios for all to anon using (true) with check (true);
