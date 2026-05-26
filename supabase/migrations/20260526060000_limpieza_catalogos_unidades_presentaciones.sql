-- Limpieza de catalogos de unidades_base y presentaciones para alinearlos
-- al nuevo modelo:
--   - unidad_base = la unidad atomica de venta (kg, g, lt, ml, und).
--     NO incluye envases (bolsa, caja, saco). Esos van en presentaciones
--     de compra (producto_presentaciones_compra).
--   - presentacion textual = nombre comercial del envase (Bolsa 1kg, Lata
--     473ml). NO debe contener factores como "BOLx20" porque el factor
--     vive ahora en producto_presentaciones_compra.unidades_por_presentacion.

-- 1. Asegurar que existan las unidades base correctas (idempotente).
insert into public.unidades_base (nombre, activo)
values
  ('und', true),
  ('kg', true),
  ('g', true),
  ('lt', true),
  ('ml', true)
on conflict (nombre) do update set activo = true;

-- 2. Desactivar las "unidades" que en realidad son envases.
update public.unidades_base
   set activo = false
 where lower(nombre) in (
   'bolsa', 'caja', 'casillero', 'paquete', 'sachet',
   'unidad', 'kilo', 'gramo', 'litro', 'mililitro' -- formas largas, reemplazadas por abreviaciones
 );

-- 3. Migrar productos con unidad_base invalida o ambigua a "und" (default
--    seguro). Esto NO toca productos que ya tengan unidad valida.
update public.productos
   set unidad_base = 'und'
 where unidad_base is null
    or lower(unidad_base) in (
      'bolsa', 'caja', 'casillero', 'paquete', 'sachet'
    );

-- Normalizar formas largas a abreviaciones en productos existentes.
update public.productos set unidad_base = 'und' where lower(unidad_base) = 'unidad';
update public.productos set unidad_base = 'kg'  where lower(unidad_base) = 'kilo';
update public.productos set unidad_base = 'g'   where lower(unidad_base) = 'gramo';
update public.productos set unidad_base = 'lt'  where lower(unidad_base) = 'litro';
update public.productos set unidad_base = 'ml'  where lower(unidad_base) = 'mililitro';

-- 4. Asegurar presentaciones textuales basicas (envases sin factor).
insert into public.presentaciones (nombre, activo)
values
  ('Unidad', true),
  ('Bolsa', true),
  ('Botella', true),
  ('Lata', true),
  ('Caja', true),
  ('Plancha', true),
  ('Pack', true),
  ('Paquete', true),
  ('Saco', true),
  ('Frasco', true),
  ('Galon', true),
  ('Sachet', true)
on conflict (nombre) do update set activo = true;

-- 5. Desactivar presentaciones con factor (ej. BOLx20, CJAx12). El factor
--    ahora vive en producto_presentaciones_compra.unidades_por_presentacion,
--    no en el nombre. Las presentaciones existentes NO se borran (algun
--    producto puede tenerlas asignadas como texto); solo se ocultan del
--    dropdown.
update public.presentaciones
   set activo = false
 where (
    nombre ~* '^[A-Z]+x[0-9]'      -- BOLx20, CJAx12, PAQx24, etc.
    or nombre ~* '^[A-Z]+\s*x\s*[0-9]'  -- BOL x15, PAQ x4
    or upper(nombre) in ('UND', 'KILO', 'BOL', 'BOT', 'PAQ')  -- abreviaciones obsoletas
 );
