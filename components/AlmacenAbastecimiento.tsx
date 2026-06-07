"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "@/lib/dateUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type { AbastecimientoPedido, Producto, Proveedor } from "@/types/database";

type AbastecimientoItemRow = {
  id: string;
  cantidad: number;
  observacion: string | null;
  productos: Pick<Producto, "id" | "nombre_producto" | "presentacion"> | null;
};

type PedidoRow = AbastecimientoPedido & {
  proveedores: Pick<Proveedor, "id" | "nombre" | "telefono"> | null;
  abastecimiento_items: AbastecimientoItemRow[];
};

type Message = {
  type: "success" | "error";
  text: string;
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100";
const ownerWhatsapp = "943104987";
const abastecimientoUrl = "https://app-minimarket.vercel.app/almacen/abastecimiento";

function buildWhatsAppUrl(numero: string, mensaje: string) {
  return `https://wa.me/51${numero}?text=${encodeURIComponent(mensaje)}`;
}

function formatQty(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2).replace(/\.00$/, "");
}

export function AlmacenAbastecimiento() {
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorId, setProveedorId] = useState("");
  const [estado, setEstado] = useState("");
  const [urgencia, setUrgencia] = useState("");
  const [fecha, setFecha] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const filteredPedidos = useMemo(() => pedidos, [pedidos]);

  async function loadCatalogos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    const { data, error } = await supabase
      .from("proveedores")
      .select("*")
      .eq("activo", true)
      .order("nombre");

    if (!error) {
      setProveedores((data ?? []) as Proveedor[]);
    }
  }

  async function loadPedidos() {
    if (!supabase) {
      return;
    }

    setIsLoading(true);
    let query = supabase
      .from("abastecimiento_pedidos")
      .select(
        `
          *,
          proveedores(id,nombre,telefono),
          abastecimiento_items(
            id,
            cantidad,
            observacion,
            productos(id,nombre_producto,presentacion)
          )
        `,
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (proveedorId) {
      query = query.eq("proveedor_id", proveedorId);
    }
    if (estado) {
      query = query.eq("estado", estado);
    }
    if (urgencia) {
      query = query.eq("urgencia", urgencia);
    }
    if (fecha) {
      query = query.gte("created_at", `${fecha}T00:00:00`).lte("created_at", `${fecha}T23:59:59`);
    }

    const { data, error } = await query;
    setIsLoading(false);

    if (error) {
      setMessage({ type: "error", text: `No se cargaron pedidos: ${error.message}` });
      setPedidos([]);
      return;
    }

    setPedidos((data ?? []) as PedidoRow[]);
  }

  useEffect(() => {
    void loadCatalogos();
  }, []);

  useEffect(() => {
    void loadPedidos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId, estado, urgencia, fecha]);

  async function updatePedido(id: string, payload: Partial<Pick<AbastecimientoPedido, "estado" | "urgencia" | "observacion">>) {
    if (!supabase) {
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.from("abastecimiento_pedidos").update(payload).eq("id", id);
    setIsSaving(false);

    if (error) {
      setMessage({ type: "error", text: `No se actualizo abastecimiento: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Abastecimiento actualizado." });
    await loadPedidos();
  }

  async function updateItemCantidad(itemId: string, value: string) {
    if (!supabase) {
      return;
    }

    const cantidad = Number(value);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setMessage({ type: "error", text: "La cantidad debe ser mayor que cero." });
      return;
    }

    const { error } = await supabase.from("abastecimiento_items").update({ cantidad }).eq("id", itemId);
    if (error) {
      setMessage({ type: "error", text: `No se actualizo cantidad: ${error.message}` });
      return;
    }

    await loadPedidos();
  }

  function reenviarWhatsApp(pedido: PedidoRow) {
    const mensaje = [
      "Lista de abastecimiento",
      pedido.proveedores ? `Proveedor: ${pedido.proveedores.nombre}` : "Proveedor: por definir",
      `Urgencia: ${pedido.urgencia}`,
      `Estado: ${pedido.estado}`,
      "",
      ...pedido.abastecimiento_items.map((item) => `- ${formatQty(item.cantidad)} ${item.productos?.presentacion ?? ""} ${item.productos?.nombre_producto ?? "Producto"}`),
      "",
      `Revisar: ${abastecimientoUrl}`,
    ].join("\n");

    window.open(buildWhatsAppUrl(ownerWhatsapp, mensaje), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5">
      {message ? (
        <div className={`rounded-lg border p-4 text-sm ${message.type === "success" ? "border-santa-200 bg-santa-50 text-santa-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select value={proveedorId} onChange={(event) => setProveedorId(event.target.value)} className={inputClassName}>
            <option value="">Todos los proveedores</option>
            {proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.nombre}
              </option>
            ))}
          </select>
          <select value={estado} onChange={(event) => setEstado(event.target.value)} className={inputClassName}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="enviado">Enviado</option>
            <option value="comprado">Comprado</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <select value={urgencia} onChange={(event) => setUrgencia(event.target.value)} className={inputClassName}>
            <option value="">Todas las urgencias</option>
            <option value="baja">Baja</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
          </select>
          <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} className={inputClassName} />
        </div>
      </section>

      <section className="space-y-3">
        {filteredPedidos.map((pedido) => (
          <article key={pedido.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-santa-700">Abastecimiento #{pedido.id.slice(0, 8)}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">{pedido.proveedores?.nombre ?? "Proveedor por definir"}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(pedido.created_at)} | {pedido.proveedores?.telefono ?? "Sin telefono"}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <select value={pedido.estado} disabled={isSaving} onChange={(event) => void updatePedido(pedido.id, { estado: event.target.value as AbastecimientoPedido["estado"] })} className={inputClassName}>
                  <option value="pendiente">Pendiente</option>
                  <option value="enviado">Enviado</option>
                  <option value="comprado">Comprado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
                <select value={pedido.urgencia} disabled={isSaving} onChange={(event) => void updatePedido(pedido.id, { urgencia: event.target.value as AbastecimientoPedido["urgencia"] })} className={inputClassName}>
                  <option value="baja">Baja</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                </select>
                <button type="button" onClick={() => reenviarWhatsApp(pedido)} className="h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white">
                  WhatsApp
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {pedido.abastecimiento_items.map((item) => (
                <div key={item.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-950">{item.productos?.nombre_producto ?? "Producto"}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.productos?.presentacion ?? "Sin presentacion"}</p>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={item.cantidad}
                    onBlur={(event) => void updateItemCantidad(item.id, event.target.value)}
                    className="mt-3 h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </article>
        ))}
        {isLoading ? <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Cargando abastecimiento...</p> : null}
        {!isLoading && filteredPedidos.length === 0 ? <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">No hay pedidos de abastecimiento con estos filtros.</p> : null}
      </section>
    </div>
  );
}
