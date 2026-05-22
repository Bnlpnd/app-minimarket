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

export function AlmacenTransferencias() {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [productos, setProductos] = useState<ProductoRow[]>([]);
  const [search, setSearch] = useState("");
  const [productoId, setProductoId] = useState("");
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [cantidad, setCantidad] = useState("");
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
    setOrigenId(rows.find((almacen) => almacen.nombre.toLowerCase() === "casa")?.id ?? rows[0]?.id ?? "");
    setDestinoId(rows.find((almacen) => almacen.nombre.toLowerCase() === "tienda")?.id ?? rows[1]?.id ?? "");
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

  const stockOrigen = useMemo(() => {
    return Number(
      producto?.producto_almacen.find((stock) => stock.almacen_id === origenId)
        ?.stock_actual ?? 0,
    );
  }, [origenId, producto]);

  async function transferir() {
    if (!supabase) {
      return;
    }

    const parsedCantidad = Number(cantidad);
    const obs = normalizeSpaces(observacion);

    if (!productoId || !origenId || !destinoId) {
      setMessage({ type: "error", text: "Selecciona producto, origen y destino." });
      return;
    }

    if (origenId === destinoId) {
      setMessage({ type: "error", text: "Origen y destino deben ser diferentes." });
      return;
    }

    if (!Number.isFinite(parsedCantidad) || parsedCantidad <= 0) {
      setMessage({ type: "error", text: "La cantidad debe ser mayor a cero." });
      return;
    }

    if (parsedCantidad > stockOrigen) {
      setMessage({ type: "error", text: "No hay stock suficiente en el almacen origen." });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc("transferir_stock", {
      p_producto_id: productoId,
      p_almacen_origen_id: origenId,
      p_almacen_destino_id: destinoId,
      p_cantidad: parsedCantidad,
      p_observacion: obs || null,
      p_usuario_id: null,
    });
    setIsSaving(false);

    if (error) {
      setMessage({ type: "error", text: `No se pudo transferir: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Transferencia registrada correctamente." });
    setCantidad("");
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
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Buscar producto</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Codigo o nombre"
              className={`${inputClassName} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Producto</span>
            <select
              value={productoId}
              onChange={(event) => setProductoId(event.target.value)}
              className={`${inputClassName} mt-1`}
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
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Origen">
            <select value={origenId} onChange={(event) => setOrigenId(event.target.value)} className={inputClassName}>
              {almacenes.map((almacen) => (
                <option key={almacen.id} value={almacen.id}>
                  {almacen.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destino">
            <select value={destinoId} onChange={(event) => setDestinoId(event.target.value)} className={inputClassName}>
              {almacenes.map((almacen) => (
                <option key={almacen.id} value={almacen.id}>
                  {almacen.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cantidad">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={cantidad}
              onChange={(event) => setCantidad(event.target.value)}
              className={inputClassName}
            />
          </Field>
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <p className="text-slate-500">Stock origen</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">
              {formatStock(stockOrigen)}
            </p>
          </div>
        </div>

        <Field label="Observacion">
          <textarea
            value={observacion}
            onChange={(event) => setObservacion(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
        </Field>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void transferir()}
            disabled={isSaving}
            className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
          >
            {isSaving ? "Guardando..." : "Confirmar transferencia"}
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
