create or replace function public.descontar_stock_pedido_en_preparacion()
returns trigger
security definer
set search_path = public
as $$
declare
  item record;
  stock_previo numeric(10,2);
  stock_final numeric(10,2);
begin
  if new.estado = 'en_preparacion'
     and old.estado is distinct from 'en_preparacion'
     and new.stock_descontado = false then

    for item in
      select producto_id, cantidad
      from public.detalle_pedido
      where pedido_id = new.id
    loop
      select coalesce(stock_actual, 0)
      into stock_previo
      from public.productos
      where id = item.producto_id
      for update;

      if stock_previo < item.cantidad then
        raise exception 'Stock insuficiente para producto %. Stock actual: %, requerido: %',
          item.producto_id,
          stock_previo,
          item.cantidad;
      end if;

      stock_final := stock_previo - item.cantidad;

      update public.productos
      set stock_actual = stock_final
      where id = item.producto_id;

      insert into public.stock_movimientos (
        producto_id,
        pedido_id,
        tipo,
        cantidad,
        stock_anterior,
        stock_nuevo,
        motivo,
        registrado_por_id
      )
      values (
        item.producto_id,
        new.id,
        'venta',
        item.cantidad,
        stock_previo,
        stock_final,
        'Descuento automatico al pasar pedido a en_preparacion',
        coalesce(new.preparado_por_id, new.registrado_por_id)
      );
    end loop;

    new.stock_descontado := true;
    new.preparado_at := coalesce(new.preparado_at, now());
  end if;

  return new;
end;
$$ language plpgsql;
