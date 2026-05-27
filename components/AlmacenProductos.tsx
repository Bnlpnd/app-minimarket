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
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import {
  getBaseStockByAlmacen,
  getStockProductId,
} from "@/lib/inventoryUtils";
import { colors, colorsForAlmacen, stockChipClass } from "@/lib/theme";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Toast } from "@/components/ui/Toast";
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

type Message = { type: "success" | "error"; text: string };

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
}: {
  producto: ProductoConStock;
  almacenes: Almacen[];
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
}: {
  almacen: Almacen;
  producto: ProductoConStock;
  unidadBase: string;
  stockProductoId: string;
  presentacionesActivas: ProductoConStock["producto_presentaciones_compra"];
}) {
  const stockBase = getBaseStockByAlmacen(producto, almacen.id);
  const minimo = Number(producto.stock_minimo ?? 10);
  const almacenColors = colorsForAlmacen(almacen.nombre);
  const chipClass = stockChipClass(stockBase, minimo);

  return (
    <div className="grid gap-3 p-4 md:grid-cols-[140px_minmax(0,1fr)_auto] md:items-center">
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
        <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${chipClass}`}>
          {stockBase <= 0 ? "Sin stock" : stockBase <= minimo ? "Stock bajo" : "OK"}
        </span>
      </div>

      {/* Desglose por presentacion (centro) */}
      <div className="space-y-1">
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
            return (
              <div
                key={pres.id}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm"
              >
                <span className="text-slate-700">
                  {pres.nombre_presentacion}{" "}
                  <span className="text-xs text-slate-400">(x{factor})</span>
                </span>
                <span className="text-slate-900">
                  <strong>{enteras}</strong> ent.{" "}
                  <span className="text-xs text-slate-500">
                    + {formatNum(sueltas)} {unidadBase}
                  </span>
                </span>
              </div>
            );
          })
        )}
        {/* Unidad base siempre al final */}
        <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm">
          <span className="text-slate-700">Unidad base ({unidadBase})</span>
          <span className="font-semibold text-slate-900">
            {formatNum(stockBase)}
          </span>
        </div>
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
          href={`/almacen/agregar-stock?producto=${stockProductoId}&almacen=${almacen.id}`}
          className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-xs font-semibold ${colors.btnPrimary}`}
        >
          Agregar stock
        </Link>
        <Link
          href={`/almacen/ajustes?producto=${stockProductoId}&almacen=${almacen.id}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-800 hover:bg-amber-100"
          title="Corregir stock por conteo fisico"
        >
          Corregir
        </Link>
      </div>
    </div>
  );
}
