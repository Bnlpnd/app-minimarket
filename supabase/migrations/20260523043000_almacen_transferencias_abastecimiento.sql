create table if not exists public.almacen_transferencias_solicitudes (
  id uuid primary key default gen_random_uuid(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'recibido', 'cancelado')),
  observacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.almacen_transferencias_items (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.almacen_transferencias_solicitudes(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  cantidad_solicitada numeric(10,2) not null check (cantidad_solicitada > 0),
  cantidad_recibida numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.abastecimiento_pedidos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'comprado', 'cancelado')),
  urgencia text not null default 'normal' check (urgencia in ('baja', 'normal', 'alta')),
  observacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.abastecimiento_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.abastecimiento_pedidos(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  cantidad numeric(10,2) not null check (cantidad > 0),
  observacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_almacen_transferencias_estado
on public.almacen_transferencias_solicitudes (estado, created_at desc);

create index if not exists idx_abastecimiento_pedidos_estado_fecha
on public.abastecimiento_pedidos (estado, created_at desc);

create index if not exists idx_abastecimiento_pedidos_proveedor
on public.abastecimiento_pedidos (proveedor_id);

drop trigger if exists set_almacen_transferencias_solicitudes_updated_at on public.almacen_transferencias_solicitudes;
create trigger set_almacen_transferencias_solicitudes_updated_at
before update on public.almacen_transferencias_solicitudes
for each row execute function public.set_updated_at();

drop trigger if exists set_almacen_transferencias_items_updated_at on public.almacen_transferencias_items;
create trigger set_almacen_transferencias_items_updated_at
before update on public.almacen_transferencias_items
for each row execute function public.set_updated_at();

drop trigger if exists set_abastecimiento_pedidos_updated_at on public.abastecimiento_pedidos;
create trigger set_abastecimiento_pedidos_updated_at
before update on public.abastecimiento_pedidos
for each row execute function public.set_updated_at();

drop trigger if exists set_abastecimiento_items_updated_at on public.abastecimiento_items;
create trigger set_abastecimiento_items_updated_at
before update on public.abastecimiento_items
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.almacen_transferencias_solicitudes to anon, authenticated;
grant select, insert, update, delete on public.almacen_transferencias_items to anon, authenticated;
grant select, insert, update, delete on public.abastecimiento_pedidos to anon, authenticated;
grant select, insert, update, delete on public.abastecimiento_items to anon, authenticated;
