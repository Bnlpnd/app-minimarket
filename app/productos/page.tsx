"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { ProductoTable } from "@/components/ProductoTable";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { ProductoConRelaciones } from "@/components/ProductoTable";
import { getCurrentUserProfile, isAdmin, isTrabajador } from "@/lib/authRoles";
import {
  getBaseStockByName,
  getStockProductId,
} from "@/lib/inventoryUtils";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import type { Almacen, Categoria, Marca, Subcategoria } from "@/types/database";

type Message = {
  type: "success" | "error";
  text: string;
};

type EstadoFilter = "todos" | "activos" | "inactivos";

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

const PAGE_SIZE = 50;
const inputClassName =
  "h-11 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function buildQuickValues(productos: ProductoConRelaciones[]) {
  // stock_tienda y stock_casa son DELTAS (sumar/restar), no totales.
  // Arrancan vacios para que el usuario solo tipee lo que quiere agregar.
  // Los demas campos arrancan con valor actual porque son reemplazos
  // logicos (precio, stock minimo).
  return Object.fromEntries(
    productos.map((producto) => [
      producto.id,
      {
        precio_compra:
          producto.precio_compra_referencial != null
            ? String(Number(producto.precio_compra_referencial).toFixed(2))
            : "",
        precio_venta: String(Number(producto.precio_venta ?? 1).toFixed(2)),
        stock_minimo: String(Number(producto.stock_minimo ?? 10)),
        stock_tienda: "",
        stock_casa: "",
      },
    ]),
  );
}

function getAlmacenIdByName(
  producto: ProductoConRelaciones,
  name: string,
  almacenes: Almacen[],
) {
  const row = producto.producto_almacen?.find(
    (stock) => stock.almacenes?.nombre.toLowerCase() === name.toLowerCase(),
  );
  return (
    row?.almacen_id ??
    row?.almacenes?.id ??
    almacenes.find((almacen) => almacen.nombre.toLowerCase() === name.toLowerCase())
      ?.id ??
    null
  );
}

