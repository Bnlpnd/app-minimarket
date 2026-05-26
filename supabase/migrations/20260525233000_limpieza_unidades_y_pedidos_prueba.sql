-- 1. Limpiar data legacy de unidades_por_presentacion en presentaciones de
-- compra. El nuevo flow trabaja siempre a nivel de UNIDAD (precio compra
-- y stock son por unidad). Las presentaciones-bundle ya viven como
-- producto-presentacion separado con producto_base_id + unidades_equivalentes,
-- por lo que `producto_presentaciones_compra.unidades_por_presentacion`
-- queda sin uso y lo fijamos en 1 para evitar inconsistencias.
update public.producto_presentaciones_compra
   set unidades_por_presentacion = 1
 where unidades_por_presentacion is distinct from 1;

-- 2. Borrar pedidos de prueba (data dummy). Los triggers de proteccion
-- de pedidos entregados se deshabilitan temporalmente para esta operacion
-- de limpieza de datos no productivos.
alter table public.pedidos disable trigger proteger_pedido_entregado_trigger;
alter table public.pedidos disable trigger no_borrar_pedido_entregado_trigger;
alter table public.detalle_pedido disable trigger proteger_detalle_pedido_entregado_trigger;

delete from public.pedidos
 where id::text like '03e2e8b6%'
    or id::text like '24c36750%'
    or id::text like '644cb759%'
    or id::text like '41c0758f%';

alter table public.pedidos enable trigger proteger_pedido_entregado_trigger;
alter table public.pedidos enable trigger no_borrar_pedido_entregado_trigger;
alter table public.detalle_pedido enable trigger proteger_detalle_pedido_entregado_trigger;
