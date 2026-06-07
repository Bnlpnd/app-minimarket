"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getBaseStockByName, getStockProductId } from "@/lib/inventoryUtils";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { selectOnFocus } from "@/lib/inputUtils";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import type {
  Almacen,
  Categoria,
  Marca,
  Producto,
  ProductoAlmacen,
  Subcategoria,
} from "@/types/database";

type ProductoAlmacenRow = ProductoAlmacen & {
  almacenes: Pick<Almacen, "id" | "nombre"> | null;
};

type ProductoRow = Producto & {
  categorias: Pick<Categoria, "nombre"> | null;
  subcategorias: Pick<Subcategoria, "nombre"> | null;
  marcas: Pick<Marca, "nombre"> | null;
  producto_almacen: ProductoAlmacenRow[];
  producto_base?: {
    id: string;
    nombre_producto?: string | null;
    producto_almacen: ProductoAlmacenRow[];
  } | null;
};

type QuickStock = Record<
  string,
  {
    stock_minimo: string;
    precio_venta: string;
    precio_compra_referencial: string;
    tienda: string;
    casa: string;
  }
>;

type Message = {
  type: "success" | "error";
  text: string;
};

const inputClassName =
  "h-11 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100";

function formatMoney(value: number | null) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatStock(value: number | null) {
  return Number(value ?? 0).toFixed(2).replace(/\.00$/, "");
}

function stockTotal(producto: ProductoRow) {
  // Suma del producto base si la presentacion lo tiene; si no, suma propio.
  const rows = producto.producto_base?.producto_almacen ?? producto.producto_almacen;
  return rows.reduce((sum, stock) => sum + Number(stock.stock_actual ?? 0), 0);
}

function quickFromRows(productos: ProductoRow[]) {
  return Object.fromEntries(
    productos.map((producto) => [
      producto.id,
      {
        stock_minimo: String(Number(producto.stock_minimo ?? 10)),
        precio_venta: Number(producto.precio_venta ?? 1).toFixed(2),
        precio_compra_referencial:
          producto.precio_compra_referencial === null
            ? ""
            : Number(producto.precio_compra_referencial).toFixed(2),
        tienda: String(getBaseStockByName(producto, "Tienda")),
        casa: String(getBaseStockByName(producto, "Casa")),
      },
    ]),
  );
}

