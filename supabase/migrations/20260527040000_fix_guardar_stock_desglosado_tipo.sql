-- Fix RPC guardar_stock_desglosado: faltaba setear la columna legacy
-- "tipo" en stock_movimientos (que es NOT NULL aparte del campo nuevo
-- "tipo_movimiento"). Sin esto, guardar el desglose fallaba con
-- "null value in column tipo violates not-null constraint".

create or replace function public.guardar_stock_desglosado(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_presentaciones jsonb,   -- [{id: pres_id, cantidad: 14}, ...]
  p_unidades_sueltas numeric default 0,
  p_observacion text default null,
  p_usuario_id uuid default null
) returns numeric
language plpgsql
security definer
as $$
declare
  v_stock_anterior numeric := 0;
  v_stock_nuevo numeric := 0;
  v_total_pres numeric := 0;
  v_item jsonb;
  v_sueltas numeric;
begin
  v_sueltas := coalesce(p_unidades_sueltas, 0);
  if v_sueltas < 0 then
    raise exception 'unidades_sueltas no puede ser negativo';
  end if;

  select coalesce(stock_actual, 0) into v_stock_anterior
    from public.producto_almacen
    where producto_id = p_producto_id and almacen_id = p_almacen_id;
  if v_stock_anterior is null then v_stock_anterior := 0; end if;

  delete from public.producto_almacen_presentacion
    where producto_id = p_producto_id and almacen_id = p_almacen_id;

  for v_item in select * from jsonb_array_elements(p_presentaciones) loop
    if (v_item->>'cantidad')::numeric < 0 then
      raise exception 'cantidad de presentacion no puede ser negativa';
    end if;
    if (v_item->>'cantidad')::numeric > 0 then
      insert into public.producto_almacen_presentacion
        (producto_id, almacen_id, presentacion_compra_id, cantidad)
      values (
        p_producto_id,
        p_almacen_id,
        (v_item->>'id')::uuid,
        (v_item->>'cantidad')::numeric
      );
    end if;
  end loop;

  select coalesce(sum(pap.cantidad * ppc.unidades_por_presentacion), 0)
    into v_total_pres
  from public.producto_almacen_presentacion pap
  join public.producto_presentaciones_compra ppc on ppc.id = pap.presentacion_compra_id
  where pap.producto_id = p_producto_id
    and pap.almacen_id = p_almacen_id;

  v_stock_nuevo := v_total_pres + v_sueltas;

  insert into public.producto_almacen
    (producto_id, almacen_id, stock_actual, unidades_sueltas)
    values (p_producto_id, p_almacen_id, v_stock_nuevo, v_sueltas)
    on conflict (producto_id, almacen_id)
    do update set
      stock_actual = excluded.stock_actual,
      unidades_sueltas = excluded.unidades_sueltas,
      updated_at = now();

  -- Movimiento de auditoria. Llenar AMBAS columnas: tipo (legacy NOT NULL)
  -- y tipo_movimiento (la actual).
  if v_stock_nuevo <> v_stock_anterior then
    insert into public.stock_movimientos (
      producto_id, almacen_destino_id, tipo, tipo_movimiento, cantidad,
      stock_anterior, stock_nuevo, observacion, registrado_por_id
    ) values (
      p_producto_id,
      p_almacen_id,
      'ajuste',
      'ajuste',
      v_stock_nuevo - v_stock_anterior,
      v_stock_anterior,
      v_stock_nuevo,
      coalesce(p_observacion, 'Stock guardado por desglose de presentacion'),
      p_usuario_id
    );
  end if;

  return v_stock_nuevo;
end;
$$;

grant execute on function public.guardar_stock_desglosado
  (uuid, uuid, jsonb, numeric, text, uuid) to anon, authenticated;
