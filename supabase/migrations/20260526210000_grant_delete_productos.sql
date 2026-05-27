-- Grants DELETE faltantes para que el admin pueda borrar productos
-- desde la UI. El flujo de eliminar producto (lib/productoDelete.ts)
-- toca varias tablas en cascada antes de borrar el producto en si.
-- Sin estos GRANTs el cliente recibe "permission denied for table X".

grant delete on table public.productos to anon, authenticated;
grant delete on table public.producto_almacen to anon, authenticated;
grant delete on table public.producto_presentaciones_compra to anon, authenticated;
grant delete on table public.producto_precios_mayor to anon, authenticated;
grant delete on table public.producto_lotes to anon, authenticated;
grant delete on table public.stock_reservas to anon, authenticated;
grant delete on table public.stock_movimientos to anon, authenticated;
