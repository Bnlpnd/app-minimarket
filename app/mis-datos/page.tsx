"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { PaymentHistoryBlock } from "@/components/personal/PaymentHistoryBlock";
import { getStoredAppUser } from "@/lib/authRoles";
import { formatDate, formatTime, parseInputDate } from "@/lib/dateUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { validateHorarioLaboral } from "@/lib/validators";
import {
  calcularPagoSemanal,
  diaSemana,
  hoursBetween as hoursBetweenUtil,
} from "@/lib/payrollUtils";
import type {
  AppUsuario,
  PersonalAsistencia,
  PersonalDescuento,
  PersonalPago,
  PersonalTurno,
} from "@/types/database";

type Tab = "asistencia" | "descuento" | "pago";

type Data = {
  trabajador: AppUsuario | null;
  asistencias: PersonalAsistencia[];
  descuentos: PersonalDescuento[];
  pagos: PersonalPago[];
  turnos: PersonalTurno[];
};

function formatMoney(value: number | null | undefined) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

const hoursBetween = hoursBetweenUtil;

function todayIso() {
  return parseInputDate(new Date());
}

function nowHHMM() {
  return new Date().toTimeString().slice(0, 5);
}

function getWeekRange() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  // Usa fecha LOCAL para no desfasar el dia por zona horaria.
  const iso = (d: Date) => parseInputDate(d);
  return { startIso: iso(start), endIso: iso(end), label: `${formatDate(iso(start))} - ${formatDate(iso(end))}` };
}

