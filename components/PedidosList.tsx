"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { getStoredAppUser } from "@/lib/authRoles";
import { formatDate, formatTime } from "@/lib/dateUtils";
import { matchesSearch } from "@/lib/searchUtils";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import type { Cliente, Pago, Pedido, PedidoEstado } from "@/types/database";

type PedidoListItem = Pedido & {
  clientes: Pick<Cliente, "nombres" | "telefono"> | null;
  pagos: Pick<Pago, "metodo" | "estado" | "captura_yape_url"> | null | Pick<
    Pago,
    "metodo" | "estado" | "captura_yape_url"
  >[];
};

type Message = {
  type: "success" | "error";
  text: string;
};

const pedidoEstados: Array<{ value: PedidoEstado | ""; label: string }> = [
  { value: "", label: "Todos los estados" },
  { value: "pendiente", label: "Pendiente" },
  { value: "pago_enviado", label: "Pago enviado" },
  { value: "pago_validado", label: "Pago validado" },
  { value: "en_preparacion", label: "En preparacion" },
  { value: "listo_para_recoger", label: "Listo para recoger" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" },
];

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatEstado(value: PedidoEstado) {
  return value.replaceAll("_", " ");
}

function getPago(pedido: PedidoListItem) {
  return Array.isArray(pedido.pagos) ? pedido.pagos[0] : pedido.pagos;
}

export function PedidosList() {
  const [pedidos, setPedidos] = useState<PedidoListItem[]>([]);
  const [estado, setEstado] = useState<PedidoEstado | "">("");
  const [fechaRecojo, setFechaRecojo] = useState("");
  const [search, setSearch] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("pedido") ?? ""),
  );
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rechazoId, setRechazoId] = useState<string | null>(null);
  const [rechazoObservacion, setRechazoObservacion] = useState("");

  async function loadPedidos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data, error } = await fetchAllRows<PedidoListItem>(
      supabase
        .from("pedidos")
        .select(
          `
            *,
            clientes(nombres, telefono),
            pagos(metodo, estado, captura_yape_url)
          `,
        )
        .order("created_at", { ascending: false }),
    );

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar pedidos: ${error.message}`,
      });
      setPedidos([]);
      setIsLoading(false);
      return;
    }

    setPedidos(data);
    setIsLoading(false);
  }

  async function validarPago(pedidoId: string) {
    if (!supabase) return;
    setActionLoading(pedidoId);
    setMessage(null);
    const appUser = getStoredAppUser();

    const { error: pagoError } = await supabase
      .from("pagos")
      .update({
        estado: "validado",
        validado_por_id: appUser?.id ?? null,
        validado_at: new Date().toISOString(),
        observacion_rechazo: null,
      })
      .eq("pedido_id", pedidoId);

    if (pagoError) {
      setMessage({ type: "error", text: `No se pudo validar pago: ${pagoError.message}` });
      setActionLoading(null);
      return;
    }

    const { error: pedidoError } = await supabase
      .from("pedidos")
      .update({ estado: "pago_validado", estado_pago: "pagado" })
      .eq("id", pedidoId);

    if (pedidoError) {
      setMessage({ type: "error", text: `Pago validado pero fallo actualizar pedido: ${pedidoError.message}` });
    } else {
      setMessage({ type: "success", text: "Pago validado correctamente." });
    }

    setActionLoading(null);
    await loadPedidos();
  }

  async function rechazarPago(pedidoId: string) {
    if (!supabase) return;
    if (!rechazoObservacion.trim()) {
      setMessage({ type: "error", text: "Indica el motivo del rechazo." });
      return;
    }

    setActionLoading(pedidoId);
    setMessage(null);

    const { error: pagoError } = await supabase
      .from("pagos")
      .update({
        estado: "rechazado",
        observacion_rechazo: rechazoObservacion.trim(),
      })
      .eq("pedido_id", pedidoId);

    if (pagoError) {
      setMessage({ type: "error", text: `No se pudo rechazar pago: ${pagoError.message}` });
      setActionLoading(null);
      return;
    }

    const { error: pedidoError } = await supabase
      .from("pedidos")
      .update({ estado: "pendiente", estado_pago: "debe" })
      .eq("id", pedidoId);

    if (pedidoError) {
      setMessage({ type: "error", text: `Pago rechazado pero fallo actualizar pedido: ${pedidoError.message}` });
    } else {
      setMessage({ type: "success", text: "Pago rechazado." });
    }

    setRechazoId(null);
    setRechazoObservacion("");
    setActionLoading(null);
    await loadPedidos();
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPedidos();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const filteredPedidos = useMemo(() => {
    return pedidos.filter((pedido) => {
      const cliente = pedido.clientes;
      const matchesEstado = estado ? pedido.estado === estado : true;
      const matchesFecha = fechaRecojo
        ? (pedido.fecha_recojo ?? "").slice(0, 10) === fechaRecojo
        : true;
      const matchesTerm = matchesSearch(search, [
        pedido.id,
        pedido.id.slice(0, 8),
        cliente?.nombres,
        cliente?.telefono,
        pedido.estado,
        pedido.metodo_pago,
      ]);

      return matchesEstado && matchesFecha && matchesTerm;
    });
  }, [pedidos, estado, fechaRecojo, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/pedidos/nuevo"
          className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Nuevo pedido
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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[180px_180px_minmax(0,1fr)]">
          <select
            value={estado}
            onChange={(event) => setEstado(event.target.value as PedidoEstado | "")}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          >
            {pedidoEstados.map((item) => (
              <option key={item.label} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={fechaRecojo}
            onChange={(event) => setFechaRecojo(event.target.value)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por cliente, WhatsApp o pedido"
            aria-label="Buscar por cliente, WhatsApp o codigo de pedido"
            className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Pedidos</h2>
            <p className="mt-1 text-sm text-slate-600">
              Filtra por estado, fecha de recojo o cliente.
            </p>
          </div>
          <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            {filteredPedidos.length} registros
          </span>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Pedido</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">WhatsApp</th>
                <th className="px-4 py-3 font-medium">Recojo</th>
                <th className="px-4 py-3 font-medium">Hora</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Deuda</th>
                <th className="px-4 py-3 font-medium">Pago</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    Cargando pedidos...
                  </td>
                </tr>
              ) : filteredPedidos.length > 0 ? (
                filteredPedidos.map((pedido) => {
                  const pago = getPago(pedido);

                  return (
                    <tr key={pedido.id}>
                      <td className="px-4 py-3 font-medium text-slate-950">
                        #{pedido.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {pedido.clientes?.nombres ?? "Sin cliente"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {pedido.clientes?.telefono ?? "Sin WhatsApp"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(pedido.fecha_recojo)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatTime(pedido.hora_recojo)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {formatMoney(pedido.total)}
                      </td>
                      <td className="px-4 py-3">
                        {pedido.estado_pago === "debe" ? (
                          <span className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                            {formatMoney(Math.max(0, Number(pedido.total ?? 0) - Number(pedido.monto_a_cuenta ?? 0)))}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {pago?.metodo ?? pedido.metodo_pago ?? "Sin pago"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">
                          {formatEstado(pedido.estado)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/pedidos/${pedido.id}`}
                            className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Ver detalle
                          </Link>
                          {pedido.estado === "pendiente" || pedido.estado === "pago_validado" ? (
                            <Link
                              href={`/preparacion?pedido=${pedido.id}`}
                              className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700"
                            >
                              Preparar
                            </Link>
                          ) : null}
                          {pedido.estado === "pago_enviado" ? (
                            rechazoId === pedido.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={rechazoObservacion}
                                  onChange={(event) => setRechazoObservacion(event.target.value)}
                                  placeholder="Motivo del rechazo"
                                  className="h-9 w-40 rounded-md border border-slate-300 px-2 text-xs outline-none focus:border-emerald-600"
                                />
                                <button
                                  type="button"
                                  disabled={actionLoading === pedido.id}
                                  onClick={() => void rechazarPago(pedido.id)}
                                  className="h-9 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:bg-slate-300"
                                >
                                  {actionLoading === pedido.id ? "..." : "Confirmar"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setRechazoId(null); setRechazoObservacion(""); }}
                                  className="h-9 rounded-md border border-slate-300 px-2 text-xs font-medium text-slate-600"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={actionLoading === pedido.id}
                                  onClick={() => void validarPago(pedido.id)}
                                  className="h-9 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white hover:bg-emerald-800 disabled:bg-slate-300"
                                >
                                  {actionLoading === pedido.id ? "..." : "Pago OK"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRechazoId(pedido.id)}
                                  className="h-9 rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 hover:bg-red-50"
                                >
                                  Rechazar
                                </button>
                              </>
                            )
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    No hay pedidos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
