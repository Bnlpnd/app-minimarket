"use client";

import Link from "next/link";
import { getBaseStockByName } from "@/lib/inventoryUtils";
import { colors } from "@/lib/theme";
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
  producto_base?: {
    id: string;
    nombre_producto?: string | null;
    producto_almacen?: ProductoStock[];
  } | null;
};

type QuickValues = Record<
  string,
  {
    precio_compra: string;
    precio_venta: string;
    stock_minimo: string;
  }
>;

type QuickKey = "precio_compra" | "precio_venta" | "stock_minimo";

type ProductoTableProps = {
  productos: ProductoConRelaciones[];
  isLoading: boolean;
  quickValues: QuickValues;
  onQuickValueChange: (productoId: string, key: QuickKey, value: string) => void;
  onQuickSave: (producto: ProductoConRelaciones) => void;
  onToggleActivo: (producto: ProductoConRelaciones) => void;
  /** Solo se muestra el boton eliminar si esta callback esta presente (admin). */
  onDelete?: (producto: ProductoConRelaciones) => void;
  /** IDs de productos con ventas o que son base de otra presentacion -> no eliminables. */
  productosNoEliminables?: Set<string>;
  /** ID del producto que se esta borrando en este momento (para deshabilitar el boton). */
  deletingId?: string | null;
};

function formatMoney(value: number | null) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatStock(value: number | null) {
  return Number(value ?? 0).toFixed(2).replace(/\.00$/, "");
}

/**
 * Calcula margen porcentual de ganancia: (venta - costo) / costo × 100.
 * Devuelve null si el costo es 0 o invalido.
 */
function calcMargen(precioCompra: number, precioVenta: number): number | null {
  if (!Number.isFinite(precioCompra) || precioCompra <= 0) return null;
  if (!Number.isFinite(precioVenta) || precioVenta < 0) return null;
  return ((precioVenta - precioCompra) / precioCompra) * 100;
}

