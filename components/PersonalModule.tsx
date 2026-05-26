"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getCurrentUserProfile, getStoredAppUser, isAdmin } from "@/lib/authRoles";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import { validateHorarioLaboral, validatePhonePe } from "@/lib/validators";
import { calcularPagoSemanal, hoursBetween } from "@/lib/payrollUtils";
import type {
  AppUsuario,
  PersonalAsistencia,
  PersonalDescuento,
  PersonalPago,
  PersonalTurno,
} from "@/types/database";
import { AttendanceWeekBlock } from "@/components/personal/AttendanceWeekBlock";
import { DiscountWeekBlock } from "@/components/personal/DiscountWeekBlock";
import { PaymentHistoryBlock } from "@/components/personal/PaymentHistoryBlock";

type InternalRole = "admin" | "trabajador";
type ActiveTab = "listado" | "pagos";
type WorkerAction = "asistencia" | "descuento" | "pago";
type EstadoFilter = "todos" | "activos" | "inactivos";

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
  bono_asistencia_completa: string;
};

type TurnoFormRow = {
  id: string; // "" si es nuevo
  nombre: string;
  /** "1234560" formato: dia=1 (Lun), 0 (Dom), etc. */
  dias_aplica: number[];
  hora_inicio: string;
  hora_fin: string;
  monto_pago: string;
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

function fechasSemana(startStr: string): string[] {
  const [y, m, d] = startStr.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1);
  return Array.from({ length: 7 }, (_, i) => {
    const next = new Date(start);
    next.setDate(start.getDate() + i);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  });
}

function shiftWeek(startStr: string, deltaWeeks: number): string {
  const [y, m, d] = startStr.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1);
  start.setDate(start.getDate() + deltaWeeks * 7);
  return toInputDate(start);
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

function numberValue(value: number | null | undefined) {
  return Number(value ?? 0);
}

