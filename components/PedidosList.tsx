"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
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

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeSearch(value: string) {
  return normalizeSpaces(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function formatTime(value: string | null) {
  if (!value) {
    return "Sin hora";
  }

  return value.slice(0, 5);
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
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          pagos(metodo, estado, captura_yape_url)
        `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar pedidos: ${error.message}`,
      });
      setPedidos([]);
      setIsLoading(false);
      return;
    }

    setPedidos((data ?? []) as PedidoListItem[]);
    setIsLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPedidos();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const filteredPedidos = useMemo(() => {
    const term = normalizeSearch(search);

    return pedidos.filter((pedido) => {
      const cliente = pedido.clientes;
      const matchesEstado = estado ? pedido.estado === estado : true;
      const matchesFecha = fechaRecojo
        ? (pedido.fecha_recojo ?? "").slice(0, 10) === fechaRecojo
        : true;
      const matchesSearch = term
        ? normalizeSearch(`${cliente?.nombres ?? ""} ${cliente?.telefono ?? ""}`)
            .includes(term)
        : true;

      return matchesEstado && matchesFecha && matchesSearch;
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
            placeholder="Buscar por cliente o WhatsApp"
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Pedido</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">WhatsApp</th>
                <th className="px-4 py-3 font-medium">Recojo</th>
                <th className="px-4 py-3 font-medium">Hora</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Pago</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
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
                      <td className="px-4 py-3 text-slate-600">
                        {pago?.metodo ?? pedido.metodo_pago ?? "Sin pago"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">
                          {formatEstado(pedido.estado)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/pedidos/${pedido.id}`}
                          className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
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
