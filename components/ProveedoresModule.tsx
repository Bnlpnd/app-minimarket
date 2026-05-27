"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import { normalizePhonePe, validatePhonePe } from "@/lib/validators";
import { Toast } from "@/components/ui/Toast";
import type { Proveedor } from "@/types/database";

type FormValues = {
  nombre: string;
  ruc: string;
  contacto: string;
  telefono: string;
  email: string;
  direccion: string;
  observacion: string;
  activo: boolean;
};

type Message = {
  type: "success" | "error";
  text: string;
};

type EstadoFilter = "todos" | "activos" | "inactivos";

const emptyForm: FormValues = {
  nombre: "",
  ruc: "",
  contacto: "",
  telefono: "",
  email: "",
  direccion: "",
  observacion: "",
  activo: true,
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeRuc(value: string) {
  return value.replace(/\D/g, "");
}

function emptyToNull(value: string) {
  const normalized = normalizeSpaces(value);
  return normalized || null;
}

function formFromProveedor(proveedor: Proveedor): FormValues {
  return {
    nombre: proveedor.nombre,
    ruc: proveedor.ruc ?? "",
    contacto: proveedor.contacto ?? "",
    telefono: proveedor.telefono ?? "",
    email: proveedor.email ?? "",
    direccion: proveedor.direccion ?? "",
    observacion: proveedor.observacion ?? "",
    activo: proveedor.activo,
  };
}

export function ProveedoresModule() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data, error } = await fetchAllRows<Proveedor>(
      supabase
        .from("proveedores")
        .select("*")
        .order("nombre", { ascending: true }),
    );
    setIsLoading(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar proveedores: ${error.message}`,
      });
      return;
    }

    setProveedores(data);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredProveedores = useMemo(() => {
    return proveedores.filter((proveedor) =>
      (estadoFilter === "todos" ||
        (estadoFilter === "activos" && proveedor.activo) ||
        (estadoFilter === "inactivos" && !proveedor.activo)) &&
      matchesSearch(search, [
        proveedor.nombre,
        proveedor.ruc,
        proveedor.contacto,
        proveedor.telefono,
        proveedor.email,
        proveedor.direccion,
      ]),
    );
  }, [estadoFilter, proveedores, search]);

  function updateForm<Key extends keyof FormValues>(
    key: Key,
    value: FormValues[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEdit(proveedor: Proveedor) {
    setEditingId(proveedor.id);
    setForm(formFromProveedor(proveedor));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId("");
    setForm(emptyForm);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion a Supabase.",
      });
      return;
    }

    const nombre = normalizeSpaces(form.nombre);
    const ruc = normalizeRuc(form.ruc);
    const telefono = normalizePhonePe(form.telefono);

    if (!nombre) {
      setMessage({ type: "error", text: "El nombre del proveedor es obligatorio." });
      return;
    }

    if (telefono) {
      const phoneCheck = validatePhonePe(telefono);
      if (!phoneCheck.ok) {
        setMessage({ type: "error", text: phoneCheck.error });
        return;
      }
    }

    const payload = {
      nombre,
      ruc: ruc || null,
      contacto: emptyToNull(form.contacto),
      telefono: telefono || null,
      email: emptyToNull(form.email),
      direccion: emptyToNull(form.direccion),
      observacion: emptyToNull(form.observacion),
      activo: form.activo,
    };

    setIsSaving(true);
    const result = editingId
      ? await supabase.from("proveedores").update(payload).eq("id", editingId)
      : await supabase.from("proveedores").insert(payload);
    setIsSaving(false);

    if (result.error) {
      setMessage({
        type: "error",
        text:
          result.error.code === "23505"
            ? "Ya existe un proveedor con ese nombre o RUC."
            : `No se pudo guardar proveedor: ${result.error.message}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text: editingId ? "Proveedor actualizado." : "Proveedor creado.",
    });
    resetForm();
    await loadData();
  }

  return (
    <div className="space-y-5">
      <Toast message={message} onDismiss={() => setMessage(null)} />

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-slate-950">
            {editingId ? "Editar proveedor" : "Agregar proveedor"}
          </h2>
          <p className="text-sm text-slate-500">
            Guarda datos del distribuidor para comparar costos por producto.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 lg:grid-cols-3">
          <Field label="Nombre" required>
            <input
              value={form.nombre}
              onChange={(event) => updateForm("nombre", event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="RUC">
            <input
              value={form.ruc}
              onChange={(event) => updateForm("ruc", event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Contacto">
            <input
              value={form.contacto}
              onChange={(event) => updateForm("contacto", event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Telefono">
            <input
              value={form.telefono}
              onChange={(event) => updateForm("telefono", event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Direccion">
            <input
              value={form.direccion}
              onChange={(event) => updateForm("direccion", event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Observacion">
            <textarea
              value={form.observacion}
              onChange={(event) => updateForm("observacion", event.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(event) => updateForm("activo", event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-700"
            />
            Activo
          </label>
          <div className="flex gap-2 self-end">
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            ) : null}
            <button
              type="submit"
              disabled={isSaving}
              className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
            >
              {isSaving ? "Guardando..." : editingId ? "Guardar cambios" : "Agregar proveedor"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_320px] lg:items-end">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Proveedores
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {proveedores.length} proveedores registrados.
              </p>
            </div>
            <select
              value={estadoFilter}
              onChange={(event) => setEstadoFilter(event.target.value as EstadoFilter)}
              className={inputClassName}
            >
              <option value="todos">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, RUC o telefono"
              className={inputClassName}
            />
          </div>
        </div>

        <div className="hidden max-h-[70vh] overflow-auto lg:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">RUC</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Telefono</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Cargando proveedores...
                  </td>
                </tr>
              ) : filteredProveedores.length > 0 ? (
                filteredProveedores.map((proveedor) => (
                  <tr key={proveedor.id}>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {proveedor.nombre}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{proveedor.ruc ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{proveedor.contacto ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{proveedor.telefono ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {proveedor.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => startEdit(proveedor)}
                        className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No hay proveedores con ese criterio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 lg:hidden">
          {filteredProveedores.map((proveedor) => (
            <article key={proveedor.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    {proveedor.nombre}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    RUC {proveedor.ruc ?? "-"} - {proveedor.telefono ?? "Sin telefono"}
                  </p>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                  {proveedor.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startEdit(proveedor)}
                className="mt-3 h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
              >
                Editar
              </button>
            </article>
          ))}
        </div>
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
