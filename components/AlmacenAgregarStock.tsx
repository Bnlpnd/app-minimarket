"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type {
  Almacen,
  Categoria,
  Producto,
  ProductoAlmacen,
  ProductoPresentacionCompra,
  Subcategoria,
} from "@/types/database";

type ProductoStockRow = Producto & {
  categorias: Pick<Categoria, "nombre"> | null;
  subcategorias: Pick<Subcategoria, "nombre"> | null;
  producto_almacen: Array<Pick<ProductoAlmacen, "almacen_id" | "stock_actual">>;
  producto_presentaciones_compra: Array<
    Pick<ProductoPresentacionCompra, "nombre_presentacion" | "unidades_por_presentacion" | "es_principal">
  >;
};

type Message = {
  type: "success" | "error";
  text: string;
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function formatStock(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2).replace(/\.00$/, "");
}

function parsePresentationUnits(value: string | null | undefined) {
  if (!value) {
    return 1;
  }

  const match = value.toUpperCase().match(/X\s*(\d+)/);
  return match ? Number(match[1]) : 1;
}

function stockForAlmacen(producto: ProductoStockRow | null, almacenId: string) {
  return Number(
    producto?.producto_almacen.find((stock) => stock.almacen_id === almacenId)?.stock_actual ?? 0,
  );
}

