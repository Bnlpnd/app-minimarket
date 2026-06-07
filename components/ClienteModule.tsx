"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import { normalizePhonePe, validatePhonePe } from "@/lib/validators";
import type { Cliente } from "@/types/database";

type ClienteFormValues = {
  nombre: string;
  whatsapp: string;
  direccion_entrega: string;
  referencia: string;
  observacion: string;
  activo: boolean;
};

type PedidoDeudaRow = {
  cliente_id: string | null;
  total: number;
  monto_a_cuenta: number;
  estado_pago: "pagado" | "debe";
};

type Message = {
  type: "success" | "error";
  text: string;
};

type EstadoFilter = "todos" | "activos" | "inactivos";

const emptyClienteForm: ClienteFormValues = {
  nombre: "",
  whatsapp: "",
  direccion_entrega: "",
  referencia: "",
  observacion: "",
  activo: true,
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100";

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeWhatsapp(value: string) {
  return normalizePhonePe(value);
}

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function getDebtByClient(pedidos: PedidoDeudaRow[]) {
  const debtMap = new Map<string, number>();

  pedidos.forEach((pedido) => {
    if (!pedido.cliente_id || pedido.estado_pago !== "debe") {
      return;
    }

    const saldo = Math.max(0, Number(pedido.total ?? 0) - Number(pedido.monto_a_cuenta ?? 0));
    debtMap.set(pedido.cliente_id, (debtMap.get(pedido.cliente_id) ?? 0) + saldo);
  });

  return debtMap;
}

export function ClienteModule() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pedidos, setPedidos] = useState<PedidoDeudaRow[]>([]);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [clienteForm, setClienteForm] = useState<ClienteFormValues>(emptyClienteForm);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [showDebtOnly, setShowDebtOnly] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCliente, setIsSavingCliente] = useState(false);

  async function loadClientes() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const [clientesResult, pedidosResult] = await Promise.all([
      fetchAllRows<Cliente>(
        supabase.from("clientes").select("*").order("created_at", { ascending: false }),
      ),
      supabase
        .from("pedidos")
        .select("cliente_id,total,monto_a_cuenta,estado_pago")
        .eq("estado_pago", "debe"),
    ]);

    if (clientesResult.error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar clientes: ${clientesResult.error.message}`,
      });
      setClientes([]);
      setIsLoading(false);
      return;
    }

    if (pedidosResult.error) {
      setMessage({
        type: "error",
        text: `No se pudo calcular deuda: ${pedidosResult.error.message}`,
      });
    }

    setClientes((clientesResult.data ?? []) as Cliente[]);
    setPedidos((pedidosResult.data ?? []) as PedidoDeudaRow[]);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadClientes();
  }, []);

  const debtByClient = useMemo(() => getDebtByClient(pedidos), [pedidos]);

  const filteredClientes = useMemo(() => {
    return clientes.filter((cliente) => {
      const deuda = debtByClient.get(cliente.id) ?? 0;
      const matchesEstado =
        estadoFilter === "todos" ||
        (estadoFilter === "activos" && cliente.activo) ||
        (estadoFilter === "inactivos" && !cliente.activo);
      const matchesDebt = showDebtOnly ? deuda > 0 : true;
      const matchesTerm = matchesSearch(search, [
        cliente.nombres,
        cliente.telefono,
        cliente.direccion_entrega,
        cliente.referencia,
      ]);

      return matchesEstado && matchesDebt && matchesTerm;
    });
  }, [clientes, debtByClient, estadoFilter, search, showDebtOnly]);

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

    const phoneCheck = validatePhonePe(whatsapp);
    if (!phoneCheck.ok) {
      setMessage({ type: "error", text: phoneCheck.error });
      return;
    }

    const duplicated = clientes.some(
      (cliente) =>
        normalizeWhatsapp(cliente.telefono ?? "") === whatsapp &&
        cliente.id !== editingCliente?.id,
    );

    if (duplicated) {
      setMessage({ type: "error", text: "Ya existe un cliente con ese WhatsApp." });
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
      text: editingCliente ? "Cliente actualizado correctamente." : "Cliente creado correctamente.",
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
      setMessage({ type: "error", text: `No se pudo cambiar estado: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Estado de cliente actualizado." });
    await loadClientes();
  }

  return (
    <div className="space-y-5">
      {message ? (
        <div
          className={`rounded-lg border p-4 text-sm ${
            message.type === "success"
              ? "border-santa-200 bg-santa-50 text-santa-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-slate-950">
          {editingCliente ? "Editar cliente" : "Nuevo cliente"}
        </h2>
        <form onSubmit={handleSubmitCliente} className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Nombre" required>
              <input
                value={clienteForm.nombre}
                onChange={(event) =>
                  setClienteForm((current) => ({ ...current, nombre: event.target.value }))
                }
                className={inputClassName}
              />
            </Field>
            <Field label="WSP" required>
              <input
                value={clienteForm.whatsapp}
                onChange={(event) =>
                  setClienteForm((current) => ({ ...current, whatsapp: event.target.value }))
                }
                className={inputClassName}
              />
            </Field>
            <Field label="Direccion entrega">
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
                  setClienteForm((current) => ({ ...current, referencia: event.target.value }))
                }
                className={inputClassName}
              />
            </Field>
            <Field label="Observacion">
              <input
                value={clienteForm.observacion}
                onChange={(event) =>
                  setClienteForm((current) => ({ ...current, observacion: event.target.value }))
                }
                className={inputClassName}
              />
            </Field>
            <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700 md:self-end">
              <input
                type="checkbox"
                checked={clienteForm.activo}
                onChange={(event) =>
                  setClienteForm((current) => ({ ...current, activo: event.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300 text-santa-700"
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
              className="h-11 rounded-md bg-santa-700 px-5 text-sm font-semibold text-white hover:bg-santa-800 disabled:bg-slate-300"
            >
              {isSavingCliente ? "Guardando..." : "Guardar cliente"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_120px]">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar"
              className={inputClassName}
            />
            <select
              value={estadoFilter}
              onChange={(event) => setEstadoFilter(event.target.value as EstadoFilter)}
              className={inputClassName}
            >
              <option value="todos">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
            <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showDebtOnly}
                onChange={(event) => setShowDebtOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-santa-700"
              />
              Deuda
            </label>
          </div>
        </div>

        <div className="hidden max-h-[70vh] overflow-auto lg:block">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">WSP</th>
                <th className="px-4 py-3 font-medium">Deuda</th>
                <th className="px-4 py-3 font-medium">Estado</th>
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
                    <td className="px-4 py-3 font-medium text-slate-950">{cliente.nombres}</td>
                    <td className="px-4 py-3 text-slate-600">{cliente.telefono}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {formatMoney(debtByClient.get(cliente.id) ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill active={cliente.activo} />
                    </td>
                    <td className="px-4 py-3">
                      <Actions
                        cliente={cliente}
                        onEdit={startEditCliente}
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
                  <p className="mt-1 text-xs text-slate-500">{cliente.telefono ?? "Sin WSP"}</p>
                </div>
                <StatusPill active={cliente.activo} />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-950">
                Deuda: {formatMoney(debtByClient.get(cliente.id) ?? 0)}
              </p>
              <div className="mt-3">
                <Actions
                  cliente={cliente}
                  onEdit={startEditCliente}
                  onToggle={(item) => void toggleActivo(item)}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Actions({
  cliente,
  onEdit,
  onToggle,
}: {
  cliente: Cliente;
  onEdit: (cliente: Cliente) => void;
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
      <Link
        href={`/clientes/${cliente.id}/pedidos`}
        className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Ver pedidos
      </Link>
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

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}
