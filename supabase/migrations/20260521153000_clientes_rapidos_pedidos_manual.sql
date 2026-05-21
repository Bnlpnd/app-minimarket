alter table public.clientes
add column if not exists observacion text;

alter table public.pedidos
add column if not exists fecha_pedido timestamptz not null default now(),
add column if not exists detalle_manual text,
add column if not exists monto_a_cuenta numeric(10,2) not null default 0,
add column if not exists estado_pago text not null default 'debe';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_estado_pago_check'
  ) then
    alter table public.pedidos
    add constraint pedidos_estado_pago_check
    check (estado_pago in ('pagado', 'debe'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_monto_a_cuenta_check'
  ) then
    alter table public.pedidos
    add constraint pedidos_monto_a_cuenta_check
    check (monto_a_cuenta >= 0);
  end if;
end $$;

create unique index if not exists clientes_whatsapp_normalizado_unique
on public.clientes (
  regexp_replace(btrim(telefono), '\s+', '', 'g')
)
where telefono is not null and btrim(telefono) <> '';

create index if not exists idx_clientes_nombres
on public.clientes using gin (to_tsvector('spanish', nombres));

create index if not exists idx_clientes_telefono
on public.clientes (telefono);

create index if not exists idx_pedidos_fecha_pedido
on public.pedidos (fecha_pedido);

create index if not exists idx_pedidos_estado_pago
on public.pedidos (estado_pago);

grant select, insert, update on public.clientes to anon, authenticated;
grant select, insert, update on public.pedidos to anon, authenticated;
