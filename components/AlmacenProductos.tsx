"use client";

/* eslint-disable react-hooks/set-state-in-effect */

/**
 * Productos Almacen: vista por producto con desglose de stock por
 * almacen y por cada presentacion de compra registrada.
 *
 * Ejemplo "Soda dia" con presentaciones [Caja x40, Caja x100]:
 *   Casa: 574 und
 *     - Caja x100 → 5 cajas + 74 sueltas
 *     - Caja x40  → 14 cajas + 14 sueltas
 *     - und        → 574 unidades
 *   Tienda: 0 und
 *
 * Acciones por almacen+producto: Transferir, Abastecer, Agregar stock
 * (links a las paginas existentes con el producto preseleccionado).
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { selectOnFocus } from "@/lib/inputUtils";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import {
  getBaseStockByAlmacen,
  getStockProductId,
} from "@/lib/inventoryUtils";
import { colors, colorsForAlmacen, stockChipClass } from "@/lib/theme";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Toast, type ToastMessage } from "@/components/ui/Toast";
import type {
  Almacen,
  Categoria,
  Marca,
  Producto,
  ProductoAlmacen,
  ProductoPresentacionCompra,
  Subcategoria,
} from "@/types/database";

type ProductoConStock = Producto & {
  marcas: Pick<Marca, "nombre"> | null;
  categorias: Pick<Categoria, "nombre"> | null;
  subcategorias: Pick<Subcategoria, "nombre"> | null;
  producto_almacen: Array<
    Pick<ProductoAlmacen, "almacen_id" | "stock_actual"> & {
      almacenes: Pick<Almacen, "id" | "nombre"> | null;
    }
  >;
  producto_base?: {
    id: string;
    producto_almacen: Array<
      Pick<ProductoAlmacen, "almacen_id" | "stock_actual"> & {
        almacenes: Pick<Almacen, "id" | "nombre"> | null;
      }
    >;
  } | null;
  producto_presentaciones_compra: Array<
    Pick<
      ProductoPresentacionCompra,
      "id" | "nombre_presentacion" | "unidades_por_presentacion" | "es_principal" | "activo"
    >
  >;
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

type Message = ToastMessage;

function formatNum(n: number) {
  return Number(n ?? 0).toFixed(2).replace(/\.00$/, "");
}

export function AlmacenProductos() {
  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [search, setSearch] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoriaId, setSubcategoriaId] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [stockFilter, setStockFilter] = useState<"todos" | "con_stock" | "sin_stock" | "bajo">("todos");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function loadCatalogos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "Sin Supabase." });
      return;
    }
    const [almacenesRes, catRes, subRes, marRes] = await Promise.all([
      supabase.from("almacenes").select("*").eq("activo", true).order("nombre"),
      supabase.from("categorias").select("*").eq("activo", true).order("nombre"),
      supabase.from("subcategorias").select("*").eq("activo", true).order("nombre"),
      supabase.from("marcas").select("*").eq("activo", true).order("nombre"),
    ]);
    setAlmacenes((almacenesRes.data ?? []) as Almacen[]);
    setCategorias((catRes.data ?? []) as Categoria[]);
    setSubcategorias((subRes.data ?? []) as Subcategoria[]);
    setMarcas((marRes.data ?? []) as Marca[]);
  }

  async function loadProductos() {
    if (!supabase) return;
    setIsLoading(true);

    let q = supabase
      .from("productos")
      .select(
        `*,
        marcas(nombre),
        categorias(nombre),
        subcategorias(nombre),
        producto_almacen(almacen_id,stock_actual,almacenes(id,nombre)),
        producto_presentaciones_compra(id,nombre_presentacion,unidades_por_presentacion,es_principal,activo)`,
      )
      .eq("activo", true)
      .order("nombre_producto");
    if (categoriaId) q = q.eq("categoria_id", categoriaId);
    if (subcategoriaId) q = q.eq("subcategoria_id", subcategoriaId);
    if (marcaId) q = q.eq("marca_id", marcaId);

    const { data, error } = await fetchAllRows<ProductoConStock>(q);
    if (error) {
      setIsLoading(false);
      setMessage({ type: "error", text: `No se cargaron productos: ${error.message}` });
      return;
    }

    // Prefetch producto_base para resolver stock real de presentaciones vinculadas.
    const baseIds = [
      ...new Set(
        (data ?? [])
          .map((p) => p.producto_base_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const baseMap = new Map<
      string,
      {
        id: string;
        producto_almacen: ProductoConStock["producto_almacen"];
      }
    >();
    if (baseIds.length > 0) {
      const { data: baseRows } = await supabase
        .from("productos")
        .select("id,producto_almacen(almacen_id,stock_actual,almacenes(id,nombre))")
        .in("id", baseIds);
      ((baseRows ?? []) as unknown as Array<{
        id: string;
        producto_almacen: ProductoConStock["producto_almacen"];
      }>).forEach((row) => baseMap.set(row.id, row));
    }

    const merged = (data ?? []).map((p) => {
      if (!p.producto_base_id) return p;
      const base = baseMap.get(p.producto_base_id);
      return base ? { ...p, producto_base: base } : p;
    });

    setProductos(merged);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadCatalogos();
  }, []);

  useEffect(() => {
    void loadProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId, subcategoriaId, marcaId]);

  const subcategoriasDisponibles = useMemo(
    () =>
      categoriaId
        ? subcategorias.filter((s) => s.categoria_id === categoriaId)
        : subcategorias,
    [categoriaId, subcategorias],
  );

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      if (search.trim()) {
        const ok = matchesSearch(search, [
          p.codigo_interno,
          p.nombre_producto,
          p.presentacion,
          p.marcas?.nombre,
          p.categorias?.nombre,
          p.subcategorias?.nombre,
        ]);
        if (!ok) return false;
      }
      if (stockFilter !== "todos") {
        const total = (p.producto_base?.producto_almacen ?? p.producto_almacen ?? [])
          .reduce((sum, r) => sum + Number(r.stock_actual ?? 0), 0);
        const minimo = Number(p.stock_minimo ?? 10);
        if (stockFilter === "con_stock" && total <= 0) return false;
        if (stockFilter === "sin_stock" && total > 0) return false;
        if (stockFilter === "bajo" && (total <= 0 || total > minimo)) return false;
      }
      return true;
    });
  }, [productos, search, stockFilter]);

  return (
    <div className="space-y-5">
      <Toast message={message} onDismiss={() => setMessage(null)} />

      <section className={`rounded-lg border ${colors.panelBorder} ${colors.panelBg} p-4 shadow-sm`}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto, codigo, marca..."
            className={inputClassName}
          />
          <SearchableSelect
            value={categoriaId}
            onChange={(id) => {
              setCategoriaId(id);
              setSubcategoriaId("");
            }}
            options={categorias.map((c) => ({ id: c.id, label: c.nombre }))}
            placeholder="Categoria"
          />
          <SearchableSelect
            value={subcategoriaId}
            onChange={(id) => setSubcategoriaId(id)}
            options={subcategoriasDisponibles.map((s) => ({ id: s.id, label: s.nombre }))}
            placeholder={categoriaId ? "Subcategoria" : "Elegi categoria"}
            disabled={!categoriaId}
          />
          <SearchableSelect
            value={marcaId}
            onChange={(id) => setMarcaId(id)}
            options={marcas.map((m) => ({ id: m.id, label: m.nombre }))}
            placeholder="Marca"
          />
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
            className={inputClassName}
          >
            <option value="todos">Todo stock</option>
            <option value="con_stock">Con stock</option>
            <option value="bajo">Stock bajo</option>
            <option value="sin_stock">Sin stock</option>
          </select>
        </div>
      </section>

      <section className="space-y-4">
        {isLoading ? (
          <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">
            Cargando productos...
          </p>
        ) : productosFiltrados.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">
            No hay productos con estos filtros.
          </p>
        ) : (
          productosFiltrados.map((producto) => (
            <ProductoCard
              key={producto.id}
              producto={producto}
              almacenes={almacenes}
              onMessage={setMessage}
              onSaved={() => void loadProductos()}
            />
          ))
        )}
      </section>
    </div>
  );
}

/**
 * Una tarjeta por producto, con secciones internas para cada almacen.
 * Cada seccion lista el stock total y el desglose por presentacion
 * (cuantas presentaciones enteras + cuantas sueltas).
 */
