grant insert on public.categorias to anon, authenticated;
grant insert on public.subcategorias to anon, authenticated;
grant insert on public.marcas to anon, authenticated;

create unique index if not exists categorias_nombre_normalizado_unique
on public.categorias (
  lower(regexp_replace(btrim(nombre), '\s+', ' ', 'g'))
);

create unique index if not exists marcas_nombre_normalizado_unique
on public.marcas (
  lower(regexp_replace(btrim(nombre), '\s+', ' ', 'g'))
);

create unique index if not exists subcategorias_categoria_nombre_normalizado_unique
on public.subcategorias (
  categoria_id,
  lower(regexp_replace(btrim(nombre), '\s+', ' ', 'g'))
);
