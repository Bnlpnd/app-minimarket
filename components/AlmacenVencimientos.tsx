"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { matchesSearch } from "@/lib/searchUtils";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import {
  estadoVencimientoUI,
  fechaHoyInput,
  formatFechaCorta,
  labelOrigenLote,
} from "@/lib/loteUtils";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type {
  Almacen,
  LoteEstadoVencimiento,
  VistaLoteVencimiento,
} from "@/types/database";

type Filtro = "todos" | "vencidos" | "urgentes" | "proximos";

type Message = { type: "success" | "error"; text: string };

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export function AlmacenVencimientos() {
  const [lotes, setLotes] = useState<VistaLoteVencimiento[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [almacenId, setAlmacenId] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  // Edicion inline de fecha por lote.
  const [editFecha, setEditFecha] = useState<Record<string, string>>({});

  async function loadAlmacenes() {
    if (!supabase) return;
    const { data } = await supabase
      .from("almacenes")
      .select("*")
      .eq("activo", true)
      .order("nombre");
    setAlmacenes((data ?? []) as Almacen[]);
  }

  async function loadLotes() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "Sin Supabase." });
      return;
    }
    setIsLoading(true);
    const { data, error } = await fetchAllRows<VistaLoteVencimiento>(
      supabase
        .from("vista_lotes_vencimiento")
        .select("*")
        .order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
    );
    setIsLoading(false);
    if (error) {
      setMessage({ type: "error", text: `No se cargaron lotes: ${error.message}` });
      return;
    }
    setLotes(data ?? []);
  }

  useEffect(() => {
    void loadAlmacenes();
    void loadLotes();
  }, []);

  const filtrados = useMemo(() => {
    return lotes.filter((lote) => {
      if (almacenId && lote.almacen_id !== almacenId) return false;
      if (filtro === "vencidos" && lote.estado_vencimiento !== "vencido") return false;
      if (filtro === "urgentes" && lote.estado_vencimiento !== "urgente") return false;
      if (filtro === "proximos" && lote.estado_vencimiento !== "proximo") return false;
      if (search.trim()) {
        return matchesSearch(search, [
          lote.nombre_producto,
          lote.codigo_interno,
          lote.almacen_nombre,
          lote.notas,
        ]);
      }
      return true;
    });
  }, [lotes, filtro, almacenId, search]);

  const counts = useMemo(() => {
    return lotes.reduce(
      (acc, lote) => {
        if (lote.estado_vencimiento === "vencido") acc.vencidos++;
        else if (lote.estado_vencimiento === "urgente") acc.urgentes++;
        else if (lote.estado_vencimiento === "proximo") acc.proximos++;
        return acc;
      },
      { vencidos: 0, urgentes: 0, proximos: 0 },
    );
  }, [lotes]);

  async function descartarLote(loteId: string) {
    if (!supabase) return;
    const motivo = window.prompt(
      "Motivo del descarte (opcional). Esta accion resta el lote del stock del almacen.",
      "",
    );
    if (motivo === null) return; // canceled

    setSavingId(loteId);
    setMessage(null);
    const { error } = await supabase.rpc("descartar_lote", {
      p_lote_id: loteId,
      p_motivo: motivo || null,
    });
    setSavingId(null);
    if (error) {
      setMessage({ type: "error", text: `No se descarto: ${error.message}` });
      return;
    }
    setMessage({ type: "success", text: "Lote descartado y stock ajustado." });
    await loadLotes();
  }

  async function actualizarFecha(loteId: string) {
    if (!supabase) return;
    const nuevaFecha = editFecha[loteId];
    if (nuevaFecha === undefined) return;

    setSavingId(loteId);
    setMessage(null);
    const { error } = await supabase
      .from("producto_lotes")
      .update({ fecha_vencimiento: nuevaFecha || null })
      .eq("id", loteId);
    setSavingId(null);
    if (error) {
      setMessage({ type: "error", text: `No se actualizo: ${error.message}` });
      return;
    }
    setMessage({ type: "success", text: "Fecha de vencimiento actualizada." });
    setEditFecha((current) => {
      const next = { ...current };
      delete next[loteId];
      return next;
    });
    await loadLotes();
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

      {/* Resumen rapido con chips por estado. */}
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryChip
          label="Vencidos"
          count={counts.vencidos}
          tone="red"
          active={filtro === "vencidos"}
          onClick={() => setFiltro(filtro === "vencidos" ? "todos" : "vencidos")}
        />
        <SummaryChip
          label="≤ 7 dias"
          count={counts.urgentes}
          tone="orange"
          active={filtro === "urgentes"}
          onClick={() => setFiltro(filtro === "urgentes" ? "todos" : "urgentes")}
        />
        <SummaryChip
          label="≤ 30 dias"
          count={counts.proximos}
          tone="amber"
          active={filtro === "proximos"}
          onClick={() => setFiltro(filtro === "proximos" ? "todos" : "proximos")}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar producto, codigo, notas..."
            className={inputClassName}
          />
          <SearchableSelect
            value={almacenId}
            onChange={(id) => setAlmacenId(id)}
            options={almacenes.map((a) => ({ id: a.id, label: a.nombre }))}
            placeholder="Todos los almacenes"
          />
          <select
            value={filtro}
            onChange={(event) => setFiltro(event.target.value as Filtro)}
            className={inputClassName}
          >
            <option value="todos">Todos los lotes</option>
            <option value="vencidos">Solo vencidos</option>
            <option value="urgentes">≤ 7 dias</option>
            <option value="proximos">≤ 30 dias</option>
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">
            Lotes activos ({filtrados.length})
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Acciones: editar fecha o descartar (resta el lote del stock del almacen).
          </p>
        </div>

        {/* Desktop: tabla. */}
        <div className="hidden max-h-[70vh] overflow-auto lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Almacen</th>
                <th className="px-4 py-3">Cantidad</th>
                <th className="px-4 py-3">Vencimiento</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">Ingreso</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map((lote) => {
                const ui = estadoVencimientoUI(lote.estado_vencimiento);
                const editing = lote.id in editFecha;
                const fechaValue = editing
                  ? editFecha[lote.id]
                  : lote.fecha_vencimiento ?? "";
                return (
                  <tr key={lote.id} className={ui.row}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">{lote.nombre_producto}</p>
                      {lote.codigo_interno ? (
                        <p className="text-xs text-slate-500">{lote.codigo_interno}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{lote.almacen_nombre}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {Number(lote.cantidad_actual).toFixed(2).replace(/\.00$/, "")}{" "}
                      <span className="text-xs text-slate-500">
                        {lote.unidad_base ?? "und"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={fechaValue}
                        onChange={(event) =>
                          setEditFecha((current) => ({
                            ...current,
                            [lote.id]: event.target.value,
                          }))
                        }
                        className="h-9 rounded-md border border-slate-300 px-2 text-sm"
                      />
                      {lote.fecha_vencimiento && lote.dias_restantes !== null ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {lote.dias_restantes < 0
                            ? `Vencio hace ${Math.abs(lote.dias_restantes)} dias`
                            : lote.dias_restantes === 0
                              ? "Vence hoy"
                              : `Faltan ${lote.dias_restantes} dias`}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ui.badge}`}
                      >
                        {ui.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {labelOrigenLote(lote.origen)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatFechaCorta(lote.fecha_ingreso)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {editing ? (
                          <button
                            type="button"
                            disabled={savingId === lote.id}
                            onClick={() => void actualizarFecha(lote.id)}
                            className="h-9 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:bg-slate-300"
                          >
                            Guardar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={savingId === lote.id}
                          onClick={() => void descartarLote(lote.id)}
                          className="h-9 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          title="Restar este lote del stock del almacen"
                        >
                          Descartar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    No hay lotes con estos filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Mobile: tarjetas. */}
        <div className="divide-y divide-slate-100 lg:hidden">
          {filtrados.map((lote) => {
            const ui = estadoVencimientoUI(lote.estado_vencimiento);
            const editing = lote.id in editFecha;
            const fechaValue = editing
              ? editFecha[lote.id]
              : lote.fecha_vencimiento ?? "";
            return (
              <article key={lote.id} className={`p-4 ${ui.row}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-950">{lote.nombre_producto}</p>
                    <p className="text-xs text-slate-500">
                      {lote.almacen_nombre} ·{" "}
                      {Number(lote.cantidad_actual).toFixed(2).replace(/\.00$/, "")}{" "}
                      {lote.unidad_base ?? "und"} · {labelOrigenLote(lote.origen)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${ui.badge}`}
                  >
                    {ui.label}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={fechaValue}
                    onChange={(event) =>
                      setEditFecha((current) => ({
                        ...current,
                        [lote.id]: event.target.value,
                      }))
                    }
                    className="h-9 flex-1 rounded-md border border-slate-300 px-2 text-sm"
                  />
                  {editing ? (
                    <button
                      type="button"
                      disabled={savingId === lote.id}
                      onClick={() => void actualizarFecha(lote.id)}
                      className="h-9 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:bg-slate-300"
                    >
                      Guardar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={savingId === lote.id}
                    onClick={() => void descartarLote(lote.id)}
                    className="h-9 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Descartar
                  </button>
                </div>
                {lote.fecha_vencimiento && lote.dias_restantes !== null ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {lote.dias_restantes < 0
                      ? `Vencio hace ${Math.abs(lote.dias_restantes)} dias`
                      : lote.dias_restantes === 0
                        ? "Vence hoy"
                        : `Faltan ${lote.dias_restantes} dias`}
                    {" · "}
                    Ingreso {formatFechaCorta(lote.fecha_ingreso)}
                  </p>
                ) : null}
              </article>
            );
          })}
          {filtrados.length === 0 && !isLoading ? (
            <p className="p-4 text-center text-sm text-slate-500">
              No hay lotes con estos filtros.
            </p>
          ) : null}
        </div>
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500">Cargando lotes...</p>
        ) : null}
      </section>
    </div>
  );
}

function SummaryChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: "red" | "orange" | "amber";
  active: boolean;
  onClick: () => void;
}) {
  const toneClasses: Record<typeof tone, string> = {
    red: active
      ? "border-red-300 bg-red-100 text-red-800"
      : "border-red-200 bg-red-50 text-red-700",
    orange: active
      ? "border-orange-300 bg-orange-100 text-orange-800"
      : "border-orange-200 bg-orange-50 text-orange-700",
    amber: active
      ? "border-amber-300 bg-amber-100 text-amber-800"
      : "border-amber-200 bg-amber-50 text-amber-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg border p-4 text-left transition ${toneClasses[tone]}`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-2xl font-bold">{count}</span>
    </button>
  );
}

// Util para fix de TS sobre vencimiento desde el state.
export type _Estado = LoteEstadoVencimiento; // mantener referencia exportada
export { fechaHoyInput };
