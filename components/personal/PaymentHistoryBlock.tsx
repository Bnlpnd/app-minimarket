"use client";

import { useMemo } from "react";
import {
  calcularPagoSemanal,
  elegirTurnoParaAsistencia,
  hoursBetween,
  pagoPorDia,
} from "@/lib/payrollUtils";
import type {
  AppUsuario,
  PersonalAsistencia,
  PersonalDescuento,
  PersonalPago,
  PersonalTurno,
} from "@/types/database";

type UsuarioInterno = Omit<AppUsuario, "rol"> & { rol: "admin" | "trabajador" };

type Props = {
  worker: UsuarioInterno;
  asistencias: PersonalAsistencia[];
  descuentos: PersonalDescuento[];
  pagos: PersonalPago[];
  turnos: PersonalTurno[];
  historyAsistencias: PersonalAsistencia[];
  historyDescuentos: PersonalDescuento[];
  historyPagos: PersonalPago[];
  week: { start: string; end: string; label: string };
  paymentFilter: "dia" | "semana" | "mes";
  isAdmin: boolean;
  isSaving: boolean;
  onChangeFilter: (filter: "dia" | "semana" | "mes") => void;
  onRegisterPayment: () => void;
};

function toInputDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function numberValue(value: number | null | undefined) {
  return Number(value ?? 0);
}

function getMondayOf(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toInputDate(date);
}

function getMonthOf(dateStr: string) {
  return dateStr.slice(0, 7); // yyyy-mm
}

type Bucket = {
  key: string;
  label: string;
  hours: number;
  productivitySum: number;
  productivityCount: number;
  discounts: number;
  payment: number;
};

