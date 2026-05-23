create or replace function public.product_code_segment(raw_value text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text;
begin
  normalized := upper(
    regexp_replace(
      translate(
        coalesce(raw_value, ''),
        'áéíóúüñÁÉÍÓÚÜÑ',
        'aeiouunAEIOUUN'
      ),
      '[^A-Za-z0-9]',
      '',
      'g'
    )
  );

  if normalized = '' then
    normalized := 'XXX';
  end if;

  return rpad(left(normalized, 3), 3, 'X');
end;
$$;

create or replace function public.generar_codigo_producto(
  p_categoria_id uuid,
  p_subcategoria_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  categoria_nombre text;
  subcategoria_nombre text;
  prefix text;
  next_number integer;
begin
  select c.nombre
  into categoria_nombre
  from public.categorias c
  where c.id = p_categoria_id;

  select s.nombre
  into subcategoria_nombre
  from public.subcategorias s
  where s.id = p_subcategoria_id
    and s.categoria_id = p_categoria_id;

  if categoria_nombre is null then
    raise exception 'No existe categoria para generar codigo.';
  end if;

  if subcategoria_nombre is null then
    raise exception 'No existe subcategoria asociada a la categoria para generar codigo.';
  end if;

  prefix := public.product_code_segment(categoria_nombre)
    || '-'
    || public.product_code_segment(subcategoria_nombre);

  perform pg_advisory_xact_lock(hashtext('productos.codigo.' || prefix));

  select coalesce(max((substring(p.codigo_interno from ('^' || prefix || '-([0-9]+)$')))::integer), 0) + 1
  into next_number
  from public.productos p
  where p.codigo_interno ~ ('^' || prefix || '-[0-9]+$');

  return prefix || '-' || lpad(next_number::text, 3, '0');
end;
$$;

create or replace function public.set_codigo_producto_autogenerado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.codigo_interno, '')), '') is null then
    new.codigo_interno := public.generar_codigo_producto(
      new.categoria_id,
      new.subcategoria_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists set_codigo_producto_autogenerado_on_insert on public.productos;
create trigger set_codigo_producto_autogenerado_on_insert
before insert on public.productos
for each row execute function public.set_codigo_producto_autogenerado();

grant execute on function public.generar_codigo_producto(uuid, uuid) to anon, authenticated;
