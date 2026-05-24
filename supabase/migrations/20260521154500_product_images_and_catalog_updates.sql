grant update on public.categorias to anon, authenticated;
grant update on public.subcategorias to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'productos_storage_public_read'
  ) then
    create policy "productos_storage_public_read"
    on storage.objects
    for select
    to anon, authenticated
    using (bucket_id = 'productos');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'productos_storage_insert'
  ) then
    create policy "productos_storage_insert"
    on storage.objects
    for insert
    to anon, authenticated
    with check (bucket_id = 'productos');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'productos_storage_update'
  ) then
    create policy "productos_storage_update"
    on storage.objects
    for update
    to anon, authenticated
    using (bucket_id = 'productos')
    with check (bucket_id = 'productos');
  end if;
end $$;
