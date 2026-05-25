import type { Almacen, Producto, ProductoAlmacen } from "@/types/database";

type StockRow = Pick<ProductoAlmacen, "almacen_id" | "stock_actual"> & {
  almacenes?: Pick<Almacen, "id" | "nombre"> | null;
};

/**
 * Stock minimo default cuando productos.stock_minimo es null.
 * Se usa para marcar "stock bajo" (color naranja en UI).
 */
export const STOCK_BAJO_DEFAULT = 10;

export type ProductWithStockPresentation = {
  id: string;
  producto_base_id?: string | null;
  unidades_equivalentes?: number | null;
  stock_minimo?: number | null;
  producto_almacen?: StockRow[] | null;
  producto_base?: {
    id: string;
    producto_almacen?: StockRow[] | null;
  } | null;
};

export type StockReservadoMap = Map<string, number>;

function stockReservadoKey(productoId: string, almacenId: string) {
  return `${productoId}::${almacenId}`;
}

/**
 * Construye un Map<"producto_id::almacen_id", cantidad_reservada> a partir
 * de las filas de vista_stock_reservado.
 */
export function buildReservadoMap(
  rows: Array<{ producto_id: string; almacen_id: string; total_reservado: number | string }>,
): StockReservadoMap {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(stockReservadoKey(row.producto_id, row.almacen_id), Number(row.total_reservado));
  }
  return map;
}

export function getStockReservado(
  reservadoMap: StockReservadoMap | null | undefined,
  productoId: string,
  almacenId: string,
) {
  if (!reservadoMap) return 0;
  return reservadoMap.get(stockReservadoKey(productoId, almacenId)) ?? 0;
}

export function getStockProductId(producto: ProductWithStockPresentation) {
  return producto.producto_base_id || producto.id;
}

export function getUnitsPerSale(producto: ProductWithStockPresentation) {
  const units = Number(producto.unidades_equivalentes ?? 1);
  return Number.isFinite(units) && units > 0 ? units : 1;
}

export function getBaseStockRows(producto: ProductWithStockPresentation) {
  return producto.producto_base?.producto_almacen ?? producto.producto_almacen ?? [];
}

export function getBaseStockByName(
  producto: ProductWithStockPresentation,
  name: string,
) {
  return Number(
    getBaseStockRows(producto).find(
      (row) => row.almacenes?.nombre.toLowerCase() === name.toLowerCase(),
    )?.stock_actual ?? 0,
  );
}

export function getBaseStockByAlmacen(
  producto: ProductWithStockPresentation,
  almacenId: string,
) {
  return Number(
    getBaseStockRows(producto).find((row) => row.almacen_id === almacenId)
      ?.stock_actual ?? 0,
  );
}

export function toPresentationStock(
  producto: ProductWithStockPresentation,
  baseStock: number,
) {
  const units = getUnitsPerSale(producto);
  if (units <= 1) {
    return baseStock;
  }

  return Math.floor(baseStock / units);
}

export function presentationRemainder(
  producto: ProductWithStockPresentation,
  baseStock: number,
) {
  const units = getUnitsPerSale(producto);
  if (units <= 1) {
    return 0;
  }

  return baseStock % units;
}

export function toBaseQuantity(
  producto: ProductWithStockPresentation,
  presentationQuantity: number,
) {
  return presentationQuantity * getUnitsPerSale(producto);
}

/**
 * Stock disponible = stock_actual - reservado por carritos/pedidos abiertos.
 * Calcula sobre el producto base (resolviendo presentacion).
 */
export function getStockDisponible(
  producto: ProductWithStockPresentation,
  almacenId: string,
  reservadoMap: StockReservadoMap | null | undefined,
) {
  const stockBase = getBaseStockByAlmacen(producto, almacenId);
  const stockId = getStockProductId(producto);
  const reservado = getStockReservado(reservadoMap, stockId, almacenId);
  return Math.max(0, stockBase - reservado);
}

/**
 * Indica si el stock disponible esta en nivel "bajo".
 * Umbral: stock_minimo del producto, o STOCK_BAJO_DEFAULT si no esta configurado.
 */
export function isStockBajo(
  producto: ProductWithStockPresentation,
  almacenId: string,
  reservadoMap: StockReservadoMap | null | undefined,
) {
  const disponible = getStockDisponible(producto, almacenId, reservadoMap);
  const umbral = Number(producto.stock_minimo ?? STOCK_BAJO_DEFAULT);
  return disponible <= umbral;
}

/**
 * Calcula nivel de stock para colorear en UI.
 * "sin" -> rojo (0 o menos)
 * "bajo" -> naranja (<= umbral)
 * "ok" -> normal
 */
export function getStockLevel(
  producto: ProductWithStockPresentation,
  almacenId: string,
  reservadoMap: StockReservadoMap | null | undefined,
): "sin" | "bajo" | "ok" {
  const disponible = getStockDisponible(producto, almacenId, reservadoMap);
  if (disponible <= 0) return "sin";
  const umbral = Number(producto.stock_minimo ?? STOCK_BAJO_DEFAULT);
  if (disponible <= umbral) return "bajo";
  return "ok";
}

/**
 * Resuelve los IDs de Tienda y Casa desde una lista de almacenes,
 * tolerando "Tienda"/"Negocio" como sinonimos.
 */
export function resolveCasaTiendaIds(
  almacenes: Array<Pick<Almacen, "id" | "nombre">>,
): { casaId: string | null; tiendaId: string | null } {
  const casaId = almacenes.find((a) => a.nombre.toLowerCase() === "casa")?.id ?? null;
  const tiendaId =
    almacenes.find((a) => a.nombre.toLowerCase() === "tienda")?.id ??
    almacenes.find((a) => a.nombre.toLowerCase() === "negocio")?.id ??
    null;
  return { casaId, tiendaId };
}

/**
 * Para tipos legacy donde solo hay Producto (sin embed producto_base):
 * resuelve el ID base con un Map<id, producto_base_id> precargado.
 * Util cuando el componente carga el producto fresco para confirmar
 * (ej. transferencias confirmadas mucho despues de creadas).
 */
export function resolveStockId(
  productoId: string,
  basePorProducto: Map<string, string | null> | null | undefined,
): string {
  if (!basePorProducto) return productoId;
  return basePorProducto.get(productoId) || productoId;
}

/**
 * Type guard: producto tiene base.
 */
export function tieneProductoBase(
  producto: Pick<Producto, "producto_base_id"> | null | undefined,
): boolean {
  return Boolean(producto?.producto_base_id);
}
