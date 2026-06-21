-- =====================================================================
-- Storefront: cuentas de cliente vinculadas por correo.
-- - clientes.email: para enlazar la cuenta de login con su ficha.
-- - app_usuarios.cliente_id: enlace login -> cliente.
-- - cliente_login_google(): tras autenticar con Google (Supabase Auth)
--   busca/crea el cliente y el usuario de login (rol 'cliente') y devuelve
--   el perfil para guardar la sesion local. NO altera el rol de staff.
-- =====================================================================

create extension if not exists pgcrypto;

alter table public.clientes add column if not exists email text;
create index if not exists idx_clientes_email on public.clientes (lower(email));

alter table public.app_usuarios
  add column if not exists cliente_id uuid references public.clientes(id);

create or replace function public.cliente_login_google(p_email text, p_nombres text)
returns table (
  id uuid,
  email text,
  rol text,
  nombres text,
  apellidos text,
  telefono text,
  cliente_id uuid
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_nombres text := nullif(trim(coalesce(p_nombres, '')), '');
  v_cliente_id uuid;
  v_usuario public.app_usuarios%rowtype;
begin
  if v_email is null or v_email = '' then
    raise exception 'email requerido';
  end if;
  if v_nombres is null then
    v_nombres := split_part(v_email, '@', 1);
  end if;

  -- 1) Cliente por correo (crear si no existe)
  select c.id into v_cliente_id
  from public.clientes c
  where lower(c.email) = v_email
  limit 1;

  if v_cliente_id is null then
    insert into public.clientes (nombres, email)
    values (v_nombres, v_email)
    returning clientes.id into v_cliente_id;
  end if;

  -- 2) Usuario de login por correo (crear si no existe)
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
      v_nombres,
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
         v_usuario.nombres, v_usuario.apellidos, v_usuario.telefono,
         v_usuario.cliente_id;
end;
$$;

grant execute on function public.cliente_login_google(text, text) to anon, authenticated;
