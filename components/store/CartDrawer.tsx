"use client";

/**
 * Carrito deslizable de la tienda. Permite ajustar cantidades, ver el total
 * y confirmar el pedido. Confirmar crea un pedido real (estado pendiente)
 * ligado al cliente; tambien ofrece enviar el resumen por WhatsApp.
 */

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { getStoredAppUser, setStoredAppUser } from "@/lib/authRoles";
import { supabase } from "@/lib/supabaseClient";
import { generarLinkWhatsApp } from "@/lib/whatsapp";

const WHATSAPP_NEGOCIO =
  process.env.NEXT_PUBLIC_WHATSAPP_NEGOCIO ?? "942025999";

function money(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onRequestLogin: () => void;
};

export function CartDrawer({ open, onClose, onRequestLogin }: Props) {
  const { items, total, count, setQty, removeItem, clear } = useCart();
  const [nota, setNota] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [donePedidoId, setDonePedidoId] = useState<string | null>(null);

  function buildWhatsappMessage(codigo?: string) {
    const lineas = items.map(
      (i) => `• ${i.cantidad} x ${i.nombre} — ${money(i.cantidad * i.precio)}`,
    );
    return [
      "¡Hola Santa Ana minimarket! Quiero hacer este pedido:",
      "",
      ...lineas,
      "",
      `Total: ${money(total)}`,
      codigo ? `Código de pedido: ${codigo}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function openWhatsapp(codigo?: string) {
    const url = generarLinkWhatsApp(WHATSAPP_NEGOCIO, buildWhatsappMessage(codigo));
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleConfirmar() {
    setError(null);
    const session = getStoredAppUser();
    if (!session) {
      onRequestLogin();
      return;
    }
    if (!supabase) {
      setError("Sin conexion a Supabase.");
      return;
    }
    if (items.length === 0) return;

    setSubmitting(true);

    // Asegurar que la cuenta este vinculada a un cliente (por correo).
    let clienteId = session.cliente_id ?? null;
    if (!clienteId) {
      const { data, error: linkErr } = await supabase.rpc("cliente_login_google", {
        p_email: session.email,
        p_nombres: session.nombres ?? "",
      });
      const linked = data?.[0] as { cliente_id: string } | undefined;
      if (linkErr || !linked?.cliente_id) {
        setSubmitting(false);
        setError("No se pudo vincular tu cuenta a un cliente. Intenta de nuevo.");
        return;
      }
      clienteId = linked.cliente_id;
      setStoredAppUser({ ...session, cliente_id: clienteId });
    }

    const { data: pedido, error: pedidoErr } = await supabase
      .from("pedidos")
      .insert({
        cliente_id: clienteId,
        estado: "pendiente",
        subtotal: total,
        total,
        tipo_entrega: "recoger_despues",
        estado_pago: "debe",
        monto_a_cuenta: 0,
        nota_cliente: nota.trim() || null,
        detalle_manual: items
          .map((i) => `${i.cantidad} x ${i.nombre}`)
          .join("; "),
      })
      .select("id")
      .single();

    if (pedidoErr || !pedido) {
      setSubmitting(false);
      setError(`No se pudo crear el pedido: ${pedidoErr?.message ?? "sin respuesta"}`);
      return;
    }

    const pedidoId = pedido.id as string;
    const detalle = items.map((i) => ({
      pedido_id: pedidoId,
      producto_id: i.productoId,
      cantidad: i.cantidad,
      cantidad_base: i.cantidad,
      precio_unitario: i.precio,
      preparado: false,
    }));
    const { error: detErr } = await supabase.from("detalle_pedido").insert(detalle);
    setSubmitting(false);

    if (detErr) {
      setError(`El pedido se creo pero fallo el detalle: ${detErr.message}`);
      return;
    }

    clear();
    setNota("");
    setDonePedidoId(pedidoId);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55]" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Cerrar carrito"
        className="absolute inset-0 bg-slate-950/50"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <ShoppingCart className="h-5 w-5 text-santa-700" />
            Tu carrito {count > 0 ? `(${count})` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {donePedidoId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-santa-100 text-santa-800">
              <ShoppingCart className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-950">¡Pedido enviado!</p>
              <p className="mt-1 text-sm text-slate-500">
                Código {donePedidoId.slice(0, 8)}. El equipo lo preparará pronto.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openWhatsapp(donePedidoId.slice(0, 8))}
              className="h-11 w-full rounded-md bg-[#25D366] text-sm font-semibold text-white hover:brightness-95"
            >
              Enviar resumen por WhatsApp
            </button>
            <Link
              href="/mi-cuenta"
              onClick={onClose}
              className="h-11 w-full rounded-md border border-slate-300 px-4 text-sm font-semibold leading-[44px] text-slate-700 hover:bg-slate-50"
            >
              Ver mis pedidos
            </Link>
            <button
              type="button"
              onClick={() => {
                setDonePedidoId(null);
                onClose();
              }}
              className="text-sm font-medium text-santa-700 hover:underline"
            >
              Seguir comprando
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-slate-500">
            <ShoppingCart className="h-10 w-10 text-slate-300" />
            <p className="text-sm">Tu carrito está vacío.</p>
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-semibold text-santa-700 hover:underline"
            >
              Ver productos
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="space-y-3">
                {items.map((i) => (
                  <li
                    key={i.productoId}
                    className="flex gap-3 rounded-lg border border-slate-200 p-3"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100">
                      {i.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={i.imagenUrl}
                          alt={i.nombre}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                          <ShoppingCart className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {i.nombre}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {money(i.precio)} {i.unidad ? `/ ${i.unidad}` : ""}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="inline-flex items-center rounded-md border border-slate-300">
                          <button
                            type="button"
                            onClick={() => setQty(i.productoId, i.cantidad - 1)}
                            aria-label="Restar"
                            className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-50"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-8 text-center text-sm font-semibold">
                            {i.cantidad}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQty(i.productoId, i.cantidad + 1)}
                            aria-label="Sumar"
                            className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-50"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <span className="text-sm font-semibold text-slate-900">
                          {money(i.cantidad * i.precio)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(i.productoId)}
                      aria-label="Quitar"
                      className="self-start text-slate-300 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-600">Nota (opcional)</span>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={2}
                  placeholder="Ej: para recoger a las 6pm"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100"
                />
              </label>

              {error ? (
                <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="border-t border-slate-200 p-5">
              <div className="mb-3 flex items-center justify-between text-base">
                <span className="font-medium text-slate-600">Total</span>
                <span className="font-bold text-slate-950">{money(total)}</span>
              </div>
              <button
                type="button"
                onClick={() => void handleConfirmar()}
                disabled={submitting}
                className="h-11 w-full rounded-md bg-santa-800 text-sm font-semibold text-white hover:bg-santa-900 disabled:bg-slate-300"
              >
                {submitting ? "Enviando pedido..." : "Confirmar pedido"}
              </button>
              <button
                type="button"
                onClick={() => openWhatsapp()}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#25D366] text-sm font-semibold text-[#1ba34e] hover:bg-[#25D366]/10"
              >
                Enviar por WhatsApp
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
