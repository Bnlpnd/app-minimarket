-- =====================================================================
-- AGREGAR PRODUCTOS EN BLOQUE
-- =====================================================================
-- Como usarlo:
--   1) Abri el SQL editor de Supabase
--      (https://supabase.com/dashboard/project/qdophedzbruzsduoeavk/sql)
--   2) Editas el array `productos` de abajo con tus datos.
--   3) Pegas todo este archivo y le das Run.
--
-- Que hace por cada producto:
--   - Crea (o reusa) categoria/subcategoria/marca/presentacion por nombre.
--   - Crea el producto si no existe (matchea por codigo_interno O por
--     nombre+marca+presentacion). Si ya existe, actualiza precio/stock.
--   - Suma stock a Tienda y/o Casa.
--   - Si das presentacion de compra (saco, plancha, caja...), la crea
--     y la marca como principal.
--   - Si das fecha de vencimiento, crea un lote en producto_lotes.
--   - Imprime NOTICE por cada accion (los ves en el panel "Messages").
--
-- Campos por producto (orden y nombres EXACTOS):
--   nombre            (texto, OBLIGATORIO)        - "Coca Cola 500ml"
--   categoria         (texto, OBLIGATORIO)        - "Bebidas"
--   subcategoria      (texto, OBLIGATORIO)        - "Gaseosas"
--   marca             (texto, OBLIGATORIO)        - "Coca Cola"
--   presentacion      (texto, OBLIGATORIO)        - "Botella" / "Lata" / "Unidad"
--   unidad_base       (texto, default 'und')      - "und" / "kg" / "lt" / "ml" / "g"
--   precio_compra     (numero, opcional)          - costo por unidad base
--   precio_venta      (numero, OBLIGATORIO)       - precio venta por unidad
--   stock_minimo      (numero, default 10)
--   stock_tienda      (numero, default 0)         - en UNIDAD BASE (kg, und, lt...)
--   stock_casa        (numero, default 0)         - en UNIDAD BASE
--   stock_tienda_pres (numero, opcional)          - en PRESENTACIONES (sacos, cajas)
--   stock_casa_pres   (numero, opcional)          - en PRESENTACIONES
--   imagen_url        (texto, opcional)
--   activo            (bool, default true)
--   codigo_interno    (texto, opcional - si lo dejas vacio se autogenera)
--
--   -- Presentacion de compra (opcional, todas o ninguna):
--   pres_compra_nombre        (texto)             - "Saco", "Caja", "Plancha"
--   pres_compra_unidades      (numero)            - 49 (saco trae 49 kg)
--   pres_compra_costo_total   (numero)            - 122.00 (costo de un saco)
--
-- COMO CARGAR STOCK POR PRESENTACION:
--   Si vendes arroz por kg pero compras por saco (49 kg cada uno) y tenes
--   3 sacos en Casa, podes cargar:
--       "pres_compra_nombre": "Saco x49",
--       "pres_compra_unidades": 49,
--       "stock_casa_pres": 3,
--       "stock_casa": 0   <-- o un sobrante en kg sueltos
--   El script suma:  3 sacos x 49 kg + 0 kg = 147 kg en Casa.
--
--   Tambien podes mezclar: "stock_casa_pres": 3 y "stock_casa": 5
--   -> 3 x 49 + 5 = 152 kg en Casa.
--
--   -- Lote inicial opcional (para tracking de vencimiento):
--   lote_fecha_vto    (texto YYYY-MM-DD)
--   lote_almacen      ('tienda' o 'casa')         - default 'tienda'
--
-- Tips:
--   - Si un campo no aplica, podes omitirlo (todo opcional menos los
--     obligatorios marcados arriba).
--   - El script es idempotente: si corres dos veces el mismo producto,
--     no se duplica (actualiza datos).
-- =====================================================================