export default function MisDatosPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("asistencia");
  const [data, setData] = useState<Data>({
    trabajador: null,
    asistencias: [],
    descuentos: [],
    pagos: [],
    turnos: [],
  });
  const [turnoElegido, setTurnoElegido] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isMarking, setIsMarking] = useState<"ingreso" | "salida" | null>(null);
  // Form manual de asistencia
  const [manualAsis, setManualAsis] = useState({
    fecha: "",
    hora_ingreso: "",
    hora_salida: "",
    productividad: "2" as "1" | "2" | "3",
    observacion: "",
  });
  const [isSavingManual, setIsSavingManual] = useState(false);
  // Form de descuento
  const [descForm, setDescForm] = useState({ fecha: "", detalle: "", monto: "" });
  const [isSavingDesc, setIsSavingDesc] = useState(false);
  const [descMessage, setDescMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Filtro del grafico de pago
  const [paymentFilter, setPaymentFilter] = useState<"dia" | "semana" | "mes">("dia");

  useEffect(() => {
    const stored = getStoredAppUser();
    if (!stored) {
      router.replace("/login");
      return;
    }
    void loadData(stored.id);
    // Inicializar fechas de los forms a hoy.
    const hoy = todayIso();
    setManualAsis((current) => ({ ...current, fecha: hoy }));
    setDescForm((current) => ({ ...current, fecha: hoy }));
  }, []);

  async function loadData(userId: string) {
    if (supabaseConfigError || !supabase) {
      setErrorMsg(supabaseConfigError ?? "Sin conexion a Supabase.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [trabajador, asistencias, descuentos, pagos, turnos] = await Promise.all([
      supabase
        .from("app_usuarios")
        .select("*")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("personal_asistencias")
        .select("*")
        .eq("usuario_id", userId)
        .order("fecha", { ascending: false })
        .limit(60),
      supabase
        .from("personal_descuentos")
        .select("*")
        .eq("usuario_id", userId)
        .order("fecha", { ascending: false })
        .limit(60),
      supabase
        .from("personal_pagos")
        .select("*")
        .eq("usuario_id", userId)
        .order("semana_inicio", { ascending: false })
        .limit(30),
      supabase
        .from("personal_turnos")
        .select("*")
        .eq("usuario_id", userId)
        .eq("activo", true)
        .order("created_at", { ascending: true }),
    ]);
    setData({
      trabajador: (trabajador.data ?? null) as Data["trabajador"],
      asistencias: (asistencias.data ?? []) as PersonalAsistencia[],
      descuentos: (descuentos.data ?? []) as PersonalDescuento[],
      pagos: (pagos.data ?? []) as PersonalPago[],
      turnos: (turnos.data ?? []) as PersonalTurno[],
    });
    setIsLoading(false);
  }

  const week = useMemo(() => getWeekRange(), []);

  const horasSemanaReales = useMemo(() => {
    return data.asistencias
      .filter((a) => a.fecha >= week.startIso && a.fecha <= week.endIso)
      .reduce((sum, a) => sum + hoursBetween(a.hora_ingreso, a.hora_salida), 0);
  }, [data.asistencias, week]);

  const descuentosSemana = useMemo(() => {
    return data.descuentos
      .filter((d) => d.fecha >= week.startIso && d.fecha <= week.endIso)
      .reduce((sum, d) => sum + Number(d.monto ?? 0), 0);
  }, [data.descuentos, week]);

  const pagoSemanaResumen = useMemo(() => {
    if (!data.trabajador) return { total: 0, subtotalDias: 0, bonoAplicado: 0 };
    const asisSemana = data.asistencias.filter(
      (a) => a.fecha >= week.startIso && a.fecha <= week.endIso,
    );
    const fechas: string[] = [];
    const [sy, sm, sd] = week.startIso.split("-").map(Number);
    for (let i = 0; i < 7; i++) {
      const d = new Date(sy, (sm || 1) - 1, (sd || 1) + i);
      fechas.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    }
    const resumen = calcularPagoSemanal({
      asistencias: asisSemana,
      turnos: data.turnos,
      pagoHoraGeneral: Number(data.trabajador.pago_hora ?? 0),
      bonoSemanaCompleta: Number(data.trabajador.bono_asistencia_completa ?? 0),
      fechasSemana: fechas,
    });
    return {
      total: Math.max(0, resumen.total - descuentosSemana),
      subtotalDias: resumen.subtotalDias,
      bonoAplicado: resumen.bonoAplicado,
    };
  }, [data.trabajador, data.asistencias, data.turnos, week, descuentosSemana]);

  const asistenciaHoy = useMemo(() => {
    const hoy = todayIso();
    return data.asistencias.find((a) => a.fecha === hoy) ?? null;
  }, [data.asistencias]);

  const turnosDeHoy = useMemo(() => {
    const dia = diaSemana(todayIso());
    return data.turnos.filter((t) => t.dias_aplica.includes(dia));
  }, [data.turnos]);

  async function marcarIngreso() {
    if (!supabase || !data.trabajador) return;
    setActionMessage(null);

    // Si ya hay hora_ingreso registrada hoy, no permitir reescritura.
    if (asistenciaHoy?.hora_ingreso) {
      setActionMessage({
        type: "error",
        text: `Ya marcaste tu ingreso hoy a las ${asistenciaHoy.hora_ingreso.slice(0, 5)}.`,
      });
      return;
    }

    const fecha = todayIso();
    const hora = nowHHMM();

    // Si ya hay salida previa (edge case raro), validar que ingreso quede antes.
    if (asistenciaHoy?.hora_salida) {
      const check = validateHorarioLaboral(hora, asistenciaHoy.hora_salida);
      if (!check.ok) {
        setActionMessage({ type: "error", text: check.error });
        return;
      }
    }

    // Determinar turno: si solo hay 1 turno hoy, auto. Si hay varios y el
    // usuario eligio, usar eso. Si hay varios pero no eligio, pedirle.
    let turnoId: string | null = asistenciaHoy?.turno_id ?? null;
    if (!turnoId && turnosDeHoy.length === 1) {
      turnoId = turnosDeHoy[0].id;
    } else if (!turnoId && turnosDeHoy.length > 1) {
      if (!turnoElegido) {
        setActionMessage({
          type: "error",
          text: "Tienes mas de un turno hoy. Elige cual vas a hacer arriba.",
        });
        return;
      }
      turnoId = turnoElegido;
    }

    setIsMarking("ingreso");
    const { error } = await supabase.from("personal_asistencias").upsert(
      {
        usuario_id: data.trabajador.id,
        fecha,
        hora_ingreso: hora,
        hora_salida: asistenciaHoy?.hora_salida ?? null,
        productividad: asistenciaHoy?.productividad ?? 2,
        observacion: asistenciaHoy?.observacion ?? null,
        turno_id: turnoId,
      },
      { onConflict: "usuario_id,fecha" },
    );
    setIsMarking(null);

    if (error) {
      setActionMessage({ type: "error", text: `No se registro: ${error.message}` });
      return;
    }
    setActionMessage({ type: "success", text: `Ingreso registrado a las ${hora}.` });
    await loadData(data.trabajador.id);
  }

  async function marcarSalida() {
    if (!supabase || !data.trabajador) return;
    setActionMessage(null);

    if (!asistenciaHoy?.hora_ingreso) {
      setActionMessage({
        type: "error",
        text: "Primero marca tu ingreso del dia.",
      });
      return;
    }

    if (asistenciaHoy.hora_salida) {
      setActionMessage({
        type: "error",
        text: `Ya marcaste tu salida hoy a las ${asistenciaHoy.hora_salida.slice(0, 5)}.`,
      });
      return;
    }

    const fecha = todayIso();
    const hora = nowHHMM();

    const check = validateHorarioLaboral(asistenciaHoy.hora_ingreso, hora);
    if (!check.ok) {
      setActionMessage({ type: "error", text: check.error });
      return;
    }

    setIsMarking("salida");
    const { error } = await supabase.from("personal_asistencias").upsert(
      {
        usuario_id: data.trabajador.id,
        fecha,
        hora_ingreso: asistenciaHoy.hora_ingreso,
        hora_salida: hora,
        productividad: asistenciaHoy.productividad ?? 2,
        observacion: asistenciaHoy.observacion ?? null,
        turno_id: asistenciaHoy.turno_id,
      },
      { onConflict: "usuario_id,fecha" },
    );
    setIsMarking(null);

    if (error) {
      setActionMessage({ type: "error", text: `No se registro: ${error.message}` });
      return;
    }
    setActionMessage({ type: "success", text: `Salida registrada a las ${hora}.` });
    await loadData(data.trabajador.id);
  }

  /**
   * Form manual de asistencia. Permite tipear hora exacta + productividad
   * + observacion. Solo INSERTA o COMPLETA (no sobreescribe campos ya
   * registrados; el trabajador no puede editar).
   */
  async function guardarManual() {
    if (!supabase || !data.trabajador) return;
    setActionMessage(null);

    if (!manualAsis.fecha) {
      setActionMessage({ type: "error", text: "Elige una fecha." });
      return;
    }
    if (manualAsis.fecha > todayIso()) {
      setActionMessage({ type: "error", text: "No se puede registrar asistencia futura." });
      return;
    }
    if (!manualAsis.hora_ingreso && !manualAsis.hora_salida) {
      setActionMessage({ type: "error", text: "Ingresa al menos hora de ingreso o salida." });
      return;
    }
    // Validar horario si ambos vienen.
    if (manualAsis.hora_ingreso && manualAsis.hora_salida) {
      const check = validateHorarioLaboral(manualAsis.hora_ingreso, manualAsis.hora_salida);
      if (!check.ok) {
        setActionMessage({ type: "error", text: check.error });
        return;
      }
    }

    // Buscar registro existente para no sobreescribir.
    const { data: existing } = await supabase
      .from("personal_asistencias")
      .select("*")
      .eq("usuario_id", data.trabajador.id)
      .eq("fecha", manualAsis.fecha)
      .maybeSingle();

    const existingRow = existing as PersonalAsistencia | null;

    // Si ya hay un campo, conservalo (el trabajador no edita).
    const hora_ingreso = existingRow?.hora_ingreso ?? manualAsis.hora_ingreso ?? null;
    const hora_salida = existingRow?.hora_salida ?? manualAsis.hora_salida ?? null;

    // Si ambos quedaron, validar horario coherente.
    if (hora_ingreso && hora_salida) {
      const check = validateHorarioLaboral(hora_ingreso, hora_salida);
      if (!check.ok) {
        setActionMessage({ type: "error", text: check.error });
        return;
      }
    }

    // Resolver turno si aplica (igual que marcarIngreso).
    let turnoId: string | null = existingRow?.turno_id ?? null;
    if (!turnoId && turnosDeHoy.length === 1 && manualAsis.fecha === todayIso()) {
      turnoId = turnosDeHoy[0].id;
    }

    setIsSavingManual(true);
    const { error } = await supabase.from("personal_asistencias").upsert(
      {
        usuario_id: data.trabajador.id,
        fecha: manualAsis.fecha,
        hora_ingreso,
        hora_salida,
        productividad: Number(manualAsis.productividad || "2"),
        observacion: manualAsis.observacion.trim() || existingRow?.observacion || null,
        turno_id: turnoId,
      },
      { onConflict: "usuario_id,fecha" },
    );
    setIsSavingManual(false);

    if (error) {
      setActionMessage({ type: "error", text: `No se guardo: ${error.message}` });
      return;
    }
    setActionMessage({ type: "success", text: "Asistencia registrada." });
    setManualAsis({
      fecha: todayIso(),
      hora_ingreso: "",
      hora_salida: "",
      productividad: "2",
      observacion: "",
    });
    await loadData(data.trabajador.id);
  }

  async function guardarDescuento() {
    if (!supabase || !data.trabajador) return;
    setDescMessage(null);

    if (!descForm.fecha) {
      setDescMessage({ type: "error", text: "Elige fecha." });
      return;
    }
    if (descForm.fecha > todayIso()) {
      setDescMessage({ type: "error", text: "No puedes registrar un descuento futuro." });
      return;
    }
    const detalle = descForm.detalle.trim();
    if (!detalle) {
      setDescMessage({ type: "error", text: "Pon un detalle del descuento." });
      return;
    }
    const monto = Number(descForm.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setDescMessage({ type: "error", text: "Monto invalido." });
      return;
    }

    setIsSavingDesc(true);
    const { error } = await supabase.from("personal_descuentos").insert({
      usuario_id: data.trabajador.id,
      fecha: descForm.fecha,
      detalle,
      monto,
    });
    setIsSavingDesc(false);

    if (error) {
      setDescMessage({ type: "error", text: `No se guardo: ${error.message}` });
      return;
    }
    setDescMessage({ type: "success", text: "Descuento registrado." });
    setDescForm({ fecha: todayIso(), detalle: "", monto: "" });
    await loadData(data.trabajador.id);
  }

  return (
    <Layout title="Mis datos" description="Tu informacion personal, asistencia, descuentos y pagos.">
      <div className="space-y-5">
        <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-950">
          Volver al inicio
        </Link>

        {errorMsg ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMsg}
          </div>
        ) : null}

        {isLoading ? (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Cargando tus datos...
          </p>
        ) : !data.trabajador ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            No se encontro tu ficha personal. Pide a tu admin que la cree.
          </p>
        ) : (
          <>
            {/* Header con info del trabajador */}
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950">
                {`${data.trabajador.nombres ?? ""} ${data.trabajador.apellidos ?? ""}`.trim() || "Trabajador"}
              </h2>
              <p className="mt-1 text-sm text-slate-500 capitalize">{data.trabajador.rol}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Metric label="Costo x hora" value={formatMoney(data.trabajador.pago_hora)} />
                <Metric label="Horas/semana" value={String(Number(data.trabajador.horas_semana ?? 0))} />
                <Metric label="Pago estimado semana" value={formatMoney(pagoSemanaResumen.total)} />
              </div>
              {data.trabajador.horario_laboral ? (
                <p className="mt-4 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Horario:</span>{" "}
                  {data.trabajador.horario_laboral}
                </p>
              ) : null}
            </section>

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto">
              <TabButton active={tab === "asistencia"} onClick={() => setTab("asistencia")}>
                Asistencia
              </TabButton>
              <TabButton active={tab === "descuento"} onClick={() => setTab("descuento")}>
                Descuento
              </TabButton>
              <TabButton active={tab === "pago"} onClick={() => setTab("pago")}>
                Pago
              </TabButton>
            </div>

            {tab === "asistencia" ? (
              <Panel title="Mi asistencia" subtitle={week.label}>
                {/* Botones para marcar ingreso/salida del dia */}
                <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Hoy {formatDate(todayIso())}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Ingreso:{" "}
                    <span className="font-semibold text-slate-950">
                      {asistenciaHoy?.hora_ingreso ? asistenciaHoy.hora_ingreso.slice(0, 5) : "-"}
                    </span>
                    {"  -  Salida: "}
                    <span className="font-semibold text-slate-950">
                      {asistenciaHoy?.hora_salida ? asistenciaHoy.hora_salida.slice(0, 5) : "-"}
                    </span>
                  </p>

                  {/* Selector de turno cuando hay varios para hoy */}
                  {turnosDeHoy.length > 1 && !asistenciaHoy?.hora_ingreso ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-semibold text-amber-900">
                        Hoy tienes mas de un turno. Elige cual vas a hacer:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {turnosDeHoy.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setTurnoElegido(t.id)}
                            className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                              turnoElegido === t.id
                                ? "border-santa-700 bg-santa-700 text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {t.nombre} ({t.hora_inicio.slice(0, 5)} - {t.hora_fin.slice(0, 5)})
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {turnosDeHoy.length === 1 && !asistenciaHoy?.hora_ingreso ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Turno asignado: <strong>{turnosDeHoy[0].nombre}</strong>{" "}
                      ({turnosDeHoy[0].hora_inicio.slice(0, 5)} - {turnosDeHoy[0].hora_fin.slice(0, 5)})
                    </p>
                  ) : null}

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void marcarIngreso()}
                      disabled={isMarking !== null || Boolean(asistenciaHoy?.hora_ingreso)}
                      className="h-12 rounded-md bg-santa-700 px-4 text-sm font-semibold text-white hover:bg-santa-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isMarking === "ingreso"
                        ? "Registrando..."
                        : asistenciaHoy?.hora_ingreso
                          ? "Ingreso ya registrado"
                          : "Marcar mi ingreso"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void marcarSalida()}
                      disabled={
                        isMarking !== null ||
                        !asistenciaHoy?.hora_ingreso ||
                        Boolean(asistenciaHoy?.hora_salida)
                      }
                      className="h-12 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isMarking === "salida"
                        ? "Registrando..."
                        : asistenciaHoy?.hora_salida
                          ? "Salida ya registrada"
                          : "Marcar mi salida"}
                    </button>
                  </div>
                  {actionMessage ? (
                    <p
                      className={`mt-3 text-xs ${
                        actionMessage.type === "success" ? "text-santa-700" : "text-red-700"
                      }`}
                    >
                      {actionMessage.text}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-slate-500">
                    Tu admin es quien puede editar o corregir registros anteriores.
                  </p>
                </div>

                {/* Form manual: por si necesitas registrar otra hora,
                    productividad u observacion. NO sobreescribe campos
                    ya guardados (preserva ingreso/salida previos). */}
                <details className="mb-4 rounded-md border border-slate-200">
                  <summary className="cursor-pointer rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    Registro manual con observacion / productividad
                  </summary>
                  <div className="space-y-3 p-3">
                    <Field label="Fecha">
                      <input
                        type="date"
                        value={manualAsis.fecha}
                        max={todayIso()}
                        onChange={(event) =>
                          setManualAsis((c) => ({ ...c, fecha: event.target.value }))
                        }
                        className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Hora ingreso">
                        <input
                          type="time"
                          value={manualAsis.hora_ingreso}
                          onChange={(event) =>
                            setManualAsis((c) => ({ ...c, hora_ingreso: event.target.value }))
                          }
                          className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
                        />
                      </Field>
                      <Field label="Hora salida">
                        <input
                          type="time"
                          value={manualAsis.hora_salida}
                          onChange={(event) =>
                            setManualAsis((c) => ({ ...c, hora_salida: event.target.value }))
                          }
                          className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
                        />
                      </Field>
                    </div>
                    <Field label="Productividad">
                      <select
                        value={manualAsis.productividad}
                        onChange={(event) =>
                          setManualAsis((c) => ({
                            ...c,
                            productividad: event.target.value as "1" | "2" | "3",
                          }))
                        }
                        className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                      >
                        <option value="1">1 — No la dio</option>
                        <option value="2">2 — Normal</option>
                        <option value="3">3 — Extra</option>
                      </select>
                    </Field>
                    <Field label="Observacion">
                      <textarea
                        value={manualAsis.observacion}
                        onChange={(event) =>
                          setManualAsis((c) => ({ ...c, observacion: event.target.value }))
                        }
                        rows={2}
                        placeholder="Ej. llegue tarde por feria, salida temprano por enfermedad..."
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => void guardarManual()}
                      disabled={isSavingManual}
                      className="h-11 w-full rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
                    >
                      {isSavingManual ? "Guardando..." : "Guardar registro manual"}
                    </button>
                    <p className="text-[11px] text-slate-500">
                      Si ya hay ingreso o salida registrados para esa fecha, se
                      conservan tal cual. Solo se agregan los campos vacios.
                    </p>
                  </div>
                </details>

                {data.asistencias.length === 0 ? (
                  <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                    Aun no tienes asistencias registradas.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.asistencias.map((a) => {
                      const horas = hoursBetween(a.hora_ingreso, a.hora_salida);
                      return (
                        <li key={a.id} className="grid gap-2 py-3 sm:grid-cols-[140px_1fr_auto] sm:items-center">
                          <p className="font-medium text-slate-950">{formatDate(a.fecha)}</p>
                          <p className="text-sm text-slate-600">
                            {formatTime(a.hora_ingreso) ?? "-"} a {formatTime(a.hora_salida) ?? "-"}
                          </p>
                          <span className="text-sm font-semibold text-slate-800">
                            {horas > 0 ? `${horas.toFixed(2).replace(/\.00$/, "")} h` : "-"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            ) : null}

            {tab === "descuento" ? (
              <Panel
                title="Mis descuentos"
                subtitle={`Semana actual: ${formatMoney(descuentosSemana)}`}
              >
                {/* Form para registrar descuento propio (ej. prestamo,
                    compra en tienda, pago a cuenta del sueldo). */}
                <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Registrar nuevo descuento
                  </p>
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Fecha">
                        <input
                          type="date"
                          value={descForm.fecha}
                          max={todayIso()}
                          onChange={(event) =>
                            setDescForm((c) => ({ ...c, fecha: event.target.value }))
                          }
                          className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
                        />
                      </Field>
                      <Field label="Monto S/">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={descForm.monto}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            setDescForm((c) => ({ ...c, monto: event.target.value }))
                          }
                          placeholder="0.00"
                          className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
                        />
                      </Field>
                    </div>
                    <Field label="Detalle">
                      <input
                        value={descForm.detalle}
                        onChange={(event) =>
                          setDescForm((c) => ({ ...c, detalle: event.target.value }))
                        }
                        placeholder="Ej. prestamo, compra en tienda, adelanto"
                        className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => void guardarDescuento()}
                      disabled={isSavingDesc}
                      className="h-11 w-full rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
                    >
                      {isSavingDesc ? "Guardando..." : "Registrar descuento"}
                    </button>
                    {descMessage ? (
                      <p
                        className={`text-xs ${
                          descMessage.type === "success" ? "text-santa-700" : "text-red-700"
                        }`}
                      >
                        {descMessage.text}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-slate-500">
                      Tu admin puede editar o anular descuentos si hay error.
                    </p>
                  </div>
                </div>

                {data.descuentos.length === 0 ? (
                  <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                    No tienes descuentos registrados. Buen trabajo.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.descuentos.map((d) => (
                      <li key={d.id} className="grid gap-2 py-3 sm:grid-cols-[140px_1fr_auto] sm:items-center">
                        <p className="font-medium text-slate-950">{formatDate(d.fecha)}</p>
                        <p className="text-sm text-slate-600">{d.detalle}</p>
                        <span className="text-sm font-semibold text-red-700">
                          -{formatMoney(d.monto)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ) : null}

            {tab === "pago" && data.trabajador ? (
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-950">
                  Mi pago de la semana
                </h3>
                <p className="mt-1 text-xs text-slate-500">{week.label}</p>
                {/* Filtra asistencias/descuentos de la semana actual para
                    el calculo del monto. Los history* son los listados de
                    los ultimos 60 dias que ya cargamos. */}
                <PaymentHistoryBlock
                  worker={
                    {
                      ...data.trabajador,
                      rol:
                        data.trabajador.rol === "cliente"
                          ? "trabajador"
                          : (data.trabajador.rol as "admin" | "trabajador"),
                    }
                  }
                  asistencias={data.asistencias.filter(
                    (a) => a.fecha >= week.startIso && a.fecha <= week.endIso,
                  )}
                  descuentos={data.descuentos.filter(
                    (d) => d.fecha >= week.startIso && d.fecha <= week.endIso,
                  )}
                  pagos={data.pagos}
                  turnos={data.turnos}
                  historyAsistencias={data.asistencias}
                  historyDescuentos={data.descuentos}
                  historyPagos={data.pagos}
                  week={{
                    start: week.startIso,
                    end: week.endIso,
                    label: week.label,
                  }}
                  paymentFilter={paymentFilter}
                  isAdmin={false}
                  isSaving={false}
                  onChangeFilter={setPaymentFilter}
                  onRegisterPayment={() => {}}
                />
              </section>
            ) : null}
          </>
        )}
      </div>
    </Layout>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 shrink-0 rounded-md px-4 text-sm font-semibold ${
        active
          ? "bg-slate-950 text-white"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
