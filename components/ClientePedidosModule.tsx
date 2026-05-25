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

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

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

/**
 * Distribuye un monto entre cards deudoras en orden de antiguedad.
 * Retorna una lista de allocations (id, monto a aplicar) y el remanente
 * que sobra si el monto excede el saldo total.
 */
type Allocation = {
  pedidoId: string;
  saldoPrevio: number;
  totalPedido: number;
  montoActual: number;
  nuevoACuenta: number;
  nuevoEstadoPago: "pagado" | "debe";
};

function allocateAmountFifo(
  amount: number,
  cards: PedidoCliente[],
  priorityIds: string[],
): { allocations: Allocation[]; sobrante: number } {
  const ordered: PedidoCliente[] = [];
  // Cards explicitamente seleccionadas primero (en su orden), luego el resto
  // ordenado por fecha ascendente (mas antigua primero).
  const seen = new Set<string>();
  for (const id of priorityIds) {
    const card = cards.find((c) => c.id === id);
    if (card && getSaldo(card) > 0 && !seen.has(card.id)) {
      ordered.push(card);
      seen.add(card.id);
    }
  }
  const fifo = cards
    .filter((c) => !seen.has(c.id) && getSaldo(c) > 0)
    .sort(
      (a, b) =>
        new Date(a.fecha_pedido).getTime() - new Date(b.fecha_pedido).getTime(),
    );
  for (const card of fifo) {
    ordered.push(card);
    seen.add(card.id);
  }

  const allocations: Allocation[] = [];
  let remaining = amount;
  for (const card of ordered) {
    if (remaining <= 0) break;
    const saldo = getSaldo(card);
    const aplicar = Math.min(remaining, saldo);
    const nuevoACuenta = Math.min(
      Number(card.total ?? 0),
      Number(card.monto_a_cuenta ?? 0) + aplicar,
    );
    const nuevoEstadoPago =
      nuevoACuenta >= Number(card.total ?? 0) ? "pagado" : "debe";
    allocations.push({
      pedidoId: card.id,
      saldoPrevio: saldo,
      totalPedido: Number(card.total ?? 0),
      montoActual: Number(card.monto_a_cuenta ?? 0),
      nuevoACuenta,
      nuevoEstadoPago,
    });
    remaining -= aplicar;
  }
  return { allocations, sobrante: Math.max(0, remaining) };
}

