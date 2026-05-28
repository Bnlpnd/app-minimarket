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
      unidades_sueltas?: number | null;
      almacenes: Pick<Almacen, "id" | "nombre"> | null;
    }
  >;
  producto_base?: {
    id: string;
    producto_almacen: Array<
      Pick<ProductoAlmacen, "almacen_id" | "stock_actual"> & {
        unidades_sueltas?: number | null;
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

/** Cantidad guardada por presentacion en producto_almacen_presentacion. */
type DesgloseRow = {
  producto_id: string;
  almacen_id: string;
  presentacion_compra_id: string;
  cantidad: number;
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

type Message = ToastMessage;

function formatNum(n: number) {
  return Number(n ?? 0).toFixed(2).replace(/\.00$/, "");
}

export function AlmacenProductos() {
  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  // Desglose por (producto_id, almacen_id, presentacion_id) -> cantidad
  const [desgloseMap, setDesgloseMap] = useState<Map<string, number>>(new Map());
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
        producto_almacen(almacen_id,stock_actual,unidades_sueltas,almacenes(id,nombre)),
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
        .select("id,producto_almacen(almacen_id,stock_actual,unidades_sueltas,almacenes(id,nombre))")
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

    // Cargar desglose por presentacion para todos los productos visibles.
    // Indexamos por "producto_id|almacen_id|presentacion_id".
    const productoIds = [
      ...new Set(merged.flatMap((p) => [p.id, p.producto_base_id].filter(Boolean) as string[])),
    ];
    if (productoIds.length > 0) {
      const { data: desgloseData } = await supabase
        .from("producto_almacen_presentacion")
        .select("producto_id, almacen_id, presentacion_compra_id, cantidad")
        .in("producto_id", productoIds);
      const map = new Map<string, number>();
      for (const row of (desgloseData ?? []) as DesgloseRow[]) {
        map.set(
          `${row.producto_id}|${row.almacen_id}|${row.presentacion_compra_id}`,
          Number(row.cantidad),
        );
      }
      setDesgloseMap(map);
    }

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
              desgloseMap={desgloseMap}
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
  desgloseMap,
  onMessage,
  onSaved,
}: {
  producto: ProductoConStock;
  almacenes: Almacen[];
  desgloseMap: Map<string, number>;
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
            desgloseMap={desgloseMap}
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
  desgloseMap,
  onMessage,
  onSaved,
}: {
  almacen: Almacen;
  producto: ProductoConStock;
  unidadBase: string;
  stockProductoId: string;
  presentacionesActivas: ProductoConStock["producto_presentaciones_compra"];
  desgloseMap: Map<string, number>;
  onMessage: (m: ToastMessage) => void;
  onSaved: () => void;
}) {
  const stockBase = getBaseStockByAlmacen(producto, almacen.id);
  const minimo = Number(producto.stock_minimo ?? 10);
  const almacenColors = colorsForAlmacen(almacen.nombre);
  const chipClass = stockChipClass(stockBase, minimo);

  // ¿Hay desglose REAL guardado en BD para este producto+almacen?
  // (alguna fila en producto_almacen_presentacion para esta tupla)
  const tieneDesgloseGuardado = useMemo(() => {
    return presentacionesActivas.some((p) =>
      desgloseMap.has(`${stockProductoId}|${almacen.id}|${p.id}`),
    );
  }, [desgloseMap, presentacionesActivas, stockProductoId, almacen.id]);

  // Sueltas guardadas en producto_almacen.unidades_sueltas (puede ser 0/null
  // para productos legacy que nunca usaron el desglose).
  const sueltasEnDB = useMemo(() => {
    const rows =
      producto.producto_base?.producto_almacen ?? producto.producto_almacen ?? [];
    const row = rows.find((r) => r.almacen_id === almacen.id);
    return Number(row?.unidades_sueltas ?? 0);
  }, [producto, almacen.id]);

  // Cantidad "guardada" por presentacion. Si hay registros en la tabla
  // nueva, los usa. Si no (caso legacy), CALCULA un desglose razonable
  // desde stock_actual usando la presentacion principal/mas grande,
  // para que el usuario no vea todo en 0 cuando si hay stock real.
  // El calculo es solo para mostrar — al guardar, queda persistido tal
  // cual lo tipee el usuario.
  const desgloseGuardado = useMemo(() => {
    const map: Record<string, number> = {};
    if (tieneDesgloseGuardado) {
      for (const pres of presentacionesActivas) {
        const key = `${stockProductoId}|${almacen.id}|${pres.id}`;
        map[pres.id] = desgloseMap.get(key) ?? 0;
      }
      return map;
    }
    // Legacy: distribuir stock_actual usando la presentacion principal
    // (la primera, que viene ordenada principal -> mayor factor).
    if (presentacionesActivas.length === 0 || stockBase <= 0) {
      for (const pres of presentacionesActivas) map[pres.id] = 0;
      return map;
    }
    const principal = presentacionesActivas[0];
    const factor = Number(principal.unidades_por_presentacion);
    let asignadas = 0;
    if (factor > 0) {
      asignadas = Math.floor(stockBase / factor);
      map[principal.id] = asignadas;
    } else {
      map[principal.id] = 0;
    }
    for (const pres of presentacionesActivas) {
      if (!(pres.id in map)) map[pres.id] = 0;
    }
    return map;
  }, [
    tieneDesgloseGuardado,
    desgloseMap,
    presentacionesActivas,
    stockProductoId,
    almacen.id,
    stockBase,
  ]);

  // Sueltas "guardadas" para mostrar. Si hay desglose real, usa la columna.
  // Si no (legacy), es el RESIDUO de stock_actual menos lo que se asigno a
  // la presentacion principal.
  const sueltasGuardadas = useMemo(() => {
    if (tieneDesgloseGuardado) return sueltasEnDB;
    if (presentacionesActivas.length === 0) return stockBase;
    const principal = presentacionesActivas[0];
    const factor = Number(principal.unidades_por_presentacion);
    if (factor <= 0) return stockBase;
    const enteras = Math.floor(stockBase / factor);
    return stockBase - enteras * factor;
  }, [tieneDesgloseGuardado, sueltasEnDB, presentacionesActivas, stockBase]);

  // Valores ABSOLUTOS editables (no deltas). Arrancan con lo guardado.
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [sueltasInput, setSueltasInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reset cuando cambia el desglose desde el padre (despues de guardar/recargar)
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const pres of presentacionesActivas) {
      init[pres.id] = String(desgloseGuardado[pres.id] ?? 0);
    }
    setCantidades(init);
    setSueltasInput(String(sueltasGuardadas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desgloseMap, sueltasGuardadas, presentacionesActivas.length]);

  // Total proyectado = SUM(cantidad x factor) + sueltas
  const totalProyectado = useMemo(() => {
    let suma = 0;
    for (const pres of presentacionesActivas) {
      const n = Number(cantidades[pres.id] ?? 0);
      if (Number.isFinite(n) && n > 0) {
        suma += n * Number(pres.unidades_por_presentacion);
      }
    }
    const nSueltas = Number(sueltasInput ?? 0);
    if (Number.isFinite(nSueltas) && nSueltas > 0) suma += nSueltas;
    return suma;
  }, [cantidades, sueltasInput, presentacionesActivas]);

  // Si todo coincide con lo guardado, no hay cambios.
  const hayCambios = useMemo(() => {
    for (const pres of presentacionesActivas) {
      const actual = desgloseGuardado[pres.id] ?? 0;
      const editado = Number(cantidades[pres.id] ?? 0);
      if (actual !== editado) return true;
    }
    if (Number(sueltasInput ?? 0) !== sueltasGuardadas) return true;
    return false;
  }, [cantidades, sueltasInput, desgloseGuardado, sueltasGuardadas, presentacionesActivas]);

  /**
   * Distribuye un total de unidades base entre las presentaciones,
   * usando la presentacion principal (la primera) para llenar lo mas
   * posible y poner el residuo en sueltas. Si solo hay una sin
   * presentaciones, todo va a sueltas.
   *
   * Util cuando el usuario sabe el total contado pero no quiere
   * pensar la distribucion. Despues puede ajustar manualmente.
   */
  function distribuirTotal(totalDeseado: number) {
    if (!Number.isFinite(totalDeseado) || totalDeseado < 0) return;
    const init: Record<string, string> = {};
    if (presentacionesActivas.length === 0) {
      setSueltasInput(String(totalDeseado));
      return;
    }
    const principal = presentacionesActivas[0];
    const factor = Number(principal.unidades_por_presentacion);
    let asignadas = 0;
    let restoSueltas = totalDeseado;
    if (factor > 0) {
      asignadas = Math.floor(totalDeseado / factor);
      restoSueltas = totalDeseado - asignadas * factor;
    }
    for (const pres of presentacionesActivas) {
      init[pres.id] = pres.id === principal.id ? String(asignadas) : "0";
    }
    setCantidades(init);
    setSueltasInput(String(restoSueltas));
  }

  async function guardar() {
    if (!supabase) return;
    if (!hayCambios) {
      onMessage({ type: "warning", text: "No hay cambios para guardar." });
      return;
    }
    // Validar todas las cantidades >= 0
    const presPayload: Array<{ id: string; cantidad: number }> = [];
    for (const pres of presentacionesActivas) {
      const n = Number(cantidades[pres.id] ?? 0);
      if (!Number.isFinite(n) || n < 0) {
        onMessage({
          type: "error",
          text: `Cantidad invalida en ${pres.nombre_presentacion}: ${cantidades[pres.id]}`,
        });
        return;
      }
      presPayload.push({ id: pres.id, cantidad: n });
    }
    const nSueltas = Number(sueltasInput ?? 0);
    if (!Number.isFinite(nSueltas) || nSueltas < 0) {
      onMessage({ type: "error", text: "Unidades sueltas invalidas." });
      return;
    }

    setIsSaving(true);
    const detallesObs = presentacionesActivas
      .map((p) => `${p.nombre_presentacion}=${cantidades[p.id] ?? 0}`)
      .join(", ");
    const obs = `Desglose guardado: ${detallesObs}, sueltas=${nSueltas} (total ${totalProyectado} ${unidadBase})`;

    const { error } = await supabase.rpc("guardar_stock_desglosado", {
      p_producto_id: stockProductoId,
      p_almacen_id: almacen.id,
      p_presentaciones: presPayload,
      p_unidades_sueltas: nSueltas,
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
      text: `${almacen.nombre}: ${stockBase} → ${totalProyectado} ${unidadBase}`,
    });
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
          <p className="text-sm font-semibold text-emerald-700">
            → {formatNum(totalProyectado)} {unidadBase}
            <span className="ml-1 text-xs">
              ({totalProyectado - stockBase >= 0 ? "+" : ""}
              {formatNum(totalProyectado - stockBase)})
            </span>
          </p>
        ) : null}
        <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${chipClass}`}>
          {stockBase <= 0 ? "Sin stock" : stockBase <= minimo ? "Stock bajo" : "OK"}
        </span>
      </div>

      {/* Cantidad ABSOLUTA editable por presentacion (centro).
          Lo que tipea el usuario es lo que se guarda — no se recalcula
          entre presentaciones. */}
      <div className="space-y-1.5">
        {presentacionesActivas.length === 0 ? (
          <p className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Sin presentaciones de compra registradas. Solo se cuenta en{" "}
            <strong>{unidadBase}</strong>.
          </p>
        ) : (
          presentacionesActivas.map((pres) => {
            const factor = Number(pres.unidades_por_presentacion);
            const valGuardado = desgloseGuardado[pres.id] ?? 0;
            const valEditado = cantidades[pres.id] ?? "0";
            const numEditado = Number(valEditado);
            const cambio = Number.isFinite(numEditado) && numEditado !== valGuardado;
            return (
              <div
                key={pres.id}
                className="grid items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm sm:grid-cols-[1fr_auto_110px]"
              >
                <span className="text-slate-700">
                  {pres.nombre_presentacion}{" "}
                  <span className="text-xs text-slate-400">(x{factor})</span>
                </span>
                <span className="text-xs text-slate-500">
                  {factor > 0 && Number.isFinite(numEditado)
                    ? `= ${formatNum(numEditado * factor)} ${unidadBase}`
                    : ""}
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={valEditado}
                  onChange={(e) =>
                    setCantidades((curr) => ({ ...curr, [pres.id]: e.target.value }))
                  }
                  onFocus={selectOnFocus}
                  placeholder="0"
                  title={`Cantidad real de ${pres.nombre_presentacion} (no se mezcla con otras)`}
                  className={`h-8 w-full rounded border px-2 text-right text-sm font-semibold ${
                    cambio
                      ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                      : "border-slate-300"
                  }`}
                />
              </div>
            );
          })
        )}
        {/* Unidades sueltas (las que NO estan en ninguna presentacion) */}
        <div className="grid items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm sm:grid-cols-[1fr_auto_110px]">
          <span className="text-slate-700">
            Sueltas <span className="text-xs text-slate-400">({unidadBase})</span>
          </span>
          <span className="text-xs text-slate-500">unidades sueltas</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={sueltasInput}
            onChange={(e) => setSueltasInput(e.target.value)}
            onFocus={selectOnFocus}
            placeholder="0"
            title={`Unidades sueltas en ${unidadBase} (fuera de presentaciones)`}
            className={`h-8 w-full rounded border px-2 text-right text-sm font-semibold ${
              Number(sueltasInput ?? 0) !== sueltasGuardadas
                ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                : "border-slate-300"
            }`}
          />
        </div>
        {/* Atajo: setear el TOTAL en unidades base y se distribuye
            automaticamente entre presentaciones (principal + sueltas).
            Util para no estar pensando "cuantas cajas + cuantas sueltas"
            cuando ya sabes el total contado. */}
        {presentacionesActivas.length > 0 ? (
          <div className="grid items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-1.5 text-sm sm:grid-cols-[1fr_auto_110px]">
            <span className="text-slate-700">
              Total <span className="text-xs text-slate-400">({unidadBase})</span>
            </span>
            <span className="text-xs text-slate-400">distribuir automatico</span>
            <input
              type="number"
              min="0"
              step="1"
              placeholder={`Ej. ${stockBase || 100}`}
              onFocus={selectOnFocus}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Number((e.target as HTMLInputElement).value);
                  if (Number.isFinite(n) && n >= 0) {
                    distribuirTotal(n);
                    (e.target as HTMLInputElement).value = "";
                  }
                }
              }}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") return;
                const n = Number(raw);
                if (Number.isFinite(n) && n >= 0) {
                  distribuirTotal(n);
                  e.target.value = "";
                }
              }}
              title={`Setear total contado. Distribuye en ${presentacionesActivas[0]?.nombre_presentacion ?? "principal"} + sueltas.`}
              className="h-8 w-full rounded border border-slate-300 px-2 text-right text-sm"
            />
          </div>
        ) : null}
        {hayCambios ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void guardar()}
            className={`mt-1 h-9 w-full rounded-md text-xs font-semibold ${colors.btnPrimary}`}
          >
            {isSaving
              ? "Guardando..."
              : `Guardar (total ${formatNum(totalProyectado)} ${unidadBase})`}
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