export function AlmacenAgregarStock() {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [productos, setProductos] = useState<ProductoStockRow[]>([]);
  const [stockEdit, setStockEdit] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [almacenId, setAlmacenId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoriaId, setSubcategoriaId] = useState("");
  const [productoIngresoId, setProductoIngresoId] = useState("");
  const [almacenIngresoId, setAlmacenIngresoId] = useState("");
  const [cantidadPresentaciones, setCantidadPresentaciones] = useState("1");
  const [unidadesSueltas, setUnidadesSueltas] = useState("0");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const productoIngreso = useMemo(
    () => productos.find((producto) => producto.id === productoIngresoId) ?? null,
    [productoIngresoId, productos],
  );

  const unidadesPorPresentacion = useMemo(() => {
    const principal =
      productoIngreso?.producto_presentaciones_compra.find((item) => item.es_principal) ??
      productoIngreso?.producto_presentaciones_compra[0];
    return Number(principal?.unidades_por_presentacion ?? parsePresentationUnits(productoIngreso?.presentacion));
  }, [productoIngreso]);

  const totalIngreso = useMemo(() => {
    const presentaciones = Number(cantidadPresentaciones);
    const sueltas = Number(unidadesSueltas);
    if (!Number.isFinite(presentaciones) || !Number.isFinite(sueltas)) {
      return 0;
    }
    return presentaciones * unidadesPorPresentacion + sueltas;
  }, [cantidadPresentaciones, unidadesPorPresentacion, unidadesSueltas]);

  async function loadCatalogos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    const [almacenesResult, categoriasResult, subcategoriasResult] = await Promise.all([
      supabase.from("almacenes").select("*").eq("activo", true).order("nombre"),
      supabase.from("categorias").select("*").eq("activo", true).order("nombre"),
      supabase.from("subcategorias").select("*").eq("activo", true).order("nombre"),
    ]);

    if (almacenesResult.error || categoriasResult.error || subcategoriasResult.error) {
      setMessage({ type: "error", text: "No se pudieron cargar filtros de almacen." });
      return;
    }

    const almacenRows = (almacenesResult.data ?? []) as Almacen[];
    const defaultAlmacen =
      almacenRows.find((almacen) => almacen.nombre.toLowerCase() === "tienda") ??
      almacenRows.find((almacen) => almacen.nombre.toLowerCase() === "negocio") ??
      almacenRows[0];

    setAlmacenes(almacenRows);
    setAlmacenId(defaultAlmacen?.id ?? "");
    setAlmacenIngresoId(defaultAlmacen?.id ?? "");
    setCategorias((categoriasResult.data ?? []) as Categoria[]);
    setSubcategorias((subcategoriasResult.data ?? []) as Subcategoria[]);
  }

  async function loadProductos() {
    if (!supabase) {
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
          producto_almacen(almacen_id,stock_actual),
          producto_presentaciones_compra(nombre_presentacion,unidades_por_presentacion,es_principal)
        `,
      )
      .eq("activo", true)
      .order("nombre_producto");

    if (categoriaId) {
      query = query.eq("categoria_id", categoriaId);
    }
    if (subcategoriaId) {
      query = query.eq("subcategoria_id", subcategoriaId);
    }

    const { data, error } = await query.range(0, 2499);
    setIsLoading(false);

    if (error) {
      setMessage({ type: "error", text: `No se cargo el stock: ${error.message}` });
      setProductos([]);
      return;
    }

    const rows = ((data ?? []) as ProductoStockRow[]).filter((producto) =>
      matchesSearch(search, [
        producto.codigo_interno,
        producto.nombre_producto,
        producto.presentacion,
        producto.categorias?.nombre,
        producto.subcategorias?.nombre,
      ]),
    );
    setProductos(rows);
    setStockEdit(
      Object.fromEntries(rows.map((producto) => [producto.id, String(stockForAlmacen(producto, almacenId))])),
    );
  }

  useEffect(() => {
    void loadCatalogos();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProductos();
    }, 300);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, almacenId, categoriaId, subcategoriaId]);

  async function guardarStock(producto: ProductoStockRow) {
    if (!supabase || !almacenId) {
      return;
    }

    const value = Number(stockEdit[producto.id]);
    if (!Number.isFinite(value) || value < 0) {
      setMessage({ type: "error", text: "El stock debe ser cero o mayor." });
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.rpc("ajustar_stock", {
      p_producto_id: producto.id,
      p_almacen_id: almacenId,
      p_stock_contado: value,
      p_observacion: "Edicion directa desde Agregar stock",
      p_usuario_id: null,
    });
    setIsSaving(false);

    if (error) {
      setMessage({ type: "error", text: `No se guardo stock: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Stock actualizado." });
    await loadProductos();
  }

  async function agregarCantidad() {
    if (!supabase || !productoIngreso || !almacenIngresoId) {
      setMessage({ type: "error", text: "Selecciona producto y almacen." });
      return;
    }

    if (!Number.isFinite(totalIngreso) || totalIngreso <= 0) {
      setMessage({ type: "error", text: "La cantidad a agregar debe ser mayor que cero." });
      return;
    }

    const actual = stockForAlmacen(productoIngreso, almacenIngresoId);
    setIsSaving(true);
    const { error } = await supabase.rpc("ajustar_stock", {
      p_producto_id: productoIngreso.id,
      p_almacen_id: almacenIngresoId,
      p_stock_contado: actual + totalIngreso,
      p_observacion: `Ingreso rapido: ${cantidadPresentaciones} presentacion(es) x ${unidadesPorPresentacion} + ${unidadesSueltas} unidad(es)`,
      p_usuario_id: null,
    });
    setIsSaving(false);

    if (error) {
      setMessage({ type: "error", text: `No se agrego stock: ${error.message}` });
      return;
    }

    setCantidadPresentaciones("1");
    setUnidadesSueltas("0");
    setMessage({ type: "success", text: `Se agregaron ${formatStock(totalIngreso)} unidades.` });
    await loadProductos();
  }

  return (
    <div className="space-y-5">
      {message ? (
        <div className={`rounded-lg border p-4 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Agregar cantidad</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select value={productoIngresoId} onChange={(event) => setProductoIngresoId(event.target.value)} className={inputClassName}>
            <option value="">Producto</option>
            {productos.map((producto) => (
              <option key={producto.id} value={producto.id}>
                {producto.nombre_producto}
              </option>
            ))}
          </select>
          <select value={almacenIngresoId} onChange={(event) => setAlmacenIngresoId(event.target.value)} className={inputClassName}>
            {almacenes.map((almacen) => (
              <option key={almacen.id} value={almacen.id}>
                {almacen.nombre}
              </option>
            ))}
          </select>
          <input type="number" min="0" step="1" value={cantidadPresentaciones} onChange={(event) => setCantidadPresentaciones(event.target.value)} placeholder="Presentaciones" className={inputClassName} />
          <input type="number" min="0" step="1" value={unidadesSueltas} onChange={(event) => setUnidadesSueltas(event.target.value)} placeholder="Unidades sueltas" className={inputClassName} />
          <button type="button" disabled={isSaving} onClick={() => void agregarCantidad()} className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
            Agregar stock
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Presentacion: {productoIngreso?.presentacion ?? "sin producto"} | unidades por presentacion: {formatStock(unidadesPorPresentacion)} | se agregaran {formatStock(totalIngreso)} unidades.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto" className={inputClassName} />
          <select value={almacenId} onChange={(event) => setAlmacenId(event.target.value)} className={inputClassName}>
            {almacenes.map((almacen) => (
              <option key={almacen.id} value={almacen.id}>
                {almacen.nombre}
              </option>
            ))}
          </select>
          <select value={categoriaId} onChange={(event) => { setCategoriaId(event.target.value); setSubcategoriaId(""); }} className={inputClassName}>
            <option value="">Categoria</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
          <select value={subcategoriaId} onChange={(event) => setSubcategoriaId(event.target.value)} className={inputClassName}>
            <option value="">Subcategoria</option>
            {subcategorias
              .filter((subcategoria) => !categoriaId || subcategoria.categoria_id === categoriaId)
              .map((subcategoria) => (
                <option key={subcategoria.id} value={subcategoria.id}>
                  {subcategoria.nombre}
                </option>
              ))}
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">Stock por almacen</h2>
          <p className="mt-1 text-sm text-slate-500">Edita el stock contado del almacen seleccionado.</p>
        </div>
        <div className="hidden max-h-[70vh] overflow-auto lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Presentacion</th>
                <th className="px-4 py-3">Almacen</th>
                <th className="px-4 py-3">Stock actual</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productos.map((producto) => (
                <tr key={producto.id}>
                  <td className="px-4 py-3 font-medium text-slate-950">{producto.nombre_producto}</td>
                  <td className="px-4 py-3 text-slate-600">{producto.presentacion ?? "Sin presentacion"}</td>
                  <td className="px-4 py-3 text-slate-600">{almacenes.find((almacen) => almacen.id === almacenId)?.nombre ?? "Almacen"}</td>
                  <td className="px-4 py-3">
                    <input type="number" min="0" step="0.01" value={stockEdit[producto.id] ?? "0"} onChange={(event) => setStockEdit((current) => ({ ...current, [producto.id]: event.target.value }))} className="h-10 w-28 rounded-md border border-slate-300 px-2 text-sm" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" disabled={isSaving} onClick={() => void guardarStock(producto)} className="h-10 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Guardar</button>
                      <Link href={`/productos/nuevo?id=${producto.id}`} className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700">Editar</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 lg:hidden">
          {productos.map((producto) => (
            <article key={producto.id} className="p-4">
              <p className="font-semibold text-slate-950">{producto.nombre_producto}</p>
              <p className="mt-1 text-sm text-slate-500">{producto.presentacion ?? "Sin presentacion"} | {almacenes.find((almacen) => almacen.id === almacenId)?.nombre ?? "Almacen"}</p>
              <input type="number" min="0" step="0.01" value={stockEdit[producto.id] ?? "0"} onChange={(event) => setStockEdit((current) => ({ ...current, [producto.id]: event.target.value }))} className="mt-3 h-11 w-full rounded-md border border-slate-300 px-3 text-sm" />
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={isSaving} onClick={() => void guardarStock(producto)} className="h-10 flex-1 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Guardar</button>
                <Link href={`/productos/nuevo?id=${producto.id}`} className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700">Editar</Link>
              </div>
            </article>
          ))}
        </div>
        {isLoading ? <p className="p-4 text-sm text-slate-500">Cargando productos...</p> : null}
        {!isLoading && productos.length === 0 ? <p className="p-4 text-sm text-slate-500">Busca o filtra productos para editar stock.</p> : null}
      </section>
    </div>
  );
}