function margenClass(margen: number | null): string {
  if (margen === null) return "text-slate-500";
  if (margen < 0) return "text-red-700 font-semibold";
  if (margen < 10) return "text-orange-600 font-semibold";
  if (margen < 25) return "text-amber-700";
  return "text-santa-700 font-semibold";
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
  onDelete,
  productosNoEliminables,
  deletingId,
}: ProductoTableProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Productos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Listado paginado con stock por almacen. Para ajustar stock ve a{" "}
            <strong>Productos Almacén</strong> o <strong>Corregir stock</strong>.
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {productos.length}
        </span>
      </div>

      <div className="hidden max-h-[70vh] overflow-auto lg:block">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 font-medium">Producto</th>
              <th className="px-3 py-3 font-medium">Marca</th>
              <th className={`px-3 py-3 font-medium ${colors.tienda.bg} ${colors.tienda.text}`}>
                Tienda
              </th>
              <th className={`px-3 py-3 font-medium ${colors.casa.bg} ${colors.casa.text}`}>
                Casa
              </th>
              <th className="px-3 py-3 font-medium">Stock total</th>
              <th className="px-3 py-3 font-medium">Stock minimo</th>
              <th className="px-3 py-3 font-medium">Costo unidad</th>
              <th className="px-3 py-3 font-medium">Precio venta</th>
              <th className="px-3 py-3 font-medium">Margen</th>
              <th className="px-3 py-3 font-medium">Estado</th>
              <th className="px-3 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  Cargando productos...
                </td>
              </tr>
            ) : productos.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
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
                        {producto.producto_base_id ? (
                          <p className="mt-1 inline-flex items-center rounded-full bg-santa-50 px-2 py-0.5 text-[10px] font-medium text-santa-700">
                            = {formatStock(Number(producto.unidades_equivalentes ?? 1))} de &quot;{producto.producto_base?.nombre_producto ?? "base"}&quot;
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {producto.marcas?.nombre ?? "Sin marca"}
                  </td>
                  <td className={`px-3 py-3 ${colors.tienda.bg}`}>
                    <span className={`text-sm font-semibold ${colors.tienda.text}`}>
                      {formatStock(getBaseStockByName(producto, "Tienda"))}
                    </span>
                  </td>
                  <td className={`px-3 py-3 ${colors.casa.bg}`}>
                    <span className={`text-sm font-semibold ${colors.casa.text}`}>
                      {formatStock(getBaseStockByName(producto, "Casa"))}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm font-bold text-slate-950">
                    {formatStock(
                      getBaseStockByName(producto, "Tienda") +
                        getBaseStockByName(producto, "Casa"),
                    )}
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
                      value={quickValues[producto.id]?.precio_compra ?? ""}
                      onChange={(value) =>
                        onQuickValueChange(producto.id, "precio_compra", value)
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
                    {(() => {
                      const compra = Number(quickValues[producto.id]?.precio_compra);
                      const venta = Number(quickValues[producto.id]?.precio_venta);
                      const margen = calcMargen(compra, venta);
                      if (margen === null) {
                        return <span className="text-xs text-slate-400">—</span>;
                      }
                      const ganancia = venta - compra;
                      return (
                        <span className={`text-xs ${margenClass(margen)}`}>
                          {margen.toFixed(1)}%
                          <span className="block text-[10px] text-slate-500">
                            +{formatMoney(ganancia)}
                          </span>
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${
                        producto.activo
                          ? "bg-santa-50 text-santa-700"
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
                      onDelete={onDelete}
                      productosNoEliminables={productosNoEliminables}
                      deletingId={deletingId}
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
                      ? "bg-santa-50 text-santa-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {producto.activo ? "Activo" : "Inactivo"}
                </span>
              </div>

              {/* Stock por almacen y total (READONLY) */}
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div className={`rounded-md p-2 ${colors.tienda.bg}`}>
                  <dt className={`text-xs font-medium ${colors.tienda.text}`}>Tienda</dt>
                  <dd className={`mt-1 text-sm font-bold ${colors.tienda.text}`}>
                    {formatStock(getBaseStockByName(producto, "Tienda"))}
                  </dd>
                </div>
                <div className={`rounded-md p-2 ${colors.casa.bg}`}>
                  <dt className={`text-xs font-medium ${colors.casa.text}`}>Casa</dt>
                  <dd className={`mt-1 text-sm font-bold ${colors.casa.text}`}>
                    {formatStock(getBaseStockByName(producto, "Casa"))}
                  </dd>
                </div>
                <Info
                  label="Stock total"
                  value={formatStock(
                    getBaseStockByName(producto, "Tienda") +
                      getBaseStockByName(producto, "Casa"),
                  )}
                />
              </dl>

              {(() => {
                const compra = Number(quickValues[producto.id]?.precio_compra);
                const venta = Number(quickValues[producto.id]?.precio_venta);
                const margen = calcMargen(compra, venta);
                if (margen === null) return null;
                return (
                  <div className="mt-2 rounded-md bg-slate-50 p-2 text-sm">
                    <span className="text-xs text-slate-500">Margen: </span>
                    <span className={`text-sm ${margenClass(margen)}`}>
                      {margen.toFixed(1)}%{" "}
                      <span className="text-xs text-slate-500">
                        ({formatMoney(venta - compra)})
                      </span>
                    </span>
                  </div>
                );
              })()}

              {/* Solo editables: minimo, costo, precio */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <StockInput
                  value={quickValues[producto.id]?.stock_minimo ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "stock_minimo", value)
                  }
                  placeholder="Stock min"
                />
                <StockInput
                  value={quickValues[producto.id]?.precio_compra ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "precio_compra", value)
                  }
                  placeholder="Costo"
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
                  onDelete={onDelete}
                  productosNoEliminables={productosNoEliminables}
                  deletingId={deletingId}
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
  onDelete,
  productosNoEliminables,
  deletingId,
}: {
  producto: ProductoConRelaciones;
  onQuickSave: (producto: ProductoConRelaciones) => void;
  onToggleActivo: (producto: ProductoConRelaciones) => void;
  onDelete?: (producto: ProductoConRelaciones) => void;
  productosNoEliminables?: Set<string>;
  deletingId?: string | null;
}) {
  const noEliminable = productosNoEliminables?.has(producto.id) ?? false;
  const isDeleting = deletingId === producto.id;
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
      {onDelete ? (
        <button
          type="button"
          onClick={() => onDelete(producto)}
          disabled={noEliminable || isDeleting}
          title={
            noEliminable
              ? "No se puede eliminar: tiene ventas asociadas o es base de otra presentacion. Usa Desactivar."
              : "Eliminar permanentemente (admin)"
          }
          className={`h-9 rounded-md border px-3 text-xs font-medium transition ${
            noEliminable || isDeleting
              ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              : "border-red-200 bg-white text-red-700 hover:bg-red-50"
          }`}
        >
          {isDeleting ? "Borrando..." : "Eliminar"}
        </button>
      ) : null}
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
