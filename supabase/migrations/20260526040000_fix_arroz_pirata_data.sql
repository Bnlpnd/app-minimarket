-- Limpieza puntual de la data del Arroz pirata azul.
-- El producto duplicado "Saco arroz Pirata azul" (f6a5f9f6...) era
-- redundante: el saco se modela como presentacion de compra del base,
-- no como producto separado. Los precios por mayor estaban en formato
-- incorrecto (unitario en vez de total), y el stock no reflejaba la
-- intencion del usuario (8 sacos en Tienda = 392 kg).

do $$
declare
  v_base_id uuid := '259ae2d6-8dd0-4e70-b44a-6b276baf19b6'; -- Arroz pirata azul (kg)
  v_saco_id uuid := 'f6a5f9f6-a808-47c4-9a7c-f03784e51ee3'; -- duplicado saco
  v_tienda uuid;
  v_casa uuid;
begin
  select id into v_tienda from public.almacenes where lower(nombre) = 'tienda' limit 1;
  select id into v_casa from public.almacenes where lower(nombre) = 'casa' limit 1;

  -- 1. Borrar el producto duplicado y todas sus relaciones.
  delete from public.producto_almacen where producto_id = v_saco_id;
  delete from public.producto_presentaciones_compra where producto_id = v_saco_id;
  delete from public.producto_precios_mayor where producto_id = v_saco_id;
  delete from public.productos where id = v_saco_id;

  -- 2. Borrar la presentacion de compra "KILO x1" redundante del base.
  --    La unidad base ya es kg, no necesitamos una presentacion x1.
  delete from public.producto_presentaciones_compra
   where producto_id = v_base_id
     and unidades_por_presentacion = 1;

  -- 3. Borrar el precio por mayor mal puesto (unitario=68 cuando deberia
  --    ser total=68).
  delete from public.producto_precios_mayor
   where producto_id = v_base_id
     and cantidad_minima = 24.5;

  -- 4. Insertar los dos precios por mayor correctos.
  --    Medio saco: 24.5 kg total S/68 → unitario 2.78
  --    Saco entero: 49 kg total S/135 → unitario 2.7551
  insert into public.producto_precios_mayor
    (producto_id, cantidad_minima, precio_unitario, precio_total, tipo_precio, descripcion, activo)
  values
    (v_base_id, 24.5, round(68.0::numeric / 24.5, 4), 68, 'paquete', 'Medio saco S/68', true),
    (v_base_id, 49,   round(135.0::numeric / 49, 4),  135, 'paquete', 'Saco entero S/135', true);

  -- 5. Stock minimo: 4 sacos = 196 kg.
  update public.productos
     set stock_minimo = 196,
         precio_compra_referencial = round(122.0::numeric / 49, 4) -- 2.49 por kg
   where id = v_base_id;

  -- 6. Stock real: 8 sacos en Tienda = 392 kg. Casa = 0 (los 8 kg
  --    actuales eran de prueba y no corresponden al stock real).
  if v_tienda is not null then
    insert into public.producto_almacen (producto_id, almacen_id, stock_actual)
    values (v_base_id, v_tienda, 392)
    on conflict (producto_id, almacen_id)
    do update set stock_actual = 392;
  end if;

  if v_casa is not null then
    update public.producto_almacen
       set stock_actual = 0
     where producto_id = v_base_id and almacen_id = v_casa;
  end if;
end$$;
