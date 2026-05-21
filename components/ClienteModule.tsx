"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type { Cliente, Pedido, PedidoEstadoPago } from "@/types/database";

type ClienteFormValues = {
  nombre: string;
  whatsapp: string;
  observacion: string;
};

type PedidoFormValues = {
  fecha_pedido: string;
  detalle_manual: string;
  total: string;
  monto_a_cuenta: string;
};

type Message = {
  type: "success" | "error";
  text: string;
};

const emptyClienteForm: ClienteFormValues = {
  nombre: "",
  whatsapp: "",
  observacion: "",
};

const emptyPedidoForm: PedidoFormValues = {
  fecha_pedido: new Date().toISOString().slice(0, 10),
  detalle_manual: "",
  total: "",
  monto_a_cuenta: "",
};

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeWhatsapp(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function normalizeSearch(value: string) {
  return normalizeSpaces(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
  return `S/ ${value.toFixed(2)}`;
}

function getEstadoPago(total: number, montoACuenta: number): PedidoEstadoPago {
  return montoACuenta >= total ? "pagado" : "debe";
}

export function ClienteModule() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [clienteForm, setClienteForm] =
    useState<ClienteFormValues>(emptyClienteForm);
  const [pedidoForm, setPedidoForm] =
    useState<PedidoFormValues>(emptyPedidoForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCliente, setIsSavingCliente] = useState(false);
  const [isSavingPedido, setIsSavingPedido] = useState(false);

  async function loadClientes() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar clientes: ${error.message}`,
      });
      setClientes([]);
      setIsLoading(false);
      return;
    }

    setClientes((data ?? []) as Cliente[]);
    setIsLoading(false);
  }

  async function loadPedidos(clienteId: string) {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("pedidos")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("fecha_pedido", { ascending: false });

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar pedidos: ${error.message}`,
      });
      setPedidos([]);
      return;
    }

    setPedidos((data ?? []) as Pedido[]);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadClientes();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const filteredClientes = useMemo(() => {
    const term = normalizeSearch(search);

    if (!term) {
      return clientes;
    }

    return clientes.filter((cliente) =>
      normalizeSearch(`${cliente.nombres} ${cliente.telefono ?? ""}`).includes(
        term,
      ),
    );
  }, [clientes, search]);

  function startEditCliente(cliente: Cliente) {
    setEditingCliente(cliente);
    setClienteForm({
      nombre: cliente.nombres,
      whatsapp: cliente.telefono ?? "",
      observacion: cliente.observacion ?? "",
    });
  }

  function resetClienteForm() {
    setEditingCliente(null);
    setClienteForm(emptyClienteForm);
  }

  async function handleSubmitCliente(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return;
    }

    const nombre = normalizeSpaces(clienteForm.nombre);
    const whatsapp = normalizeWhatsapp(clienteForm.whatsapp);
    const observacion = normalizeSpaces(clienteForm.observacion);

    if (!nombre) {
      setMessage({ type: "error", text: "El nombre es obligatorio." });
      return;
    }

    if (!whatsapp) {
      setMessage({ type: "error", text: "El WhatsApp es obligatorio." });
      return;
    }

    const duplicated = clientes.some(
      (cliente) =>
        normalizeWhatsapp(cliente.telefono ?? "") === whatsapp &&
        cliente.id !== editingCliente?.id,
    );

    if (duplicated) {
      setMessage({
        type: "error",
        text: "Ya existe un cliente con ese WhatsApp.",
      });
      return;
    }

    setIsSavingCliente(true);
    const payload = {
      nombres: nombre,
      telefono: whatsapp,
      observacion: observacion || null,
    };
    const result = editingCliente
      ? await supabase.from("clientes").update(payload).eq("id", editingCliente.id)
      : await supabase.from("clientes").insert(payload);
    setIsSavingCliente(false);

    if (result.error) {
      setMessage({
        type: "error",
        text:
          result.error.code === "23505"
            ? "Ya existe un cliente con ese WhatsApp."
            : `No se pudo guardar el cliente: ${result.error.message}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text: editingCliente
        ? "Cliente actualizado correctamente."
        : "Cliente creado correctamente.",
    });
    resetClienteForm();
    await loadClientes();
  }

  async function handleSelectCliente(cliente: Cliente) {
    setSelectedCliente(cliente);
    setPedidos([]);
    await loadPedidos(cliente.id);
  }

  async function handleSubmitPedido(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedCliente) {
      setMessage({
        type: "error",
        text: "Selecciona un cliente antes de registrar pedido.",
      });
      return;
    }

    const detalle = normalizeSpaces(pedidoForm.detalle_manual);
    const total = parseMoney(pedidoForm.total);
    const montoACuenta = parseMoney(pedidoForm.monto_a_cuenta);

    if (!pedidoForm.fecha_pedido) {
      setMessage({ type: "error", text: "La fecha del pedido es obligatoria." });
      return;
    }

    if (!detalle) {
      setMessage({ type: "error", text: "El detalle del pedido es obligatorio." });
      return;
    }

    if (Number.isNaN(total) || total < 0) {
      setMessage({ type: "error", text: "El monto a pagar no es valido." });
      return;
    }

    if (Number.isNaN(montoACuenta) || montoACuenta < 0) {
      setMessage({ type: "error", text: "El monto a cuenta no es valido." });
      return;
    }

    const estadoPago = getEstadoPago(total, montoACuenta);
    setIsSavingPedido(true);
    const { error } = await supabase.from("pedidos").insert({
      cliente_id: selectedCliente.id,
      fecha_pedido: new Date(`${pedidoForm.fecha_pedido}T00:00:00`).toISOString(),
      fecha_recojo: new Date(`${pedidoForm.fecha_pedido}T00:00:00`).toISOString(),
      detalle_manual: detalle,
      subtotal: total,
      total,
      monto_a_cuenta: montoACuenta,
      estado_pago: estadoPago,
      estado: "pendiente",
      observaciones: estadoPago === "pagado" ? "Pedido pagado" : "Pedido con saldo pendiente",
    });
    setIsSavingPedido(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo guardar el pedido: ${error.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Pedido registrado correctamente." });
    setPedidoForm(emptyPedidoForm);
    await loadPedidos(selectedCliente.id);
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
        <h2 className="text-base font-semibold text-slate-950">
          {editingCliente ? "Editar cliente" : "Nuevo cliente rapido"}
        </h2>
        <form
          onSubmit={handleSubmitCliente}
          className="mt-4 grid gap-4 lg:grid-cols-[1fr_180px]"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Nombre" required>
              <input
                value={clienteForm.nombre}
                onChange={(event) =>
                  setClienteForm((current) => ({
                    ...current,
                    nombre: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </Field>
            <Field label="WhatsApp" required>
              <input
                value={clienteForm.whatsapp}
                onChange={(event) =>
                  setClienteForm((current) => ({
                    ...current,
                    whatsapp: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </Field>
            <Field label="Observacion">
              <input
                value={clienteForm.observacion}
                onChange={(event) =>
                  setClienteForm((current) => ({
                    ...current,
                    observacion: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </Field>
          </div>

          <div className="flex gap-2 lg:items-end">
            <button
              type="submit"
              disabled={isSavingCliente}
              className="h-10 flex-1 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:bg-slate-300"
            >
              {isSavingCliente ? "Guardando..." : "Guardar"}
            </button>
            {editingCliente ? (
              <button
                type="button"
                onClick={resetClienteForm}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Clientes
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Busca por nombre o WhatsApp.
                </p>
              </div>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 md:w-72"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">WhatsApp</th>
                  <th className="px-4 py-3 font-medium">Observacion</th>
                  <th className="px-4 py-3 font-medium">Creado</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Cargando clientes...
                    </td>
                  </tr>
                ) : filteredClientes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No hay clientes para mostrar.
                    </td>
                  </tr>
                ) : (
                  filteredClientes.map((cliente) => (
                    <tr key={cliente.id}>
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {cliente.nombres}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {cliente.telefono}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {cliente.observacion || "Sin observacion"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(cliente.created_at).toLocaleDateString("es-PE")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEditCliente(cliente)}
                            className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSelectCliente(cliente)}
                            className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Ver pedidos
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            Pedidos del cliente
          </h2>
          {selectedCliente ? (
            <>
              <p className="mt-1 text-sm text-slate-600">
                {selectedCliente.nombres} - {selectedCliente.telefono}
              </p>

              <form onSubmit={handleSubmitPedido} className="mt-4 space-y-3">
                <Field label="Fecha" required>
                  <input
                    type="date"
                    value={pedidoForm.fecha_pedido}
                    onChange={(event) =>
                      setPedidoForm((current) => ({
                        ...current,
                        fecha_pedido: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </Field>
                <Field label="Detalle del pedido" required>
                  <textarea
                    value={pedidoForm.detalle_manual}
                    onChange={(event) =>
                      setPedidoForm((current) => ({
                        ...current,
                        detalle_manual: event.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Monto a pagar" required>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pedidoForm.total}
                      onChange={(event) =>
                        setPedidoForm((current) => ({
                          ...current,
                          total: event.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    />
                  </Field>
                  <Field label="A cuenta">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pedidoForm.monto_a_cuenta}
                      onChange={(event) =>
                        setPedidoForm((current) => ({
                          ...current,
                          monto_a_cuenta: event.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    />
                  </Field>
                </div>
                <button
                  type="submit"
                  disabled={isSavingPedido}
                  className="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-300"
                >
                  {isSavingPedido ? "Guardando..." : "Registrar pedido"}
                </button>
              </form>

              <div className="mt-5 space-y-3">
                {pedidos.length > 0 ? (
                  pedidos.map((pedido) => {
                    const saldo = Math.max(
                      0,
                      Number(pedido.total) - Number(pedido.monto_a_cuenta),
                    );

                    return (
                      <article
                        key={pedido.id}
                        className="rounded-md border border-slate-200 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">
                            {new Date(pedido.fecha_pedido).toLocaleDateString(
                              "es-PE",
                            )}
                          </p>
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-medium ${
                              pedido.estado_pago === "pagado"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {pedido.estado_pago === "pagado" ? "Pagado" : "Debe"}
                          </span>
                        </div>
                        <p className="mt-2 text-slate-600">
                          {pedido.detalle_manual}
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <p>
                            Total
                            <strong className="block text-sm text-slate-950">
                              {formatMoney(Number(pedido.total))}
                            </strong>
                          </p>
                          <p>
                            A cuenta
                            <strong className="block text-sm text-slate-950">
                              {formatMoney(Number(pedido.monto_a_cuenta))}
                            </strong>
                          </p>
                          <p>
                            Falta
                            <strong className="block text-sm text-slate-950">
                              {formatMoney(saldo)}
                            </strong>
                          </p>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                    Este cliente aun no tiene pedidos asociados.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-500">
              Selecciona un cliente para ver o registrar pedidos.
            </p>
          )}
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
