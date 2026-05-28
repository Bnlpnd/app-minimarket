"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  getBaseStockByAlmacen,
  getStockProductId,
  getUnitsPerSale,
} from "@/lib/inventoryUtils";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { selectOnFocus } from "@/lib/inputUtils";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Toast } from "@/components/ui/Toast";
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
  producto_base?: {
    id: string;
    nombre_producto?: string | null;
    producto_almacen: Array<Pick<ProductoAlmacen, "almacen_id" | "stock_actual">>;
  } | null;
  producto_presentaciones_compra: Array<
    Pick<
      ProductoPresentacionCompra,
      "nombre_presentacion" | "unidades_por_presentacion" | "es_principal"
    >
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
  return producto ? getBaseStockByAlmacen(producto, almacenId) : 0;
}

export function AlmacenAgregarStock() {
  const searchParams = useSearchParams();
  const productoQueryId = searchParams.get("producto");
  const almacenQueryId = searchParams.get("almacen");
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
  const [presentacionCompraIndex, setPresentacionCompraIndex] = useState(0);
  // Fecha de vencimiento opcional del lote que ingresa. Vacio = no se
  // crea lote (productos no perecederos como cuadernos, detergentes).
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const productoIngreso = useMemo(
    () => productos.find((producto) => producto.id === productoIngresoId) ?? null,
    [productoIngresoId, productos],
  );

  // Reset del selector de presentacion cuando cambia el producto.
  useEffect(() => {
    setPresentacionCompraIndex(0);
  }, [productoIngresoId]);

  // Lista de presentaciones de compra ordenada (principal primero, luego por
  // mayor cantidad).
  const presentacionesCompraOrdenadas = useMemo(() => {
    if (!productoIngreso) return [];
    const items = [...productoIngreso.producto_presentaciones_compra];
    items.sort((a, b) => {
      if (a.es_principal && !b.es_principal) return -1;
      if (!a.es_principal && b.es_principal) return 1;
      return Number(b.unidades_por_presentacion ?? 0) - Number(a.unidades_por_presentacion ?? 0);
    });
    return items;
  }, [productoIngreso]);

  // Jerarquia explicita para definir cuantas unidades trae cada presentacion:
  //   1) Si el usuario eligio una presentacion de compra, usa esa.
  //   2) Si el producto declara `unidades_equivalentes > 1` (presentacion
  //      vinculada a base), usa esa.
  //   3) Si hay alguna presentacion_compra (incluso unica), usa su `unidades_por_presentacion`.
  //   4) Si la presentacion textual tiene "x N" (ej. "Pack x4"), parsea N.
  //   5) Fallback a 1.
  const unidadesPorPresentacion = useMemo(() => {
    if (!productoIngreso) {
      return 1;
    }

    const elegida = presentacionesCompraOrdenadas[presentacionCompraIndex];
    if (elegida) {
      const valor = Number(elegida.unidades_por_presentacion ?? 0);
      if (Number.isFinite(valor) && valor > 0) {
        return valor;
      }
    }

    const desdeProducto = Number(productoIngreso.unidades_equivalentes ?? 1);
    if (Number.isFinite(desdeProducto) && desdeProducto > 1) {
      return desdeProducto;
    }

    const desdeTexto = parsePresentationUnits(productoIngreso.presentacion);
    return desdeTexto || getUnitsPerSale(productoIngreso) || 1;
  }, [presentacionCompraIndex, presentacionesCompraOrdenadas, productoIngreso]);

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
        `*,categorias(nombre),subcategorias(nombre),producto_almacen(almacen_id,stock_actual),producto_presentaciones_compra(nombre_presentacion,unidades_por_presentacion,es_principal)`,
      )
      .eq("activo", true)
      .order("nombre_producto");

    if (categoriaId) {
      query = query.eq("categoria_id", categoriaId);
    }
    if (subcategoriaId) {
      query = query.eq("subcategoria_id", subcategoriaId);
    }

    const { data, error } = await fetchAllRows<ProductoStockRow>(query);

    if (error) {
      setIsLoading(false);
      setMessage({ type: "error", text: `No se cargo el stock: ${error.message}` });
      setProductos([]);
      return;
    }

    const baseIds = Array.from(
      new Set(
        data
          .map((producto) => producto.producto_base_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const baseStockByProducto = new Map<
      string,
      {
        id: string;
        nombre_producto: string | null;
        producto_almacen: Array<Pick<ProductoAlmacen, "almacen_id" | "stock_actual">>;
      }
    >();

    if (baseIds.length > 0) {
      const { data: baseRows, error: baseError } = await supabase
        .from("productos")
        .select("id,nombre_producto,producto_almacen(almacen_id,stock_actual)")
        .in("id", baseIds);

      if (baseError) {
        setIsLoading(false);
        setMessage({
          type: "error",
          text: `No se cargo el stock base: ${baseError.message}`,
        });
        setProductos([]);
        return;
      }

      (baseRows ?? []).forEach((row) => {
        const typed = row as {
          id: string;
          nombre_producto: string | null;
          producto_almacen: Array<Pick<ProductoAlmacen, "almacen_id" | "stock_actual">>;
        };
        baseStockByProducto.set(typed.id, typed);
      });
    }

    const merged = data.map((producto) => {
      if (!producto.producto_base_id) {
        return producto;
      }
      const base = baseStockByProducto.get(producto.producto_base_id);
      if (!base) {
        return producto;
      }
      return { ...producto, producto_base: base };
    });

    setIsLoading(false);
    const rows = merged.filter((producto) =>
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
      Object.fromEntries(
        rows.map((producto) => [producto.id, String(stockForAlmacen(producto, almacenId))]),
      ),
    );
  }

  useEffect(() => {
    void loadCatalogos();
  }, []);

  // Si la URL trae ?producto=ID, preseleccionarlo y filtrar la busqueda
  // para que el listado de abajo tambien lo muestre. Se dispara una sola
  // vez al cambiar el param.
  useEffect(() => {
    if (almacenQueryId) {
      setAlmacenIngresoId(almacenQueryId);
    }
  }, [almacenQueryId]);

  useEffect(() => {
    if (!productoQueryId) return;
    setProductoIngresoId(productoQueryId);
    // Cargar nombre del producto para filtrar visualmente la lista de abajo.
    if (supabase) {
      void supabase
        .from("productos")
        .select("nombre_producto")
        .eq("id", productoQueryId)
        .maybeSingle()
        .then(({ data }) => {
          const nombre = (data as { nombre_producto?: string } | null)?.nombre_producto;
          if (nombre) setSearch(nombre);
        });
    }
    setMessage({
      type: "success",
      text: "Producto preseleccionado. Elige almacen y cantidad para sumar stock.",
    });
  }, [productoQueryId]);

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
    setMessage(null);
    try {
      const { error } = await supabase.rpc("ajustar_stock", {
        p_producto_id: getStockProductId(producto),
        p_almacen_id: almacenId,
        p_stock_contado: value,
        p_observacion: producto.producto_base_id
          ? `Edicion directa Agregar stock (vinculo a base ${producto.producto_base?.nombre_producto ?? ""})`
          : "Edicion directa Agregar stock",
        p_usuario_id: null,
      });
      if (error) {
        setMessage({ type: "error", text: `No se guardo stock: ${error.message}` });
        return;
      }
    } catch (rpcError) {
      const text = rpcError instanceof Error ? rpcError.message : String(rpcError);
      setMessage({
        type: "error",
        text: `No se guardo stock: ${text}. Revisa la conexion con Supabase.`,
      });
      return;
    } finally {
      setIsSaving(false);
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
    const productoStockId = getStockProductId(productoIngreso);
    setIsSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc("ajustar_stock", {
        p_producto_id: productoStockId,
        p_almacen_id: almacenIngresoId,
        p_stock_contado: actual + totalIngreso,
        p_observacion: `Ingreso rapido: ${cantidadPresentaciones} presentacion(es) x ${unidadesPorPresentacion} + ${unidadesSueltas} unidad(es)`,
        p_usuario_id: null,
      });
      if (error) {
        setMessage({ type: "error", text: `No se agrego stock: ${error.message}` });
        return;
      }

      // Si el usuario eligio fecha de vencimiento, registramos un lote.
      // Sin fecha = ingreso comun sin tracking (productos no perecederos).
      if (fechaVencimiento) {
        const { error: loteError } = await supabase
          .from("producto_lotes")
          .insert({
            producto_id: productoStockId,
            almacen_id: almacenIngresoId,
            cantidad_inicial: totalIngreso,
            cantidad_actual: totalIngreso,
            fecha_vencimiento: fechaVencimiento,
            origen: "compra",
            notas: `Ingreso ${cantidadPresentaciones}x${unidadesPorPresentacion}+${unidadesSueltas} sueltas`,
          });
        if (loteError) {
          // No bloquear: el stock ya se ajusto. Avisar como warning suave.
          setMessage({
            type: "error",
            text: `Stock actualizado, pero no se guardo el lote: ${loteError.message}`,
          });
          return;
        }
      }
    } catch (rpcError) {
      const text = rpcError instanceof Error ? rpcError.message : String(rpcError);
      setMessage({
        type: "error",
        text: `No se agrego stock: ${text}. Revisa la conexion con Supabase.`,
      });
      return;
    } finally {
      setIsSaving(false);
    }

    const almacenNombre =
      almacenes.find((a) => a.id === almacenIngresoId)?.nombre ?? "almacen";
    const stockNuevo = actual + totalIngreso;
    setCantidadPresentaciones("1");
    setUnidadesSueltas("0");
    setFechaVencimiento("");
    setMessage({
      type: "success",
      text:
        `✓ Se agregaron ${formatStock(totalIngreso)} ${productoIngreso.unidad_base ?? "und"} a ${almacenNombre} ` +
        `(${actual} → ${stockNuevo})` +
        (fechaVencimiento ? " · lote registrado" : ""),
    });
    await loadProductos();
  }

  return (
    <div className="space-y-5">
      <Toast message={message} onDismiss={() => setMessage(null)} />

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-slate-950">Agregar cantidad</h2>
          <Link
            href="/productos/nuevo"
            className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + Agregar nuevo producto
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 md:hidden">Producto</span>
            <SearchableSelect
              value={productoIngresoId}
              onChange={(id) => setProductoIngresoId(id)}
              options={productos.map((producto) => ({
                id: producto.id,
                label: producto.nombre_producto,
                sub: producto.codigo_interno ?? undefined,
              }))}
              placeholder="Buscar producto..."
            />
          </label>
          <div className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              Almacen destino <span className="text-red-600">*</span>
            </span>
            <div className="flex gap-1 rounded-md border border-slate-300 bg-white p-1">
              {almacenes.map((almacen) => {
                const isSelected = almacen.id === almacenIngresoId;
                const isCasa = almacen.nombre.toLowerCase() === "casa";
                return (
                  <button
                    key={almacen.id}
                    type="button"
                    onClick={() => setAlmacenIngresoId(almacen.id)}
                    className={`flex-1 h-9 rounded text-sm font-semibold transition ${
                      isSelected
                        ? isCasa
                          ? "bg-blue-600 text-white shadow"
                          : "bg-emerald-600 text-white shadow"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {almacen.nombre}
                  </button>
                );
              })}
            </div>
          </div>
          {presentacionesCompraOrdenadas.length > 1 ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600 md:hidden">Presentacion</span>
              <select
                value={presentacionCompraIndex}
                onChange={(event) => setPresentacionCompraIndex(Number(event.target.value))}
                className={inputClassName}
              >
                {presentacionesCompraOrdenadas.map((pres, index) => (
                  <option key={`${pres.nombre_presentacion}-${index}`} value={index}>
                    {pres.nombre_presentacion} (x{pres.unidades_por_presentacion})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 md:hidden">Cantidad de presentaciones</span>
            <input type="number" onFocus={selectOnFocus} min="0" step="1" value={cantidadPresentaciones} onChange={(event) => setCantidadPresentaciones(event.target.value)} placeholder="Presentaciones" className={inputClassName} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 md:hidden">Unidades sueltas</span>
            <input type="number" onFocus={selectOnFocus} min="0" step="1" value={unidadesSueltas} onChange={(event) => setUnidadesSueltas(event.target.value)} placeholder="Unidades sueltas" className={inputClassName} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 md:hidden">Fecha vencimiento (opcional)</span>
            <input
              type="date"
              value={fechaVencimiento}
              onChange={(event) => setFechaVencimiento(event.target.value)}
              className={inputClassName}
              title="Fecha vencimiento (opcional)"
            />
          </label>
          <button type="button" disabled={isSaving} onClick={() => void agregarCantidad()} className="h-12 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300 md:h-11">
            Agregar stock
          </button>
        </div>
        {productoIngreso && almacenIngresoId ? (() => {
          const almacenNombre =
            almacenes.find((a) => a.id === almacenIngresoId)?.nombre ?? "?";
          const actual = stockForAlmacen(productoIngreso, almacenIngresoId);
          const nuevo = actual + totalIngreso;
          const isCasa = almacenNombre.toLowerCase() === "casa";
          return (
            <p
              className={`mt-3 rounded-md border p-3 text-sm ${
                isCasa
                  ? "border-blue-200 bg-blue-50 text-blue-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              <strong>Se sumara a {almacenNombre}:</strong>{" "}
              {formatStock(totalIngreso)} {productoIngreso.unidad_base?.trim() || "unidades"}
              {" "}
              ({cantidadPresentaciones} pres. × {formatStock(unidadesPorPresentacion)}
              {" + "}{unidadesSueltas} sueltas)
              {" · "}
              Stock {almacenNombre}: <strong>{formatStock(actual)} → {formatStock(nuevo)}</strong>
              {fechaVencimiento ? ` · vence ${fechaVencimiento.split("-").reverse().join("/")}` : ""}
            </p>
          );
        })() : (
          <p className="mt-3 text-sm text-slate-500">
            Selecciona producto y almacen para ver la previsualizacion.
          </p>
        )}
        {productoIngreso?.producto_base_id && productoIngreso.producto_base ? (
          <p className="mt-2 text-sm text-emerald-700">
            Stock se suma al producto base &quot;{productoIngreso.producto_base.nombre_producto ?? "(base)"}&quot;.
          </p>
        ) : null}
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
          <p className="mt-1 text-sm text-slate-500">
            Edita el stock contado en unidades base. Los productos vinculados a un producto base comparten stock con el.
          </p>
        </div>
        <div className="hidden max-h-[70vh] overflow-auto lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Presentacion</th>
                <th className="px-4 py-3">Vinculo</th>
                <th className="px-4 py-3">Almacen</th>
                <th className="px-4 py-3">Stock base actual</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productos.map((producto) => {
                const units = getUnitsPerSale(producto);
                const inputValue = Number(stockEdit[producto.id] ?? 0);
                const presentacionesEq = units > 1 ? Math.floor(inputValue / units) : 0;
                const remainder = units > 1 ? inputValue % units : 0;
                return (
                  <tr key={producto.id}>
                    <td className="px-4 py-3 font-medium text-slate-950">{producto.nombre_producto}</td>
                    <td className="px-4 py-3 text-slate-600">{producto.presentacion ?? "Sin presentacion"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {producto.producto_base_id && producto.producto_base ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          1 = {formatStock(units)} de &quot;{producto.producto_base.nombre_producto ?? "base"}&quot;
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Producto base</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{almacenes.find((almacen) => almacen.id === almacenId)?.nombre ?? "Almacen"}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        onFocus={selectOnFocus}
                        min="0"
                        step="0.01"
                        value={stockEdit[producto.id] ?? "0"}
                        onChange={(event) => setStockEdit((current) => ({ ...current, [producto.id]: event.target.value }))}
                        className="h-10 w-28 rounded-md border border-slate-300 px-2 text-sm"
                      />
                      {units > 1 ? (
                        <p className="mt-1 text-xs text-slate-500">
                          = {presentacionesEq} presentacion(es) + {formatStock(remainder)} sueltas
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button type="button" disabled={isSaving} onClick={() => void guardarStock(producto)} className="h-10 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Guardar</button>
                        <Link href={`/productos/nuevo?id=${producto.id}`} className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700">Editar</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 lg:hidden">
          {productos.map((producto) => {
            const units = getUnitsPerSale(producto);
            const inputValue = Number(stockEdit[producto.id] ?? 0);
            const presentacionesEq = units > 1 ? Math.floor(inputValue / units) : 0;
            const remainder = units > 1 ? inputValue % units : 0;
            return (
              <article key={producto.id} className="p-4">
                <p className="font-semibold text-slate-950">{producto.nombre_producto}</p>
                <p className="mt-1 text-sm text-slate-500">{producto.presentacion ?? "Sin presentacion"} | {almacenes.find((almacen) => almacen.id === almacenId)?.nombre ?? "Almacen"}</p>
                {producto.producto_base_id && producto.producto_base ? (
                  <p className="mt-1 text-xs text-emerald-700">
                    1 presentacion = {formatStock(units)} unidades base de &quot;{producto.producto_base.nombre_producto ?? "base"}&quot;
                  </p>
                ) : null}
                <input
                  type="number"
                  onFocus={selectOnFocus}
                  min="0"
                  step="0.01"
                  value={stockEdit[producto.id] ?? "0"}
                  onChange={(event) => setStockEdit((current) => ({ ...current, [producto.id]: event.target.value }))}
                  className="mt-3 h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
                />
                {units > 1 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    = {presentacionesEq} presentacion(es) + {formatStock(remainder)} sueltas
                  </p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={isSaving} onClick={() => void guardarStock(producto)} className="h-10 flex-1 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Guardar</button>
                  <Link href={`/productos/nuevo?id=${producto.id}`} className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700">Editar</Link>
                </div>
              </article>
            );
          })}
        </div>
        {isLoading ? <p className="p-4 text-sm text-slate-500">Cargando productos...</p> : null}
        {!isLoading && productos.length === 0 ? <p className="p-4 text-sm text-slate-500">Busca o filtra productos para editar stock.</p> : null}
      </section>
    </div>
  );
}
