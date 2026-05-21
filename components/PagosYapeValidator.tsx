"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type { Cliente, Pago, Pedido } from "@/types/database";

type PedidoPago = Pedido & {
  clientes: Pick<Cliente, "nombres" | "telefono"> | null;
  pagos: Pago | null | Pago[];
};

type Message = {
  type: "success" | "error";
  text: string;
};

function getPago(pedido: PedidoPago) {
  return Array.isArray(pedido.pagos) ? pedido.pagos[0] : pedido.pagos;
}

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  return new Date(value).toLocaleDateString("es-PE");
}

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function PagosYapeValidator() {
  const [pedidos, setPedidos] = useState<PedidoPago[]>([]);
  const [rejectingPedidoId, setRejectingPedidoId] = useState<string | null>(null);
  const [observacionRechazo, setObservacionRechazo] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadPedidos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase
      .from("pedidos")
      .select(
        `
          *,
          clientes(nombres, telefono),
          pagos(*)
        `,
      )
      .eq("estado", "pago_enviado")
      .order("fecha_pedido", { ascending: false });

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar pagos: ${error.message}`,
      });
      setPedidos([]);
      setIsLoading(false);
      return;
    }

    setPedidos((data ?? []) as PedidoPago[]);
    setIsLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPedidos();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const pagosPendientes = useMemo(() => {
    return pedidos.filter((pedido) => {
      const pago = getPago(pedido);
      return pago?.metodo === "yape" && pago.estado === "enviado";
    });
  }, [pedidos]);

  async function validarPago(pedido: PedidoPago) {
    if (!supabase) {
      return;
    }

    const pago = getPago(pedido);

    if (!pago) {
      setMessage({
        type: "error",
        text: "Este pedido no tiene registro de pago.",
      });
      return;
    }

    setUpdatingId(pedido.id);
    setMessage(null);

    const { error: pagoError } = await supabase
      .from("pagos")
      .update({
        estado: "validado",
        validado_at: new Date().toISOString(),
        observacion_rechazo: null,
      })
      .eq("id", pago.id);

    if (pagoError) {
      setUpdatingId(null);
      setMessage({
        type: "error",
        text: `No se pudo validar el pago: ${pagoError.message}`,
      });
      return;
    }

    const { error: pedidoError } = await supabase
      .from("pedidos")
      .update({ estado: "pago_validado", estado_pago: "pagado" })
      .eq("id", pedido.id);

    setUpdatingId(null);

    if (pedidoError) {
      setMessage({
        type: "error",
        text: `Pago validado, pero fallo el pedido: ${pedidoError.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Pago validado correctamente." });
    await loadPedidos();
  }

  async function rechazarPago(pedido: PedidoPago) {
    if (!supabase) {
      return;
    }

    const pago = getPago(pedido);
    const observacion = normalizeSpaces(observacionRechazo);

    if (!pago) {
      setMessage({
        type: "error",
        text: "Este pedido no tiene registro de pago.",
      });
      return;
    }

    if (!observacion) {
      setMessage({
        type: "error",
        text: "Ingresa una observacion para rechazar el pago.",
      });
      return;
    }

    setUpdatingId(pedido.id);
    setMessage(null);

    const { error: pagoError } = await supabase
      .from("pagos")
      .update({
        estado: "rechazado",
        observacion_rechazo: observacion,
      })
      .eq("id", pago.id);

    if (pagoError) {
      setUpdatingId(null);
      setMessage({
        type: "error",
        text: `No se pudo rechazar el pago: ${pagoError.message}`,
      });
      return;
    }

    const { error: pedidoError } = await supabase
      .from("pedidos")
      .update({ estado: "pendiente", estado_pago: "debe" })
      .eq("id", pedido.id);

    setUpdatingId(null);

    if (pedidoError) {
      setMessage({
        type: "error",
        text: `Pago rechazado, pero fallo el pedido: ${pedidoError.message}`,
      });
      return;
    }

    setRejectingPedidoId(null);
    setObservacionRechazo("");
    setMessage({ type: "success", text: "Pago rechazado correctamente." });
    await loadPedidos();
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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Pagos Yape por validar
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Solo se muestran pedidos en estado pago enviado.
            </p>
          </div>
          <span className="w-fit rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            {pagosPendientes.length} pendientes
          </span>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {isLoading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            Cargando pagos...
          </div>
        ) : pagosPendientes.length > 0 ? (
          pagosPendientes.map((pedido) => {
            const pago = getPago(pedido);
            const isRejecting = rejectingPedidoId === pedido.id;
            const isUpdating = updatingId === pedido.id;

            return (
              <article
                key={pedido.id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">
                      Pedido #{pedido.id.slice(0, 8)}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">
                      {pedido.clientes?.nombres ?? "Sin cliente"}
                    </h3>
                    <p className="text-sm text-slate-600">
                      WhatsApp: {pedido.clientes?.telefono ?? "Sin WhatsApp"}
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-slate-950">
                    {formatMoney(pedido.total)}
                  </p>
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Info label="Fecha de pedido" value={formatDate(pedido.fecha_pedido)} />
                  <Info label="Fecha de recojo" value={formatDate(pedido.fecha_recojo)} />
                </dl>

                {pago?.captura_yape_url ? (
                  <a
                    href={pago.captura_yape_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pago.captura_yape_url}
                      alt="Captura de pago Yape"
                      className="h-72 w-full rounded-md border border-slate-200 object-cover"
                    />
                  </a>
                ) : (
                  <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                    El pedido no tiene captura registrada.
                  </p>
                )}

                {isRejecting ? (
                  <div className="mt-4 space-y-3 rounded-md border border-red-200 bg-red-50 p-3">
                    <label className="block">
                      <span className="text-sm font-medium text-red-800">
                        Observacion del rechazo
                      </span>
                      <textarea
                        value={observacionRechazo}
                        onChange={(event) => setObservacionRechazo(event.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-md border border-red-200 px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void rechazarPago(pedido)}
                        disabled={isUpdating}
                        className="h-10 rounded-md bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:bg-slate-300"
                      >
                        Confirmar rechazo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingPedidoId(null);
                          setObservacionRechazo("");
                        }}
                        className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-white"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void validarPago(pedido)}
                    disabled={isUpdating}
                    className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:bg-slate-300"
                  >
                    {isUpdating ? "Actualizando..." : "Validar pago"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingPedidoId(pedido.id);
                      setObservacionRechazo("");
                    }}
                    disabled={isUpdating}
                    className="h-10 rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:bg-slate-100"
                  >
                    Rechazar pago
                  </button>
                  <Link
                    href={`/pedidos/${pedido.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Ver pedido
                  </Link>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            No hay pagos Yape pendientes de validacion.
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