function getFullName(usuario: Pick<UsuarioInterno, "nombres" | "apellidos">) {
  return `${usuario.nombres ?? ""} ${usuario.apellidos ?? ""}`.trim();
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

function getPaySummary(
  worker: UsuarioInterno,
  asistencias: PersonalAsistencia[],
  descuentos: PersonalDescuento[],
  turnos: PersonalTurno[] = [],
  fechasSemana: string[] = [],
) {
  const registeredHours = workerWeekHours(worker.id, asistencias);
  const discountTotal = workerWeekDiscounts(worker.id, descuentos);
  const turnosUsuario = turnos.filter((t) => t.usuario_id === worker.id);

  // Si el trabajador tiene turnos definidos, calculamos con la nueva
  // logica (tarifa hora por turno + bono semana completa). Si no, usamos
  // el fallback historico pago_hora × horas_semana.
  if (turnosUsuario.length > 0 && fechasSemana.length > 0) {
    const asistSemana = asistencias.filter(
      (a) =>
        a.usuario_id === worker.id &&
        a.fecha >= fechasSemana[0] &&
        a.fecha <= fechasSemana[fechasSemana.length - 1],
    );
    const resumen = calcularPagoSemanal({
      asistencias: asistSemana,
      turnos: turnosUsuario,
      pagoHoraGeneral: numberValue(worker.pago_hora),
      bonoSemanaCompleta: numberValue(
        (worker as UsuarioInterno & { bono_asistencia_completa?: number })
          .bono_asistencia_completa,
      ),
      fechasSemana,
    });
    const amount = Math.max(0, resumen.total - discountTotal);
    return {
      registeredHours,
      hoursForPay: resumen.horasTrabajadas,
      discountTotal,
      bonoAplicado: resumen.bonoAplicado,
      amount,
    };
  }

  // Fallback historico cuando no hay turnos definidos.
  const hoursForPay = registeredHours > 0 ? registeredHours : numberValue(worker.horas_semana);
  const amount = Math.max(0, hoursForPay * numberValue(worker.pago_hora) - discountTotal);

  return {
    registeredHours,
    hoursForPay,
    discountTotal,
    bonoAplicado: 0,
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
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ActiveTab>(getInitialTab);
  useEffect(() => {
    const param = searchParams.get("tab");
    if (param === "pago") setTab("pagos");
    else if (param === "listado" || param === "nuevo") setTab("listado");
  }, [searchParams]);
  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);
  const [asistencias, setAsistencias] = useState<PersonalAsistencia[]>([]);
  const [descuentos, setDescuentos] = useState<PersonalDescuento[]>([]);
  const [pagos, setPagos] = useState<PersonalPago[]>([]);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [detailForm, setDetailForm] = useState<DetailForm | null>(null);
  const [turnosForm, setTurnosForm] = useState<TurnoFormRow[]>([]);
  const [turnos, setTurnos] = useState<PersonalTurno[]>([]);
  const [isSavingTurnos, setIsSavingTurnos] = useState(false);
  const [, setAttendanceForm] = useState<AttendanceForm>(emptyAttendanceForm);
  const [discountForm, setDiscountForm] = useState<DiscountForm>(emptyDiscountForm);
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"todos" | InternalRole>("todos");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [message, setMessage] = useState<Message | null>(null);
  const [selectedUser, setSelectedUser] = useState<UsuarioInterno | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [workerAction, setWorkerAction] = useState<WorkerAction>("asistencia");
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [viewingWeekStart, setViewingWeekStart] = useState<string>(getWeekRange().start);
  const [selectedDate, setSelectedDate] = useState<string>(todayInput());
  const [showIngreso, setShowIngreso] = useState(false);
  const [showSalida, setShowSalida] = useState(false);
  const [historyAsistencias, setHistoryAsistencias] = useState<PersonalAsistencia[]>([]);
  const [historyDescuentos, setHistoryDescuentos] = useState<PersonalDescuento[]>([]);
  const [historyPagos, setHistoryPagos] = useState<PersonalPago[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<"semana" | "mes">("semana");
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

    // Compute history range: last 12 weeks for asistencias/descuentos, all pagos.
    const historyStart = shiftWeek(getWeekRange().start, -12);

    const [
      { data: usersData, error: usersError },
      { data: asistenciasData },
      { data: descuentosData },
      { data: pagosData },
      { data: historyAsistenciasData },
      { data: historyDescuentosData },
      { data: historyPagosData },
    ] = await Promise.all([
        fetchAllRows<UsuarioInterno>(
          supabase
            .from("app_usuarios")
            .select(
              "id,email,rol,nombres,apellidos,telefono,pago_hora,horas_semana,gastos_semana,horario_laboral,bono_asistencia_completa,activo,created_at,updated_at",
            )
            .in("rol", ["admin", "trabajador"])
            .order("created_at", { ascending: false }),
        ),
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
        supabase
          .from("personal_asistencias")
          .select("*")
          .gte("fecha", historyStart)
          .order("fecha", { ascending: false }),
        supabase
          .from("personal_descuentos")
          .select("*")
          .gte("fecha", historyStart)
          .order("fecha", { ascending: false }),
        supabase
          .from("personal_pagos")
          .select("*")
          .order("semana_inicio", { ascending: false }),
      ]);

    setIsLoading(false);

    if (usersError) {
      setMessage({ type: "error", text: `No se pudo cargar personal: ${usersError.message}` });
      return;
    }

    const internalUsers = usersData ?? [];
    setUsuarios(internalUsers);
    setAsistencias((asistenciasData ?? []) as PersonalAsistencia[]);
    setDescuentos((descuentosData ?? []) as PersonalDescuento[]);
    setPagos((pagosData ?? []) as PersonalPago[]);
    setHistoryAsistencias((historyAsistenciasData ?? []) as PersonalAsistencia[]);
    setHistoryDescuentos((historyDescuentosData ?? []) as PersonalDescuento[]);
    setHistoryPagos((historyPagosData ?? []) as PersonalPago[]);

    // Cargar TODOS los turnos activos para usar en calculo de pago.
    const { data: turnosData } = await supabase
      .from("personal_turnos")
      .select("*")
      .eq("activo", true);
    setTurnos((turnosData ?? []) as PersonalTurno[]);

    if (!selectedWorkerId) {
      const firstWorker = internalUsers.find((user) => user.rol === "trabajador" && user.activo);
      setSelectedWorkerId(firstWorker?.id ?? null);
    }
  }

  useEffect(() => {
    void checkAccessAndLoad();
  }, []);

  const filteredUsuarios = useMemo(() => {
    return usuarios.filter((usuario) => {
      const matchesRole = roleFilter === "todos" || usuario.rol === roleFilter;
      const matchesEstado =
        estadoFilter === "todos" ||
        (estadoFilter === "activos" && usuario.activo) ||
        (estadoFilter === "inactivos" && !usuario.activo);
      const matchesTerm = matchesSearch(search, [
        usuario.email,
        usuario.nombres,
        usuario.apellidos,
        usuario.telefono,
        usuario.rol,
      ]);

      return matchesRole && matchesEstado && matchesTerm;
    });
  }, [estadoFilter, roleFilter, search, usuarios]);

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
      bono_asistencia_completa: String(
        numberValue((usuario as UsuarioInterno & { bono_asistencia_completa?: number }).bono_asistencia_completa).toFixed(2),
      ),
    });
    void loadTurnosDelUsuario(usuario.id);
  }

  async function loadTurnosDelUsuario(usuarioId: string) {
    if (!supabase) return;
    const { data } = await supabase
      .from("personal_turnos")
      .select("*")
      .eq("usuario_id", usuarioId)
      .order("created_at", { ascending: true });
    const rows: TurnoFormRow[] = ((data ?? []) as PersonalTurno[]).map((t) => ({
      id: t.id,
      nombre: t.nombre,
      dias_aplica: Array.isArray(t.dias_aplica) ? t.dias_aplica : [],
      hora_inicio: (t.hora_inicio ?? "").slice(0, 5),
      hora_fin: (t.hora_fin ?? "").slice(0, 5),
      monto_pago: String(Number(t.monto_pago ?? 0).toFixed(2)),
      activo: t.activo,
    }));
    setTurnosForm(rows);
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

    const telefonoNormalizado = form.telefono ? normalizeSpaces(form.telefono) : "";
    if (telefonoNormalizado) {
      const phoneCheck = validatePhonePe(telefonoNormalizado);
      if (!phoneCheck.ok) {
        setMessage({ type: "error", text: phoneCheck.error });
        return;
      }
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
      p_telefono: telefonoNormalizado || null,
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
    setShowRegisterForm(false);
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

    const telefonoNormalizado = detailForm.telefono ? normalizeSpaces(detailForm.telefono) : "";
    if (telefonoNormalizado) {
      const phoneCheck = validatePhonePe(telefonoNormalizado);
      if (!phoneCheck.ok) {
        setMessage({ type: "error", text: phoneCheck.error });
        return;
      }
    }

    setIsSaving(true);
    const { error } = await supabase
      .from("app_usuarios")
      .update({
        rol: detailForm.rol,
        nombres,
        apellidos: normalizeSpaces(detailForm.apellidos) || null,
        telefono: telefonoNormalizado || null,
        pago_hora: pagoHora,
        horas_semana: horasSemana,
        horario_laboral: normalizeSpaces(detailForm.horario_laboral) || null,
        bono_asistencia_completa: parseMoney(detailForm.bono_asistencia_completa) ?? 0,
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

  async function saveTurnos() {
    if (!supabase || !selectedUser) return;
    setIsSavingTurnos(true);
    // Validar: cada fila no vacia debe tener al menos un dia + horario + monto.
    const validas = turnosForm.filter((t) => t.nombre.trim() && t.dias_aplica.length > 0);
    for (const t of validas) {
      if (!t.hora_inicio || !t.hora_fin || t.hora_fin <= t.hora_inicio) {
        setIsSavingTurnos(false);
        setMessage({
          type: "error",
          text: `Turno "${t.nombre}": horario invalido (fin debe ser mayor que inicio).`,
        });
        return;
      }
      const monto = parseMoney(t.monto_pago);
      if (monto === null || monto < 0) {
        setIsSavingTurnos(false);
        setMessage({ type: "error", text: `Turno "${t.nombre}": monto invalido.` });
        return;
      }
    }

    // Borrar todos los turnos del usuario y reinsertar (mas simple).
    await supabase.from("personal_turnos").delete().eq("usuario_id", selectedUser.id);
    if (validas.length > 0) {
      const payload = validas.map((t) => ({
        usuario_id: selectedUser.id,
        nombre: t.nombre.trim(),
        dias_aplica: t.dias_aplica,
        hora_inicio: t.hora_inicio,
        hora_fin: t.hora_fin,
        monto_pago: parseMoney(t.monto_pago) ?? 0,
        activo: t.activo,
      }));
      const { error } = await supabase.from("personal_turnos").insert(payload);
      if (error) {
        setIsSavingTurnos(false);
        setMessage({ type: "error", text: `No se guardaron turnos: ${error.message}` });
        return;
      }
    }
    setIsSavingTurnos(false);
    setMessage({ type: "success", text: "Turnos guardados." });
    await loadTurnosDelUsuario(selectedUser.id);
  }

  function addTurno() {
    setTurnosForm((current) => [
      ...current,
      { id: "", nombre: "", dias_aplica: [], hora_inicio: "08:00", hora_fin: "18:00", monto_pago: "0", activo: true },
    ]);
  }

  function removeTurno(index: number) {
    setTurnosForm((current) => current.filter((_, i) => i !== index));
  }

  function updateTurno(index: number, patch: Partial<TurnoFormRow>) {
    setTurnosForm((current) => current.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function toggleDiaTurno(index: number, dia: number) {
    setTurnosForm((current) =>
      current.map((t, i) => {
        if (i !== index) return t;
        const dias = t.dias_aplica.includes(dia)
          ? t.dias_aplica.filter((d) => d !== dia)
          : [...t.dias_aplica, dia].sort();
        return { ...t, dias_aplica: dias };
      }),
    );
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

  async function saveIngreso(fecha: string, hora: string, observacion: string) {
    if (!supabase || !selectedWorker) return;
    setMessage(null);
    // Try to preserve hora_salida + productividad if existing record exists
    const existing = historyAsistencias.find(
      (item) => item.usuario_id === selectedWorker.id && item.fecha === fecha,
    );
    // Si ya hay salida registrada, validar que ingreso sea anterior.
    if (hora && existing?.hora_salida) {
      const check = validateHorarioLaboral(hora, existing.hora_salida);
      if (!check.ok) {
        setMessage({ type: "error", text: check.error });
        return;
      }
    }
    setIsSaving(true);
    const { error } = await supabase.from("personal_asistencias").upsert(
      {
        usuario_id: selectedWorker.id,
        fecha,
        hora_ingreso: hora || null,
        hora_salida: existing?.hora_salida ?? null,
        productividad: existing?.productividad ?? 2,
        observacion: normalizeSpaces(observacion) || existing?.observacion || null,
      },
      { onConflict: "usuario_id,fecha" },
    );
    setIsSaving(false);
    if (error) {
      setMessage({ type: "error", text: "No se pudo guardar ingreso: " + error.message });
      return;
    }
    setMessage({ type: "success", text: "Ingreso registrado." });
    setShowIngreso(false);
    await loadData();
  }

  async function saveSalida(fecha: string, hora: string, productividad: number) {
    if (!supabase || !selectedWorker) return;
    setMessage(null);
    const existing = historyAsistencias.find(
      (item) => item.usuario_id === selectedWorker.id && item.fecha === fecha,
    );
    // Validar que salida sea mayor que el ingreso del dia (no overnight).
    if (hora && existing?.hora_ingreso) {
      const check = validateHorarioLaboral(existing.hora_ingreso, hora);
      if (!check.ok) {
        setMessage({ type: "error", text: check.error });
        return;
      }
    }
    setIsSaving(true);
    const { error } = await supabase.from("personal_asistencias").upsert(
      {
        usuario_id: selectedWorker.id,
        fecha,
        hora_ingreso: existing?.hora_ingreso ?? null,
        hora_salida: hora || null,
        productividad: productividad || 2,
        observacion: existing?.observacion ?? null,
      },
      { onConflict: "usuario_id,fecha" },
    );
    setIsSaving(false);
    if (error) {
      setMessage({ type: "error", text: "No se pudo guardar salida: " + error.message });
      return;
    }
    setMessage({ type: "success", text: "Salida registrada." });
    setShowSalida(false);
    await loadData();
  }

  function editAttendance(item: PersonalAsistencia) {
    // Admin-only: re-open the day's record by setting selectedDate and pre-populating
    setSelectedDate(item.fecha);
    setShowIngreso(true);
    setShowSalida(true);
    setMessage({ type: "success", text: "Editar registro del " + formatDateText(item.fecha) });
  }

  async function registerWeeklyPayment() {
    if (!supabase || !selectedWorker) {
      return;
    }

    const summary = getPaySummary(selectedWorker, asistencias, descuentos, turnos, fechasSemana(week.start));

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

      {tab === "listado" ? (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowRegisterForm((current) => !current)}
              className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              {showRegisterForm ? "Cerrar" : "Registrar usuario"}
            </button>
          </div>
          {showRegisterForm ? (
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
          ) : null}

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_260px] lg:items-end">
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
                <Field label="Estado">
                  <select
                    value={estadoFilter}
                    onChange={(event) => setEstadoFilter(event.target.value as EstadoFilter)}
                    className={inputClassName}
                  >
                    <option value="todos">Todos</option>
                    <option value="activos">Activos</option>
                    <option value="inactivos">Inactivos</option>
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

            <div className="hidden max-h-[70vh] overflow-auto lg:block">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
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
                      const summary = getPaySummary(usuario, asistencias, descuentos, turnos, fechasSemana(week.start));

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
                const summary = getPaySummary(usuario, asistencias, descuentos, turnos, fechasSemana(week.start));

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
                <Field label="Pago por hora (dia sin turno)">
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
                <Field label="Bono semana completa">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={detailForm.bono_asistencia_completa}
                    onChange={(event) =>
                      setDetailForm((current) =>
                        current ? { ...current, bono_asistencia_completa: event.target.value } : current,
                      )
                    }
                    placeholder="0"
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

              {/* Turnos del trabajador */}
              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">Turnos y horarios</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Define los dias y horarios que trabaja. El sistema calcula la tarifa por
                      hora (monto del turno ÷ horas) y aplica al pago segun las horas reales
                      que fiche.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addTurno}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Agregar turno
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {turnosForm.length === 0 ? (
                    <p className="rounded-md bg-white p-3 text-xs text-slate-500">
                      Sin turnos. Si no agregas ninguno se usara el pago por hora general.
                    </p>
                  ) : null}
                  {turnosForm.map((turno, index) => {
                    const horas = hoursBetween(turno.hora_inicio, turno.hora_fin);
                    const monto = Number(turno.monto_pago);
                    const tarifa =
                      horas > 0 && Number.isFinite(monto) && monto > 0 ? monto / horas : 0;
                    return (
                      <div key={index} className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="grid gap-2 sm:grid-cols-[1fr_140px_140px_140px_auto]">
                          <input
                            value={turno.nombre}
                            onChange={(event) => updateTurno(index, { nombre: event.target.value })}
                            placeholder="Nombre (ej. Dia completo)"
                            className={inputClassName}
                          />
                          <input
                            type="time"
                            value={turno.hora_inicio}
                            onChange={(event) =>
                              updateTurno(index, { hora_inicio: event.target.value })
                            }
                            className={inputClassName}
                          />
                          <input
                            type="time"
                            value={turno.hora_fin}
                            onChange={(event) =>
                              updateTurno(index, { hora_fin: event.target.value })
                            }
                            className={inputClassName}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={turno.monto_pago}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) =>
                              updateTurno(index, { monto_pago: event.target.value })
                            }
                            placeholder="S/ del dia"
                            className={inputClassName}
                          />
                          <button
                            type="button"
                            onClick={() => removeTurno(index)}
                            className="h-11 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Quitar
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          {["D", "L", "M", "Mi", "J", "V", "S"].map((label, dia) => {
                            const activo = turno.dias_aplica.includes(dia);
                            return (
                              <button
                                key={dia}
                                type="button"
                                onClick={() => toggleDiaTurno(index, dia)}
                                className={`h-8 w-10 rounded-md border text-xs font-semibold ${
                                  activo
                                    ? "border-emerald-700 bg-emerald-100 text-emerald-800"
                                    : "border-slate-300 bg-white text-slate-500"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                          {tarifa > 0 ? (
                            <span className="ml-auto self-center text-slate-600">
                              {horas.toFixed(2).replace(/\.00$/, "")}h ·{" "}
                              <strong className="text-slate-900">S/ {tarifa.toFixed(2)}/h</strong>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {turnosForm.length > 0 ? (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => void saveTurnos()}
                      disabled={isSavingTurnos}
                      className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
                    >
                      {isSavingTurnos ? "Guardando..." : "Guardar turnos"}
                    </button>
                  </div>
                ) : null}
              </div>
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
          turnos={turnos}
          week={week}
          discountForm={discountForm}
          editingDiscountId={editingDiscountId}
          isSaving={isSaving}
          isAdmin={hasAdminAccess}
          viewingWeekStart={viewingWeekStart}
          selectedDate={selectedDate}
          showIngreso={showIngreso}
          showSalida={showSalida}
          historyAsistencias={historyAsistencias}
          historyDescuentos={historyDescuentos}
          historyPagos={historyPagos}
          paymentFilter={paymentFilter}
          onSelectAction={selectWorkerAction}
          onDiscountChange={(key, value) =>
            setDiscountForm((current) => ({ ...current, [key]: value }))
          }
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
          setViewingWeekStart={setViewingWeekStart}
          setSelectedDate={setSelectedDate}
          setShowIngreso={setShowIngreso}
          setShowSalida={setShowSalida}
          setPaymentFilter={setPaymentFilter}
          onSaveIngreso={saveIngreso}
          onSaveSalida={saveSalida}
          onEditAttendance={editAttendance}
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
  turnos,
  week,
  discountForm,
  editingDiscountId,
  isSaving,
  isAdmin,
  viewingWeekStart,
  selectedDate,
  showIngreso,
  showSalida,
  historyAsistencias,
  historyDescuentos,
  historyPagos,
  paymentFilter,
  onSelectAction,
  onDiscountChange,
  onSaveDiscount,
  onEditDiscount,
  onRegisterPayment,
  setViewingWeekStart,
  setSelectedDate,
  setShowIngreso,
  setShowSalida,
  setPaymentFilter,
  onSaveIngreso,
  onSaveSalida,
  onEditAttendance,
}: {
  activeWorkers: UsuarioInterno[];
  selectedWorker: UsuarioInterno | null;
  workerAction: WorkerAction;
  asistencias: PersonalAsistencia[];
  descuentos: PersonalDescuento[];
  pagos: PersonalPago[];
  turnos: PersonalTurno[];
  week: ReturnType<typeof getWeekRange>;
  discountForm: DiscountForm;
  editingDiscountId: string | null;
  isSaving: boolean;
  isAdmin: boolean;
  viewingWeekStart: string;
  selectedDate: string;
  showIngreso: boolean;
  showSalida: boolean;
  historyAsistencias: PersonalAsistencia[];
  historyDescuentos: PersonalDescuento[];
  historyPagos: PersonalPago[];
  paymentFilter: "semana" | "mes";
  onSelectAction: (worker: UsuarioInterno, action: WorkerAction) => void;
  onDiscountChange: (key: keyof DiscountForm, value: string) => void;
  onSaveDiscount: (event: FormEvent<HTMLFormElement>) => void;
  onEditDiscount: (item: PersonalDescuento) => void;
  onRegisterPayment: () => void;
  setViewingWeekStart: (start: string) => void;
  setSelectedDate: (date: string) => void;
  setShowIngreso: (updater: (current: boolean) => boolean) => void;
  setShowSalida: (updater: (current: boolean) => boolean) => void;
  setPaymentFilter: (filter: "semana" | "mes") => void;
  onSaveIngreso: (date: string, hora: string, observacion: string) => Promise<void>;
  onSaveSalida: (date: string, hora: string, productividad: number) => Promise<void>;
  onEditAttendance: (item: PersonalAsistencia) => void;
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
        <div className="hidden max-h-[70vh] overflow-auto lg:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
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
                  const summary = getPaySummary(worker, asistencias, descuentos, turnos, fechasSemana(week.start));

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
            const summary = getPaySummary(worker, asistencias, descuentos, turnos, fechasSemana(week.start));

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
            <AttendanceWeekBlock
              worker={selectedWorker}
              historyAsistencias={historyAsistencias.filter((item) => item.usuario_id === selectedWorker.id)}
              viewingWeekStart={viewingWeekStart}
              selectedDate={selectedDate}
              showIngreso={showIngreso}
              showSalida={showSalida}
              isAdmin={isAdmin}
              isSaving={isSaving}
              onChangeViewingWeek={setViewingWeekStart}
              onChangeSelectedDate={setSelectedDate}
              onToggleIngreso={() => setShowIngreso((v) => !v)}
              onToggleSalida={() => setShowSalida((v) => !v)}
              onSaveIngreso={onSaveIngreso}
              onSaveSalida={onSaveSalida}
              onEditAttendance={onEditAttendance}
            />
          ) : null}

          {workerAction === "descuento" ? (
            <DiscountWeekBlock
              worker={selectedWorker}
              historyDescuentos={historyDescuentos.filter((item) => item.usuario_id === selectedWorker.id)}
              viewingWeekStart={viewingWeekStart}
              selectedDate={selectedDate}
              isAdmin={isAdmin}
              isSaving={isSaving}
              editingDiscountId={editingDiscountId}
              discountForm={discountForm}
              onChangeViewingWeek={setViewingWeekStart}
              onChangeSelectedDate={setSelectedDate}
              onDiscountChange={onDiscountChange}
              onSaveDiscount={onSaveDiscount}
              onEditDiscount={onEditDiscount}
            />
          ) : null}

          {workerAction === "pago" ? (
            <PaymentHistoryBlock
              worker={selectedWorker}
              asistencias={asistencias}
              descuentos={descuentos}
              pagos={pagos}
              historyAsistencias={historyAsistencias}
              historyDescuentos={historyDescuentos}
              historyPagos={historyPagos}
              week={week}
              paymentFilter={paymentFilter}
              isAdmin={isAdmin}
              isSaving={isSaving}
              onChangeFilter={setPaymentFilter}
              onRegisterPayment={onRegisterPayment}
            />
          ) : null}
        </section>
      ) : null}
    </div>
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
