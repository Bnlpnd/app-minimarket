"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { getCurrentUserProfile, getStoredAppUser, isAdmin } from "@/lib/authRoles";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";

type UsuarioApp = {
  id: string;
  email: string;
  rol: "admin" | "trabajador" | "cliente";
  nombres: string;
  apellidos: string | null;
  telefono: string | null;
  pago_hora: number;
  horas_semana: number;
  gastos_semana: number;
  activo: boolean;
  created_at: string;
};

type FormValues = {
  email: string;
  password: string;
  rol: "admin" | "trabajador" | "cliente";
  nombres: string;
  apellidos: string;
  telefono: string;
  pago_hora: string;
  horas_semana: string;
  gastos_semana: string;
};

type PayForm = {
  pago_hora: string;
  horas_semana: string;
  gastos_semana: string;
};

type Message = {
  type: "success" | "error";
  text: string;
};

const roles: Array<FormValues["rol"]> = ["admin", "trabajador", "cliente"];

const emptyForm: FormValues = {
  email: "",
  password: "",
  rol: "trabajador",
  nombres: "",
  apellidos: "",
  telefono: "",
  pago_hora: "0.00",
  horas_semana: "0",
  gastos_semana: "0.00",
};

const emptyPayForm: PayForm = {
  pago_hora: "0.00",
  horas_semana: "0",
  gastos_semana: "0.00",
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function weeklyPay(usuario: Pick<UsuarioApp, "pago_hora" | "horas_semana" | "gastos_semana">) {
  return (
    Number(usuario.pago_hora ?? 0) * Number(usuario.horas_semana ?? 0) -
    Number(usuario.gastos_semana ?? 0)
  );
}

export function PersonalModule() {
  const [usuarios, setUsuarios] = useState<UsuarioApp[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [payForm, setPayForm] = useState<PayForm>(emptyPayForm);
  const [ownUser, setOwnUser] = useState<UsuarioApp | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getStoredAppUser>>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPay, setIsSavingPay] = useState(false);

  async function checkAccessAndLoad() {
    const { profile } = await getCurrentUserProfile();
    const session = getStoredAppUser();
    setCurrentUser(session);

    if (!session) {
      setHasAdminAccess(false);
      setMessage({
        type: "error",
        text: "Debes iniciar sesion para ver esta seccion.",
      });
      setIsCheckingAccess(false);
      return;
    }

    const adminAccess = isAdmin(profile);
    setHasAdminAccess(adminAccess);
    setIsCheckingAccess(false);
    await loadOwnPayroll(session.id);

    if (adminAccess) {
      await loadData();
    }
  }

  async function loadData() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase
      .from("app_usuarios")
      .select(
        "id,email,rol,nombres,apellidos,telefono,pago_hora,horas_semana,gastos_semana,activo,created_at",
      )
      .order("created_at", { ascending: false });
    setIsLoading(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo cargar usuarios: ${error.message}`,
      });
      return;
    }

    setUsuarios((data ?? []) as UsuarioApp[]);
  }

  async function loadOwnPayroll(userId: string) {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("app_usuarios")
      .select(
        "id,email,rol,nombres,apellidos,telefono,pago_hora,horas_semana,gastos_semana,activo,created_at",
      )
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) {
      return;
    }

    const usuario = data as UsuarioApp;
    setOwnUser(usuario);
    setPayForm({
      pago_hora: String(Number(usuario.pago_hora ?? 0).toFixed(2)),
      horas_semana: String(Number(usuario.horas_semana ?? 0)),
      gastos_semana: String(Number(usuario.gastos_semana ?? 0).toFixed(2)),
    });
  }

  useEffect(() => {
    void checkAccessAndLoad();
  }, []);

  const filteredUsuarios = useMemo(() => {
    const term = normalizeSpaces(search).toLowerCase();

    if (!term) {
      return usuarios;
    }

    return usuarios.filter((usuario) =>
      `${usuario.email} ${usuario.nombres} ${usuario.apellidos ?? ""} ${
        usuario.telefono ?? ""
      } ${usuario.rol}`
        .toLowerCase()
        .includes(term),
    );
  }, [search, usuarios]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion a Supabase.",
      });
      return;
    }

    const admin = getStoredAppUser();
    const email = normalizeSpaces(form.email).toLowerCase();
    const password = form.password;
    const nombres = normalizeSpaces(form.nombres);
    const pagoHora = parsePositiveNumber(form.pago_hora);
    const horasSemana = parsePositiveNumber(form.horas_semana);
    const gastosSemana = parsePositiveNumber(form.gastos_semana);

    if (!admin) {
      setMessage({ type: "error", text: "Sesion admin no encontrada." });
      return;
    }

    if (!email || !password || !nombres) {
      setMessage({
        type: "error",
        text: "Correo, clave y nombres son obligatorios.",
      });
      return;
    }

    if (pagoHora === null || horasSemana === null || gastosSemana === null) {
      setMessage({
        type: "error",
        text: "Pago por hora, horas y gastos deben ser numeros positivos.",
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc("crear_app_usuario", {
      p_admin_id: admin.id,
      p_email: email,
      p_password: password,
      p_rol: form.rol,
      p_nombres: nombres,
      p_apellidos: normalizeSpaces(form.apellidos) || null,
      p_telefono: normalizeSpaces(form.telefono) || null,
      p_pago_hora: pagoHora,
      p_horas_semana: horasSemana,
      p_gastos_semana: gastosSemana,
    });
    setIsSaving(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo registrar usuario: ${error.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Usuario registrado correctamente." });
    setForm(emptyForm);
    await loadData();
  }

  async function handlePayrollSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !currentUser) {
      return;
    }

    const pagoHora = parsePositiveNumber(payForm.pago_hora);
    const horasSemana = parsePositiveNumber(payForm.horas_semana);
    const gastosSemana = parsePositiveNumber(payForm.gastos_semana);

    if (pagoHora === null || horasSemana === null || gastosSemana === null) {
      setMessage({
        type: "error",
        text: "Pago por hora, horas y gastos deben ser numeros positivos.",
      });
      return;
    }

    setIsSavingPay(true);
    const { error } = await supabase
      .from("app_usuarios")
      .update({
        pago_hora: pagoHora,
        horas_semana: horasSemana,
        gastos_semana: gastosSemana,
      })
      .eq("id", currentUser.id);
    setIsSavingPay(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo actualizar datos de pago: ${error.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Datos de pago actualizados." });
    await loadOwnPayroll(currentUser.id);
    if (hasAdminAccess) {
      await loadData();
    }
  }

  async function toggleActivo(usuario: UsuarioApp) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase
      .from("app_usuarios")
      .update({ activo: !usuario.activo })
      .eq("id", usuario.id);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo actualizar estado: ${error.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Estado actualizado." });
    await loadData();
  }

  if (isCheckingAccess) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Verificando permisos...
      </section>
    );
  }

  if (!currentUser) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <h2 className="text-base font-semibold text-amber-950">Acceso restringido</h2>
        <p className="mt-2">Debes iniciar sesion para ver esta seccion.</p>
        <a
          href="/login"
          className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
        >
          Ir al login
        </a>
      </section>
    );
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

      {ownUser ? (
        <PayrollSection
          ownUser={ownUser}
          payForm={payForm}
          isSavingPay={isSavingPay}
          onChange={(key, value) =>
            setPayForm((current) => ({ ...current, [key]: value }))
          }
          onSubmit={handlePayrollSubmit}
        />
      ) : null}

      {hasAdminAccess ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-semibold text-slate-950">
              Registrar personal o usuario cliente
            </h2>
            <form onSubmit={handleSubmit} className="mt-4 grid gap-4 lg:grid-cols-3">
              <Field label="Correo" required>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className={inputClassName}
                />
              </Field>
              <Field label="Clave inicial" required>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                  className={inputClassName}
                />
              </Field>
              <Field label="Rol" required>
                <select
                  value={form.rol}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      rol: event.target.value as FormValues["rol"],
                    }))
                  }
                  className={inputClassName}
                >
                  {roles.map((rol) => (
                    <option key={rol} value={rol}>
                      {rol}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombres" required>
                <input
                  value={form.nombres}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, nombres: event.target.value }))
                  }
                  className={inputClassName}
                />
              </Field>
              <Field label="Apellidos">
                <input
                  value={form.apellidos}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, apellidos: event.target.value }))
                  }
                  className={inputClassName}
                />
              </Field>
              <Field label="Telefono">
                <input
                  value={form.telefono}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, telefono: event.target.value }))
                  }
                  className={inputClassName}
                />
              </Field>
              <Field label="Pago por hora">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.pago_hora}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, pago_hora: event.target.value }))
                  }
                  className={inputClassName}
                />
              </Field>
              <Field label="Horas por semana">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.horas_semana}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, horas_semana: event.target.value }))
                  }
                  className={inputClassName}
                />
              </Field>
              <Field label="Gastos de la semana">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.gastos_semana}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, gastos_semana: event.target.value }))
                  }
                  className={inputClassName}
                />
              </Field>
              <div className="lg:col-span-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
                >
                  {isSaving ? "Registrando..." : "Registrar usuario"}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    Usuarios registrados
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Gestiona acceso del personal y usuarios cliente.
                  </p>
                </div>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar usuario"
                  className={`${inputClassName} sm:max-w-xs`}
                />
              </div>
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[940px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Correo</th>
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Telefono</th>
                    <th className="px-4 py-3 font-medium">Rol</th>
                    <th className="px-4 py-3 font-medium">Pago semanal</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        Cargando usuarios...
                      </td>
                    </tr>
                  ) : filteredUsuarios.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No hay usuarios para mostrar.
                      </td>
                    </tr>
                  ) : (
                    filteredUsuarios.map((usuario) => (
                      <tr key={usuario.id}>
                        <td className="px-4 py-3 font-medium text-slate-950">
                          {usuario.email}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {`${usuario.nombres ?? ""} ${usuario.apellidos ?? ""}`.trim()}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {usuario.telefono ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{usuario.rol}</td>
                        <td className="px-4 py-3 text-slate-600">
                          S/ {weeklyPay(usuario).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                            {usuario.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void toggleActivo(usuario)}
                            className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700"
                          >
                            {usuario.activo ? "Desactivar" : "Activar"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 lg:hidden">
              {filteredUsuarios.map((usuario) => (
                <article key={usuario.id} className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-950">
                    {usuario.email}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {usuario.rol} - {usuario.nombres} - {usuario.telefono ?? "Sin telefono"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Pago semanal estimado: S/ {weeklyPay(usuario).toFixed(2)}
                  </p>
                  <button
                    type="button"
                    onClick={() => void toggleActivo(usuario)}
                    className="mt-3 h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
                  >
                    {usuario.activo ? "Desactivar" : "Activar"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function PayrollSection({
  ownUser,
  payForm,
  isSavingPay,
  onChange,
  onSubmit,
}: {
  ownUser: UsuarioApp;
  payForm: PayForm;
  isSavingPay: boolean;
  onChange: (key: keyof PayForm, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const pagoSemana =
    Number(payForm.pago_hora || 0) * Number(payForm.horas_semana || 0) -
    Number(payForm.gastos_semana || 0);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-slate-950">
          Datos de pago semanal
        </h2>
        <p className="text-sm text-slate-500">
          {ownUser.nombres} puede actualizar pago por hora, horas semanales y gastos.
        </p>
      </div>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 lg:grid-cols-4">
        <Field label="Pago por hora">
          <input
            type="number"
            min="0"
            step="0.01"
            value={payForm.pago_hora}
            onChange={(event) => onChange("pago_hora", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Horas semana">
          <input
            type="number"
            min="0"
            step="0.01"
            value={payForm.horas_semana}
            onChange={(event) => onChange("horas_semana", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Gastos semana">
          <input
            type="number"
            min="0"
            step="0.01"
            value={payForm.gastos_semana}
            onChange={(event) => onChange("gastos_semana", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Pago estimado</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">
            S/ {pagoSemana.toFixed(2)}
          </p>
        </div>
        <div className="lg:col-span-4">
          <button
            type="submit"
            disabled={isSavingPay}
            className="h-11 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
          >
            {isSavingPay ? "Guardando..." : "Guardar datos de pago"}
          </button>
        </div>
      </form>
    </section>
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
