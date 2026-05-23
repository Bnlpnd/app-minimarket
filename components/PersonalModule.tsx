"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentUserProfile, getStoredAppUser, isAdmin } from "@/lib/authRoles";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type {
  AppUsuario,
  PersonalAsistencia,
  PersonalDescuento,
  PersonalPago,
} from "@/types/database";

type InternalRole = "admin" | "trabajador";
type ActiveTab = "listado" | "pagos";
type WorkerAction = "asistencia" | "descuento" | "pago";

type UsuarioInterno = Omit<AppUsuario, "rol"> & {
  rol: InternalRole;
};

type UserForm = {
  email: string;
  password: string;
  rol: InternalRole;
  nombres: string;
  apellidos: string;
  telefono: string;
  pago_hora: string;
  horas_semana: string;
  horario_laboral: string;
};

type DetailForm = Omit<UserForm, "password"> & {
  activo: boolean;
};

type AttendanceForm = {
  fecha: string;
  hora_ingreso: string;
  hora_salida: string;
  productividad: "1" | "2" | "3";
  observacion: string;
};

type DiscountForm = {
  fecha: string;
  detalle: string;
  monto: string;
};

type Message = {
  type: "success" | "error";
  text: string;
};

const workerRoles: InternalRole[] = ["trabajador", "admin"];

const emptyForm: UserForm = {
  email: "",
  password: "",
  rol: "trabajador",
  nombres: "",
  apellidos: "",
  telefono: "",
  pago_hora: "0.00",
  horas_semana: "0",
  horario_laboral: "",
};

const emptyAttendanceForm: AttendanceForm = {
  fecha: todayInput(),
  hora_ingreso: "",
  hora_salida: "",
  productividad: "2",
  observacion: "",
};