export function PaymentHistoryBlock({
  worker,
  asistencias,
  descuentos,
  turnos,
  week,
  historyAsistencias,
  historyDescuentos,
  historyPagos,
  paymentFilter,
  isAdmin,
  isSaving,
  onChangeFilter,
  onRegisterPayment,
}: Props) {
  const workerAsistSemana = useMemo(
    () => asistencias.filter((a) => a.usuario_id === worker.id),
    [asistencias, worker.id],
  );
  const workerDescSemana = useMemo(
    () => descuentos.filter((d) => d.usuario_id === worker.id),
    [descuentos, worker.id],
  );
  const workerTurnos = useMemo(
    () => turnos.filter((t) => t.usuario_id === worker.id),
    [turnos, worker.id],
  );

  const currentWeekHours = useMemo(
    () =>
      workerAsistSemana.reduce(
        (sum, a) => sum + hoursBetween(a.hora_ingreso, a.hora_salida),
        0,
      ),
    [workerAsistSemana],
  );
  const currentWeekDiscount = useMemo(
    () => workerDescSemana.reduce((sum, d) => sum + numberValue(d.monto), 0),
    [workerDescSemana],
  );

  // Fechas L-D de la semana actual para evaluar bono y agrupar.
  const fechasSemana = useMemo(() => {
    const [y, m, d] = week.start.split("-").map(Number);
    const start = new Date(y, (m || 1) - 1, d || 1);
    return Array.from({ length: 7 }, (_, i) => {
      const next = new Date(start);
      next.setDate(start.getDate() + i);
      return toInputDate(next);
    });
  }, [week.start]);

  // Monto a pagar: usa el calculo correcto con turnos + bono.
  const currentAmount = useMemo(() => {
    if (workerTurnos.length > 0) {
      const resumen = calcularPagoSemanal({
        asistencias: workerAsistSemana,
        turnos: workerTurnos,
        pagoHoraGeneral: numberValue(worker.pago_hora),
        bonoSemanaCompleta: numberValue(
          (worker as UsuarioInterno & { bono_asistencia_completa?: number })
            .bono_asistencia_completa,
        ),
        fechasSemana,
      });
      return Math.max(0, resumen.total - currentWeekDiscount);
    }
    // Sin turnos: fallback historico horas × pago_hora.
    const hoursForPay = currentWeekHours > 0 ? currentWeekHours : numberValue(worker.horas_semana);
    return Math.max(0, hoursForPay * numberValue(worker.pago_hora) - currentWeekDiscount);
  }, [workerAsistSemana, workerTurnos, worker, fechasSemana, currentWeekHours, currentWeekDiscount]);

  const hoursForPay = currentWeekHours > 0 ? currentWeekHours : numberValue(worker.horas_semana);
  const registeredPayment = useMemo(
    () => historyPagos.find((p) => p.usuario_id === worker.id && p.semana_inicio === week.start),
    [historyPagos, worker.id, week.start],
  );

  // Build history buckets according to filter
  const buckets = useMemo<Bucket[]>(() => {
    const workerAsist = historyAsistencias.filter((a) => a.usuario_id === worker.id);
    const workerDisc = historyDescuentos.filter((d) => d.usuario_id === worker.id);
    const workerPagos = historyPagos.filter((p) => p.usuario_id === worker.id);

    // Modo "dia": cada barra es un dia de la SEMANA ACTUAL, calculado
    // con la logica nueva (turnos + horas extra).
    if (paymentFilter === "dia") {
      const labels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
      return fechasSemana.map((fecha, i) => {
        const asistDia = workerAsistSemana.find((a) => a.fecha === fecha) ?? null;
        const descDia = workerDescSemana.filter((d) => d.fecha === fecha);
        const descTotal = descDia.reduce((s, d) => s + numberValue(d.monto), 0);
        let payment = 0;
        let hours = 0;
        let prodSum = 0;
        let prodCount = 0;
        if (asistDia) {
          const turno = elegirTurnoParaAsistencia(asistDia, workerTurnos);
          const calc = pagoPorDia(asistDia, turno, numberValue(worker.pago_hora));
          payment = Math.max(0, calc.pago - descTotal);
          hours = calc.horas;
          const prod = Number(asistDia.productividad);
          if (Number.isFinite(prod) && prod > 0) {
            prodSum = prod;
            prodCount = 1;
          }
        }
        return {
          key: fecha,
          label: `${labels[i]} ${fecha.slice(8, 10)}`,
          hours,
          productivitySum: prodSum,
          productivityCount: prodCount,
          discounts: descTotal,
          payment,
        };
      });
    }

    // Modo "semana" o "mes": agregado historico.
    const map = new Map<string, Bucket>();
    const keyFor = (date: string) => (paymentFilter === "semana" ? getMondayOf(date) : getMonthOf(date));
    const ensure = (key: string, label: string): Bucket => {
      const existing = map.get(key);
      if (existing) return existing;
      const fresh: Bucket = {
        key,
        label,
        hours: 0,
        productivitySum: 0,
        productivityCount: 0,
        discounts: 0,
        payment: 0,
      };
      map.set(key, fresh);
      return fresh;
    };

    for (const a of workerAsist) {
      const key = keyFor(a.fecha);
      const b = ensure(key, key);
      b.hours += hoursBetween(a.hora_ingreso, a.hora_salida);
      const prod = Number(a.productividad);
      if (Number.isFinite(prod) && prod > 0) {
        b.productivitySum += prod;
        b.productivityCount += 1;
      }
    }
    for (const d of workerDisc) {
      const key = keyFor(d.fecha);
      const b = ensure(key, key);
      b.discounts += numberValue(d.monto);
    }
    for (const p of workerPagos) {
      const key = paymentFilter === "semana" ? p.semana_inicio : p.semana_inicio.slice(0, 7);
      const b = ensure(key, key);
      b.payment += numberValue(p.monto_pagado);
    }

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key)).slice(-8);
  }, [
    historyAsistencias,
    historyDescuentos,
    historyPagos,
    paymentFilter,
    worker.id,
    worker.pago_hora,
    workerAsistSemana,
    workerDescSemana,
    workerTurnos,
    fechasSemana,
  ]);

  const maxValue = Math.max(
    1,
    ...buckets.flatMap((b) => [b.payment, b.hours * 5, b.discounts, b.productivitySum]),
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Semana" value={week.label} />
        <Metric label="Pago x hora" value={`S/ ${numberValue(worker.pago_hora).toFixed(2)}`} />
        <Metric label="Horas trabajadas" value={hoursForPay.toFixed(2)} />
        <Metric label="Descuentos semana" value={`S/ ${currentWeekDiscount.toFixed(2)}`} />
        <Metric label="Monto a pagar" value={`S/ ${currentAmount.toFixed(2)}`} strong />
      </div>

      {isAdmin ? (
        <div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onRegisterPayment}
            className="h-11 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300"
          >
            {isSaving ? "Guardando..." : registeredPayment ? "Actualizar pago" : "Registrar pago"}
          </button>
          {registeredPayment ? (
            <p className="mt-2 text-sm text-santa-700">
              Pago registrado: S/ {numberValue(registeredPayment.monto_pagado).toFixed(2)}.
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-950">Historico</h3>
          <div className="flex gap-1 rounded-md border border-slate-200 p-1 text-xs">
            <button type="button" onClick={() => onChangeFilter("dia")} className={`rounded px-3 py-1 ${paymentFilter === "dia" ? "bg-santa-600 text-white" : "text-slate-700"}`}>
              Dia
            </button>
            <button type="button" onClick={() => onChangeFilter("semana")} className={`rounded px-3 py-1 ${paymentFilter === "semana" ? "bg-santa-600 text-white" : "text-slate-700"}`}>
              Semana
            </button>
            <button type="button" onClick={() => onChangeFilter("mes")} className={`rounded px-3 py-1 ${paymentFilter === "mes" ? "bg-santa-600 text-white" : "text-slate-700"}`}>
              Mes
            </button>
          </div>
        </div>

        {buckets.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Sin historico aun.</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
            <Chart buckets={buckets} maxValue={maxValue} />
            <Legend buckets={buckets} />
          </div>
        )}
      </section>
    </div>
  );
}

function Chart({ buckets, maxValue }: { buckets: Bucket[]; maxValue: number }) {
  const barWidth = 24;
  const gap = 12;
  const groupWidth = barWidth * 4 + gap * 3;
  const chartWidth = buckets.length * (groupWidth + gap * 2);
  const chartHeight = 180;

  return (
    <div className="overflow-x-auto">
      <svg width={chartWidth} height={chartHeight + 40} viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`}>
        {buckets.map((b, i) => {
          const x0 = i * (groupWidth + gap * 2) + gap;
          const heights = [
            (b.payment / maxValue) * chartHeight,
            ((b.hours * 5) / maxValue) * chartHeight,
            (b.discounts / maxValue) * chartHeight,
            ((b.productivityCount > 0 ? b.productivitySum / b.productivityCount : 0) / 3) * chartHeight,
          ];
          const colors = ["#10b981", "#3b82f6", "#f59e0b", "#a855f7"];
          return (
            <g key={b.key}>
              {heights.map((h, j) => (
                <rect
                  key={j}
                  x={x0 + j * (barWidth + gap)}
                  y={chartHeight - h}
                  width={barWidth}
                  height={Math.max(0, h)}
                  fill={colors[j]}
                  rx={3}
                />
              ))}
              <text x={x0 + groupWidth / 2} y={chartHeight + 18} textAnchor="middle" fontSize="10" fill="#475569">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend({ buckets }: { buckets: Bucket[] }) {
  const totalPay = buckets.reduce((s, b) => s + b.payment, 0);
  const totalHours = buckets.reduce((s, b) => s + b.hours, 0);
  const totalDisc = buckets.reduce((s, b) => s + b.discounts, 0);
  const prodVals = buckets.flatMap((b) => (b.productivityCount > 0 ? [b.productivitySum / b.productivityCount] : []));
  const avgProd = prodVals.length > 0 ? prodVals.reduce((s, n) => s + n, 0) / prodVals.length : 0;

  return (
    <div className="space-y-2 text-xs">
      <LegendItem color="#10b981" label="Pago semanal" value={`S/ ${totalPay.toFixed(2)}`} />
      <LegendItem color="#3b82f6" label="Horas trabajadas" value={totalHours.toFixed(1)} />
      <LegendItem color="#f59e0b" label="Descuentos" value={`S/ ${totalDisc.toFixed(2)}`} />
      <LegendItem color="#a855f7" label="Productividad promedio" value={avgProd.toFixed(2)} />
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-2">
      <span className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded" style={{ background: color }} />
        <span className="text-slate-700">{label}</span>
      </span>
      <span className="font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className={`mt-1 text-sm ${strong ? "font-bold text-slate-950" : "font-semibold text-slate-800"}`}>
        {value}
      </p>
    </div>
  );
}
