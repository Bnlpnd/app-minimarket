"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { formatDate } from "@/lib/dateUtils";
import type { Cliente, Pedido, PedidoEstadoPago } from "@/types/database";

type ClienteFormValues = {
  nombre: string;
  whatsapp: string;
  direccion_entrega: string;
  referencia: string;
  observacion: string;
  activo: boolean;
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
  direccion_entrega: "",
  referencia: "",
  observacion: "",
  activo: true,
};

const emptyPedidoForm: PedidoFormValues = {
  fecha_pedido: new Date().toISOString().slice(0, 10),
  detalle_manual: "",
  total: "",
  monto_a_cuenta: "",
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

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
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
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
  const [showInactive, setShowInactive] = useState(false);
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
    void loadClientes();
  }, []);

  const filteredClientes = useMemo(() => {
    const term = normalizeSearch(search);

    return clientes.filter((cliente) => {
      const matchesEstado = showInactive ? true : cliente.activo;
      const matchesTerm = term
        ? normalizeSearch(`${cliente.nombres} ${cliente.telefono ?? ""}`).includes(
            term,
          )
        : true;

      return matchesEstado && matchesTerm;
    });
  }, [clientes, search, showInactive]);

  function startEditCliente(cliente: Cliente) {
    setEditingCliente(cliente);
    setClienteForm({
      nombre: cliente.nombres,
      whatsapp: cliente.telefono ?? "",
      direccion_entrega: cliente.direccion_entrega ?? cliente.direccion ?? "",
      referencia: cliente.referencia ?? "",
      observacion: cliente.observacion ?? "",
      activo: cliente.activo,
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
    const direccion = normalizeSpaces(clienteForm.direccion_entrega);
    const referencia = normalizeSpaces(clienteForm.referencia);
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
      direccion: direccion || null,
      direccion_entrega: direccion || null,
      referencia: referencia || null,
      observacion: observacion || null,
      activo: clienteForm.activo,
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

  async function toggleActivo(cliente: Cliente) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase
      .from("clientes")
      .update({ activo: !cliente.activo })
      .eq("id", cliente.id);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo cambiar estado: ${error.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Estado de cliente actualizado." });
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
    const fecha = new Date(`${pedidoForm.fecha_pedido}T00:00:00`).toISOString();

    setIsSavingPedido(true);
    const { error } = await supabase.from("pedidos").insert({
      cliente_id: selectedCliente.id,
      fecha_pedido: fecha,
      fecha_recojo: fecha,
      tipo_entrega: "recoger_despues",
      detalle_manual: detalle,
      subtotal: total,
      total,
      monto_a_cuenta: montoACuenta,
      estado_pago: estadoPago,
      estado: "pendiente",
      metodo_pago: estadoPago === "pagado" ? "efectivo" : "otro",
      observaciones:
        estadoPago === "pagado" ? "Pedido pagado" : "Pedido con saldo pendiente",
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

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-slate-950">
          {editingCliente ? "Editar cliente" : "Nuevo cliente rapido"}
        </h2>
        <form onSubmit={handleSubmitCliente} className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Nombre" required>
              <input
                value={clienteForm.nombre}
                onChange={(event) =>
                  setClienteForm((current) => ({
                    ...current,
                    nombre: event.target.value,
                  }))
                }
                className={inputClassName}
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
                className={inputClassName}
              />
            </Field>
            <Field label="Direccion de entrega">
              <input
                value={clienteForm.direccion_entrega}
                onChange={(event) =>
                  setClienteForm((current) => ({
                    ...current,
                    direccion_entrega: event.target.value,
                  }))
                }
                className={inputClassName}
              />
            </Field>
            <Field label="Referencia">
              <input
                value={clienteForm.referencia}
                onChange={(event) =>
                  setClienteForm((current) => ({
                    ...current,
                    referencia: event.target.value,
                  }))
                }
                className={inputClassName}
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
                className={inputClassName}
              />
            </Field>
            <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700 md:self-end">
              <input
                type="checkbox"
                checked={clienteForm.activo}
                onChange={(event) =>
                  setClienteForm((current) => ({
                    ...current,
                    activo: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-emerald-700"
              />
              Cliente activo
            </label>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {editingCliente ? (
              <button
                type="button"
                onClick={resetClienteForm}
                className="h-11 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            ) : null}
            <button
              type="submit"
              disabled={isSavingCliente}
              className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
            >
              {isSavingCliente ? "Guardando..." : "Guardar cliente"}
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre o WhatsApp"
                className={inputClassName}
              />
              <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                />
                Ver inactivos
              </label>
            </div>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">WhatsApp</th>
                  <th className="px-4 py-3 font-medium">Direccion</th>
                  <th className="px-4 py-3 font-medium">Referencia</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Creado</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Cargando clientes...
                    </td>
                  </tr>
                ) : filteredClientes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No hay clientes para mostrar.
                    </td>
                  </tr>
                ) : (
                  filteredClientes.map((cliente) => (
                    <tr key={cliente.id}>
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {cliente.nombres}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{cliente.telefono}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {cliente.direccion_entrega ?? cliente.direccion ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {cliente.referencia ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                          {cliente.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(cliente.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Actions
                          cliente={cliente}
                          onEdit={startEditCliente}
                          onPedidos={(item) => void handleSelectCliente(item)}
                          onToggle={(item) => void toggleActivo(item)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 lg:hidden">
            {filteredClientes.map((cliente) => (
              <article key={cliente.id} className="rounded-lg border border-slate-200 p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950">{cliente.nombres}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {cliente.telefono ?? "Sin WhatsApp"}
                    </p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                    {cliente.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <dl className="mt-3 grid gap-2">
                  <Info label="Direccion" value={cliente.direccion_entrega ?? cliente.direccion ?? "-"} />
                  <Info label="Referencia" value={cliente.referencia ?? "-"} />
                  <Info label="Observacion" value={cliente.observacion ?? "-"} />
                </dl>
                <div className="mt-3">
                  <Actions
                    cliente={cliente}
                    onEdit={startEditCliente}
                    onPedidos={(item) => void handleSelectCliente(item)}
                    onToggle={(item) => void toggleActivo(item)}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-950">
            Pedidos del cliente
          </h2>
          {selectedCliente ? (
            <>
              <p className="mt-1 text-sm text-slate-600">
                {selectedCliente.nombres} · {selectedCliente.telefono}
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
                    className={inputClassName}
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
                      className={inputClassName}
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
                      className={inputClassName}
                    />
                  </Field>
                </div>
                <button
                  type="submit"
                  disabled={isSavingPedido}
                  className="h-11 w-full rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
                >
                  {isSavingPedido ? "Guardando..." : "Registrar pedido manual"}
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
                            {formatDate(pedido.fecha_pedido)}
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
                          <Info label="Total" value={formatMoney(Number(pedido.total))} />
                          <Info label="A cuenta" value={formatMoney(Number(pedido.monto_a_cuenta))} />
                          <Info label="Falta" value={formatMoney(saldo)} />
                        </div>
                        <Link
                          href={`/pedidos/${pedido.id}`}
                          className="mt-3 inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700"
                        >
                          Ver detalle
                        </Link>
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

function Actions({
  cliente,
  onEdit,
  onPedidos,
  onToggle,
}: {
  cliente: Cliente;
  onEdit: (cliente: Cliente) => void;
  onPedidos: (cliente: Cliente) => void;
  onToggle: (cliente: Cliente) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onEdit(cliente)}
        className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Editar
      </button>
      <button
        type="button"
        onClick={() => onPedidos(cliente)}
        className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Ver pedidos
      </button>
      <button
        type="button"
        onClick={() => onToggle(cliente)}
        className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {cliente.activo ? "Desactivar" : "Activar"}
      </button>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-950">{value}</dd>
    </div>
  );
}
