alter table public.app_usuarios
  add column if not exists horario_laboral text;

create table if not exists public.personal_asistencias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.app_usuarios(id) on delete cascade,
  fecha date not null default current_date,
  hora_ingreso time,
  hora_salida time,
  productividad smallint not null default 2 check (productividad in (1, 2, 3)),
  observacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usuario_id, fecha)
);

create table if not exists public.personal_descuentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.app_usuarios(id) on delete cascade,
  fecha date not null default current_date,
  detalle text not null,
  monto numeric(10,2) not null default 0 check (monto >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_pagos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.app_usuarios(id) on delete cascade,
  semana_inicio date not null,
  semana_fin date not null,
  horas_trabajadas numeric(10,2) not null default 0,
  pago_hora numeric(10,2) not null default 0,
  descuentos numeric(10,2) not null default 0,
  monto_pagado numeric(10,2) not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado')),
  observacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usuario_id, semana_inicio)
);

create index if not exists idx_personal_asistencias_usuario_fecha
on public.personal_asistencias (usuario_id, fecha);

create index if not exists idx_personal_descuentos_usuario_fecha
on public.personal_descuentos (usuario_id, fecha);

create index if not exists idx_personal_pagos_usuario_semana
on public.personal_pagos (usuario_id, semana_inicio);

drop trigger if exists set_personal_asistencias_updated_at on public.personal_asistencias;
create trigger set_personal_asistencias_updated_at
before update on public.personal_asistencias
for each row execute function public.set_updated_at();

drop trigger if exists set_personal_descuentos_updated_at on public.personal_descuentos;
create trigger set_personal_descuentos_updated_at
before update on public.personal_descuentos
for each row execute function public.set_updated_at();

drop trigger if exists set_personal_pagos_updated_at on public.personal_pagos;
create trigger set_personal_pagos_updated_at
before update on public.personal_pagos
for each row execute function public.set_updated_at();

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
  p_gastos_semana numeric default 0,
  p_horario_laboral text default null
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
    horario_laboral,
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
    nullif(trim(coalesce(p_horario_laboral, '')), ''),
    true
  )
  returning id into v_user_id;

  return v_user_id;
end;
$$;

drop function if exists public.crear_app_usuario(uuid, text, text, text, text, text, text, numeric, numeric, numeric);

grant select, insert, update, delete on public.personal_asistencias to anon, authenticated;
grant select, insert, update, delete on public.personal_descuentos to anon, authenticated;
grant select, insert, update, delete on public.personal_pagos to anon, authenticated;
grant execute on function public.crear_app_usuario(uuid, text, text, text, text, text, text, numeric, numeric, numeric, text) to anon, authenticated;
