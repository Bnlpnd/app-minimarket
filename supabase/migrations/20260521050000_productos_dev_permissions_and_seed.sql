grant insert, update on public.productos to anon, authenticated;

insert into public.categorias (nombre, descripcion)
values ('General', 'Categoria base para productos sin clasificar')
on conflict (nombre) do nothing;

insert into public.marcas (nombre)
values ('Generica')
on conflict (nombre) do nothing;

insert into public.subcategorias (categoria_id, nombre, descripcion)
select id, 'General', 'Subcategoria base para productos sin clasificar'
from public.categorias
where nombre = 'General'
on conflict (categoria_id, nombre) do nothing;
