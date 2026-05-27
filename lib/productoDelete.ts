import { supabase } from "@/lib/supabaseClient";

export type DeleteProductoResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Borra un producto y sus relaciones. Valida primero que no este en
 * uso (pedidos, base de otra presentacion) y borra la imagen del
 * storage si vive en nuestro bucket.
 *
 * Pensado para usarse tanto desde el form de edicion como desde el
 * listado de productos con boton inline.
 */
export async function deleteProducto(
  productoId: string,
  imagenUrl: string | null | undefined,
): Promise<DeleteProductoResult> {
  if (!supabase) return { ok: false, reason: "Sin conexion a Supabase." };

  // 1) Verificar que no este en pedidos (como producto vendido o stock).
  const usoComoItem = await supabase
    .from("detalle_pedido")
    .select("id", { count: "exact", head: true })
    .or(`producto_id.eq.${productoId},producto_stock_id.eq.${productoId}`);

  if (usoComoItem.error) {
    return { ok: false, reason: `No se pudo verificar uso: ${usoComoItem.error.message}` };
  }
  if ((usoComoItem.count ?? 0) > 0) {
    return {
      ok: false,
      reason: `Tiene ${usoComoItem.count} venta(s) asociada(s). Para preservar el historial, desactivalo en lugar de borrar.`,
    };
  }

  // 2) Verificar que no sea base de otra presentacion.
  const esBase = await supabase
    .from("productos")
    .select("id", { count: "exact", head: true })
    .eq("producto_base_id", productoId);
  if ((esBase.count ?? 0) > 0) {
    return {
      ok: false,
      reason: "Otros productos lo tienen como base. Desvincula esas presentaciones antes de eliminar.",
    };
  }

  // 3) Borrar imagen del storage si esta en nuestro bucket.
  if (imagenUrl) {
    try {
      const url = new URL(imagenUrl);
      const marker = "/storage/v1/object/public/productos/";
      const idx = url.pathname.indexOf(marker);
      if (idx >= 0) {
        const objectPath = url.pathname.slice(idx + marker.length);
        if (objectPath) {
          await supabase.storage.from("productos").remove([objectPath]);
        }
      }
    } catch {
      // URL no es del storage, no es bloqueante.
    }
  }

  // 4) Borrar relaciones y producto. Si hay lotes/reservas/movimientos
  // los borramos también para evitar foreign key violations.
  const tablasRelacionadas: Array<{ table: string; col: string }> = [
    { table: "producto_almacen", col: "producto_id" },
    { table: "producto_presentaciones_compra", col: "producto_id" },
    { table: "producto_precios_mayor", col: "producto_id" },
    { table: "producto_lotes", col: "producto_id" },
    { table: "stock_reservas", col: "producto_id" },
    { table: "stock_movimientos", col: "producto_id" },
  ];

  for (const { table, col } of tablasRelacionadas) {
    await supabase.from(table).delete().eq(col, productoId);
  }

  const del = await supabase.from("productos").delete().eq("id", productoId);
  if (del.error) {
    return { ok: false, reason: `No se pudo eliminar: ${del.error.message}` };
  }

  return { ok: true };
}

/**
 * Devuelve un Set con los IDs de productos que tienen al menos 1 venta
 * o son base de otra presentacion. Sirve para deshabilitar el boton
 * eliminar en el listado sin tener que hacer 1 query por producto.
 */
export async function fetchProductosNoEliminables(): Promise<Set<string>> {
  if (!supabase) return new Set();
  const noEliminables = new Set<string>();

  // Productos referenciados en detalle_pedido (como producto o stock_id).
  const ventasRes = await supabase
    .from("detalle_pedido")
    .select("producto_id, producto_stock_id");
  if (ventasRes.data) {
    for (const row of ventasRes.data as Array<{
      producto_id: string | null;
      producto_stock_id: string | null;
    }>) {
      if (row.producto_id) noEliminables.add(row.producto_id);
      if (row.producto_stock_id) noEliminables.add(row.producto_stock_id);
    }
  }

  // Productos que son base de otro.
  const basesRes = await supabase
    .from("productos")
    .select("producto_base_id")
    .not("producto_base_id", "is", null);
  if (basesRes.data) {
    for (const row of basesRes.data as Array<{ producto_base_id: string | null }>) {
      if (row.producto_base_id) noEliminables.add(row.producto_base_id);
    }
  }

  return noEliminables;
}
