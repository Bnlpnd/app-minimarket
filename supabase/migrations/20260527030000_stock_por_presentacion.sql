-- Stock desglosado por presentacion (no recalculado).
--
-- Antes el sistema solo guardaba el TOTAL en unidades base
-- (producto_almacen.stock_actual) y al mostrar el desglose por
-- presentacion (Caja x40, Caja x100, Unidad) lo CALCULABA partiendo
-- el total. Eso confundia al usuario: si el usuario habia cargado
-- "14 cajas x40 + 7 cajas x100", al mostrar veia "12 cajas x100 + 60
-- sueltas" o "31 cajas x40 + 20 sueltas" — la misma cantidad total
-- pero con diferente desglose, dependiendo de la presentacion.
--
-- Ahora se guarda la cantidad REAL por presentacion en una tabla
-- nueva. El stock_actual total = SUM(cant_pres × factor) + sueltas.
-- Lo que cargas es lo que ves.

create table if not exists public.producto_almacen_presentacion (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  almacen_id uuid not null references public.almacenes(id) on delete cascade,
  presentacion_compra_id uuid not null
    references public.producto_presentaciones_compra(id) on delete cascade,
  cantidad numeric(12,2) not null default 0 check (cantidad >= 0),
  updated_at timestamptz not null default now(),
  unique (producto_id, almacen_id, presentacion_compra_id)
);

create index if not exists idx_pap_producto_almacen
  on public.producto_almacen_presentacion (producto_id, almacen_id);

drop trigger if exists set_pap_updated_at on public.producto_almacen_presentacion;
create trigger set_pap_updated_at
  before update on public.producto_almacen_presentacion
  for each row execute function public.set_updated_at();

-- Unidades sueltas (las que estan fuera de cualquier presentacion).
alter table public.producto_almacen
  add column if not exists unidades_sueltas numeric(12,2)
    not null default 0 check (unidades_sueltas >= 0);

grant select, insert, update, delete on public.producto_almacen_presentacion
  to anon, authenticated;

-- RPC: guarda el desglose por presentacion + sueltas, y recalcula
-- producto_almacen.stock_actual. Registra movimiento de ajuste con
-- la diferencia. Idempotente: reemplaza el desglose completo.
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

  -- Stock previo (puede no existir la fila aun)
  select coalesce(stock_actual, 0) into v_stock_anterior
    from public.producto_almacen
    where producto_id = p_producto_id and almacen_id = p_almacen_id;
  if v_stock_anterior is null then v_stock_anterior := 0; end if;

  -- Borrar desglose anterior y reinsertar el nuevo
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

  -- Calcular nuevo total = SUM(cantidad × factor) + sueltas
  select coalesce(sum(pap.cantidad * ppc.unidades_por_presentacion), 0)
    into v_total_pres
  from public.producto_almacen_presentacion pap
  join public.producto_presentaciones_compra ppc on ppc.id = pap.presentacion_compra_id
  where pap.producto_id = p_producto_id
    and pap.almacen_id = p_almacen_id;

  v_stock_nuevo := v_total_pres + v_sueltas;

  -- Upsert producto_almacen
  insert into public.producto_almacen
    (producto_id, almacen_id, stock_actual, unidades_sueltas)
    values (p_producto_id, p_almacen_id, v_stock_nuevo, v_sueltas)
    on conflict (producto_id, almacen_id)
    do update set
      stock_actual = excluded.stock_actual,
      unidades_sueltas = excluded.unidades_sueltas,
      updated_at = now();

  -- Movimiento de auditoria (solo si hay diferencia real)
  if v_stock_nuevo <> v_stock_anterior then
    insert into public.stock_movimientos (
      producto_id, almacen_destino_id, tipo_movimiento, cantidad,
      stock_anterior, stock_nuevo, observacion, registrado_por_id
    ) values (
      p_producto_id,
      p_almacen_id,
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
