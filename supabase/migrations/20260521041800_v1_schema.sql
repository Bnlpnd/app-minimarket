create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table public.roles (
  id bigserial primary key,
  nombre text not null unique,
  descripcion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usuarios_perfil (
  id uuid primary key references auth.users(id) on delete cascade,
  rol_id bigint references public.roles(id),
  nombres text,
  apellidos text,
  telefono text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombres text not null,
  apellidos text,
  telefono text,
  direccion text,
  referencia text,
  documento text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subcategorias (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias(id) on delete restrict,
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcategorias_categoria_nombre_unique unique (categoria_id, nombre),
  constraint subcategorias_id_categoria_unique unique (id, categoria_id)
);

create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  codigo_interno text not null unique,
  categoria_id uuid not null references public.categorias(id) on delete restrict,
  subcategoria_id uuid not null,
  nombre_producto text not null,
  marca_id uuid not null references public.marcas(id) on delete restrict,
  presentacion text,
  unidad_base text,
  stock_actual numeric(10,2) default 0,
  stock_minimo numeric(10,2),
  precio_compra_referencial numeric(10,2),
  precio_venta numeric(10,2),
  imagen_url text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint productos_subcategoria_categoria_fk
    foreign key (subcategoria_id, categoria_id)
    references public.subcategorias(id, categoria_id)
    on delete restrict,
  constraint productos_stock_actual_check check (stock_actual is null or stock_actual >= 0),
  constraint productos_stock_minimo_check check (stock_minimo is null or stock_minimo >= 0),
  constraint productos_precio_compra_check check (precio_compra_referencial is null or precio_compra_referencial >= 0),
  constraint productos_precio_venta_check check (precio_venta is null or precio_venta >= 0)
);

create table public.producto_imagenes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  imagen_url text not null,
  orden integer not null default 1,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  estado text not null default 'pendiente',
  registrado_por_id uuid references public.usuarios_perfil(id) on delete set null,
  preparado_por_id uuid references public.usuarios_perfil(id) on delete set null,
  entregado_por_id uuid references public.usuarios_perfil(id) on delete set null,
  fecha_recojo timestamptz,
  subtotal numeric(10,2) not null default 0,
  descuento numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  observaciones text,
  stock_descontado boolean not null default false,
  preparado_at timestamptz,
  entregado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedidos_estado_check check (
    estado in (
      'pendiente',
      'pago_enviado',
      'pago_validado',
      'en_preparacion',
      'listo_para_recoger',
      'entregado',
      'cancelado'
    )
  ),
  constraint pedidos_montos_check check (
    subtotal >= 0 and descuento >= 0 and total >= 0
  )
);

create table public.detalle_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  cantidad numeric(10,2) not null,
  precio_unitario numeric(10,2) not null,
  subtotal numeric(10,2) generated always as (round((cantidad * precio_unitario)::numeric, 2)) stored,
  preparado boolean not null default false,
  cantidad_preparada numeric(10,2),
  observacion_preparacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint detalle_pedido_cantidad_check check (cantidad > 0),
  constraint detalle_pedido_precio_unitario_check check (precio_unitario >= 0),
  constraint detalle_pedido_cantidad_preparada_check check (
    cantidad_preparada is null or cantidad_preparada >= 0
  )
);

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.pedidos(id) on delete cascade,
  metodo text not null default 'yape',
  estado text not null default 'pendiente',
  monto numeric(10,2) not null,
  captura_yape_url text,
  validado_por_id uuid references public.usuarios_perfil(id) on delete set null,
  validado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pagos_metodo_check check (metodo in ('yape', 'efectivo', 'transferencia')),
  constraint pagos_estado_check check (estado in ('pendiente', 'enviado', 'validado', 'rechazado')),
  constraint pagos_monto_check check (monto >= 0)
);

