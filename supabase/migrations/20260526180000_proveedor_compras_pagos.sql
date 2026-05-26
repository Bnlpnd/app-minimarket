-- Compras a proveedor con boletas y pagos parciales.
--
-- Modelo:
--   proveedor_compras       -> cabecera (boleta, monto total, fecha)
--   proveedor_compra_items  -> detalle opcional (puede no haber items)
--   proveedor_pagos         -> historial de pagos / abonos
--
-- Reglas de negocio:
--   - El usuario puede registrar SOLO la boleta + monto + pagos
--     iniciales. Los items son opcionales (al principio puede ser
--     tedioso anotar cada producto).
--   - Cada item opcionalmente referencia un producto del catalogo.
--     Si producto_id es NULL, es un item "libre" (texto + precio).
--   - Si el item tiene registrar_stock=true y producto_id, al guardarse
--     se llamara desde la app a ajustar_stock y a crear lote si trae
--     fecha_vencimiento.
--   - monto_pagado y saldo de la cabecera se mantienen actualizados
--     via trigger al insertar/borrar pagos.

create table if not exists public.proveedor_compras (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete restrict,
  fecha_compra date not null default current_date,
  numero_documento text,
  tipo_documento text not null default 'boleta'
    check (tipo_documento in ('boleta', 'factura', 'nota', 'sin_documento')),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  descuento numeric(12,2) not null default 0 check (descuento >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  monto_pagado numeric(12,2) not null default 0 check (monto_pagado >= 0),
  -- saldo = total - monto_pagado (puede ser negativo si pagaste de mas)
  saldo numeric(12,2) generated always as (total - monto_pagado) stored,
  estado_pago text not null default 'pendiente'
    check (estado_pago in ('pagado', 'parcial', 'pendiente')),
  observacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proveedor_compras_proveedor
  on public.proveedor_compras (proveedor_id);
create index if not exists idx_proveedor_compras_fecha
  on public.proveedor_compras (fecha_compra desc);
create index if not exists idx_proveedor_compras_estado
  on public.proveedor_compras (estado_pago)
  where estado_pago <> 'pagado';

drop trigger if exists set_proveedor_compras_updated_at on public.proveedor_compras;
create trigger set_proveedor_compras_updated_at
  before update on public.proveedor_compras
  for each row execute function public.set_updated_at();

create table if not exists public.proveedor_compra_items (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.proveedor_compras(id) on delete cascade,
  -- producto_id NULL = item "libre" (proveedor te trae algo no registrado)
  producto_id uuid references public.productos(id) on delete restrict,
  descripcion text, -- usado cuando producto_id es NULL
  cantidad numeric(12,3) not null check (cantidad > 0),
  precio_unitario numeric(12,4) not null check (precio_unitario >= 0),
  subtotal numeric(12,2) generated always as (cantidad * precio_unitario) stored,
  fecha_vencimiento date,
  almacen_destino_id uuid references public.almacenes(id),
  -- Si true y producto_id existe, al guardar se suma al stock + crea lote.
  -- La logica vive en la app, no en el trigger, para evitar dobles updates.
  registrar_stock boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_proveedor_compra_items_compra
  on public.proveedor_compra_items (compra_id);
create index if not exists idx_proveedor_compra_items_producto
  on public.proveedor_compra_items (producto_id)
  where producto_id is not null;

-- Validacion: o tiene producto_id o tiene descripcion (libre).
alter table public.proveedor_compra_items
  drop constraint if exists proveedor_compra_items_producto_o_descripcion;
alter table public.proveedor_compra_items
  add constraint proveedor_compra_items_producto_o_descripcion
  check (producto_id is not null or coalesce(trim(descripcion), '') <> '');

create table if not exists public.proveedor_pagos (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.proveedor_compras(id) on delete cascade,
  fecha_pago date not null default current_date,
  monto numeric(12,2) not null check (monto > 0),
  metodo text not null default 'efectivo'
    check (metodo in ('efectivo', 'yape', 'transferencia', 'otro')),
  referencia text,
  observacion text,
  created_at timestamptz not null default now()
);

create index if not exists idx_proveedor_pagos_compra
  on public.proveedor_pagos (compra_id);
create index if not exists idx_proveedor_pagos_fecha
  on public.proveedor_pagos (fecha_pago desc);

-- Trigger: cuando cambia un pago, recalcular monto_pagado y estado_pago.
create or replace function public.recalcular_pago_compra() returns trigger
language plpgsql as $$
declare
  v_compra_id uuid;
  v_pagado numeric(12,2);
  v_total numeric(12,2);
  v_estado text;
begin
  v_compra_id := coalesce(new.compra_id, old.compra_id);

  select coalesce(sum(monto), 0) into v_pagado
    from public.proveedor_pagos where compra_id = v_compra_id;

  select total into v_total from public.proveedor_compras where id = v_compra_id;

  if v_pagado >= coalesce(v_total, 0) and coalesce(v_total, 0) > 0 then
    v_estado := 'pagado';
  elsif v_pagado > 0 then
    v_estado := 'parcial';
  else
    v_estado := 'pendiente';
  end if;

  update public.proveedor_compras
    set monto_pagado = v_pagado,
        estado_pago = v_estado,
        updated_at = now()
    where id = v_compra_id;

  return null;
end;
$$;

drop trigger if exists trg_pagos_recalcular on public.proveedor_pagos;
create trigger trg_pagos_recalcular
  after insert or update or delete on public.proveedor_pagos
  for each row execute function public.recalcular_pago_compra();

-- Trigger: cuando cambia el total de la cabecera, recalcular estado_pago.
create or replace function public.recalcular_estado_compra() returns trigger
language plpgsql as $$
begin
  if new.total >= 0 then
    if new.monto_pagado >= new.total and new.total > 0 then
      new.estado_pago := 'pagado';
    elsif new.monto_pagado > 0 then
      new.estado_pago := 'parcial';
    else
      new.estado_pago := 'pendiente';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_compras_estado on public.proveedor_compras;
create trigger trg_compras_estado
  before insert or update of total, monto_pagado on public.proveedor_compras
  for each row execute function public.recalcular_estado_compra();

grant select, insert, update, delete on public.proveedor_compras
  to anon, authenticated;
grant select, insert, update, delete on public.proveedor_compra_items
  to anon, authenticated;
grant select, insert, update, delete on public.proveedor_pagos
  to anon, authenticated;

-- Vista resumen por proveedor (deuda total, ultima compra, etc.)
create or replace view public.vista_proveedor_resumen as
  select
    p.id as proveedor_id,
    p.nombre as proveedor_nombre,
    count(c.id) as compras_total,
    coalesce(sum(c.total), 0) as compras_monto_total,
    coalesce(sum(c.monto_pagado), 0) as pagos_total,
    coalesce(sum(c.total - c.monto_pagado), 0) as deuda_total,
    count(c.id) filter (where c.estado_pago <> 'pagado') as compras_con_saldo,
    max(c.fecha_compra) as ultima_compra
  from public.proveedores p
  left join public.proveedor_compras c on c.proveedor_id = p.id
  where p.activo = true
  group by p.id, p.nombre;

grant select on public.vista_proveedor_resumen to anon, authenticated;

-- Vista resumen mensual: cuanto se pago a proveedores por mes.
create or replace view public.vista_pagos_proveedor_mensual as
  select
    to_char(pp.fecha_pago, 'YYYY-MM') as mes,
    pp.metodo,
    count(*) as pagos_cantidad,
    sum(pp.monto) as monto_total
  from public.proveedor_pagos pp
  group by 1, 2
  order by 1 desc;

grant select on public.vista_pagos_proveedor_mensual to anon, authenticated;
