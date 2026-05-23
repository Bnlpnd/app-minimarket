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

type QuickValues = Record<
  string,
  {
    precio_venta: string;
    stock_minimo: string;
    stock_tienda: string;
    stock_casa: string;
  }
>;

type ProductoTableProps = {
  productos: ProductoConRelaciones[];
  isLoading: boolean;
  quickValues: QuickValues;
  onQuickValueChange: (
    productoId: string,
    key: "precio_venta" | "stock_minimo" | "stock_tienda" | "stock_casa",
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

function getStockTotal(producto: ProductoConRelaciones) {
  return (producto.producto_almacen ?? []).reduce(
    (sum, stock) => sum + Number(stock.stock_actual ?? 0),
    0,
  );
}

function quickStockTotal(
  values: QuickValues[string] | undefined,
  producto: ProductoConRelaciones,
) {
  if (!values) {
    return getStockTotal(producto);
  }

  const tienda = Number(values.stock_tienda);
  const casa = Number(values.stock_casa);
  return (
    (Number.isFinite(tienda) ? tienda : 0) +
    (Number.isFinite(casa) ? casa : 0)
  );
}

function ProductImage({ producto }: { producto: ProductoConRelaciones }) {
  if (!producto.imagen_url) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-400">
        Sin img
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={producto.imagen_url}
      alt={producto.nombre_producto}
      className="h-12 w-12 shrink-0 rounded-md border border-slate-200 object-cover"
    />
  );
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
            Listado paginado con imagen y stock editable por almacen.
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {productos.length}
        </span>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 font-medium">Producto</th>
              <th className="px-3 py-3 font-medium">Marca</th>
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
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Cargando productos...
                </td>
              </tr>
            ) : productos.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  No hay productos para mostrar.
                </td>
              </tr>
            ) : (
              productos.map((producto) => (
                <tr key={producto.id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <ProductImage producto={producto} />
                      <div>
                        <p className="font-medium text-slate-900">
                          {producto.nombre_producto}
                        </p>
                        <p className="text-xs text-slate-500">
                          {producto.presentacion || "Sin presentacion"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {producto.marcas?.nombre ?? "Sin marca"}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-950">
                    {formatStock(quickStockTotal(quickValues[producto.id], producto))}
                  </td>
                  <td className="px-3 py-3">
                    <StockInput
                      value={quickValues[producto.id]?.stock_tienda ?? ""}
                      onChange={(value) =>
                        onQuickValueChange(producto.id, "stock_tienda", value)
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <StockInput
                      value={quickValues[producto.id]?.stock_casa ?? ""}
                      onChange={(value) =>
                        onQuickValueChange(producto.id, "stock_casa", value)
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <StockInput
                      value={quickValues[producto.id]?.stock_minimo ?? ""}
                      onChange={(value) =>
                        onQuickValueChange(producto.id, "stock_minimo", value)
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <StockInput
                      value={quickValues[producto.id]?.precio_venta ?? ""}
                      onChange={(value) =>
                        onQuickValueChange(producto.id, "precio_venta", value)
                      }
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
                    <Actions
                      producto={producto}
                      onQuickSave={onQuickSave}
                      onToggleActivo={onToggleActivo}
                    />
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
                <div className="flex gap-3">
                  <ProductImage producto={producto} />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">
                      {producto.nombre_producto}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {producto.marcas?.nombre ?? "Sin marca"} ·{" "}
                      {producto.presentacion || "Sin presentacion"}
                    </p>
                  </div>
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
                <Info
                  label="Stock total"
                  value={formatStock(quickStockTotal(quickValues[producto.id], producto))}
                />
                <Info label="Precio venta" value={formatMoney(producto.precio_venta)} />
              </dl>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <StockInput
                  value={quickValues[producto.id]?.stock_tienda ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "stock_tienda", value)
                  }
                  placeholder="Stock Tienda"
                />
                <StockInput
                  value={quickValues[producto.id]?.stock_casa ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "stock_casa", value)
                  }
                  placeholder="Stock Casa"
                />
                <StockInput
                  value={quickValues[producto.id]?.stock_minimo ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "stock_minimo", value)
                  }
                  placeholder="Stock minimo"
                />
                <StockInput
                  value={quickValues[producto.id]?.precio_venta ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "precio_venta", value)
                  }
                  placeholder="Precio"
                />
              </div>

              <div className="mt-3">
                <Actions
                  producto={producto}
                  onQuickSave={onQuickSave}
                  onToggleActivo={onToggleActivo}
                />
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function StockInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm lg:w-24"
    />
  );
}

function Actions({
  producto,
  onQuickSave,
  onToggleActivo,
}: {
  producto: ProductoConRelaciones;
  onQuickSave: (producto: ProductoConRelaciones) => void;
  onToggleActivo: (producto: ProductoConRelaciones) => void;
}) {
  return (
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
      <Link
        href={`/almacen/transferencias?producto=${producto.id}`}
        className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Transferir
      </Link>
      <button
        type="button"
        onClick={() => onToggleActivo(producto)}
        className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {producto.activo ? "Desactivar" : "Activar"}
      </button>
    </div>
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
