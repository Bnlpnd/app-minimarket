"use client";

import type { Categoria, Marca, Producto, Subcategoria } from "@/types/database";

export type ProductoConRelaciones = Producto & {
  categorias: Pick<Categoria, "nombre"> | null;
  subcategorias: Pick<Subcategoria, "nombre"> | null;
  marcas: Pick<Marca, "nombre"> | null;
};

type ProductoTableProps = {
  productos: ProductoConRelaciones[];
  isLoading: boolean;
  onEdit: (producto: Producto) => void;
  onToggleActivo: (producto: Producto) => void;
};

function formatMoney(value: number | null) {
  if (value === null) {
    return "Sin precio";
  }

  return `S/ ${value.toFixed(2)}`;
}

function formatStock(value: number | null) {
  if (value === null) {
    return "0";
  }

  return value.toString();
}

export function ProductoTable({
  productos,
  isLoading,
  onEdit,
  onToggleActivo,
}: ProductoTableProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Productos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ordenados por nombre de producto.
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {productos.length} registros
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Imagen</th>
              <th className="px-4 py-3 font-medium">Codigo</th>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Marca</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Activo</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
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
                <tr key={producto.id} className="align-middle">
                  <td className="px-4 py-3">
                    {producto.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={producto.imagen_url}
                        alt={producto.nombre_producto}
                        className="h-12 w-12 rounded-md border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-400">
                        Sin foto
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {producto.codigo_interno}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {producto.nombre_producto}
                    </p>
                    <p className="text-xs text-slate-500">
                      {producto.presentacion || "Sin presentacion"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{producto.categorias?.nombre ?? "Sin categoria"}</p>
                    <p className="text-xs text-slate-500">
                      {producto.subcategorias?.nombre ?? "Sin subcategoria"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {producto.marcas?.nombre ?? "Sin marca"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatStock(producto.stock_actual)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatMoney(producto.precio_venta)}
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(producto)}
                        className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
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
    </section>
  );
}
