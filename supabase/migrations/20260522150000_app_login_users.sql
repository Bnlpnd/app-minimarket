create extension if not exists pgcrypto;

drop function if exists public.crear_usuario_app(text, text, text, text, text, text);
drop function if exists public.current_user_is_admin();

create table if not exists public.app_usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  rol text not null check (rol in ('admin', 'trabajador', 'cliente')),
  nombres text not null,
  apellidos text,
  telefono text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_app_usuarios_updated_at on public.app_usuarios;
create trigger set_app_usuarios_updated_at
before update on public.app_usuarios
for each row execute function public.set_updated_at();

create or replace function public.login_app(p_email text, p_password text)
returns table (
  id uuid,
  email text,
  rol text,
  nombres text,
  apellidos text,
  telefono text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select u.id, u.email, u.rol, u.nombres, u.apellidos, u.telefono
  from public.app_usuarios u
  where lower(u.email) = lower(trim(p_email))
    and u.activo = true
    and u.password_hash = crypt(p_password, u.password_hash)
  limit 1;
end;
$$;

create or replace function public.crear_app_usuario(
  p_admin_id uuid,
  p_email text,
  p_password text,
  p_rol text,
  p_nombres text,
  p_apellidos text default null,
  p_telefono text default null
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
    activo
  )
  values (
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf', 10)),
    p_rol,
    nullif(trim(p_nombres), ''),
    nullif(trim(coalesce(p_apellidos, '')), ''),
    nullif(trim(coalesce(p_telefono, '')), ''),
    true
  )
  returning id into v_user_id;

  return v_user_id;
end;
$$;

grant select, update on public.app_usuarios to anon, authenticated;
grant execute on function public.login_app(text, text) to anon, authenticated;
grant execute on function public.crear_app_usuario(uuid, text, text, text, text, text, text) to anon, authenticated;
