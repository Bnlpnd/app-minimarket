-- Sistema de pago por turno con tarifa hora calculada.
-- Cada trabajador define sus turnos (dias + horario + monto). El sistema
-- calcula tarifa_hora = monto / horas(inicio, fin) y aplica:
--   pago_dia = horas_trabajadas_reales × tarifa_hora_del_turno
-- Esto premia entrar antes o quedarse mas, y descuenta llegadas tarde.
-- Si un dia no tiene turno, usa app_usuarios.pago_hora como tarifa general.

create table if not exists public.personal_turnos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.app_usuarios(id) on delete cascade,
  nombre text not null,
  -- Dias de la semana en formato JS: 0=Dom, 1=Lun, ..., 6=Sab.
  dias_aplica smallint[] not null check (cardinality(dias_aplica) > 0),
  hora_inicio time not null,
  hora_fin time not null,
  -- Monto que el trabajador cobra el dia si cumple este turno completo.
  -- La tarifa_hora se calcula en runtime: monto_pago / horas(inicio, fin).
  monto_pago numeric(10,2) not null check (monto_pago >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_turnos_horario_check check (hora_fin > hora_inicio)
);

create index if not exists idx_personal_turnos_usuario
  on public.personal_turnos (usuario_id, activo);

drop trigger if exists set_personal_turnos_updated_at on public.personal_turnos;
create trigger set_personal_turnos_updated_at
  before update on public.personal_turnos
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.personal_turnos
  to anon, authenticated;

-- Bono por asistencia completa de la semana, configurable por trabajador.
-- Default 0 = sin bono.
alter table public.app_usuarios
  add column if not exists bono_asistencia_completa numeric(10,2) not null default 0;

-- Cada asistencia puede referenciar al turno que cubrio. NULL = sin turno
-- (usa tarifa general pago_hora).
alter table public.personal_asistencias
  add column if not exists turno_id uuid references public.personal_turnos(id) on delete set null;

create index if not exists idx_personal_asistencias_turno
  on public.personal_asistencias (turno_id);
