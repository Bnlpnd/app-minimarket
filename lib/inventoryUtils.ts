import type { Almacen, ProductoAlmacen } from "@/types/database";

type StockRow = Pick<ProductoAlmacen, "almacen_id" | "stock_actual"> & {
  almacenes?: Pick<Almacen, "id" | "nombre"> | null;
};

export type ProductWithStockPresentation = {
  id: string;
  producto_base_id?: string | null;
  unidades_equivalentes?: number | null;
  producto_almacen?: StockRow[] | null;
  producto_base?: {
    id: string;
    producto_almacen?: StockRow[] | null;
  } | null;
};

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
