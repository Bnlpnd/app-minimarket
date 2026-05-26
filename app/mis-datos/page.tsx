"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { getStoredAppUser } from "@/lib/authRoles";
import { formatDate, formatTime } from "@/lib/dateUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type {
  AppUsuario,
  PersonalAsistencia,
  PersonalDescuento,
  PersonalPago,
} from "@/types/database";

type Tab = "asistencia" | "descuento" | "pago";

type Data = {
  trabajador: Pick<
    AppUsuario,
    | "id"
    | "nombres"
    | "apellidos"
    | "email"
    | "pago_hora"
    | "horas_semana"
    | "gastos_semana"
    | "horario_laboral"
    | "rol"
  > | null;
  asistencias: PersonalAsistencia[];
  descuentos: PersonalDescuento[];
  pagos: PersonalPago[];
};

function formatMoney(value: number | null | undefined) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function hoursBetween(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const st = sh * 60 + sm;
  const et = eh * 60 + em;
  if (!Number.isFinite(st) || !Number.isFinite(et) || et <= st) return 0;
  return (et - st) / 60;
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
  const iso = (d: Date) => d.toISOString().slice(0, 10);
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
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredAppUser();
    if (!stored) {
      router.replace("/login");
      return;
    }
    void loadData(stored.id);
  }, []);

  async function loadData(userId: string) {
    if (supabaseConfigError || !supabase) {
      setErrorMsg(supabaseConfigError ?? "Sin conexion a Supabase.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [trabajador, asistencias, descuentos, pagos] = await Promise.all([
      supabase
        .from("app_usuarios")
        .select("id,nombres,apellidos,email,pago_hora,horas_semana,gastos_semana,horario_laboral,rol")
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
    ]);
    setData({
      trabajador: (trabajador.data ?? null) as Data["trabajador"],
      asistencias: (asistencias.data ?? []) as PersonalAsistencia[],
      descuentos: (descuentos.data ?? []) as PersonalDescuento[],
      pagos: (pagos.data ?? []) as PersonalPago[],
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

  const pagoSemanaEstimado = useMemo(() => {
    if (!data.trabajador) return 0;
    const horas = horasSemanaReales > 0 ? horasSemanaReales : Number(data.trabajador.horas_semana ?? 0);
    const base = horas * Number(data.trabajador.pago_hora ?? 0);
    return Math.max(0, base - descuentosSemana);
  }, [data.trabajador, descuentosSemana, horasSemanaReales]);

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
                <Metric label="Pago estimado semana" value={formatMoney(pagoSemanaEstimado)} />
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

            {tab === "pago" ? (
              <Panel title="Mis pagos">
                {data.pagos.length === 0 ? (
                  <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                    Aun no tienes pagos registrados.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.pagos.map((p) => (
                      <li key={p.id} className="grid gap-2 py-3 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                        <div>
                          <p className="font-medium text-slate-950">
                            Semana {formatDate(p.semana_inicio)}
                          </p>
                          <p className="text-xs text-slate-500">a {formatDate(p.semana_fin)}</p>
                        </div>
                        <p className="text-sm text-slate-600">
                          {Number(p.horas_trabajadas ?? 0)} h - descuentos {formatMoney(p.descuentos)}
                        </p>
                        <div className="text-right">
                          <span className="block text-sm font-semibold text-emerald-700">
                            {formatMoney(p.monto_pagado)}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase ${
                              p.estado === "pagado" ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {p.estado}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
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