do $$
declare
  productos jsonb := '[
    {
      "nombre": "Coca Cola 500ml",
      "categoria": "Bebidas",
      "subcategoria": "Gaseosas",
      "marca": "Coca Cola",
      "presentacion": "Botella",
      "unidad_base": "und",
      "precio_compra": 2.20,
      "precio_venta": 3.50,
      "stock_minimo": 12,
      "stock_tienda": 24,
      "stock_casa": 36,
      "pres_compra_nombre": "Pack",
      "pres_compra_unidades": 12,
      "pres_compra_costo_total": 26.40,
      "lote_fecha_vto": "2026-12-31",
      "lote_almacen": "tienda"
    },
    {
      "nombre": "Detergente Patito 1kg",
      "categoria": "Limpieza",
      "subcategoria": "Detergentes",
      "marca": "Patito",
      "presentacion": "Bolsa",
      "unidad_base": "und",
      "precio_compra": 4.33,
      "precio_venta": 6.00,
      "stock_tienda": 15,
      "stock_casa": 24,
      "pres_compra_nombre": "Bolsa x12",
      "pres_compra_unidades": 12,
      "pres_compra_costo_total": 51.90
    },
    {
      "nombre": "Galleta Soda Dia",
      "categoria": "Abarrotes",
      "subcategoria": "Galletas",
      "marca": "Dia",
      "presentacion": "Unidad",
      "unidad_base": "und",
      "precio_compra": 0.25,
      "precio_venta": 0.40,
      "stock_minimo": 50,
      "stock_tienda": 60,
      "stock_casa": 200,
      "pres_compra_nombre": "Paquete 10und",
      "pres_compra_unidades": 10,
      "pres_compra_costo_total": 2.50
    },
    {
      "nombre": "Arroz pirata azul",
      "categoria": "Abarrotes",
      "subcategoria": "Arroz",
      "marca": "Pirata",
      "presentacion": "Granel",
      "unidad_base": "kg",
      "precio_compra": 2.49,
      "precio_venta": 3.00,
      "stock_minimo": 20,
      "stock_tienda_pres": 1,
      "stock_tienda": 5,
      "stock_casa_pres": 3,
      "stock_casa": 0,
      "pres_compra_nombre": "Saco x49",
      "pres_compra_unidades": 49,
      "pres_compra_costo_total": 122.00
    }
  ]'::jsonb;

  -- ===== A partir de aca NO necesitas editar nada =====
  prod jsonb;
  v_categoria_id   uuid;
  v_subcat_id      uuid;
  v_marca_id       uuid;
  v_presentacion_id uuid;
  v_producto_id    uuid;
  v_existente_id   uuid;
  v_pres_compra_id uuid;
  v_almacen_tienda uuid;
  v_almacen_casa   uuid;
  v_almacen_lote   uuid;
  v_codigo         text;
  v_pres_unidades  numeric;
  v_pres_costo     numeric;
  v_lote_fecha     date;
  v_actualizado    int := 0;
  v_creado         int := 0;
  v_total_lotes    int := 0;
  v_total_pres     int := 0;
