"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { getBaseStockByAlmacen, getStockProductId } from "@/lib/inventoryUtils";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { selectOnFocus } from "@/lib/inputUtils";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import { Toast } from "@/components/ui/Toast";
import type { Almacen, Producto, ProductoAlmacen } from "@/types/database";

type ProductoRow = Pick<
  Producto,
  "id" | "codigo_interno" | "nombre_producto" | "producto_base_id"
> & {
  producto_almacen: Array<Pick<ProductoAlmacen, "almacen_id" | "stock_actual">>;
  producto_base?: {
    id: string;
    nombre_producto?: string | null;
    producto_almacen: Array<Pick<ProductoAlmacen, "almacen_id" | "stock_actual">>;
  } | null;
};

type Message = {
  type: "success" | "error";
  text: string;
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function formatStock(value: number) {
  return Number(value ?? 0).toFixed(2).replace(/\.00$/, "");
}

export function AlmacenAjustes() {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [productos, setProductos] = useState<ProductoRow[]>([]);
  const [search, setSearch] = useState("");
  const [productoId, setProductoId] = useState("");
  const [almacenId, setAlmacenId] = useState("");
  const [stockContado, setStockContado] = useState("");
  const [motivo, setMotivo] = useState("Conteo fisico");
  const [observacion, setObservacion] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function loadAlmacenes() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    const { data, error } = await supabase
      .from("almacenes")
      .select("*")
      .eq("activo", true)
      .order("nombre");

    if (error) {
      setMessage({ type: "error", text: `No se cargaron almacenes: ${error.message}` });
      return;
    }

    const rows = (data ?? []) as Almacen[];
    setAlmacenes(rows);
    setAlmacenId(rows.find((almacen) => almacen.nombre.toLowerCase() === "tienda")?.id ?? rows[0]?.id ?? "");
  }

  async function searchProductos() {
    if (!supabase || !normalizeSpaces(search)) {
      setProductos([]);
      return;
    }

    setIsLoading(true);
    const { data, error } = await fetchAllRows<ProductoRow>(
      supabase
      .from("productos")
      .select("id,codigo_interno,nombre_producto,producto_base_id,producto_almacen(almacen_id,stock_actual)")
      .eq("activo", true)
      .order("nombre_producto")
    );

    if (error) {
      setIsLoading(false);
      setMessage({ type: "error", text: `No se buscaron productos: ${error.message}` });
      return;
    }

    // Prefetch del producto base para resolver stock real al ajustar presentaciones.
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
        .select("id,nombre_producto,producto_almacen(almacen_id,stock_actual)")
        .in("id", baseIds);
      if (baseError) {
        setIsLoading(false);
        setMessage({
          type: "error",
          text: `No se cargo producto base: ${baseError.message}`,
        });
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
    setProductos(
      merged
        .filter((producto) =>
          matchesSearch(search, [producto.codigo_interno, producto.nombre_producto]),
        )
        .slice(0, 20),
    );
  }

  useEffect(() => {
    void loadAlmacenes();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void searchProductos();
    }, 350);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const producto = useMemo(
    () => productos.find((item) => item.id === productoId) ?? null,
    [productoId, productos],
  );

  const stockActual = useMemo(() => {
    if (!producto) return 0;
    return getBaseStockByAlmacen(producto, almacenId);
  }, [almacenId, producto]);

  const diferencia = useMemo(() => {
    const parsed = Number(stockContado);
    return Number.isFinite(parsed) ? parsed - stockActual : 0;
  }, [stockActual, stockContado]);

  async function guardarAjuste() {
    if (!supabase) {
      return;
    }

    const parsedStock = Number(stockContado);
    const obs = [normalizeSpaces(motivo), normalizeSpaces(observacion)]
      .filter(Boolean)
      .join(" - ");

    if (!productoId || !almacenId) {
      setMessage({ type: "error", text: "Selecciona producto y almacen." });
      return;
    }

    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      setMessage({ type: "error", text: "El stock contado debe ser cero o mayor." });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    const productoStockId = producto ? getStockProductId(producto) : productoId;
    const { error } = await supabase.rpc("ajustar_stock", {
      p_producto_id: productoStockId,
      p_almacen_id: almacenId,
      p_stock_contado: parsedStock,
      p_observacion: obs || null,
      p_usuario_id: null,
    });
    setIsSaving(false);

    if (error) {
      setMessage({ type: "error", text: `No se pudo ajustar: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Ajuste registrado correctamente." });
    setStockContado("");
    setObservacion("");
    await searchProductos();
  }

  return (
    <div className="space-y-5">
      <Toast message={message} onDismiss={() => setMessage(null)} />

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Buscar producto">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Codigo o nombre"
              className={inputClassName}
            />
          </Field>
          <Field label="Producto">
            <select
              value={productoId}
              onChange={(event) => setProductoId(event.target.value)}
              className={inputClassName}
            >
              <option value="">
                {isLoading ? "Buscando..." : "Selecciona producto"}
              </option>
              {productos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.codigo_interno} - {item.nombre_producto}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Almacen">
            <select value={almacenId} onChange={(event) => setAlmacenId(event.target.value)} className={inputClassName}>
              {almacenes.map((almacen) => (
                <option key={almacen.id} value={almacen.id}>
                  {almacen.nombre}
                </option>
              ))}
            </select>
          </Field>
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <p className="text-slate-500">Stock actual</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">
              {formatStock(stockActual)}
            </p>
          </div>
          <Field label="Stock real contado">
            <input
              type="number"
              onFocus={selectOnFocus}
              min="0"
              step="0.01"
              value={stockContado}
              onChange={(event) => setStockContado(event.target.value)}
              className={inputClassName}
            />
          </Field>
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <p className="text-slate-500">Diferencia</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">
              {formatStock(diferencia)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field label="Motivo">
            <input
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Observacion">
            <input
              value={observacion}
              onChange={(event) => setObservacion(event.target.value)}
              className={inputClassName}
            />
          </Field>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void guardarAjuste()}
            disabled={isSaving}
            className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
          >
            {isSaving ? "Guardando..." : "Guardar ajuste"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