export function AlmacenDashboard() {
  const [productos, setProductos] = useState<ProductoRow[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [search, setSearch] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [almacenId, setAlmacenId] = useState("");
  const [stockFilter, setStockFilter] = useState<"todos" | "bajo" | "sin_stock">(
    "todos",
  );
  const [quick, setQuick] = useState<QuickStock>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const hasCriteria = search.trim() || categoriaId || almacenId || stockFilter !== "todos";

  async function loadCatalogos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    const [categoriasResult, almacenesResult] = await Promise.all([
      supabase.from("categorias").select("*").eq("activo", true).order("nombre"),
      supabase.from("almacenes").select("*").eq("activo", true).order("nombre"),
    ]);

    if (categoriasResult.error || almacenesResult.error) {
      setMessage({ type: "error", text: "No se pudieron cargar filtros." });
      return;
    }

    setCategorias((categoriasResult.data ?? []) as Categoria[]);
    setAlmacenes((almacenesResult.data ?? []) as Almacen[]);
  }

  async function loadProductos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    if (!hasCriteria) {
      setProductos([]);
      setQuick({});
      return;
    }

    setIsLoading(true);
    let query = supabase
      .from("productos")
      .select(
        `
          *,
          categorias(nombre),
          subcategorias(nombre),
          marcas(nombre),
          producto_almacen(*, almacenes(id,nombre))
        `,
      )
      .order("nombre_producto");
    if (categoriaId) {
      query = query.eq("categoria_id", categoriaId);
    }

    const { data, error } = await fetchAllRows<ProductoRow>(query);

    if (error) {
      setIsLoading(false);
      setMessage({ type: "error", text: `No se pudo cargar stock: ${error.message}` });
      setProductos([]);
      return;
    }

    // Prefetch del producto base para resolver stock real de presentaciones.
    const baseIds = Array.from(
      new Set(
        data
          .map((p) => p.producto_base_id)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const baseMap = new Map<string, NonNullable<ProductoRow["producto_base"]>>();
    if (baseIds.length > 0) {
      const { data: baseRows, error: baseError } = await supabase
        .from("productos")
        .select("id,nombre_producto,producto_almacen(*,almacenes(id,nombre))")
        .in("id", baseIds);
      if (baseError) {
        setIsLoading(false);
        setMessage({ type: "error", text: `No se cargo base: ${baseError.message}` });
        return;
      }
      for (const row of baseRows ?? []) {
        const baseRow = row as unknown as NonNullable<ProductoRow["producto_base"]>;
        baseMap.set(baseRow.id, baseRow);
      }
    }

    const merged = data.map((p) => {
      if (!p.producto_base_id) return p;
      const base = baseMap.get(p.producto_base_id);
      return base ? { ...p, producto_base: base } : p;
    });

    setIsLoading(false);
    let rows = merged.filter((producto) =>
      matchesSearch(search, [
        producto.codigo_interno,
        producto.nombre_producto,
        producto.presentacion,
        producto.marcas?.nombre,
        producto.categorias?.nombre,
        producto.subcategorias?.nombre,
      ]),
    );
    if (almacenId) {
      rows = rows.filter((producto) =>
        producto.producto_almacen.some(
          (stock) => stock.almacen_id === almacenId && Number(stock.stock_actual) > 0,
        ),
      );
    }
    if (stockFilter === "bajo") {
      rows = rows.filter(
        (producto) => stockTotal(producto) <= Number(producto.stock_minimo ?? 10),
      );
    }
    if (stockFilter === "sin_stock") {
      rows = rows.filter((producto) => stockTotal(producto) <= 0);
    }

    setProductos(rows);
    setQuick(quickFromRows(rows));
  }

  useEffect(() => {
    void loadCatalogos();
  }, []);

  useEffect(() => {
    void loadProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoriaId, almacenId, stockFilter]);

  const tienda = useMemo(
    () => almacenes.find((almacen) => almacen.nombre.toLowerCase() === "tienda"),
    [almacenes],
  );
  const casa = useMemo(
    () => almacenes.find((almacen) => almacen.nombre.toLowerCase() === "casa"),
    [almacenes],
  );

  function updateQuick(productoId: string, key: keyof QuickStock[string], value: string) {
    setQuick((current) => ({
      ...current,
      [productoId]: {
        ...current[productoId],
        [key]: value,
      },
    }));
  }

  async function guardarDatos(producto: ProductoRow) {
    if (!supabase) {
      return;
    }
    const values = quick[producto.id];
    const stockMinimo = Number(values.stock_minimo);
    const precioVenta = Number(values.precio_venta);
    const costo = values.precio_compra_referencial.trim()
      ? Number(values.precio_compra_referencial)
      : null;

    if (
      !Number.isFinite(stockMinimo) ||
      stockMinimo < 0 ||
      !Number.isFinite(precioVenta) ||
      precioVenta < 0 ||
      (costo !== null && (!Number.isFinite(costo) || costo < 0))
    ) {
      setMessage({ type: "error", text: "Revisa valores numericos." });
      return;
    }

    const { error } = await supabase
      .from("productos")
      .update({
        stock_minimo: stockMinimo,
        precio_venta: precioVenta,
        precio_compra_referencial: costo,
      })
      .eq("id", producto.id);

    if (error) {
      setMessage({ type: "error", text: `No se pudo guardar producto: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Datos guardados." });
    await loadProductos();
  }

  async function ajustar(producto: ProductoRow, target: "tienda" | "casa") {
    if (!supabase) {
      return;
    }
    const almacen = target === "tienda" ? tienda : casa;
    if (!almacen) {
      setMessage({ type: "error", text: "No existe el almacen requerido." });
      return;
    }
    const stockContado = Number(quick[producto.id]?.[target] ?? 0);
    if (!Number.isFinite(stockContado) || stockContado < 0) {
      setMessage({ type: "error", text: "Stock invalido." });
      return;
    }

    const { error } = await supabase.rpc("ajustar_stock", {
      p_producto_id: getStockProductId(producto),
      p_almacen_id: almacen.id,
      p_stock_contado: stockContado,
      p_observacion: producto.producto_base_id
        ? `Ajuste rapido desde almacen (${almacen.nombre}) - vinculado a base`
        : `Ajuste rapido desde almacen (${almacen.nombre})`,
      p_usuario_id: null,
    });

    if (error) {
      setMessage({ type: "error", text: `No se pudo ajustar: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: `Stock ${almacen.nombre} actualizado.` });
    await loadProductos();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Link
          href="/almacen/transferencias"
          className="inline-flex h-11 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
        >
          Transferir
        </Link>
        <Link
          href="/almacen/ajustes"
          className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
        >
          Ajuste manual
        </Link>
        <Link
          href="/almacen/movimientos"
          className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
        >
          Movimientos
        </Link>
      </div>

      {message ? (
        <div
          className={`rounded-lg border p-4 text-sm ${
            message.type === "success"
              ? "border-santa-200 bg-santa-50 text-santa-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Codigo, producto o marca"
            className={inputClassName}
          />
          <select
            value={categoriaId}
            onChange={(event) => setCategoriaId(event.target.value)}
            className={inputClassName}
          >
            <option value="">Categoria</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
          <select
            value={almacenId}
            onChange={(event) => setAlmacenId(event.target.value)}
            className={inputClassName}
          >
            <option value="">Todos los almacenes</option>
            {almacenes.map((almacen) => (
              <option key={almacen.id} value={almacen.id}>
                {almacen.nombre}
              </option>
            ))}
          </select>
          <select
            value={stockFilter}
            onChange={(event) =>
              setStockFilter(event.target.value as "todos" | "bajo" | "sin_stock")
            }
            className={inputClassName}
          >
            <option value="todos">Todo stock</option>
            <option value="bajo">Stock bajo</option>
            <option value="sin_stock">Sin stock</option>
          </select>
        </div>
      </section>

      {!hasCriteria ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Busca un producto o selecciona un filtro para revisar stock.
        </section>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
            <h2 className="text-base font-semibold text-slate-950">
              Stock por almacen
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Se muestran hasta 100 resultados por consulta.
            </p>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3 font-medium">Producto</th>
                  <th className="px-3 py-3 font-medium">Marca</th>
                  <th className="px-3 py-3 font-medium">Stock tienda</th>
                  <th className="px-3 py-3 font-medium">Stock casa</th>
                  <th className="px-3 py-3 font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">Minimo</th>
                  <th className="px-3 py-3 font-medium">Precio</th>
                  <th className="px-3 py-3 font-medium">Costo ref.</th>
                  <th className="px-3 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      Cargando stock...
                    </td>
                  </tr>
                ) : productos.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      No hay productos.
                    </td>
                  </tr>
                ) : (
                  productos.map((producto) => (
                    <tr key={producto.id} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-950">
                          {producto.nombre_producto}
                        </p>
                        <p className="text-xs text-slate-500">
                          {producto.codigo_interno}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {producto.marcas?.nombre ?? "Sin marca"}
                      </td>
                      <td className="px-3 py-3">
                        <StockInput
                          value={quick[producto.id]?.tienda ?? ""}
                          onChange={(value) => updateQuick(producto.id, "tienda", value)}
                          onSave={() => void ajustar(producto, "tienda")}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <StockInput
                          value={quick[producto.id]?.casa ?? ""}
                          onChange={(value) => updateQuick(producto.id, "casa", value)}
                          onSave={() => void ajustar(producto, "casa")}
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-950">
                        {formatStock(stockTotal(producto))}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          onFocus={selectOnFocus}
                          min="0"
                          step="0.01"
                          value={quick[producto.id]?.stock_minimo ?? ""}
                          onChange={(event) =>
                            updateQuick(producto.id, "stock_minimo", event.target.value)
                          }
                          className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          onFocus={selectOnFocus}
                          min="0"
                          step="0.01"
                          value={quick[producto.id]?.precio_venta ?? ""}
                          onChange={(event) =>
                            updateQuick(producto.id, "precio_venta", event.target.value)
                          }
                          className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          onFocus={selectOnFocus}
                          min="0"
                          step="0.01"
                          value={quick[producto.id]?.precio_compra_referencial ?? ""}
                          onChange={(event) =>
                            updateQuick(
                              producto.id,
                              "precio_compra_referencial",
                              event.target.value,
                            )
                          }
                          className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void guardarDatos(producto)}
                            className="h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white"
                          >
                            Guardar
                          </button>
                          <Link
                            href={`/almacen/transferencias?producto=${producto.id}`}
                            className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700"
                          >
                            Transferir
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 lg:hidden">
            {productos.map((producto) => (
              <article key={producto.id} className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-950">
                  {producto.nombre_producto}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {producto.codigo_interno} · {producto.marcas?.nombre ?? "Sin marca"}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Info label="Stock Tienda" value={formatStock(getBaseStockByName(producto, "Tienda"))} />
                  <Info label="Stock Casa" value={formatStock(getBaseStockByName(producto, "Casa"))} />
                  <Info label="Stock total" value={formatStock(stockTotal(producto))} />
                  <Info label="Stock minimo" value={formatStock(producto.stock_minimo)} />
                  <Info label="Precio venta" value={formatMoney(producto.precio_venta)} />
                  <Info
                    label="Costo ref."
                    value={formatMoney(producto.precio_compra_referencial)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/almacen/ajustes?producto=${producto.id}`}
                    className="inline-flex h-10 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white"
                  >
                    Ajustar
                  </Link>
                  <Link
                    href={`/almacen/transferencias?producto=${producto.id}`}
                    className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
                  >
                    Transferir
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StockInput({
  value,
  onChange,
  onSave,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex gap-1">
      <input
        type="number"
        onFocus={selectOnFocus}
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-20 rounded-md border border-slate-300 px-2 text-sm"
      />
      <button
        type="button"
        onClick={onSave}
        className="h-9 rounded-md border border-slate-300 px-2 text-xs font-medium text-slate-700"
      >
        Ajustar
      </button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-950">{value}</dd>
    </div>
  );
}