begin
  -- Resolver almacenes Tienda y Casa (deben existir).
  select id into v_almacen_tienda from public.almacenes
    where lower(nombre) in ('tienda', 'negocio') and activo = true
    limit 1;
  select id into v_almacen_casa from public.almacenes
    where lower(nombre) = 'casa' and activo = true
    limit 1;

  if v_almacen_tienda is null then
    raise exception 'Falta el almacen Tienda. Crealo desde la app antes de correr este script.';
  end if;

  for prod in select * from jsonb_array_elements(productos) loop
    -- ---- Validacion minima ----
    if coalesce(prod->>'nombre', '') = '' then
      raise warning 'Producto sin nombre, se omite: %', prod;
      continue;
    end if;
    if coalesce(prod->>'categoria', '') = ''
       or coalesce(prod->>'subcategoria', '') = ''
       or coalesce(prod->>'marca', '') = ''
       or coalesce(prod->>'presentacion', '') = '' then
      raise warning 'Producto % sin categoria/subcategoria/marca/presentacion, se omite.', prod->>'nombre';
      continue;
    end if;

    -- ---- Resolver categoria (crea si no existe) ----
    select id into v_categoria_id from public.categorias
      where lower(nombre) = lower(prod->>'categoria') limit 1;
    if v_categoria_id is null then
      insert into public.categorias (nombre, activo)
        values (prod->>'categoria', true)
        returning id into v_categoria_id;
      raise notice '  + Categoria nueva: %', prod->>'categoria';
    end if;

    -- ---- Resolver subcategoria (bajo esa categoria) ----
    select id into v_subcat_id from public.subcategorias
      where categoria_id = v_categoria_id
        and lower(nombre) = lower(prod->>'subcategoria')
      limit 1;
    if v_subcat_id is null then
      insert into public.subcategorias (categoria_id, nombre, activo)
        values (v_categoria_id, prod->>'subcategoria', true)
        returning id into v_subcat_id;
      raise notice '  + Subcategoria nueva: %', prod->>'subcategoria';
    end if;

    -- ---- Resolver marca ----
    select id into v_marca_id from public.marcas
      where lower(nombre) = lower(prod->>'marca') limit 1;
    if v_marca_id is null then
      insert into public.marcas (nombre, activo)
        values (prod->>'marca', true)
        returning id into v_marca_id;
      raise notice '  + Marca nueva: %', prod->>'marca';
    end if;

    -- ---- Resolver presentacion (catalogo) ----
    select id into v_presentacion_id from public.presentaciones
      where lower(nombre) = lower(prod->>'presentacion') limit 1;
    if v_presentacion_id is null then
      insert into public.presentaciones (nombre, activo)
        values (prod->>'presentacion', true)
        returning id into v_presentacion_id;
      raise notice '  + Presentacion nueva: %', prod->>'presentacion';
    end if;

    -- ---- Buscar producto existente (por codigo O por nombre+marca+presentacion) ----
    v_codigo := nullif(prod->>'codigo_interno', '');
    v_existente_id := null;

    if v_codigo is not null then
      select id into v_existente_id from public.productos
        where lower(codigo_interno) = lower(v_codigo) limit 1;
    end if;
    if v_existente_id is null then
      select id into v_existente_id from public.productos
        where lower(nombre_producto) = lower(prod->>'nombre')
          and marca_id = v_marca_id
          and coalesce(lower(presentacion), '') = lower(prod->>'presentacion')
        limit 1;
    end if;

    -- ---- Crear o actualizar ----
    if v_existente_id is null then
      insert into public.productos (
        codigo_interno, categoria_id, subcategoria_id, nombre_producto,
        marca_id, presentacion, unidad_base, stock_minimo,
        precio_compra_referencial, precio_venta, imagen_url, activo
      ) values (
        v_codigo, -- si es null, el trigger autogenera
        v_categoria_id, v_subcat_id, prod->>'nombre',
        v_marca_id, prod->>'presentacion',
        coalesce(nullif(prod->>'unidad_base', ''), 'und'),
        coalesce((prod->>'stock_minimo')::numeric, 10),
        nullif(prod->>'precio_compra', '')::numeric,
        coalesce((prod->>'precio_venta')::numeric, 1),
        nullif(prod->>'imagen_url', ''),
        coalesce((prod->>'activo')::boolean, true)
      ) returning id into v_producto_id;
      v_creado := v_creado + 1;
      raise notice '[CREADO] %', prod->>'nombre';
    else
      v_producto_id := v_existente_id;
      update public.productos set
        categoria_id = v_categoria_id,
        subcategoria_id = v_subcat_id,
        marca_id = v_marca_id,
        presentacion = prod->>'presentacion',
        unidad_base = coalesce(nullif(prod->>'unidad_base', ''), unidad_base, 'und'),
        stock_minimo = coalesce((prod->>'stock_minimo')::numeric, stock_minimo),
        precio_compra_referencial = coalesce(
          nullif(prod->>'precio_compra', '')::numeric,
          precio_compra_referencial
        ),
        precio_venta = coalesce((prod->>'precio_venta')::numeric, precio_venta),
        imagen_url = coalesce(nullif(prod->>'imagen_url', ''), imagen_url),
        activo = coalesce((prod->>'activo')::boolean, activo),
        updated_at = now()
      where id = v_producto_id;
      v_actualizado := v_actualizado + 1;
      raise notice '[ACTUALIZADO] %', prod->>'nombre';
    end if;

    -- ---- Stock por almacen (en unidad base) ----
    -- Soporta dos formas en paralelo y las suma:
    --   stock_<almacen>       -> ya en unidad base (kg, und, lt)
    --   stock_<almacen>_pres  -> en presentaciones (sacos, cajas),
    --                            se multiplica por pres_compra_unidades.
    v_pres_unidades := nullif(prod->>'pres_compra_unidades', '')::numeric;
    declare
      v_stock_tienda_final numeric;
      v_stock_casa_final   numeric;
      v_tienda_base numeric := coalesce((prod->>'stock_tienda')::numeric, 0);
      v_casa_base   numeric := coalesce((prod->>'stock_casa')::numeric, 0);
      v_tienda_pres numeric := coalesce((prod->>'stock_tienda_pres')::numeric, 0);
      v_casa_pres   numeric := coalesce((prod->>'stock_casa_pres')::numeric, 0);
    begin
      if (v_tienda_pres > 0 or v_casa_pres > 0) and (v_pres_unidades is null or v_pres_unidades <= 0) then
        raise warning 'Producto % usa stock_*_pres pero no definio pres_compra_unidades; se ignoran las presentaciones.', prod->>'nombre';
      end if;

      v_stock_tienda_final := v_tienda_base + (
        case when v_pres_unidades is not null and v_pres_unidades > 0
             then v_tienda_pres * v_pres_unidades else 0 end
      );
      v_stock_casa_final := v_casa_base + (
        case when v_pres_unidades is not null and v_pres_unidades > 0
             then v_casa_pres * v_pres_unidades else 0 end
      );

      if v_stock_tienda_final > 0
         or (prod ? 'stock_tienda') or (prod ? 'stock_tienda_pres') then
        insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
          values (v_producto_id, v_almacen_tienda, v_stock_tienda_final)
          on conflict (producto_id, almacen_id)
          do update set stock_actual = excluded.stock_actual, updated_at = now();
      end if;

      if v_almacen_casa is not null and (
         v_stock_casa_final > 0
         or (prod ? 'stock_casa') or (prod ? 'stock_casa_pres')) then
        insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
          values (v_producto_id, v_almacen_casa, v_stock_casa_final)
          on conflict (producto_id, almacen_id)
          do update set stock_actual = excluded.stock_actual, updated_at = now();
      end if;
    end;

    -- ---- Presentacion de compra (opcional) ----
    -- v_pres_unidades ya fue asignada arriba (seccion stock).
    v_pres_costo := nullif(prod->>'pres_compra_costo_total', '')::numeric;
    if coalesce(prod->>'pres_compra_nombre', '') <> ''
       and v_pres_unidades is not null
       and v_pres_unidades > 0 then
      -- Buscar si ya existe por nombre + producto
      select id into v_pres_compra_id from public.producto_presentaciones_compra
        where producto_id = v_producto_id
          and lower(nombre_presentacion) = lower(prod->>'pres_compra_nombre')
        limit 1;

      if v_pres_compra_id is null then
        -- Desmarcar otras "principal"
        update public.producto_presentaciones_compra
          set es_principal = false
          where producto_id = v_producto_id;

        insert into public.producto_presentaciones_compra (
          producto_id, nombre_presentacion, unidades_por_presentacion,
          costo_presentacion, es_principal, activo
        ) values (
          v_producto_id, prod->>'pres_compra_nombre', v_pres_unidades,
          v_pres_costo, true, true
        );
        v_total_pres := v_total_pres + 1;
      else
        update public.producto_presentaciones_compra
          set unidades_por_presentacion = v_pres_unidades,
              costo_presentacion = coalesce(v_pres_costo, costo_presentacion),
              activo = true,
              updated_at = now()
          where id = v_pres_compra_id;
      end if;
    end if;

    -- ---- Lote con vencimiento (opcional) ----
    v_lote_fecha := nullif(prod->>'lote_fecha_vto', '')::date;
    if v_lote_fecha is not null then
      -- Elegir almacen del lote (default tienda)
      v_almacen_lote := v_almacen_tienda;
      if lower(coalesce(prod->>'lote_almacen', 'tienda')) = 'casa'
         and v_almacen_casa is not null then
        v_almacen_lote := v_almacen_casa;
      end if;

      -- Cantidad del lote = stock cargado en ese almacen
      declare
        v_cant_lote numeric;
      begin
        if v_almacen_lote = v_almacen_casa then
          v_cant_lote := coalesce((prod->>'stock_casa')::numeric, 0);
        else
          v_cant_lote := coalesce((prod->>'stock_tienda')::numeric, 0);
        end if;

        if v_cant_lote > 0 then
          insert into public.producto_lotes (
            producto_id, almacen_id, cantidad_inicial, cantidad_actual,
            fecha_vencimiento, origen, notas
          ) values (
            v_producto_id, v_almacen_lote, v_cant_lote, v_cant_lote,
            v_lote_fecha, 'inicial', 'Lote creado desde script bulk'
          );
          v_total_lotes := v_total_lotes + 1;
        end if;
      end;
    end if;

  end loop;

  raise notice '====================================';
  raise notice 'RESUMEN:';
  raise notice '  Productos creados:      %', v_creado;
  raise notice '  Productos actualizados: %', v_actualizado;
  raise notice '  Presentaciones nuevas:  %', v_total_pres;
  raise notice '  Lotes creados:          %', v_total_lotes;
  raise notice '====================================';
end $$;