function ProductoCard({
  producto,
  almacenes,
  onMessage,
  onSaved,
}: {
  producto: ProductoConStock;
  almacenes: Almacen[];
  onMessage: (m: ToastMessage) => void;
  onSaved: () => void;
}) {
  const unidadBase = (producto.unidad_base ?? "und").trim() || "und";
  const stockProductoId = getStockProductId(producto);
  const presentacionesActivas = (producto.producto_presentaciones_compra ?? [])
    .filter((p) => p.activo !== false && Number(p.unidades_por_presentacion) > 1)
    .sort((a, b) => {
      if (a.es_principal && !b.es_principal) return -1;
      if (!a.es_principal && b.es_principal) return 1;
      return Number(b.unidades_por_presentacion ?? 0) - Number(a.unidades_por_presentacion ?? 0);
    });

  return (
    <article className={`overflow-hidden rounded-lg border ${colors.panelBorder} ${colors.panelBg} shadow-sm`}>
      {/* Header del producto */}
      <header className="flex items-start gap-3 border-b border-slate-100 p-4">
        {producto.imagen_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={producto.imagen_url}
            alt=""
            className="h-14 w-14 shrink-0 rounded-md border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-400">
            sin img
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-950">{producto.nombre_producto}</h3>
          <p className="text-xs text-slate-500">
            {[producto.marcas?.nombre, producto.presentacion, producto.codigo_interno]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right text-xs text-slate-500">
          <p>
            min{" "}
            <strong className="text-slate-700">
              {formatNum(Number(producto.stock_minimo ?? 10))}
            </strong>{" "}
            {unidadBase}
          </p>
        </div>
      </header>

      {/* Una seccion por cada almacen */}
      <div className="divide-y divide-slate-100">
        {almacenes.map((almacen) => (
          <AlmacenSection
            key={almacen.id}
            almacen={almacen}
            producto={producto}
            unidadBase={unidadBase}
            stockProductoId={stockProductoId}
            presentacionesActivas={presentacionesActivas}
            onMessage={onMessage}
            onSaved={onSaved}
          />
        ))}
      </div>
    </article>
  );
}

function AlmacenSection({
  almacen,
  producto,
  unidadBase,
  stockProductoId,
  presentacionesActivas,
  onMessage,
  onSaved,
}: {
  almacen: Almacen;
  producto: ProductoConStock;
  unidadBase: string;
  stockProductoId: string;
  presentacionesActivas: ProductoConStock["producto_presentaciones_compra"];
  onMessage: (m: ToastMessage) => void;
  onSaved: () => void;
}) {
  const stockBase = getBaseStockByAlmacen(producto, almacen.id);
  const minimo = Number(producto.stock_minimo ?? 10);
  const almacenColors = colorsForAlmacen(almacen.nombre);
  const chipClass = stockChipClass(stockBase, minimo);

  // Deltas por presentacion (en unidades de esa presentacion) + delta en
  // unidad base. Al guardar: nuevo_stock = stockBase + Σ(delta_i × factor_i).
  // Permite que el usuario diga "agregar 1 caja y 5 sueltas" sin pensar.
  const [deltas, setDeltas] = useState<Record<string, string>>({});
  const [deltaBase, setDeltaBase] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Calcular el cambio total proyectado en unidades base.
  const cambioTotalBase = useMemo(() => {
    let suma = 0;
    for (const pres of presentacionesActivas) {
      const v = deltas[pres.id];
      const n = Number(v);
      if (Number.isFinite(n) && v && v.trim() !== "") {
        suma += n * Number(pres.unidades_por_presentacion);
      }
    }
    const nBase = Number(deltaBase);
    if (Number.isFinite(nBase) && deltaBase.trim() !== "") {
      suma += nBase;
    }
    return suma;
  }, [deltas, deltaBase, presentacionesActivas]);

  const stockProyectado = stockBase + cambioTotalBase;
  const hayCambios = cambioTotalBase !== 0;

  async function guardar() {
    if (!supabase) return;
    if (!hayCambios) {
      onMessage({ type: "warning", text: "No hay cambios para guardar." });
      return;
    }
    if (stockProyectado < 0) {
      onMessage({
        type: "error",
        text: `El resultado daria stock negativo (${stockProyectado}). Stock actual: ${stockBase}.`,
      });
      return;
    }
    setIsSaving(true);
    // Construir observacion descriptiva (Saco +2, Caja -1, etc.)
    const detallesObs = presentacionesActivas
      .filter((p) => {
        const n = Number(deltas[p.id]);
        return Number.isFinite(n) && n !== 0;
      })
      .map((p) => {
        const n = Number(deltas[p.id]);
        return `${p.nombre_presentacion} ${n > 0 ? "+" : ""}${n}`;
      });
    const nBase = Number(deltaBase);
    if (Number.isFinite(nBase) && nBase !== 0) {
      detallesObs.push(`${unidadBase} ${nBase > 0 ? "+" : ""}${nBase}`);
    }
    const obs = `Edicion por presentacion: ${detallesObs.join(", ")} (= ${cambioTotalBase > 0 ? "+" : ""}${cambioTotalBase} ${unidadBase})`;
    const { error } = await supabase.rpc("ajustar_stock", {
      p_producto_id: stockProductoId,
      p_almacen_id: almacen.id,
      p_stock_contado: stockProyectado,
      p_observacion: obs,
      p_usuario_id: null,
    });
    setIsSaving(false);
    if (error) {
      onMessage({ type: "error", text: `No se pudo guardar: ${error.message}` });
      return;
    }
    onMessage({
      type: "success",
      text: `${almacen.nombre}: ${stockBase} → ${stockProyectado} ${unidadBase} (${cambioTotalBase > 0 ? "+" : ""}${cambioTotalBase})`,
    });
    setDeltas({});
    setDeltaBase("");
    onSaved();
  }

  return (
    <div className="grid gap-3 p-4 md:grid-cols-[140px_minmax(0,1fr)_auto] md:items-start">
      {/* Almacen (izquierda) */}
      <div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${almacenColors.chipStrong}`}
        >
          {almacen.nombre}
        </span>
        <p className={`mt-2 text-2xl font-bold ${almacenColors.text}`}>
          {formatNum(stockBase)}{" "}
          <span className="text-sm font-medium text-slate-500">{unidadBase}</span>
        </p>
        {hayCambios ? (
          <p className={`text-sm font-semibold ${stockProyectado < 0 ? "text-rose-700" : "text-emerald-700"}`}>
            → {formatNum(stockProyectado)} {unidadBase}
            <span className="ml-1 text-xs">
              ({cambioTotalBase > 0 ? "+" : ""}{formatNum(cambioTotalBase)})
            </span>
          </p>
        ) : null}
        <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${chipClass}`}>
          {stockBase <= 0 ? "Sin stock" : stockBase <= minimo ? "Stock bajo" : "OK"}
        </span>
      </div>

      {/* Desglose editable por presentacion (centro) */}
      <div className="space-y-1.5">
        {presentacionesActivas.length === 0 ? (
          <p className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Sin presentaciones de compra registradas. Solo se cuenta en{" "}
            <strong>{unidadBase}</strong>.
          </p>
        ) : (
          presentacionesActivas.map((pres) => {
            const factor = Number(pres.unidades_por_presentacion);
            const enteras = factor > 0 ? Math.floor(stockBase / factor) : 0;
            const sueltas = factor > 0 ? stockBase - enteras * factor : stockBase;
            const deltaVal = deltas[pres.id] ?? "";
            const deltaNum = Number(deltaVal);
            const validDelta = deltaVal.trim() !== "" && Number.isFinite(deltaNum);
            return (
              <div
                key={pres.id}
                className="grid items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm sm:grid-cols-[1fr_auto_110px]"
              >
                <span className="text-slate-700">
                  {pres.nombre_presentacion}{" "}
                  <span className="text-xs text-slate-400">(x{factor})</span>
                </span>
                <span className="text-xs text-slate-700">
                  <strong>{enteras}</strong> ent.{" "}
                  <span className="text-slate-500">
                    + {formatNum(sueltas)} {unidadBase}
                  </span>
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={deltaVal}
                  onChange={(e) =>
                    setDeltas((curr) => ({ ...curr, [pres.id]: e.target.value }))
                  }
                  onFocus={selectOnFocus}
                  placeholder="+1 / -1"
                  title={`Sumar/restar ${pres.nombre_presentacion}. +1 = +${factor} ${unidadBase}`}
                  className={`h-8 w-full rounded border px-2 text-right text-sm ${
                    validDelta && deltaNum !== 0
                      ? deltaNum > 0
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-rose-300 bg-rose-50"
                      : "border-slate-300"
                  }`}
                />
              </div>
            );
          })
        )}
        {/* Unidad base siempre al final, tambien editable */}
        <div className="grid items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm sm:grid-cols-[1fr_auto_110px]">
          <span className="text-slate-700">Unidad base ({unidadBase})</span>
          <span className="text-xs font-semibold text-slate-700">
            {formatNum(stockBase)}
          </span>
          <input
            type="number"
            step="0.01"
            value={deltaBase}
            onChange={(e) => setDeltaBase(e.target.value)}
            onFocus={selectOnFocus}
            placeholder="+5 / -2"
            title={`Sumar/restar ${unidadBase} sueltas`}
            className={`h-8 w-full rounded border px-2 text-right text-sm ${
              deltaBase.trim() !== "" && Number(deltaBase) !== 0
                ? Number(deltaBase) > 0
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-rose-300 bg-rose-50"
                : "border-slate-300"
            }`}
          />
        </div>
        {hayCambios ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void guardar()}
            className={`mt-1 h-9 w-full rounded-md text-xs font-semibold ${colors.btnPrimary}`}
          >
            {isSaving
              ? "Guardando..."
              : `Guardar (${cambioTotalBase > 0 ? "+" : ""}${formatNum(cambioTotalBase)} ${unidadBase})`}
          </button>
        ) : null}
      </div>

      {/* Acciones (derecha) */}
      <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
        <Link
          href={`/almacen/transferencias?producto=${stockProductoId}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Transferir
        </Link>
        <Link
          href={`/almacen/abastecimiento?producto=${stockProductoId}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Abastecer
        </Link>
        <Link
          href={`/almacen/ajustes?producto=${stockProductoId}&almacen=${almacen.id}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-800 hover:bg-amber-100"
          title="Conteo fisico completo (reemplaza el total)"
        >
          Conteo físico
        </Link>
      </div>
    </div>
  );
}
