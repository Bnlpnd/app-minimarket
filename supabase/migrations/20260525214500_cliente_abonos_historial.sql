-- Tabla para mantener historial de pagos hechos por el cliente desde el
-- modulo /clientes/[id]/pedidos. Cada operacion de "Registrar pago" crea
-- un registro aqui (puede distribuirse entre varios pedidos via FIFO).
-- Esto le da visibilidad al cliente de que su pago fue registrado.

create table if not exists public.cliente_abonos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fecha_pago timestamptz not null default now(),
  monto_total numeric(10,2) not null check (monto_total > 0),
  metodo text not null check (metodo in ('efectivo', 'yape', 'transferencia', 'otro')),
  observacion text,
  registrado_por_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cliente_abonos_cliente
  on public.cliente_abonos (cliente_id, fecha_pago desc);

drop trigger if exists set_cliente_abonos_updated_at on public.cliente_abonos;
create trigger set_cliente_abonos_updated_at
  before update on public.cliente_abonos
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.cliente_abonos
  to anon, authenticated;