export default function ProductosPage() {
  const [productos, setProductos] = useState<ProductoConRelaciones[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [search, setSearch] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoriaId, setSubcategoriaId] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [hasAccess, setHasAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessMessage, setAccessMessage] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [quickValues, setQuickValues] = useState<QuickValues>({});
  const [isLoading, setIsLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);
  const [showStockCasa, setShowStockCasa] = useState(false);
  const [showStockTienda, setShowStockTienda] = useState(false);
  const [showStockBajo, setShowStockBajo] = useState(false);

  const hasCriteria = hasAccess;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const subcategoriasFiltradas = useMemo(() => {
    return categoriaId
      ? subcategorias.filter((item) => item.categoria_id === categoriaId)
      : subcategorias;
  }, [categoriaId, subcategorias]);

  async function loadCatalogos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setCatalogLoading(false);
      return;
    }

    setCatalogLoading(true);
    const [categoriasResult, subcategoriasResult, marcasResult, almacenesResult] =
      await Promise.all([
        supabase.from("categorias").select("*").order("nombre"),
        supabase.from("subcategorias").select("*").order("nombre"),
        supabase.from("marcas").select("*").order("nombre"),
        supabase.from("almacenes").select("*").eq("activo", true).order("nombre"),
      ]);

    if (
      categoriasResult.error ||
      subcategoriasResult.error ||
      marcasResult.error ||
      almacenesResult.error
    ) {
      setMessage({
        type: "error",
        text: "No se pudieron cargar los filtros de catalogo.",
      });
    } else {
      setCategorias((categoriasResult.data ?? []) as Categoria[]);
      setSubcategorias((subcategoriasResult.data ?? []) as Subcategoria[]);
      setMarcas((marcasResult.data ?? []) as Marca[]);
      setAlmacenes((almacenesResult.data ?? []) as Almacen[]);
    }

    setCatalogLoading(false);
  }

  async function checkAccess() {
    const { profile } = await getCurrentUserProfile();
    const allowed = isAdmin(profile) || isTrabajador(profile);

    setHasAccess(allowed);
    setAccessMessage(
      allowed
        ? ""
        : "Debes iniciar sesion como admin o trabajador para ver productos.",
    );
    setIsCheckingAccess(false);

    if (allowed) {
      void loadCatalogos();
    }
  }

  async function loadProductos(nextPage = page) {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    if (!hasCriteria) {
      setProductos([]);
      setTotalCount(0);
      setQuickValues({});
      return;
    }

    setIsLoading(true);
    setMessage(null);

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
        { count: "exact" },
      );

    if (categoriaId) {
      query = query.eq("categoria_id", categoriaId);
    }
    if (subcategoriaId) {
      query = query.eq("subcategoria_id", subcategoriaId);
    }
    if (marcaId) {
      query = query.eq("marca_id", marcaId);
    }
    if (estadoFilter === "activos") {
      query = query.eq("activo", true);
    }
    if (estadoFilter === "inactivos") {
      query = query.eq("activo", false);
    }

    const { data, error } = await fetchAllRows<ProductoConRelaciones>(
      query.order("nombre_producto", { ascending: true }),
    );

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar productos: ${error.message}`,
      });
      setProductos([]);
      setTotalCount(0);
      setQuickValues({});
      setIsLoading(false);
      return;
    }

    const baseIds = Array.from(
      new Set(
        data
          .map((producto) => producto.producto_base_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const baseInfo = new Map<string, { id: string; nombre_producto: string }>();
    if (baseIds.length > 0) {
      const baseResult = await supabase
        .from("productos")
        .select("id,nombre_producto")
        .in("id", baseIds);
      ((baseResult.data ?? []) as Array<{ id: string; nombre_producto: string }>).forEach(
        (row) => baseInfo.set(row.id, row),
      );
    }
    const enriched = data.map((producto) => {
      if (!producto.producto_base_id) {
        return producto;
      }
      const info = baseInfo.get(producto.producto_base_id);
      if (!info) {
        return producto;
      }
      return {
        ...producto,
        producto_base: { id: info.id, nombre_producto: info.nombre_producto },
      };
    });

    const allRows = enriched.filter((producto) => {
      if (
        !matchesSearch(search, [
          producto.codigo_interno,
          producto.nombre_producto,
          producto.presentacion,
          producto.marcas?.nombre,
          producto.categorias?.nombre,
          producto.subcategorias?.nombre,
        ])
      ) {
        return false;
      }
      if (showStockTienda && getBaseStockByName(producto, "Tienda") <= 0) return false;
      if (showStockCasa && getBaseStockByName(producto, "Casa") <= 0) return false;
      if (showStockBajo && producto.stock_minimo != null && getBaseStockByName(producto, "Tienda") > producto.stock_minimo) return false;
      return true;
    });
    const from = (nextPage - 1) * PAGE_SIZE;
    const rows = allRows.slice(from, from + PAGE_SIZE);
    setProductos(rows);
    setTotalCount(allRows.length);
    setQuickValues(buildQuickValues(rows));
    setIsLoading(false);
  }

  useEffect(() => {
    void checkAccess();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, categoriaId, subcategoriaId, marcaId, estadoFilter, showStockTienda, showStockCasa, showStockBajo]);

  useEffect(() => {
    if (!catalogLoading) {
      void loadProductos(page);
    }
  }, [page, search, categoriaId, subcategoriaId, marcaId, estadoFilter, catalogLoading, showStockTienda, showStockCasa, showStockBajo]);

  function handleQuickValueChange(
    productoId: string,
    key: QuickKey,
    value: string,
  ) {
    setQuickValues((current) => ({
      ...current,
      [productoId]: {
        ...current[productoId],
        [key]: value,
      },
    }));
  }

  async function handleQuickSave(producto: ProductoConRelaciones) {
    if (!supabase) {
      return;
    }

    const values = quickValues[producto.id];
    const precioVenta = Number(values?.precio_venta);
    const stockMinimo = Number(values?.stock_minimo);
    // stock_tienda/casa son DELTAS (lo que se SUMA). Vacio = no tocar.
    const deltaTiendaRaw = values?.stock_tienda ?? "";
    const deltaCasaRaw = values?.stock_casa ?? "";
    const deltaTienda = deltaTiendaRaw.trim() === "" ? null : Number(deltaTiendaRaw);
    const deltaCasa = deltaCasaRaw.trim() === "" ? null : Number(deltaCasaRaw);

    // Costo unidad puede quedar vacio (se guarda como null).
    const precioCompraRaw = values?.precio_compra ?? "";
    let precioCompra: number | null = null;
    if (precioCompraRaw.trim() !== "") {
      const parsed = Number(precioCompraRaw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setMessage({ type: "error", text: "Costo unidad invalido." });
        return;
      }
      precioCompra = parsed;
    }

    if (!Number.isFinite(precioVenta) || precioVenta < 0) {
      setMessage({ type: "error", text: "Precio venta invalido." });
      return;
    }

    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
      setMessage({ type: "error", text: "Stock minimo invalido." });
      return;
    }

    if (deltaTienda !== null && !Number.isFinite(deltaTienda)) {
      setMessage({ type: "error", text: "Ajuste Tienda invalido." });
      return;
    }
    if (deltaCasa !== null && !Number.isFinite(deltaCasa)) {
      setMessage({ type: "error", text: "Ajuste Casa invalido." });
      return;
    }

    // Resolver al producto base para escribir el stock real (si el producto
    // es una presentacion vinculada, el stock vive en el base).
    const stockProductoId = getStockProductId(producto);
    const tiendaId = getAlmacenIdByName(producto, "Tienda", almacenes);
    const casaId = getAlmacenIdByName(producto, "Casa", almacenes);

    // Stock actual desde el producto base (no del producto si es presentacion).
    const stockActualTienda = getBaseStockByName(producto, "Tienda");
    const stockActualCasa = getBaseStockByName(producto, "Casa");
    const cambios: string[] = [];

    for (const [almacenId, delta, actual, label] of [
      [tiendaId, deltaTienda, stockActualTienda, "Tienda"],
      [casaId, deltaCasa, stockActualCasa, "Casa"],
    ] as Array<[string | null, number | null, number, string]>) {
      if (delta === null || delta === 0) continue; // nada que hacer
      if (!almacenId) {
        setMessage({
          type: "error",
          text: `No se encontro el almacen ${label} para ajustar stock.`,
        });
        return;
      }

      const nuevoStock = actual + delta;
      if (nuevoStock < 0) {
        setMessage({
          type: "error",
          text: `Ajuste ${label} dejaria stock en negativo (${nuevoStock}). Actual: ${actual}.`,
        });
        return;
      }

      const stockResult = await supabase.rpc("ajustar_stock", {
        p_producto_id: stockProductoId,
        p_almacen_id: almacenId,
        p_stock_contado: nuevoStock,
        p_observacion:
          (delta > 0 ? "+" : "") +
          `${delta} desde productos (${label}). ` +
          `${actual} -> ${nuevoStock}.`,
        p_usuario_id: null,
      });

      if (stockResult.error) {
        setMessage({
          type: "error",
          text: `No se pudo actualizar stock ${label}: ${stockResult.error.message}`,
        });
        return;
      }
      cambios.push(`${label} ${actual} -> ${nuevoStock} (${delta > 0 ? "+" : ""}${delta})`);
    }

    const { error } = await supabase
      .from("productos")
      .update({
        precio_venta: precioVenta,
        stock_minimo: stockMinimo,
        precio_compra_referencial: precioCompra,
      })
      .eq("id", producto.id);

    if (error) {
      setMessage({
        type: "error",
        text: `El stock se actualizo, pero no se pudo guardar precio/minimo: ${error.message}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text:
        cambios.length > 0
          ? `Producto actualizado. ${cambios.join(" · ")}`
          : "Producto actualizado.",
    });
    await loadProductos(page);
  }

  async function handleToggleActivo(producto: ProductoConRelaciones) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase
      .from("productos")
      .update({ activo: !producto.activo })
      .eq("id", producto.id);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo cambiar estado: ${error.message}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text: producto.activo ? "Producto desactivado." : "Producto activado.",
    });
    await loadProductos(page);
  }

  return (
    <Layout
      title="Productos"
      description="Busca, filtra y edita datos rapidos del catalogo."
    >
      <div className="space-y-5">
        {isCheckingAccess ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            Verificando permisos...
          </section>
        ) : null}

        {!isCheckingAccess && !hasAccess ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            <h2 className="text-base font-semibold text-amber-950">
              Acceso restringido
            </h2>
            <p className="mt-2">{accessMessage}</p>
            <a
              href="/login"
              className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
            >
              Ir al login
            </a>
          </section>
        ) : null}

        {hasAccess ? (
          <>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Link
            href="/productos/nuevo"
            className="inline-flex h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Nuevo producto
          </Link>
          <Link
            href="/productos/importar"
            className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Importar CSV
          </Link>
        </div>

        {message ? (
          <div
            className={`rounded-lg border p-4 text-sm ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Codigo, producto o marca"
              className={`${inputClassName} xl:col-span-2`}
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
              options={subcategoriasFiltradas.map((s) => ({
                id: s.id,
                label: s.nombre,
              }))}
              placeholder="Subcategoria"
            />
            <SearchableSelect
              value={marcaId}
              onChange={(id) => setMarcaId(id)}
              options={marcas.map((m) => ({ id: m.id, label: m.nombre }))}
              placeholder="Marca"
            />
            <select
              value={estadoFilter}
              onChange={(event) => setEstadoFilter(event.target.value as EstadoFilter)}
              className={inputClassName}
            >
              <option value="todos">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={showStockTienda} onChange={(event) => setShowStockTienda(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              Con stock Tienda
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={showStockCasa} onChange={(event) => setShowStockCasa(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              Con stock Casa
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={showStockBajo} onChange={(event) => setShowStockBajo(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              Stock bajo
            </label>
          </div>
        </section>

        {!hasCriteria ? (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Busca un producto o selecciona una categoría para empezar.
          </section>
        ) : (
          <>
            <ProductoTable
              productos={productos}
              isLoading={isLoading}
              quickValues={quickValues}
              onQuickValueChange={handleQuickValueChange}
              onQuickSave={(producto) => void handleQuickSave(producto)}
              onToggleActivo={(producto) => void handleToggleActivo(producto)}
            />

            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Pagina {page} de {totalPages}. {totalCount} productos encontrados.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="h-10 rounded-md border border-slate-300 px-3 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  className="h-10 rounded-md border border-slate-300 px-3 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
          </>
        ) : null}
      </div>
    </Layout>
  );
}
