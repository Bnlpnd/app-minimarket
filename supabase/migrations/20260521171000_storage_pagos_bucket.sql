insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pagos',
  'pagos',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
