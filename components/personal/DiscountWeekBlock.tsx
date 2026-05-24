"use client";

import type { FormEvent } from "react";
import type { PersonalDescuento, AppUsuario } from "@/types/database";

type UsuarioInterno = Omit<AppUsuario, "rol"> & { rol: "admin" | "trabajador" };

type DiscountForm = {
  fecha: string;
  detalle: string;
  monto: string;
};

type Props = {
  worker: UsuarioInterno;
  historyDescuentos: PersonalDescuento[];
  viewingWeekStart: string;
  selectedDate: string;
  isAdmin: boolean;
  isSaving: boolean;
  editingDiscountId: string | null;
  discountForm: DiscountForm;
  onChangeViewingWeek: (start: string) => void;
  onChangeSelectedDate: (date: string) => void;
  onDiscountChange: (key: keyof DiscountForm, value: string) => void;
  onSaveDiscount: (event: FormEvent<HTMLFormElement>) => void;
  onEditDiscount: (item: PersonalDescuento) => void;
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function toInputDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function getWeekDays(startStr: string) {
  const [y, m, d] = startStr.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1);
  start.setHours(0, 0, 0, 0);
  const labels = ["L", "M", "Mi", "J", "V", "S", "D"];
  return Array.from({ length: 7 }, (_, i) => {
    const next = new Date(start);
    next.setDate(start.getDate() + i);
    return { date: toInputDate(next), label: labels[i] };
  });
}

function shiftWeek(startStr: string, delta: number) {
  const [y, m, d] = startStr.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1);
  start.setDate(start.getDate() + delta * 7);
  return toInputDate(start);
}

function getCurrentWeekStart() {
  const date = new Date();
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  return toInputDate(start);
}

function formatDateText(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-");
  const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const monthIdx = Number(m) - 1;
  if (!y || !m || !d || monthIdx < 0 || monthIdx > 11) return value;
  return `${Number(d)} ${monthNames[monthIdx]} ${y}`;
}

function numberValue(value: number | null | undefined) {
  return Number(value ?? 0);
}

export function DiscountWeekBlock({
  worker,
  historyDescuentos,
  viewingWeekStart,
  selectedDate,
  isAdmin,
  isSaving,
  editingDiscountId,
  discountForm,
  onChangeViewingWeek,
  onChangeSelectedDate,
  onDiscountChange,
  onSaveDiscount,
  onEditDiscount,
}: Props) {
  const days = getWeekDays(viewingWeekStart);
  const currentWeekStart = getCurrentWeekStart();
  const canNavigateNext = viewingWeekStart < currentWeekStart;

  const weekRecords = historyDescuentos.filter(
    (item) => item.fecha >= days[0].date && item.fecha <= days[6].date,
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-950">{worker.nombres} {worker.apellidos ?? ""}</span>
          <button type="button" onClick={() => onChangeViewingWeek(shiftWeek(viewingWeekStart, -1))} className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium">{"<"}</button>
          <span className="text-sm text-slate-700">{formatDateText(days[0].date)} - {formatDateText(days[6].date)}</span>
          <button type="button" disabled={!canNavigateNext} onClick={() => onChangeViewingWeek(shiftWeek(viewingWeekStart, 1))} className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium disabled:opacity-40">{">"}</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {days.map((d) => {
            const hasDiscount = historyDescuentos.some((r) => r.fecha === d.date);
            const isSelected = selectedDate === d.date;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => { onChangeSelectedDate(d.date); onDiscountChange("fecha", d.date); }}
                className={`flex h-12 w-12 flex-col items-center justify-center rounded-full text-xs font-bold ${isSelected ? "bg-emerald-600 text-white" : hasDiscount ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-white text-slate-600 border border-slate-300"}`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={onSaveDiscount} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-950">{formatDateText(selectedDate)}</p>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Detalle</span>
            <input value={discountForm.detalle} onChange={(e) => onDiscountChange("detalle", e.target.value)} className={inputClassName} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Monto</span>
            <input type="number" min="0" step="0.01" value={discountForm.monto} onChange={(e) => onDiscountChange("monto", e.target.value)} className={inputClassName} />
          </label>
          <button type="submit" disabled={isSaving} className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
            {isSaving ? "Guardando..." : editingDiscountId ? "Actualizar" : "Guardar"}
          </button>
        </form>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-950">Descuentos semana</h3>
          <div className="mt-3 space-y-2">
            {weekRecords.length === 0 ? (
              <p className="text-sm text-slate-500">Sin descuentos esta semana.</p>
            ) : (
              weekRecords.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-2 rounded-md border border-slate-100 p-2 text-xs">
                  <div>
                    <p className="font-medium text-slate-950">{formatDateText(item.fecha)}</p>
                    <p className="text-slate-600">{item.detalle}</p>
                    <p className="font-semibold text-slate-950">S/ {numberValue(item.monto).toFixed(2)}</p>
                  </div>
                  {isAdmin ? (
                    <button type="button" onClick={() => onEditDiscount(item)} className="h-7 rounded-md border border-red-300 px-2 text-[10px] font-medium text-red-700">Editar</button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
