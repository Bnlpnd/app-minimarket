"use client";

import Link from "next/link";
import { getBaseStockByName } from "@/lib/inventoryUtils";
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
    stock_tienda: string;
    stock_casa: string;
  }
>;

type QuickKey =
  | "precio_compra"
  | "precio_venta"
  | "stock_minimo"
  | "stock_tienda"
  | "stock_casa";

type ProductoTableProps = {
  productos: ProductoConRelaciones[];
  isLoading: boolean;
  quickValues: QuickValues;
  onQuickValueChange: (productoId: string, key: QuickKey, value: string) => void;
  onQuickSave: (producto: ProductoConRelaciones) => void;
  onToggleActivo: (producto: ProductoConRelaciones) => void;
};

function formatMoney(value: number | null) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatStock(value: number | null) {
  return Number(value ?? 0).toFixed(2).replace(/\.00$/, "");
}

/**
 * Suma actual + delta de cada almacen para mostrar el total proyectado.
 * Si el usuario aun no edito, devuelve el stock total actual sumando filas.
 */
function quickStockTotal(
  values: QuickValues[string] | undefined,
  producto: ProductoConRelaciones,
) {
  const tiendaActual = getBaseStockByName(producto, "Tienda");
  const casaActual = getBaseStockByName(producto, "Casa");
  const deltaT = values?.stock_tienda ? Number(values.stock_tienda) : 0;
  const deltaC = values?.stock_casa ? Number(values.stock_casa) : 0;
  const t = tiendaActual + (Number.isFinite(deltaT) ? deltaT : 0);
  const c = casaActual + (Number.isFinite(deltaC) ? deltaC : 0);
  return t + c;
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
  return "text-emerald-700 font-semibold";
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

      <div className="hidden max-h-[70vh] overflow-auto lg:block">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 font-medium">Producto</th>
              <th className="px-3 py-3 font-medium">Marca</th>
              <th className="px-3 py-3 font-medium">Stock total</th>
              <th className="px-3 py-3 font-medium">
                Tienda
                <span className="ml-1 text-[10px] font-normal normal-case text-slate-400">
                  (actual · sumar/restar)
                </span>
              </th>
              <th className="px-3 py-3 font-medium">
                Casa
                <span className="ml-1 text-[10px] font-normal normal-case text-slate-400">
                  (actual · sumar/restar)
                </span>
              </th>
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
                          <p className="mt-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            = {formatStock(Number(producto.unidades_equivalentes ?? 1))} de &quot;{producto.producto_base?.nombre_producto ?? "base"}&quot;
                          </p>
                        ) : null}
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
                    <DeltaStockCell
                      actual={getBaseStockByName(producto, "Tienda")}
                      delta={quickValues[producto.id]?.stock_tienda ?? ""}
                      onChange={(value) =>
                        onQuickValueChange(producto.id, "stock_tienda", value)
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <DeltaStockCell
                      actual={getBaseStockByName(producto, "Casa")}
                      delta={quickValues[producto.id]?.stock_casa ?? ""}
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
                {(() => {
                  const compra = Number(quickValues[producto.id]?.precio_compra);
                  const venta = Number(quickValues[producto.id]?.precio_venta);
                  const margen = calcMargen(compra, venta);
                  if (margen === null) {
                    return <Info label="Margen" value="—" />;
                  }
                  return (
                    <div className="rounded-md bg-slate-50 p-2">
                      <dt className="text-xs text-slate-500">Margen</dt>
                      <dd className={`mt-1 text-sm ${margenClass(margen)}`}>
                        {margen.toFixed(1)}%{" "}
                        <span className="text-xs text-slate-500">
                          ({formatMoney(venta - compra)})
                        </span>
                      </dd>
                    </div>
                  );
                })()}
              </dl>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <DeltaStockCell
                  actual={getBaseStockByName(producto, "Tienda")}
                  delta={quickValues[producto.id]?.stock_tienda ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "stock_tienda", value)
                  }
                  almacenLabel="Tienda"
                />
                <DeltaStockCell
                  actual={getBaseStockByName(producto, "Casa")}
                  delta={quickValues[producto.id]?.stock_casa ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "stock_casa", value)
                  }
                  almacenLabel="Casa"
                />
                <StockInput
                  value={quickValues[producto.id]?.stock_minimo ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "stock_minimo", value)
                  }
                  placeholder="Stock minimo"
                />
                <StockInput
                  value={quickValues[producto.id]?.precio_compra ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "precio_compra", value)
                  }
                  placeholder="Costo unidad"
                />
                <StockInput
                  value={quickValues[producto.id]?.precio_venta ?? ""}
                  onChange={(value) =>
                    onQuickValueChange(producto.id, "precio_venta", value)
                  }
                  placeholder="Precio venta"
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

/**
 * Celda de stock con SUMA/RESTA explicita.
 * Muestra arriba el stock actual (no-editable) y debajo un input para
 * sumar (positivo) o restar (negativo). Cuando el usuario escribe,
 * muestra el TOTAL proyectado para que sepa que va a quedar al guardar.
 *
 * Esto evita el bug clasico de "puse 10 pero reemplazo los 60 que ya
 * tenia" — ahora poner "10" significa "sumo 10, queda 70".
 */
function DeltaStockCell({
  actual,
  delta,
  onChange,
  almacenLabel,
}: {
  actual: number;
  delta: string;
  onChange: (value: string) => void;
  almacenLabel?: string;
}) {
  const deltaNum = Number(delta);
  const valid = delta.trim() !== "" && Number.isFinite(deltaNum);
  const proyectado = valid ? actual + deltaNum : actual;
  const showProyeccion = valid && deltaNum !== 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-1 text-xs text-slate-500">
        <span className="font-medium text-slate-700">
          {almacenLabel ? almacenLabel + " " : ""}Actual:
        </span>
        <span className="font-bold text-slate-950">{actual}</span>
        {showProyeccion ? (
          <span className={proyectado < 0 ? "text-red-700" : "text-emerald-700"}>
            → {proyectado}
          </span>
        ) : null}
      </div>
      <input
        type="number"
        step="0.01"
        value={delta}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`+5 o -2`}
        title="Cantidad a sumar (positivo) o restar (negativo). Dejar vacio = no tocar."
        className={`h-9 w-full rounded-md border px-2 text-sm lg:w-24 ${
          showProyeccion
            ? proyectado < 0
              ? "border-red-300 bg-red-50"
              : "border-emerald-300 bg-emerald-50"
            : "border-slate-300"
        }`}
      />
    </div>
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
