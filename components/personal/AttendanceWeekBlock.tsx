"use client";

import { useEffect, useState } from "react";
import type { PersonalAsistencia, AppUsuario } from "@/types/database";

type UsuarioInterno = Omit<AppUsuario, "rol"> & { rol: "admin" | "trabajador" };

type Props = {
  worker: UsuarioInterno;
  historyAsistencias: PersonalAsistencia[];
  viewingWeekStart: string;
  selectedDate: string;
  showIngreso: boolean;
  showSalida: boolean;
  isAdmin: boolean;
  isSaving: boolean;
  onChangeViewingWeek: (start: string) => void;
  onChangeSelectedDate: (date: string) => void;
  onToggleIngreso: () => void;
  onToggleSalida: () => void;
  onSaveIngreso: (date: string, hora: string, observacion: string) => Promise<void>;
  onSaveSalida: (date: string, hora: string, productividad: number) => Promise<void>;
  onEditAttendance: (item: PersonalAsistencia) => void;
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100";

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
  const fullNames = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
  return Array.from({ length: 7 }, (_, i) => {
    const next = new Date(start);
    next.setDate(start.getDate() + i);
    return { date: toInputDate(next), label: labels[i], full: fullNames[i] };
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

function formatTimeText(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "-";
}

export function AttendanceWeekBlock({
  worker,
  historyAsistencias,
  viewingWeekStart,
  selectedDate,
  showIngreso,
  showSalida,
  isAdmin,
  isSaving,
  onChangeViewingWeek,
  onChangeSelectedDate,
  onToggleIngreso,
  onToggleSalida,
  onSaveIngreso,
  onSaveSalida,
  onEditAttendance,
}: Props) {
  const days = getWeekDays(viewingWeekStart);
  const currentWeekStart = getCurrentWeekStart();
  const canNavigateNext = viewingWeekStart < currentWeekStart;
  const todayStr = toInputDate(new Date());

  // Filter records for the viewing week
  const weekRecords = historyAsistencias.filter(
    (item) => item.fecha >= days[0].date && item.fecha <= days[6].date,
  );

  const recordOfSelected = historyAsistencias.find(
    (item) => item.fecha === selectedDate,
  );
  const hasIngreso = Boolean(recordOfSelected?.hora_ingreso);
  const hasSalida = Boolean(recordOfSelected?.hora_salida);

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
            const rec = historyAsistencias.find((r) => r.fecha === d.date);
            const isSelected = selectedDate === d.date;
            const hasRecord = rec && (rec.hora_ingreso || rec.hora_salida);
            const isFuture = d.date > todayStr;
            return (
              <button
                key={d.date}
                type="button"
                disabled={isFuture}
                onClick={() => onChangeSelectedDate(d.date)}
                className={`flex h-12 w-12 flex-col items-center justify-center rounded-full text-xs font-bold ${isFuture ? "cursor-not-allowed bg-slate-100 text-slate-300 border border-slate-200" : isSelected ? "bg-santa-600 text-white" : hasRecord ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-white text-slate-600 border border-slate-300"}`}
                title={isFuture ? "Fecha futura — no se puede registrar" : undefined}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-950">{formatDateText(selectedDate)}</p>

          <IngresoSection
            show={showIngreso}
            onToggle={onToggleIngreso}
            existing={recordOfSelected}
            isAdmin={isAdmin}
            isSaving={isSaving}
            onSave={(hora, observacion) => onSaveIngreso(selectedDate, hora, observacion)}
          />

          <SalidaSection
            show={showSalida}
            onToggle={onToggleSalida}
            existing={recordOfSelected}
            isAdmin={isAdmin}
            isSaving={isSaving}
            onSave={(hora, prod) => onSaveSalida(selectedDate, hora, prod)}
          />

          {recordOfSelected && hasIngreso && hasSalida && !isAdmin ? (
            <p className="text-xs text-slate-500">Registro completado. Solo un admin puede modificarlo.</p>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-950">Asistencia semana</h3>
          <div className="mt-3 space-y-2">
            {weekRecords.length === 0 ? (
              <p className="text-sm text-slate-500">Sin registros esta semana.</p>
            ) : (
              days.map((d) => {
                const rec = weekRecords.find((r) => r.fecha === d.date);
                if (!rec) return null;
                return (
                  <div key={d.date} className="flex items-start justify-between gap-2 rounded-md border border-slate-100 p-2 text-xs">
                    <div>
                      <p className="font-medium text-slate-950">{d.full.slice(0,3)} {formatDateText(d.date)}</p>
                      <p className="text-slate-600">{formatTimeText(rec.hora_ingreso)} - {formatTimeText(rec.hora_salida)} | Prod {rec.productividad}</p>
                      {rec.observacion ? <p className="italic text-slate-500">{rec.observacion}</p> : null}
                    </div>
                    {isAdmin ? (
                      <button type="button" onClick={() => onEditAttendance(rec)} className="h-7 rounded-md border border-red-300 px-2 text-[10px] font-medium text-red-700">Editar</button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function IngresoSection({
  show,
  onToggle,
  existing,
  isAdmin,
  isSaving,
  onSave,
}: {
  show: boolean;
  onToggle: () => void;
  existing: PersonalAsistencia | undefined;
  isAdmin: boolean;
  isSaving: boolean;
  onSave: (hora: string, observacion: string) => void;
}) {
  const isLocked = Boolean(existing?.hora_ingreso) && !isAdmin;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between p-3 text-left">
        <span className="text-sm font-semibold text-slate-950">
          Ingreso {existing?.hora_ingreso ? `(${existing.hora_ingreso.slice(0,5)})` : ""}
        </span>
        <span className="text-xs text-slate-500">{show ? "v" : ">"}</span>
      </button>
      {show ? (
        <div className="border-t border-slate-100 p-3">
          {isLocked ? (
            <p className="text-xs text-slate-500">Solo el admin puede modificar este registro.</p>
          ) : (
            <IngresoForm
              defaultHora={existing?.hora_ingreso?.slice(0, 5) ?? ""}
              defaultObs={existing?.observacion ?? ""}
              isSaving={isSaving}
              onSave={onSave}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function IngresoForm({
  defaultHora,
  defaultObs,
  isSaving,
  onSave,
}: {
  defaultHora: string;
  defaultObs: string;
  isSaving: boolean;
  onSave: (hora: string, observacion: string) => void;
}) {
  const [hora, setHora] = useStateValue(defaultHora);
  const [obs, setObs] = useStateValue(defaultObs);
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Hora</span>
        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputClassName} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Observacion</span>
        <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputClassName} />
      </label>
      <button type="button" disabled={isSaving || !hora} onClick={() => onSave(hora, obs)} className="h-11 rounded-md bg-santa-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
        {isSaving ? "Guardando..." : "Guardar ingreso"}
      </button>
    </div>
  );
}

function SalidaSection({
  show,
  onToggle,
  existing,
  isAdmin,
  isSaving,
  onSave,
}: {
  show: boolean;
  onToggle: () => void;
  existing: PersonalAsistencia | undefined;
  isAdmin: boolean;
  isSaving: boolean;
  onSave: (hora: string, prod: number) => void;
}) {
  const isLocked = Boolean(existing?.hora_salida) && !isAdmin;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between p-3 text-left">
        <span className="text-sm font-semibold text-slate-950">
          Salida {existing?.hora_salida ? `(${existing.hora_salida.slice(0,5)})` : ""}
        </span>
        <span className="text-xs text-slate-500">{show ? "v" : ">"}</span>
      </button>
      {show ? (
        <div className="border-t border-slate-100 p-3">
          {isLocked ? (
            <p className="text-xs text-slate-500">Solo el admin puede modificar este registro.</p>
          ) : (
            <SalidaForm
              defaultHora={existing?.hora_salida?.slice(0, 5) ?? ""}
              defaultProd={String(existing?.productividad ?? 2)}
              isSaving={isSaving}
              onSave={onSave}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function SalidaForm({
  defaultHora,
  defaultProd,
  isSaving,
  onSave,
}: {
  defaultHora: string;
  defaultProd: string;
  isSaving: boolean;
  onSave: (hora: string, prod: number) => void;
}) {
  const [hora, setHora] = useStateValue(defaultHora);
  const [prod, setProd] = useStateValue(defaultProd);
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Hora</span>
        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputClassName} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Productividad</span>
        <select value={prod} onChange={(e) => setProd(e.target.value)} className={inputClassName}>
          <option value="1">1 - No la dio</option>
          <option value="2">2 - Normal</option>
          <option value="3">3 - Extra</option>
        </select>
      </label>
      <button type="button" disabled={isSaving || !hora} onClick={() => onSave(hora, Number(prod) || 2)} className="h-11 rounded-md bg-santa-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
        {isSaving ? "Guardando..." : "Guardar salida"}
      </button>
    </div>
  );
}

// tiny local useState that resets when default changes
function useStateValue(defaultValue: string): [string, (v: string) => void] {
  const [value, setValue] = useState(defaultValue);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setValue(defaultValue); }, [defaultValue]);
  return [value, setValue];
}
