"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { formatDate } from "@/lib/dateUtils";
import type { Cliente, DetallePedido, Pedido, Producto } from "@/types/database";

type PedidoCliente = Pedido & {
  detalle_pedido:
    | Array<
        Pick<DetallePedido, "id" | "cantidad" | "precio_unitario" | "subtotal"> & {
          productos: Pick<Producto, "nombre_producto"> | null;
        }
      >
    | null;
};

type ManualPedidoForm = {
  fecha_pedido: string;
  detalle_manual: string;
  total: string;
  monto_a_cuenta: string;
};

type PagoForm = {
  monto: string;
  metodo: "efectivo" | "yape" | "transferencia";
};

type Message = {
  type: "success" | "error";
  text: string;
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

const emptyManualPedido: ManualPedidoForm = {
  fecha_pedido: todayInput(),
  detalle_manual: "",
  total: "",
  monto_a_cuenta: "",
};

const emptyPagoForm: PagoForm = {
  monto: "",
  metodo: "efectivo",
};

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function getSaldo(pedido: Pick<Pedido, "total" | "monto_a_cuenta" | "estado_pago">) {
  if (pedido.estado_pago === "pagado") {
    return 0;
  }

  return Math.max(0, Number(pedido.total ?? 0) - Number(pedido.monto_a_cuenta ?? 0));
}

function getPedidoResumen(pedido: PedidoCliente) {
  if (pedido.detalle_manual) {
    return pedido.detalle_manual;
  }

  const detalles = pedido.detalle_pedido ?? [];
  if (detalles.length === 0) {
    return "Sin detalle registrado";
  }

  return detalles
    .slice(0, 3)
    .map((item) => `${Number(item.cantidad)} x ${item.productos?.nombre_producto ?? "Producto"}`)
    .join(", ");
}

export function ClientePedidosModule({ clienteId }: { clienteId: string }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [debeOnly, setDebeOnly] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<PedidoCliente | null>(null);
  const [manualForm, setManualForm] = useState<ManualPedidoForm>(emptyManualPedido);
  const [pagoForm, setPagoForm] = useState<PagoForm>(emptyPagoForm);
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPedido, setIsSavingPedido] = useState(false);
  const [isSavingPago, setIsSavingPago] = useState(false);

  async function loadData() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const [clienteResult, pedidosResult] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", clienteId).maybeSingle(),
      supabase
        .from("pedidos")
        .select(
          `
            *,
            detalle_pedido(id,cantidad,precio_unitario,subtotal,productos!producto_id(nombre_producto))
          `,
        )
        .eq("cliente_id", clienteId)
        .order("fecha_pedido", { ascending: false }),
    ]);
    setIsLoading(false);

    if (clienteResult.error || !clienteResult.data) {
      setMessage({
        type: "error",
        text: `No se pudo cargar cliente: ${clienteResult.error?.message ?? "no encontrado"}`,
      });
      return;
    }

    if (pedidosResult.error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar pedidos: ${pedidosResult.error.message}`,
      });
      return;
    }

    setCliente(clienteResult.data as Cliente);
    setPedidos((pedidosResult.data ?? []) as PedidoCliente[]);
  }

  useEffect(() => {
    void loadData();
  }, [clienteId]);

  const filteredPedidos = useMemo(() => {
    return pedidos.filter((pedido) => {
      const matchesFecha = fechaFiltro ? pedido.fecha_pedido.slice(0, 10) === fechaFiltro : true;
      const matchesDebe = debeOnly ? pedido.estado_pago === "debe" && getSaldo(pedido) > 0 : true;
      return matchesFecha && matchesDebe;
    });
  }, [debeOnly, fechaFiltro, pedidos]);

  const totalDebt = useMemo(
    () => pedidos.reduce((sum, pedido) => sum + getSaldo(pedido), 0),
    [pedidos],
  );

  async function saveManualPedido(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !cliente) {
      return;
    }

    const detalle = normalizeSpaces(manualForm.detalle_manual);
    const total = parseMoney(manualForm.total);
    const montoACuenta = parseMoney(manualForm.monto_a_cuenta);

    if (!manualForm.fecha_pedido || !detalle) {
      setMessage({ type: "error", text: "Fecha y detalle del pedido son obligatorios." });
      return;
    }

    if (Number.isNaN(total) || total < 0 || Number.isNaN(montoACuenta) || montoACuenta < 0) {
      setMessage({ type: "error", text: "Los montos no son validos." });
      return;
    }

    const montoFinal = Math.min(montoACuenta, total);
    const estadoPago = montoFinal >= total ? "pagado" : "debe";
    const fecha = new Date(`${manualForm.fecha_pedido}T00:00:00`).toISOString();

    setIsSavingPedido(true);
    const { error } = await supabase.from("pedidos").insert({
      cliente_id: cliente.id,
      fecha_pedido: fecha,
      fecha_recojo: fecha,
      tipo_entrega: "recoger_despues",
      detalle_manual: detalle,
      subtotal: total,
      total,
      monto_a_cuenta: montoFinal,
      estado_pago: estadoPago,
      estado: "pendiente",
      metodo_pago: estadoPago === "pagado" ? "efectivo" : "otro",
      observaciones: estadoPago === "pagado" ? "Pedido pagado" : "Pedido con saldo pendiente",
    });
    setIsSavingPedido(false);

    if (error) {
      setMessage({ type: "error", text: `No se pudo registrar pedido: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Pedido manual registrado." });
    setManualForm(emptyManualPedido);
    await loadData();
  }

  async function registerPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedPedido) {
      setMessage({ type: "error", text: "Selecciona primero el pedido que esta debiendo." });
      return;
    }

    const monto = parseMoney(pagoForm.monto);
    const saldoActual = getSaldo(selectedPedido);

    if (selectedPedido.estado_pago === "pagado" || saldoActual <= 0) {
      setMessage({ type: "error", text: "Ese pedido ya esta pagado." });
      return;
    }

    if (Number.isNaN(monto) || monto <= 0) {
      setMessage({ type: "error", text: "Ingresa un monto de pago valido." });
      return;
    }

    const nuevoACuenta = Math.min(
      Number(selectedPedido.total ?? 0),
      Number(selectedPedido.monto_a_cuenta ?? 0) + monto,
    );
    const nextEstadoPago = nuevoACuenta >= Number(selectedPedido.total ?? 0) ? "pagado" : "debe";

    setIsSavingPago(true);
    const pedidoUpdate = await supabase
      .from("pedidos")
      .update({
        monto_a_cuenta: nuevoACuenta,
        estado_pago: nextEstadoPago,
        metodo_pago: pagoForm.metodo,
        observaciones:
          nextEstadoPago === "pagado"
            ? "Deuda cancelada desde modulo de cliente"
            : "Abono registrado desde modulo de cliente",
      })
      .eq("id", selectedPedido.id);

    if (pedidoUpdate.error) {
      setIsSavingPago(false);
      setMessage({ type: "error", text: `No se pudo registrar pago: ${pedidoUpdate.error.message}` });
      return;
    }

    const pagoUpdate = await supabase.from("pagos").upsert(
      {
        pedido_id: selectedPedido.id,
        metodo: pagoForm.metodo,
        estado: nextEstadoPago === "pagado" ? "validado" : "pendiente",
        monto: nuevoACuenta,
      },
      { onConflict: "pedido_id" },
    );
    setIsSavingPago(false);

    if (pagoUpdate.error) {
      setMessage({
        type: "error",
        text: `El pedido se actualizo, pero fallo el registro de pago: ${pagoUpdate.error.message}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text:
        nextEstadoPago === "pagado"
          ? "Pago registrado. El pedido quedo pagado."
          : "Abono registrado. El pedido aun mantiene saldo.",
    });
    setSelectedPedido(null);
    setPagoForm(emptyPagoForm);
    await loadData();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/clientes" className="text-sm font-medium text-slate-600 hover:text-slate-950">
            Volver a clientes
          </Link>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {cliente?.nombres ?? "Cliente"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Debe: <span className="font-semibold text-slate-950">{formatMoney(totalDebt)}</span>
          </p>
        </div>
        <Link
          href={`/pedidos/nuevo?cliente=${clienteId}`}
          className="inline-flex h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Nueva venta
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

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-[180px_160px]">
              <input
                type="date"
                value={fechaFiltro}
                onChange={(event) => setFechaFiltro(event.target.value)}
                className={inputClassName}
              />
              <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={debeOnly}
                  onChange={(event) => setDebeOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                />
                Debe
              </label>
            </div>
          </div>

          {isLoading ? (
            <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
              Cargando pedidos...
            </p>
          ) : filteredPedidos.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
              No hay pedidos para mostrar.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredPedidos.map((pedido) => {
                const saldo = getSaldo(pedido);
                const isSelected = selectedPedido?.id === pedido.id;

                return (
                  <article
                    key={pedido.id}
                    className={`rounded-lg border bg-white p-4 shadow-sm ${
                      isSelected ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {formatDate(pedido.fecha_pedido)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Pedido #{pedido.id.slice(0, 8)}</p>
                      </div>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${
                          pedido.estado_pago === "pagado"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {pedido.estado_pago === "pagado" ? "Pagado" : "Debe"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">{getPedidoResumen(pedido)}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <Metric label="Total" value={formatMoney(Number(pedido.total))} />
                      <Metric label="A cuenta" value={formatMoney(Number(pedido.monto_a_cuenta))} />
                      <Metric label="Debe" value={formatMoney(saldo)} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/pedidos?pedido=${pedido.id.slice(0, 8)}`}
                        className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Ver detalle
                      </Link>
                      <Link
                        href={`/pedidos/nuevo?duplicar=${pedido.id}`}
                        className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Duplicar pedido
                      </Link>
                      {saldo > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPedido(pedido);
                            setPagoForm({ ...emptyPagoForm, monto: saldo.toFixed(2) });
                          }}
                          className="h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-700"
                        >
                          Registrar pago
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">Registrar pedido manual</h2>
            <form onSubmit={saveManualPedido} className="mt-4 space-y-3">
              <Field label="Fecha" required>
                <input
                  type="date"
                  value={manualForm.fecha_pedido}
                  onChange={(event) =>
                    setManualForm((current) => ({ ...current, fecha_pedido: event.target.value }))
                  }
                  className={inputClassName}
                />
              </Field>
              <Field label="Detalle" required>
                <textarea
                  value={manualForm.detalle_manual}
                  onChange={(event) =>
                    setManualForm((current) => ({ ...current, detalle_manual: event.target.value }))
                  }
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Field label="Monto a pagar" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualForm.total}
                    onChange={(event) =>
                      setManualForm((current) => ({ ...current, total: event.target.value }))
                    }
                    className={inputClassName}
                  />
                </Field>
                <Field label="A cuenta">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualForm.monto_a_cuenta}
                    onChange={(event) =>
                      setManualForm((current) => ({ ...current, monto_a_cuenta: event.target.value }))
                    }
                    className={inputClassName}
                  />
                </Field>
              </div>
              <button
                type="submit"
                disabled={isSavingPedido}
                className="h-11 w-full rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
              >
                {isSavingPedido ? "Guardando..." : "Guardar pedido"}
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">Registrar pago</h2>
            <p className="mt-1 text-sm text-slate-500">
              {selectedPedido
                ? `Pedido #${selectedPedido.id.slice(0, 8)} - saldo ${formatMoney(getSaldo(selectedPedido))}`
                : "Selecciona una card que este debiendo."}
            </p>
            <form onSubmit={registerPayment} className="mt-4 space-y-3">
              <Field label="Metodo">
                <select
                  value={pagoForm.metodo}
                  onChange={(event) =>
                    setPagoForm((current) => ({
                      ...current,
                      metodo: event.target.value as PagoForm["metodo"],
                    }))
                  }
                  className={inputClassName}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="yape">Yape</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </Field>
              <Field label="Monto">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pagoForm.monto}
                  onChange={(event) => setPagoForm((current) => ({ ...current, monto: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <button
                type="submit"
                disabled={isSavingPago || !selectedPedido}
                className="h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
              >
                {isSavingPago ? "Guardando..." : "Registrar pago"}
              </button>
            </form>
          </section>
        </aside>
      </section>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}