export function ClientePedidosModule({ clienteId }: { clienteId: string }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [debeOnly, setDebeOnly] = useState(false);
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([]);
  const [manualForm, setManualForm] = useState<ManualPedidoForm>(emptyManualPedido);
  const [manualImagenFile, setManualImagenFile] = useState<File | null>(null);
  const [manualImagenPreview, setManualImagenPreview] = useState<string>("");
  const [manualImagenError, setManualImagenError] = useState<string>("");
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

  // Preview de allocations basado en el monto ingresado.
  const allocationPreview = useMemo(() => {
    const monto = parseMoney(pagoForm.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return { allocations: [], sobrante: 0 };
    }
    return allocateAmountFifo(monto, pedidos, selectedPedidoIds);
  }, [pagoForm.monto, pedidos, selectedPedidoIds]);

  function handleManualImagenChange(file: File | null) {
    setManualImagenError("");
    if (!file) {
      setManualImagenFile(null);
      setManualImagenPreview("");
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setManualImagenError("Formato no permitido. Usa JPG, PNG o WEBP.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setManualImagenError("La imagen supera 2 MB.");
      return;
    }
    setManualImagenFile(file);
    setManualImagenPreview(URL.createObjectURL(file));
  }

  async function uploadManualImagen(): Promise<string | null> {
    if (!manualImagenFile || !supabase) return null;
    const ext = manualImagenFile.name.split(".").pop() ?? "jpg";
    const safeClienteId = (cliente?.id ?? "anon").slice(0, 8);
    const path = `pedidos_manuales/${safeClienteId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("pedidos_manuales")
      .upload(path, manualImagenFile, {
        contentType: manualImagenFile.type,
        upsert: false,
      });
    if (error) {
      setManualImagenError(`No se pudo subir imagen: ${error.message}`);
      return null;
    }
    const { data } = supabase.storage.from("pedidos_manuales").getPublicUrl(path);
    return data.publicUrl;
  }

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
    let imagenUrl: string | null = null;
    if (manualImagenFile) {
      imagenUrl = await uploadManualImagen();
      if (!imagenUrl) {
        setIsSavingPedido(false);
        return;
      }
    }

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
      imagen_papel_url: imagenUrl,
    });
    setIsSavingPedido(false);

    if (error) {
      setMessage({ type: "error", text: `No se pudo registrar pedido: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Pedido manual registrado." });
    setManualForm(emptyManualPedido);
    setManualImagenFile(null);
    setManualImagenPreview("");
    await loadData();
  }

  async function registerPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !cliente) {
      return;
    }

    const monto = parseMoney(pagoForm.monto);
    if (Number.isNaN(monto) || monto <= 0) {
      setMessage({ type: "error", text: "Ingresa un monto de pago valido." });
      return;
    }

    if (totalDebt <= 0) {
      setMessage({ type: "error", text: "Este cliente no tiene deuda pendiente." });
      return;
    }

    const { allocations, sobrante } = allocationPreview;
    if (allocations.length === 0) {
      setMessage({
        type: "error",
        text: "No hay cards con saldo para aplicar el pago.",
      });
      return;
    }
    if (sobrante > 0) {
      setMessage({
        type: "error",
        text: `El monto excede el saldo total en S/ ${sobrante.toFixed(2)}. Reduce el monto.`,
      });
      return;
    }

    setIsSavingPago(true);
    // Aplicar allocations en secuencia.
    for (const alloc of allocations) {
      const pedidoUpdate = await supabase
        .from("pedidos")
        .update({
          monto_a_cuenta: alloc.nuevoACuenta,
          estado_pago: alloc.nuevoEstadoPago,
          metodo_pago: pagoForm.metodo,
          observaciones:
            alloc.nuevoEstadoPago === "pagado"
              ? "Deuda cancelada desde modulo de cliente"
              : "Abono registrado desde modulo de cliente",
        })
        .eq("id", alloc.pedidoId);

      if (pedidoUpdate.error) {
        setIsSavingPago(false);
        setMessage({
          type: "error",
          text: `Pago parcial fallo en card ${alloc.pedidoId.slice(0, 8)}: ${pedidoUpdate.error.message}`,
        });
        await loadData();
        return;
      }

      const pagoUpdate = await supabase.from("pagos").upsert(
        {
          pedido_id: alloc.pedidoId,
          metodo: pagoForm.metodo,
          estado: alloc.nuevoEstadoPago === "pagado" ? "validado" : "pendiente",
          monto: alloc.nuevoACuenta,
        },
        { onConflict: "pedido_id" },
      );

      if (pagoUpdate.error) {
        setIsSavingPago(false);
        setMessage({
          type: "error",
          text: `Card ${alloc.pedidoId.slice(0, 8)} actualizada pero el registro de pago fallo: ${pagoUpdate.error.message}`,
        });
        await loadData();
        return;
      }
    }
    setIsSavingPago(false);

    const cardsPagadas = allocations.filter((a) => a.nuevoEstadoPago === "pagado").length;
    const cardsAbono = allocations.length - cardsPagadas;
    setMessage({
      type: "success",
      text: `Pago aplicado: ${cardsPagadas} card(s) pagada(s)${cardsAbono > 0 ? `, ${cardsAbono} card(s) con abono parcial` : ""}.`,
    });
    setSelectedPedidoIds([]);
    setPagoForm(emptyPagoForm);
    await loadData();
  }

  function toggleSelected(pedidoId: string) {
    setSelectedPedidoIds((current) =>
      current.includes(pedidoId)
        ? current.filter((id) => id !== pedidoId)
        : [...current, pedidoId],
    );
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
                const isSelected = selectedPedidoIds.includes(pedido.id);
                const isEntregado = pedido.estado === "entregado";
                const tieneSaldo = saldo > 0;

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
                        <p className="mt-1 text-xs text-slate-500">
                          Pedido #{pedido.id.slice(0, 8)}
                          {isEntregado ? (
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              ENTREGADO
                            </span>
                          ) : null}
                        </p>
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
                    {pedido.imagen_papel_url ? (
                      <a
                        href={pedido.imagen_papel_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pedido.imagen_papel_url}
                          alt="Pedido en papel"
                          className="h-20 w-20 rounded border border-slate-200 object-cover"
                        />
                      </a>
                    ) : null}
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
                      {!isEntregado ? (
                        <Link
                          href={`/pedidos/nuevo?duplicar=${pedido.id}`}
                          className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Duplicar pedido
                        </Link>
                      ) : null}
                      {tieneSaldo ? (
                        <button
                          type="button"
                          onClick={() => toggleSelected(pedido.id)}
                          className={`h-9 rounded-md px-3 text-xs font-medium ${
                            isSelected
                              ? "bg-emerald-700 text-white hover:bg-emerald-800"
                              : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {isSelected ? "Quitar de pago" : "Aplicar pago aqui"}
                        </button>
                      ) : null}
                    </div>
                    {isEntregado ? (
                      <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                        Pedido entregado: no se puede editar ni duplicar como antes.
                        {tieneSaldo ? " Solo se puede registrar el pago pendiente." : ""}
                      </p>
                    ) : null}
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
              <Field label="Foto del pedido en papel (opcional)">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => handleManualImagenChange(event.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-600"
                />
                {manualImagenPreview ? (
                  <div className="mt-2 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={manualImagenPreview}
                      alt="Vista previa"
                      className="h-16 w-16 rounded border border-slate-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleManualImagenChange(null)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                ) : null}
                {manualImagenError ? (
                  <p className="mt-1 text-xs text-red-700">{manualImagenError}</p>
                ) : null}
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
              {selectedPedidoIds.length > 0
                ? `Aplicando primero a ${selectedPedidoIds.length} card(s) seleccionada(s); el resto a las mas antiguas.`
                : "Se aplicara a las cards mas antiguas primero. Tambien puedes marcar cards especificas en la lista."}
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
                <p className="mt-1 text-xs text-slate-500">
                  Saldo total: {formatMoney(totalDebt)}
                </p>
              </Field>
              {allocationPreview.allocations.length > 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Distribucion del pago:</p>
                  <ul className="mt-1 space-y-1">
                    {allocationPreview.allocations.map((alloc) => {
                      const aplicado = alloc.nuevoACuenta - alloc.montoActual;
                      return (
                        <li key={alloc.pedidoId} className="flex justify-between">
                          <span>
                            Card #{alloc.pedidoId.slice(0, 8)}{" "}
                            {alloc.nuevoEstadoPago === "pagado" ? (
                              <span className="text-emerald-700">(pagada)</span>
                            ) : (
                              <span className="text-amber-700">(a cuenta)</span>
                            )}
                          </span>
                          <span className="font-semibold">{formatMoney(aplicado)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {allocationPreview.sobrante > 0 ? (
                    <p className="mt-2 text-red-700">
                      Sobrante no aplicable: {formatMoney(allocationPreview.sobrante)} (excede el
                      saldo del cliente)
                    </p>
                  ) : null}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={
                  isSavingPago ||
                  totalDebt <= 0 ||
                  allocationPreview.allocations.length === 0 ||
                  allocationPreview.sobrante > 0
                }
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
