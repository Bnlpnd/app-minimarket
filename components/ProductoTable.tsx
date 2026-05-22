"use client";

import Link from "next/link";
import type {
  Almacen,
  Categoria,
  Marca,
  Producto,
  ProductoAlmacen,
  Subcategoria,
} from "@/types/database";

export type ProductoStock = ProductoAlmacen & {
  almacenes: Pick<Almacen, "id" | "nombre"> | null;
};

export type ProductoConRelaciones = Producto & {
  categorias: Pick<Categoria, "nombre"> | null;
  subcategorias: Pick<Subcategoria, "nombre"> | null;
  marcas: Pick<Marca, "nombre"> | null;
  producto_almacen?: ProductoStock[];
};

type QuickValues = Record<string, { precio_venta: string; stock_minimo: string }>;

type ProductoTableProps = {
  productos: ProductoConRelaciones[];
  isLoading: boolean;
  quickValues: QuickValues;
  onQuickValueChange: (
    productoId: string,
    key: "precio_venta" | "stock_minimo",
    value: string,
  ) => void;
  onQuickSave: (producto: ProductoConRelaciones) => void;
  onToggleActivo: (producto: ProductoConRelaciones) => void;
};

function formatMoney(value: number | null) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatStock(value: number | null) {
  return Number(value ?? 0).toFixed(2).replace(/\.00$/, "");
}

function getStockByName(producto: ProductoConRelaciones, name: string) {
  const item = producto.producto_almacen?.find(
    (stock) => stock.almacenes?.nombre.toLowerCase() === name.toLowerCase(),
  );
  return Number(item?.stock_actual ?? 0);
}

function getStockTotal(producto: ProductoConRelaciones) {
  return (producto.producto_almacen ?? []).reduce(
    (sum, stock) => sum + Number(stock.stock_actual ?? 0),
    0,
  );
}

function stockResumen(producto: ProductoConRelaciones) {
  const items = producto.producto_almacen ?? [];
  if (items.length === 0) {
    return "Sin stock por almacen";
  }

  return items
    .map((stock) => `${stock.almacenes?.nombre ?? "Almacen"}: ${formatStock(stock.stock_actual)}`)
    .join(" | ");
}

export function ProductoTable({
  productos,
  isLoading,
  quickValues,
  onQuickValueChange,
  onQuickSave,
  onToggleActivo,
}: ProductoTableProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Productos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Listado paginado con stock por almacen.
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {productos.length}
        </span>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 font-medium">Codigo</th>
              <th className="px-3 py-3 font-medium">Producto</th>
              <th className="px-3 py-3 font-medium">Marca</th>
              <th className="px-3 py-3 font-medium">Categoria</th>
              <th className="px-3 py-3 font-medium">Subcategoria</th>
              <th className="px-3 py-3 font-medium">Stock total</th>
              <th className="px-3 py-3 font-medium">Stock tienda</th>
              <th className="px-3 py-3 font-medium">Stock casa</th>
              <th className="px-3 py-3 font-medium">Stock minimo</th>
              <th className="px-3 py-3 font-medium">Precio venta</th>
              <th className="px-3 py-3 font-medium">Estado</th>
              <th className="px-3 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                  Cargando productos...
                </td>
              </tr>
            ) : productos.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                  No hay productos para mostrar.
                </td>
              </tr>
            ) : (
              productos.map((producto) => (
                <tr key={producto.id} className="align-top">
                  <td className="px-3 py-3 font-medium text-slate-900">
                    {producto.codigo_interno}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-900">
                      {producto.nombre_producto}
                    </p>
                    <p className="text-xs text-slate-500">
                      {producto.presentacion || "Sin presentacion"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {producto.marcas?.nombre ?? "Sin marca"}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {producto.categorias?.nombre ?? "Sin categoria"}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {producto.subcategorias?.nombre ?? "Sin subcategoria"}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-950">
                    {formatStock(getStockTotal(producto))}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {formatStock(getStockByName(producto, "Tienda"))}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {formatStock(getStockByName(producto, "Casa"))}
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={quickValues[producto.id]?.stock_minimo ?? ""}
                      onChange={(event) =>
                        onQuickValueChange(
                          producto.id,
                          "stock_minimo",
                          event.target.value,
                        )
                      }
                      className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={quickValues[producto.id]?.precio_venta ?? ""}
                      onChange={(event) =>
                        onQuickValueChange(
                          producto.id,
                          "precio_venta",
                          event.target.value,
                        )
                      }
                      className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${
                        producto.activo
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {producto.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onQuickSave(producto)}
                        className="h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-700"
                      >
                        Guardar
                      </button>
                      <Link
                        href={`/productos/nuevo?id=${producto.id}`}
                        className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => onToggleActivo(producto)}
                        className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {producto.activo ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-4 lg:hidden">
        {isLoading ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
            Cargando productos...
          </p>
        ) : productos.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
            No hay productos para mostrar.
          </p>
        ) : (
          productos.map((producto) => (
            <article key={producto.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    {producto.nombre_producto}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {producto.codigo_interno} · {producto.marcas?.nombre ?? "Sin marca"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {producto.categorias?.nombre ?? "Sin categoria"} /{" "}
                    {producto.subcategorias?.nombre ?? "Sin subcategoria"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${
                    producto.activo
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {producto.activo ? "Activo" : "Inactivo"}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Info label="Stock total" value={formatStock(getStockTotal(producto))} />
                <Info label="Stock minimo" value={formatStock(producto.stock_minimo)} />
                <Info label="Precio venta" value={formatMoney(producto.precio_venta)} />
                <Info label="Almacenes" value={stockResumen(producto)} />
              </dl>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quickValues[producto.id]?.stock_minimo ?? ""}
                  onChange={(event) =>
                    onQuickValueChange(producto.id, "stock_minimo", event.target.value)
                  }
                  placeholder="Stock minimo"
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quickValues[producto.id]?.precio_venta ?? ""}
                  onChange={(event) =>
                    onQuickValueChange(producto.id, "precio_venta", event.target.value)
                  }
                  placeholder="Precio"
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onQuickSave(producto)}
                  className="h-10 rounded-md bg-slate-900 px-3 text-sm font-medium text-white"
                >
                  Guardar
                </button>
                <Link
                  href={`/productos/nuevo?id=${producto.id}`}
                  className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
                >
                  Editar
                </Link>
                <button
                  type="button"
                  onClick={() => onToggleActivo(producto)}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
                >
                  {producto.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
