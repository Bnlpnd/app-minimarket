alter table public.pedidos
add column if not exists hora_recojo time,
add column if not exists metodo_pago text,
add column if not exists nota_cliente text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_metodo_pago_check'
  ) then
    alter table public.pedidos
    add constraint pedidos_metodo_pago_check
    check (metodo_pago is null or metodo_pago in ('yape', 'efectivo', 'otro', 'transferencia'));
  end if;
end $$;

alter table public.pagos
drop constraint if exists pagos_metodo_check;

alter table public.pagos
add constraint pagos_metodo_check
check (metodo in ('yape', 'efectivo', 'otro', 'transferencia'));

create index if not exists idx_pedidos_metodo_pago
on public.pedidos (metodo_pago);

grant select, insert, update on public.detalle_pedido to anon, authenticated;
grant select, insert, update on public.pagos to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'pagos_storage_public_read'
  ) then
    create policy "pagos_storage_public_read"
    on storage.objects
    for select
    to anon, authenticated
    using (bucket_id = 'pagos');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'pagos_storage_insert'
  ) then
    create policy "pagos_storage_insert"
    on storage.objects
    for insert
    to anon, authenticated
    with check (bucket_id = 'pagos');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'pagos_storage_update'
  ) then
    create policy "pagos_storage_update"
    on storage.objects
    for update
    to anon, authenticated
    using (bucket_id = 'pagos')
    with check (bucket_id = 'pagos');
  end if;
end $$;