create table public.stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  pedido_id uuid references public.pedidos(id) on delete set null,
  tipo text not null,
  cantidad numeric(10,2) not null,
  stock_anterior numeric(10,2),
  stock_nuevo numeric(10,2),
  motivo text,
  registrado_por_id uuid references public.usuarios_perfil(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movimientos_tipo_check check (
    tipo in ('entrada', 'salida', 'ajuste', 'venta')
  ),
  constraint stock_movimientos_cantidad_check check (cantidad > 0)
);

create trigger set_roles_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

create trigger set_usuarios_perfil_updated_at
before update on public.usuarios_perfil
for each row execute function public.set_updated_at();

create trigger set_clientes_updated_at
before update on public.clientes
for each row execute function public.set_updated_at();

create trigger set_categorias_updated_at
before update on public.categorias
for each row execute function public.set_updated_at();

create trigger set_subcategorias_updated_at
before update on public.subcategorias
for each row execute function public.set_updated_at();

create trigger set_marcas_updated_at
before update on public.marcas
for each row execute function public.set_updated_at();

create trigger set_productos_updated_at
before update on public.productos
for each row execute function public.set_updated_at();

create trigger set_pedidos_updated_at
before update on public.pedidos
for each row execute function public.set_updated_at();

create trigger set_detalle_pedido_updated_at
before update on public.detalle_pedido
for each row execute function public.set_updated_at();

create trigger set_pagos_updated_at
before update on public.pagos
for each row execute function public.set_updated_at();

create or replace function public.descontar_stock_pedido_en_preparacion()
returns trigger as $$
declare
  item record;
  stock_previo numeric(10,2);
  stock_final numeric(10,2);
begin
  if new.estado = 'en_preparacion'
     and old.estado is distinct from 'en_preparacion'
     and new.stock_descontado = false then

    for item in
      select producto_id, cantidad
      from public.detalle_pedido
      where pedido_id = new.id
    loop
      select coalesce(stock_actual, 0)
      into stock_previo
      from public.productos
      where id = item.producto_id
      for update;

      stock_final := stock_previo - item.cantidad;

      update public.productos
      set stock_actual = stock_final
      where id = item.producto_id;

      insert into public.stock_movimientos (
        producto_id,
        pedido_id,
        tipo,
        cantidad,
        stock_anterior,
        stock_nuevo,
        motivo,
        registrado_por_id
      )
      values (
        item.producto_id,
        new.id,
        'venta',
        item.cantidad,
        stock_previo,
        stock_final,
        'Descuento automatico al pasar pedido a en_preparacion',
        new.registrado_por_id
      );
    end loop;

    new.stock_descontado := true;
    new.preparado_at := coalesce(new.preparado_at, now());
  end if;

  return new;
end;
$$ language plpgsql;

create trigger descontar_stock_al_en_preparacion
before update of estado on public.pedidos
for each row
execute function public.descontar_stock_pedido_en_preparacion();

create index idx_productos_codigo_interno
on public.productos (codigo_interno);

create index idx_productos_nombre_producto
on public.productos using gin (to_tsvector('spanish', nombre_producto));

create index idx_pedidos_estado
on public.pedidos (estado);

create index idx_pedidos_cliente_id
on public.pedidos (cliente_id);

create index idx_pedidos_fecha_recojo
on public.pedidos (fecha_recojo);

create index idx_subcategorias_categoria_id
on public.subcategorias (categoria_id);

create index idx_productos_categoria_id
on public.productos (categoria_id);

create index idx_productos_subcategoria_id
on public.productos (subcategoria_id);

create index idx_productos_marca_id
on public.productos (marca_id);

create index idx_detalle_pedido_pedido_id
on public.detalle_pedido (pedido_id);

create index idx_detalle_pedido_producto_id
on public.detalle_pedido (producto_id);

create index idx_stock_movimientos_producto_id
on public.stock_movimientos (producto_id);

create index idx_stock_movimientos_pedido_id
on public.stock_movimientos (pedido_id);

insert into public.roles (nombre, descripcion)
values
  ('admin', 'Administrador del sistema'),
  ('vendedor', 'Registra ventas y pedidos'),
  ('preparador', 'Prepara pedidos'),
  ('repartidor', 'Entrega pedidos')
on conflict (nombre) do nothing;
