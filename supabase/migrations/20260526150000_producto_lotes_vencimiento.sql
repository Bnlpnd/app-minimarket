-- Lotes de producto con fecha de vencimiento (camino B: lotes manuales).
-- Cada vez que ingresa stock, opcionalmente se crea un lote con su fecha
-- de vencimiento. El stock_actual de producto_almacen sigue siendo la
-- fuente de verdad para "cuanto hay"; los lotes son metadata adicional
-- para alertas de vencimiento.
--
-- Las ventas NO descuentan automaticamente de lote (sin FIFO). Cuando
-- un lote esta vencido o por vencer, el usuario decide:
--   - dejar (todavia sirve),
--   - descartar (ajusta stock_actual y cantidad_actual del lote a 0),
--   - eliminar (ya se vendio antes de vencer; no toca stock).
--
-- Origen: 'inicial' (al crear producto con stock), 'compra' (agregar
-- stock en almacenes), 'transferencia' (recibir de otro almacen),
-- 'ajuste' (manual).

create table if not exists public.producto_lotes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  almacen_id uuid not null references public.almacenes(id) on delete restrict,
  -- cantidad inicial del lote (para historico).
  cantidad_inicial numeric(12,3) not null check (cantidad_inicial > 0),
  -- cantidad vigente del lote (lo que queda; se ajusta manualmente al
  -- descartar). Inicia igual a cantidad_inicial.
  cantidad_actual numeric(12,3) not null check (cantidad_actual >= 0),
  fecha_ingreso date not null default current_date,
  fecha_vencimiento date,
  origen text not null default 'compra'
    check (origen in ('inicial', 'compra', 'transferencia', 'ajuste')),
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_producto_lotes_producto
  on public.producto_lotes (producto_id);
create index if not exists idx_producto_lotes_almacen
  on public.producto_lotes (almacen_id);
create index if not exists idx_producto_lotes_vencimiento
  on public.producto_lotes (fecha_vencimiento)
  where fecha_vencimiento is not null and activo = true;
create index if not exists idx_producto_lotes_activos
  on public.producto_lotes (producto_id, almacen_id)
  where activo = true;

drop trigger if exists set_producto_lotes_updated_at on public.producto_lotes;
create trigger set_producto_lotes_updated_at
  before update on public.producto_lotes
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.producto_lotes
  to anon, authenticated;

-- Vista agregada: lotes activos con datos del producto y almacen.
-- Util para la pagina /vencimientos y el widget del dashboard.
create or replace view public.vista_lotes_vencimiento as
  select
    pl.id,
    pl.producto_id,
    pl.almacen_id,
    pl.cantidad_inicial,
    pl.cantidad_actual,
    pl.fecha_ingreso,
    pl.fecha_vencimiento,
    pl.origen,
    pl.notas,
    pl.created_at,
    p.nombre_producto,
    p.codigo_interno,
    p.unidad_base,
    a.nombre as almacen_nombre,
    case
      when pl.fecha_vencimiento is null then null
      when pl.fecha_vencimiento < current_date then 'vencido'
      when pl.fecha_vencimiento <= current_date + interval '7 days' then 'urgente'
      when pl.fecha_vencimiento <= current_date + interval '30 days' then 'proximo'
      else 'ok'
    end as estado_vencimiento,
    (pl.fecha_vencimiento - current_date) as dias_restantes
  from public.producto_lotes pl
  join public.productos p on p.id = pl.producto_id
  join public.almacenes a on a.id = pl.almacen_id
  where pl.activo = true
    and pl.cantidad_actual > 0;

grant select on public.vista_lotes_vencimiento to anon, authenticated;

-- RPC helper: descartar un lote (marca cantidad_actual a 0 y resta del
-- stock del almacen). Atomico para evitar inconsistencias.
create or replace function public.descartar_lote(
  p_lote_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_lote record;
begin
  select * into v_lote from public.producto_lotes
    where id = p_lote_id and activo = true for update;

  if not found then
    raise exception 'Lote no encontrado o ya descartado';
  end if;

  -- Restar del stock_actual del almacen (cantidad vigente).
  update public.producto_almacen
    set stock_actual = greatest(0, stock_actual - v_lote.cantidad_actual),
        updated_at = now()
    where producto_id = v_lote.producto_id
      and almacen_id = v_lote.almacen_id;

  -- Marcar lote descartado.
  update public.producto_lotes
    set cantidad_actual = 0,
        activo = false,
        notas = coalesce(notas || ' | ', '') ||
                'Descartado ' || to_char(now(), 'DD/MM/YYYY HH24:MI') ||
                coalesce(' - ' || p_motivo, ''),
        updated_at = now()
    where id = p_lote_id;
end;
$$;

grant execute on function public.descartar_lote(uuid, text) to anon, authenticated;
