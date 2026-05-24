create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  ruc text,
  contacto text,
  telefono text,
  email text,
  direccion text,
  observacion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists proveedores_nombre_unique
on public.proveedores (lower(trim(nombre)));

create unique index if not exists proveedores_ruc_unique
on public.proveedores (ruc)
where ruc is not null and trim(ruc) <> '';

drop trigger if exists set_proveedores_updated_at on public.proveedores;
create trigger set_proveedores_updated_at
before update on public.proveedores
for each row execute function public.set_updated_at();

create table if not exists public.producto_presentaciones_compra (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  nombre_presentacion text not null,
  unidades_por_presentacion numeric(10,2) not null default 1,
  costo_presentacion numeric(10,2),
  costo_unitario numeric(10,2) generated always as (
    case
      when costo_presentacion is null then null
      when unidades_por_presentacion > 0 then round(costo_presentacion / unidades_por_presentacion, 2)
      else null
    end
  ) stored,
  es_principal boolean not null default false,
  observacion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint producto_presentaciones_unidades_check check (unidades_por_presentacion > 0),
  constraint producto_presentaciones_costo_check check (costo_presentacion is null or costo_presentacion >= 0)
);

create index if not exists idx_producto_presentaciones_producto
on public.producto_presentaciones_compra (producto_id);

create index if not exists idx_producto_presentaciones_proveedor
on public.producto_presentaciones_compra (proveedor_id);

drop trigger if exists set_producto_presentaciones_compra_updated_at on public.producto_presentaciones_compra;
create trigger set_producto_presentaciones_compra_updated_at
before update on public.producto_presentaciones_compra
for each row execute function public.set_updated_at();

create table if not exists public.producto_precios_mayor (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  cantidad_minima numeric(10,2) not null,
  precio_unitario numeric(10,2) not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint producto_precios_mayor_cantidad_check check (cantidad_minima > 0),
  constraint producto_precios_mayor_precio_check check (precio_unitario >= 0)
);

create unique index if not exists producto_precios_mayor_unique
on public.producto_precios_mayor (producto_id, cantidad_minima);

drop trigger if exists set_producto_precios_mayor_updated_at on public.producto_precios_mayor;
create trigger set_producto_precios_mayor_updated_at
before update on public.producto_precios_mayor
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.proveedores to anon, authenticated;
grant select, insert, update, delete on public.producto_presentaciones_compra to anon, authenticated;
grant select, insert, update, delete on public.producto_precios_mayor to anon, authenticated;
