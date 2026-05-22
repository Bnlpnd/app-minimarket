"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type { Almacen, Producto, ProductoAlmacen } from "@/types/database";

type ProductoRow = Pick<Producto, "id" | "codigo_interno" | "nombre_producto"> & {
  producto_almacen: Array<Pick<ProductoAlmacen, "almacen_id" | "stock_actual">>;
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
    const term = normalizeSpaces(search);
    const { data, error } = await supabase
      .from("productos")
      .select("id,codigo_interno,nombre_producto,producto_almacen(almacen_id,stock_actual)")
      .eq("activo", true)
      .or(`codigo_interno.ilike.%${term}%,nombre_producto.ilike.%${term}%`)
      .order("nombre_producto")
      .limit(20);
    setIsLoading(false);

    if (error) {
      setMessage({ type: "error", text: `No se buscaron productos: ${error.message}` });
      return;
    }

    setProductos((data ?? []) as ProductoRow[]);
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
    return Number(
      producto?.producto_almacen.find((stock) => stock.almacen_id === almacenId)
        ?.stock_actual ?? 0,
    );
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
    const { error } = await supabase.rpc("ajustar_stock", {
      p_producto_id: productoId,
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