const emptyDiscountForm: DiscountForm = {
  fecha: todayInput(),
  detalle: "",
  monto: "",
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseMoney(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function todayInput() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function getWeekRange(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: toInputDate(start),
    end: toInputDate(end),
    label: `${formatDateText(toInputDate(start))} - ${formatDateText(toInputDate(end))}`,
  };
}

function toInputDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatDateText(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

function formatTimeText(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "-";
}

function numberValue(value: number | null | undefined) {
  return Number(value ?? 0);
}

function getFullName(usuario: Pick<UsuarioInterno, "nombres" | "apellidos">) {
  return `${usuario.nombres ?? ""} ${usuario.apellidos ?? ""}`.trim();
}

function hoursBetween(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) {
    return 0;
  }

  const [startHours, startMinutes] = start.split(":").map(Number);
  const [endHours, endMinutes] = end.split(":").map(Number);
  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;

  if (!Number.isFinite(startTotal) || !Number.isFinite(endTotal) || endTotal <= startTotal) {
    return 0;
  }

  return (endTotal - startTotal) / 60;
}

function workerWeekHours(workerId: string, asistencias: PersonalAsistencia[]) {
  return asistencias
    .filter((item) => item.usuario_id === workerId)
    .reduce((total, item) => total + hoursBetween(item.hora_ingreso, item.hora_salida), 0);
}

function workerWeekDiscounts(workerId: string, descuentos: PersonalDescuento[]) {
  return descuentos
    .filter((item) => item.usuario_id === workerId)
    .reduce((total, item) => total + numberValue(item.monto), 0);
}

function getPaySummary(worker: UsuarioInterno, asistencias: PersonalAsistencia[], descuentos: PersonalDescuento[]) {
  const registeredHours = workerWeekHours(worker.id, asistencias);
  const hoursForPay = registeredHours > 0 ? registeredHours : numberValue(worker.horas_semana);
  const discountTotal = workerWeekDiscounts(worker.id, descuentos);
  const amount = Math.max(0, hoursForPay * numberValue(worker.pago_hora) - discountTotal);

  return {
    registeredHours,
    hoursForPay,
    discountTotal,
    amount,
  };
}

function getInitialTab(): ActiveTab {
  if (typeof window === "undefined") return "listado";
  const param = new URLSearchParams(window.location.search).get("tab");
  if (param === "pago") return "pagos";
  return "listado";
}

export function PersonalModule() {
  const [tab, setTab] = useState<ActiveTab>(getInitialTab);
  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);
  const [asistencias, setAsistencias] = useState<PersonalAsistencia[]>([]);
  const [descuentos, setDescuentos] = useState<PersonalDescuento[]>([]);
  const [pagos, setPagos] = useState<PersonalPago[]>([]);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [detailForm, setDetailForm] = useState<DetailForm | null>(null);
  const [attendanceForm, setAttendanceForm] = useState<AttendanceForm>(emptyAttendanceForm);
  const [discountForm, setDiscountForm] = useState<DiscountForm>(emptyDiscountForm);
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"todos" | InternalRole>("todos");
  const [message, setMessage] = useState<Message | null>(null);
  const [selectedUser, setSelectedUser] = useState<UsuarioInterno | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [workerAction, setWorkerAction] = useState<WorkerAction>("asistencia");
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const week = useMemo(() => getWeekRange(), []);

  async function checkAccessAndLoad() {
    const { profile } = await getCurrentUserProfile();
    const session = getStoredAppUser();

    if (!session) {
      setHasAdminAccess(false);
      setIsCheckingAccess(false);
      return;
    }

    const adminAccess = isAdmin(profile);
    setHasAdminAccess(adminAccess);
    setIsCheckingAccess(false);

    if (adminAccess) {
      await loadData();
    }
  }

  async function loadData() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "No hay conexion a Supabase." });
      return;
    }

    setIsLoading(true);

    const [{ data: usersData, error: usersError }, { data: asistenciasData }, { data: descuentosData }, { data: pagosData }] =
      await Promise.all([
        supabase
          .from("app_usuarios")
          .select(
            "id,email,rol,nombres,apellidos,telefono,pago_hora,horas_semana,gastos_semana,horario_laboral,activo,created_at,updated_at",
          )
          .in("rol", ["admin", "trabajador"])
          .order("created_at", { ascending: false }),
        supabase
          .from("personal_asistencias")
          .select("*")
          .gte("fecha", week.start)
          .lte("fecha", week.end)
          .order("fecha", { ascending: false }),
        supabase
          .from("personal_descuentos")
          .select("*")
          .gte("fecha", week.start)
          .lte("fecha", week.end)
          .order("fecha", { ascending: false }),
        supabase
          .from("personal_pagos")
          .select("*")
          .eq("semana_inicio", week.start)
          .order("created_at", { ascending: false }),
      ]);

    setIsLoading(false);

    if (usersError) {
      setMessage({ type: "error", text: `No se pudo cargar personal: ${usersError.message}` });
      return;
    }

    const internalUsers = (usersData ?? []) as UsuarioInterno[];
    setUsuarios(internalUsers);
    setAsistencias((asistenciasData ?? []) as PersonalAsistencia[]);
    setDescuentos((descuentosData ?? []) as PersonalDescuento[]);
    setPagos((pagosData ?? []) as PersonalPago[]);

    if (!selectedWorkerId) {
      const firstWorker = internalUsers.find((user) => user.rol === "trabajador" && user.activo);
      setSelectedWorkerId(firstWorker?.id ?? null);
    }
  }

  useEffect(() => {
    void checkAccessAndLoad();
  }, []);

  const filteredUsuarios = useMemo(() => {
    const term = normalizeSpaces(search).toLowerCase();

    return usuarios.filter((usuario) => {
      const matchesRole = roleFilter === "todos" || usuario.rol === roleFilter;
      const matchesSearch =
        !term ||
        `${usuario.email} ${usuario.nombres} ${usuario.apellidos ?? ""} ${usuario.telefono ?? ""}`
          .toLowerCase()
          .includes(term);

      return matchesRole && matchesSearch;
    });
  }, [roleFilter, search, usuarios]);

  const activeWorkers = useMemo(
    () => usuarios.filter((usuario) => usuario.rol === "trabajador" && usuario.activo),
    [usuarios],
  );

  const selectedWorker = useMemo(
    () => activeWorkers.find((worker) => worker.id === selectedWorkerId) ?? activeWorkers[0] ?? null,
    [activeWorkers, selectedWorkerId],
  );

  function openDetail(usuario: UsuarioInterno) {
    setSelectedUser(usuario);
    setDetailForm({
      email: usuario.email,
      rol: usuario.rol,
      nombres: usuario.nombres,
      apellidos: usuario.apellidos ?? "",
      telefono: usuario.telefono ?? "",
      pago_hora: String(numberValue(usuario.pago_hora).toFixed(2)),
      horas_semana: String(numberValue(usuario.horas_semana)),
      horario_laboral: usuario.horario_laboral ?? "",
      activo: usuario.activo,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "No hay conexion a Supabase." });
      return;
    }

    const admin = getStoredAppUser();
    const email = normalizeSpaces(form.email).toLowerCase();
    const password = form.password;
    const nombres = normalizeSpaces(form.nombres);
    const pagoHora = parseMoney(form.pago_hora);
    const horasSemana = parseMoney(form.horas_semana);

    if (!admin) {
      setMessage({ type: "error", text: "Sesion admin no encontrada." });
      return;
    }

    if (!email || !password || !nombres) {
      setMessage({ type: "error", text: "Correo, clave inicial y nombres son obligatorios." });
      return;
    }

    if (pagoHora === null || horasSemana === null) {
      setMessage({ type: "error", text: "Pago por hora y horas por semana deben ser numeros positivos." });
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
      p_gastos_semana: 0,
      p_horario_laboral: normalizeSpaces(form.horario_laboral) || null,
    });

    setIsSaving(false);

    if (error) {
      setMessage({ type: "error", text: `No se pudo registrar trabajador: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Trabajador registrado correctamente." });
    setForm(emptyForm);
    await loadData();
  }

  async function saveDetail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedUser || !detailForm) {
      return;
    }

    const nombres = normalizeSpaces(detailForm.nombres);
    const pagoHora = parseMoney(detailForm.pago_hora);
    const horasSemana = parseMoney(detailForm.horas_semana);

    if (!nombres) {
      setMessage({ type: "error", text: "El nombre es obligatorio." });
      return;
    }

    if (pagoHora === null || horasSemana === null) {
      setMessage({ type: "error", text: "Pago por hora y horas por semana deben ser numeros positivos." });
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from("app_usuarios")
      .update({
        rol: detailForm.rol,
        nombres,
        apellidos: normalizeSpaces(detailForm.apellidos) || null,
        telefono: normalizeSpaces(detailForm.telefono) || null,
        pago_hora: pagoHora,
        horas_semana: horasSemana,
        horario_laboral: normalizeSpaces(detailForm.horario_laboral) || null,
        activo: detailForm.activo,
      })
      .eq("id", selectedUser.id);
    setIsSaving(false);

    if (error) {
      setMessage({ type: "error", text: `No se pudo actualizar trabajador: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Detalle actualizado." });
    await loadData();
  }

  async function toggleActivo(usuario: UsuarioInterno) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase
      .from("app_usuarios")
      .update({ activo: !usuario.activo })
      .eq("id", usuario.id);

    if (error) {
      setMessage({ type: "error", text: `No se pudo actualizar estado: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Estado actualizado." });
    await loadData();
  }

  function selectWorkerAction(worker: UsuarioInterno, action: WorkerAction) {
    setSelectedWorkerId(worker.id);
    setWorkerAction(action);
    setEditingDiscountId(null);
    setDiscountForm(emptyDiscountForm);

    const existingAttendance = asistencias.find(
      (item) => item.usuario_id === worker.id && item.fecha === todayInput(),
    );
    setAttendanceForm(
      existingAttendance
        ? {
            fecha: existingAttendance.fecha,
            hora_ingreso: existingAttendance.hora_ingreso?.slice(0, 5) ?? "",
            hora_salida: existingAttendance.hora_salida?.slice(0, 5) ?? "",
            productividad: String(existingAttendance.productividad) as AttendanceForm["productividad"],
            observacion: existingAttendance.observacion ?? "",
          }
        : emptyAttendanceForm,
    );
  }

  async function saveAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedWorker) {
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.from("personal_asistencias").upsert(
      {
        usuario_id: selectedWorker.id,
        fecha: attendanceForm.fecha,
        hora_ingreso: attendanceForm.hora_ingreso || null,
        hora_salida: attendanceForm.hora_salida || null,
        productividad: Number(attendanceForm.productividad),
        observacion: normalizeSpaces(attendanceForm.observacion) || null,
      },
      { onConflict: "usuario_id,fecha" },
    );
    setIsSaving(false);

    if (error) {
      setMessage({ type: "error", text: `No se pudo guardar asistencia: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Asistencia registrada." });
    await loadData();
  }

  async function saveDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedWorker) {
      return;
    }

    const monto = parseMoney(discountForm.monto);
    const detalle = normalizeSpaces(discountForm.detalle);

    if (!detalle || monto === null) {
      setMessage({ type: "error", text: "Detalle y monto son obligatorios." });
      return;
    }

    setIsSaving(true);
    const payload = {
      usuario_id: selectedWorker.id,
      fecha: discountForm.fecha,
      detalle,
      monto,
    };
    const result = editingDiscountId
      ? await supabase.from("personal_descuentos").update(payload).eq("id", editingDiscountId)
      : await supabase.from("personal_descuentos").insert(payload);
    setIsSaving(false);

    if (result.error) {
      setMessage({ type: "error", text: `No se pudo guardar descuento: ${result.error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Descuento registrado." });
    setDiscountForm(emptyDiscountForm);
    setEditingDiscountId(null);
    await loadData();
  }

  async function registerWeeklyPayment() {
    if (!supabase || !selectedWorker) {
      return;
    }

    const summary = getPaySummary(selectedWorker, asistencias, descuentos);

    setIsSaving(true);
    const { error } = await supabase.from("personal_pagos").upsert(
      {
        usuario_id: selectedWorker.id,
        semana_inicio: week.start,
        semana_fin: week.end,
        horas_trabajadas: summary.hoursForPay,
        pago_hora: numberValue(selectedWorker.pago_hora),
        descuentos: summary.discountTotal,
        monto_pagado: summary.amount,
        estado: "pagado",
      },
      { onConflict: "usuario_id,semana_inicio" },
    );
    setIsSaving(false);

    if (error) {
      setMessage({ type: "error", text: `No se pudo registrar pago: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Pago semanal registrado." });
    await loadData();
  }

  if (isCheckingAccess) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Verificando permisos...
      </section>
    );
  }

  if (!getStoredAppUser()) {
    return (
      <AccessBox
        title="Acceso restringido"
        text="Debes iniciar sesion para administrar usuarios y roles."
      />
    );
  }

  if (!hasAdminAccess) {
    return (
      <AccessBox
        title="Solo administrador"
        text="Este modulo administra trabajadores, roles, asistencia, descuentos y pagos semanales."
      />
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

      <section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <TabButton active={tab === "listado"} onClick={() => setTab("listado")}>
            Listado interno
          </TabButton>
          <TabButton active={tab === "pagos"} onClick={() => setTab("pagos")}>
            Pago semanal
          </TabButton>
        </div>
      </section>

      {tab === "listado" ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-semibold text-slate-950">Registrar trabajador</h2>
            <form onSubmit={handleSubmit} className="mt-4 grid gap-4 lg:grid-cols-3">
              <Field label="Correo" required>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Clave inicial" required>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Rol" required>
                <select
                  value={form.rol}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, rol: event.target.value as InternalRole }))
                  }
                  className={inputClassName}
                >
                  {workerRoles.map((rol) => (
                    <option key={rol} value={rol}>
                      {rol}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombres" required>
                <input
                  value={form.nombres}
                  onChange={(event) => setForm((current) => ({ ...current, nombres: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Apellidos">
                <input
                  value={form.apellidos}
                  onChange={(event) => setForm((current) => ({ ...current, apellidos: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Telefono">
                <input
                  value={form.telefono}
                  onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Pago por hora">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.pago_hora}
                  onChange={(event) => setForm((current) => ({ ...current, pago_hora: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Horas por semana">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.horas_semana}
                  onChange={(event) => setForm((current) => ({ ...current, horas_semana: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Horario laboral">
                <input
                  value={form.horario_laboral}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, horario_laboral: event.target.value }))
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
              <div className="grid gap-3 lg:grid-cols-[1fr_180px_280px] lg:items-end">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">Usuarios registrados</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Gestiona solo personal interno: administradores y trabajadores.
                  </p>
                </div>
                <Field label="Filtro: Rol">
                  <select
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value as "todos" | InternalRole)}
                    className={inputClassName}
                  >
                    <option value="todos">Todos</option>
                    <option value="trabajador">Trabajador</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
                <Field label="Buscar">
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar usuario"
                    className={inputClassName}
                  />
                </Field>
              </div>
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[960px] text-left text-sm">
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
                        Cargando personal...
                      </td>
                    </tr>
                  ) : filteredUsuarios.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No hay usuarios internos para mostrar.
                      </td>
                    </tr>
                  ) : (
                    filteredUsuarios.map((usuario) => {
                      const summary = getPaySummary(usuario, asistencias, descuentos);

                      return (
                        <tr key={usuario.id}>
                          <td className="px-4 py-3 font-medium text-slate-950">{usuario.email}</td>
                          <td className="px-4 py-3 text-slate-600">{getFullName(usuario)}</td>
                          <td className="px-4 py-3 text-slate-600">{usuario.telefono ?? "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{usuario.rol}</td>
                          <td className="px-4 py-3 text-slate-600">S/ {summary.amount.toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <StatusPill active={usuario.activo} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void toggleActivo(usuario)}
                                className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700"
                              >
                                {usuario.activo ? "Desactivar" : "Activar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => openDetail(usuario)}
                                className="h-9 rounded-md border border-slate-900 px-3 text-xs font-medium text-slate-950"
                              >
                                Detalle
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 lg:hidden">
              {filteredUsuarios.map((usuario) => {
                const summary = getPaySummary(usuario, asistencias, descuentos);

                return (
                  <article key={usuario.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-950">{getFullName(usuario)}</h3>
                        <p className="mt-1 text-xs text-slate-500">{usuario.email}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {usuario.rol} - {usuario.telefono ?? "Sin telefono"}
                        </p>
                      </div>
                      <StatusPill active={usuario.activo} />
                    </div>
                    <p className="mt-3 text-sm text-slate-700">Pago semanal: S/ {summary.amount.toFixed(2)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleActivo(usuario)}
                        className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
                      >
                        {usuario.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDetail(usuario)}
                        className="h-10 rounded-md border border-slate-900 px-3 text-sm font-medium text-slate-950"
                      >
                        Detalle
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {selectedUser && detailForm ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">Detalle del trabajador</h2>
                  <p className="text-sm text-slate-500">{selectedUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setDetailForm(null);
                  }}
                  className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
                >
                  Cerrar
                </button>
              </div>
              <form onSubmit={saveDetail} className="mt-4 grid gap-4 lg:grid-cols-3">
                <Field label="Rol">
                  <select
                    value={detailForm.rol}
                    onChange={(event) =>
                      setDetailForm((current) =>
                        current ? { ...current, rol: event.target.value as InternalRole } : current,
                      )
                    }
                    className={inputClassName}
                  >
                    {workerRoles.map((rol) => (
                      <option key={rol} value={rol}>
                        {rol}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nombres" required>
                  <input
                    value={detailForm.nombres}
                    onChange={(event) =>
                      setDetailForm((current) => (current ? { ...current, nombres: event.target.value } : current))
                    }
                    className={inputClassName}
                  />
                </Field>
                <Field label="Apellidos">
                  <input
                    value={detailForm.apellidos}
                    onChange={(event) =>
                      setDetailForm((current) => (current ? { ...current, apellidos: event.target.value } : current))
                    }
                    className={inputClassName}
                  />
                </Field>
                <Field label="Telefono">
                  <input
                    value={detailForm.telefono}
                    onChange={(event) =>
                      setDetailForm((current) => (current ? { ...current, telefono: event.target.value } : current))
                    }
                    className={inputClassName}
                  />
                </Field>
                <Field label="Pago por hora">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={detailForm.pago_hora}
                    onChange={(event) =>
                      setDetailForm((current) => (current ? { ...current, pago_hora: event.target.value } : current))
                    }
                    className={inputClassName}
                  />
                </Field>
                <Field label="Horas por semana">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={detailForm.horas_semana}
                    onChange={(event) =>
                      setDetailForm((current) => (current ? { ...current, horas_semana: event.target.value } : current))
                    }
                    className={inputClassName}
                  />
                </Field>
                <Field label="Horario laboral">
                  <input
                    value={detailForm.horario_laboral}
                    onChange={(event) =>
                      setDetailForm((current) =>
                        current ? { ...current, horario_laboral: event.target.value } : current,
                      )
                    }
                    className={inputClassName}
                  />
                </Field>
                <label className="flex h-11 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={detailForm.activo}
                    onChange={(event) =>
                      setDetailForm((current) => (current ? { ...current, activo: event.target.checked } : current))
                    }
                  />
                  Activo
                </label>
                <div className="lg:col-span-3">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="h-11 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
                  >
                    {isSaving ? "Guardando..." : "Guardar detalle"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}
        </>
      ) : (
        <WeeklyPaySection
          activeWorkers={activeWorkers}
          selectedWorker={selectedWorker}
          workerAction={workerAction}
          asistencias={asistencias}
          descuentos={descuentos}
          pagos={pagos}
          week={week}
          attendanceForm={attendanceForm}
          discountForm={discountForm}
          editingDiscountId={editingDiscountId}
          isSaving={isSaving}
          onSelectAction={selectWorkerAction}
          onAttendanceChange={(key, value) =>
            setAttendanceForm((current) => ({ ...current, [key]: value }))
          }
          onDiscountChange={(key, value) =>
            setDiscountForm((current) => ({ ...current, [key]: value }))
          }
          onSaveAttendance={saveAttendance}
          onSaveDiscount={saveDiscount}
          onEditDiscount={(item) => {
            setEditingDiscountId(item.id);
            setWorkerAction("descuento");
            setDiscountForm({
              fecha: item.fecha,
              detalle: item.detalle,
              monto: String(numberValue(item.monto).toFixed(2)),
            });
          }}
          onRegisterPayment={() => void registerWeeklyPayment()}
        />
      )}
    </div>
  );
}

function WeeklyPaySection({
  activeWorkers,
  selectedWorker,
  workerAction,
  asistencias,
  descuentos,
  pagos,
  week,
  attendanceForm,
  discountForm,
  editingDiscountId,
  isSaving,
  onSelectAction,
  onAttendanceChange,
  onDiscountChange,
  onSaveAttendance,
  onSaveDiscount,
  onEditDiscount,
  onRegisterPayment,
}: {
  activeWorkers: UsuarioInterno[];
  selectedWorker: UsuarioInterno | null;
  workerAction: WorkerAction;
  asistencias: PersonalAsistencia[];
  descuentos: PersonalDescuento[];
  pagos: PersonalPago[];
  week: ReturnType<typeof getWeekRange>;
  attendanceForm: AttendanceForm;
  discountForm: DiscountForm;
  editingDiscountId: string | null;
  isSaving: boolean;
  onSelectAction: (worker: UsuarioInterno, action: WorkerAction) => void;
  onAttendanceChange: (key: keyof AttendanceForm, value: string) => void;
  onDiscountChange: (key: keyof DiscountForm, value: string) => void;
  onSaveAttendance: (event: FormEvent<HTMLFormElement>) => void;
  onSaveDiscount: (event: FormEvent<HTMLFormElement>) => void;
  onEditDiscount: (item: PersonalDescuento) => void;
  onRegisterPayment: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-950">Trabajadores activos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Semana {week.label}. El pago usa horas registradas; si aun no hay asistencia, usa horas por semana.
          </p>
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Pago por hora</th>
                <th className="px-4 py-3 font-medium">Pago semanal</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeWorkers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No hay trabajadores activos.
                  </td>
                </tr>
              ) : (
                activeWorkers.map((worker) => {
                  const summary = getPaySummary(worker, asistencias, descuentos);

                  return (
                    <tr key={worker.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-950">{getFullName(worker)}</p>
                        <p className="text-xs text-slate-500">{worker.horario_laboral || "Sin horario"}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">S/ {numberValue(worker.pago_hora).toFixed(2)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-950">S/ {summary.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <ActionButton onClick={() => onSelectAction(worker, "asistencia")}>Asistencia</ActionButton>
                          <ActionButton onClick={() => onSelectAction(worker, "descuento")}>Descuento</ActionButton>
                          <ActionButton onClick={() => onSelectAction(worker, "pago")}>Pago</ActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 p-4 lg:hidden">
          {activeWorkers.map((worker) => {
            const summary = getPaySummary(worker, asistencias, descuentos);

            return (
              <article key={worker.id} className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-950">{getFullName(worker)}</h3>
                <p className="mt-1 text-xs text-slate-500">{worker.horario_laboral || "Sin horario"}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Pago por hora</p>
                    <p className="font-semibold text-slate-950">S/ {numberValue(worker.pago_hora).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Pago semanal</p>
                    <p className="font-semibold text-slate-950">S/ {summary.amount.toFixed(2)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton onClick={() => onSelectAction(worker, "asistencia")}>Asistencia</ActionButton>
                  <ActionButton onClick={() => onSelectAction(worker, "descuento")}>Descuento</ActionButton>
                  <ActionButton onClick={() => onSelectAction(worker, "pago")}>Pago</ActionButton>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selectedWorker ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-slate-950">{getFullName(selectedWorker)}</h2>
            <p className="text-sm text-slate-500">
              {workerAction === "asistencia"
                ? "Registro de asistencia y productividad diaria."
                : workerAction === "descuento"
                  ? "Registro de descuentos semanales."
                  : "Resumen de pago de la semana."}
            </p>
          </div>

          {workerAction === "asistencia" ? (
            <AttendanceBlock
              worker={selectedWorker}
              form={attendanceForm}
              asistencias={asistencias.filter((item) => item.usuario_id === selectedWorker.id)}
              isSaving={isSaving}
              onChange={onAttendanceChange}
              onSubmit={onSaveAttendance}
            />
          ) : null}

          {workerAction === "descuento" ? (
            <DiscountBlock
              form={discountForm}
              descuentos={descuentos.filter((item) => item.usuario_id === selectedWorker.id)}
              editingDiscountId={editingDiscountId}
              isSaving={isSaving}
              onChange={onDiscountChange}
              onSubmit={onSaveDiscount}
              onEdit={onEditDiscount}
            />
          ) : null}

          {workerAction === "pago" ? (
            <PaymentBlock
              worker={selectedWorker}
              asistencias={asistencias}
              descuentos={descuentos}
              pagos={pagos}
              week={week}
              isSaving={isSaving}
              onRegisterPayment={onRegisterPayment}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function AttendanceBlock({
  form,
  asistencias,
  isSaving,
  onChange,
  onSubmit,
}: {
  worker: UsuarioInterno;
  form: AttendanceForm;
  asistencias: PersonalAsistencia[];
  isSaving: boolean;
  onChange: (key: keyof AttendanceForm, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-200 p-4">
        <Field label="Fecha">
          <input
            type="date"
            value={form.fecha}
            onChange={(event) => onChange("fecha", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ingreso">
            <input
              type="time"
              value={form.hora_ingreso}
              onChange={(event) => onChange("hora_ingreso", event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Salida">
            <input
              type="time"
              value={form.hora_salida}
              onChange={(event) => onChange("hora_salida", event.target.value)}
              className={inputClassName}
            />
          </Field>
        </div>
        <Field label="Productividad">
          <select
            value={form.productividad}
            onChange={(event) => onChange("productividad", event.target.value)}
            className={inputClassName}
          >
            <option value="1">1 - No la dio</option>
            <option value="2">2 - Normal</option>
            <option value="3">3 - Extra</option>
          </select>
        </Field>
        <Field label="Observacion">
          <textarea
            value={form.observacion}
            onChange={(event) => onChange("observacion", event.target.value)}
            className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
        </Field>
        <button
          type="submit"
          disabled={isSaving}
          className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
        >
          {isSaving ? "Guardando..." : "Registrar"}
        </button>
      </form>

      <HistoryList title="Asistencia de la semana">
        {asistencias.length === 0 ? (
          <p className="text-sm text-slate-500">Sin registros esta semana.</p>
        ) : (
          asistencias.map((item) => (
            <div key={item.id} className="grid gap-1 border-b border-slate-100 py-3 text-sm last:border-0 sm:grid-cols-4">
              <span className="font-medium text-slate-950">{formatDateText(item.fecha)}</span>
              <span className="text-slate-600">
                {formatTimeText(item.hora_ingreso)} - {formatTimeText(item.hora_salida)}
              </span>
              <span className="text-slate-600">Prod. {item.productividad}</span>
              <span className="text-slate-500">{item.observacion || "-"}</span>
            </div>
          ))
        )}
      </HistoryList>
    </div>
  );
}

function DiscountBlock({
  form,
  descuentos,
  editingDiscountId,
  isSaving,
  onChange,
  onSubmit,
  onEdit,
}: {
  form: DiscountForm;
  descuentos: PersonalDescuento[];
  editingDiscountId: string | null;
  isSaving: boolean;
  onChange: (key: keyof DiscountForm, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (item: PersonalDescuento) => void;
}) {
  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-200 p-4">
        <Field label="Fecha">
          <input
            type="date"
            value={form.fecha}
            onChange={(event) => onChange("fecha", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Detalle">
          <input
            value={form.detalle}
            onChange={(event) => onChange("detalle", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Monto">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.monto}
            onChange={(event) => onChange("monto", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <button
          type="submit"
          disabled={isSaving}
          className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
        >
          {isSaving ? "Guardando..." : editingDiscountId ? "Actualizar" : "Guardar"}
        </button>
      </form>

      <HistoryList title="Lista de descuentos">
        {descuentos.length === 0 ? (
          <p className="text-sm text-slate-500">Sin descuentos esta semana.</p>
        ) : (
          descuentos.map((item) => (
            <div
              key={item.id}
              className="grid gap-2 border-b border-slate-100 py-3 text-sm last:border-0 sm:grid-cols-[120px_1fr_100px_90px] sm:items-center"
            >
              <span className="font-medium text-slate-950">{formatDateText(item.fecha)}</span>
              <span className="text-slate-600">{item.detalle}</span>
              <span className="font-semibold text-slate-950">S/ {numberValue(item.monto).toFixed(2)}</span>
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700"
              >
                Editar
              </button>
            </div>
          ))
        )}
      </HistoryList>
    </div>
  );
}

function PaymentBlock({
  worker,
  asistencias,
  descuentos,
  pagos,
  week,
  isSaving,
  onRegisterPayment,
}: {
  worker: UsuarioInterno;
  asistencias: PersonalAsistencia[];
  descuentos: PersonalDescuento[];
  pagos: PersonalPago[];
  week: ReturnType<typeof getWeekRange>;
  isSaving: boolean;
  onRegisterPayment: () => void;
}) {
  const summary = getPaySummary(worker, asistencias, descuentos);
  const payment = pagos.find((item) => item.usuario_id === worker.id && item.semana_inicio === week.start);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-5">
      <Metric label="Semana" value={week.label} />
      <Metric label="Pago x hora" value={`S/ ${numberValue(worker.pago_hora).toFixed(2)}`} />
      <Metric label="Horas trabajadas" value={summary.hoursForPay.toFixed(2)} />
      <Metric label="Descuentos semana" value={`S/ ${summary.discountTotal.toFixed(2)}`} />
      <Metric label="Monto a pagar" value={`S/ ${summary.amount.toFixed(2)}`} strong />
      <div className="lg:col-span-5">
        <button
          type="button"
          disabled={isSaving}
          onClick={onRegisterPayment}
          className="h-11 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
        >
          {isSaving ? "Guardando..." : payment ? "Actualizar pago" : "Registrar pago"}
        </button>
        {payment ? (
          <p className="mt-2 text-sm text-emerald-700">
            Pago registrado: S/ {numberValue(payment.monto_pagado).toFixed(2)}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AccessBox({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
      <h2 className="text-base font-semibold text-amber-950">{title}</h2>
      <p className="mt-2">{text}</p>
      <a
        href="/login"
        className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
      >
        Ir al login
      </a>
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 rounded-md px-4 text-sm font-semibold ${
        active ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:border-slate-900 hover:text-slate-950"
    >
      {children}
    </button>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
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
    <span
      className={`rounded-md px-2 py-1 text-xs font-medium ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function HistoryList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className={`mt-2 text-lg ${strong ? "font-bold text-slate-950" : "font-semibold text-slate-800"}`}>
        {value}
      </p>
    </div>
  );
}
