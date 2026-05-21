grant usage on schema public to anon, authenticated;

grant select on public.categorias to anon, authenticated;
grant select on public.subcategorias to anon, authenticated;
grant select on public.marcas to anon, authenticated;
grant select on public.productos to anon, authenticated;
grant select on public.producto_imagenes to anon, authenticated;

grant select, insert, update on public.clientes to authenticated;
grant select, insert, update on public.pedidos to authenticated;
grant select, insert, update on public.detalle_pedido to authenticated;
grant select, insert, update on public.pagos to authenticated;
grant select on public.stock_movimientos to authenticated;
grant select on public.roles to authenticated;
grant select on public.usuarios_perfil to authenticated;
