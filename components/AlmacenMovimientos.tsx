"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { formatDateTime } from "@/lib/dateUtils";
import type { Almacen, Producto, StockMovimiento } from "@/types/database";

type MovimientoRow = StockMovimiento & {
  productos: Pick<Producto, "codigo_interno" | "nombre_producto"> | null;
  almacen_origen: Pick<Almacen, "nombre"> | null;
  almacen_destino: Pick<Almacen, "nombre"> | null;
};

type Message = {
  type: "error" | "success";
  text: string;
};

function formatStock(value: number | null) {
  return Number(value ?? 0).toFixed(2).replace(/\.00$/, "");
}

function formatTipo(value: string | null) {
  return (value ?? "movimiento").replaceAll("_", " ");
}

export function AlmacenMovimientos() {
  const [movimientos, setMovimientos] = useState<MovimientoRow[]>([]);
  const [tipo, setTipo] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadMovimientos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let query = supabase
      .from("stock_movimientos")
      .select(
        `
          *,
          productos(codigo_interno,nombre_producto),
          almacen_origen:almacenes!stock_movimientos_almacen_origen_id_fkey(nombre),
          almacen_destino:almacenes!stock_movimientos_almacen_destino_id_fkey(nombre)
        `,
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (tipo) {
      query = query.eq("tipo_movimiento", tipo);
    }

    const { data, error } = await query;
    setIsLoading(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar movimientos: ${error.message}`,
      });
      setMovimientos([]);
      return;
    }

    setMovimientos((data ?? []) as MovimientoRow[]);
  }

  useEffect(() => {
    void loadMovimientos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  return (
    <div className="space-y-5">
      {message ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message.text}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <select
          value={tipo}
          onChange={(event) => setTipo(event.target.value)}
          className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:w-72"
        >
          <option value="">Todos los movimientos</option>
          <option value="ingreso">Ingreso</option>
          <option value="salida_venta">Salida venta</option>
          <option value="salida_pedido">Salida pedido</option>
          <option value="ajuste">Ajuste</option>
          <option value="transferencia">Transferencia</option>
          <option value="merma">Merma</option>
          <option value="devolucion">Devolucion</option>
        </select>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="hidden max-h-[70vh] overflow-auto lg:block">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Cantidad</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Destino</th>
                <th className="px-4 py-3 font-medium">Observacion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Cargando movimientos...
                  </td>
                </tr>
              ) : movimientos.length > 0 ? (
                movimientos.map((movimiento) => (
                  <tr key={movimiento.id}>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDateTime(movimiento.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">
                        {movimiento.productos?.nombre_producto ?? "Producto"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {movimiento.productos?.codigo_interno ?? "-"}
                      </p>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-700">
                      {formatTipo(movimiento.tipo_movimiento ?? movimiento.tipo)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {formatStock(movimiento.cantidad)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {movimiento.almacen_origen?.nombre ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {movimiento.almacen_destino?.nombre ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {movimiento.observacion ?? movimiento.motivo ?? "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No hay movimientos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 lg:hidden">
          {isLoading ? (
            <p className="text-sm text-slate-500">Cargando movimientos...</p>
          ) : movimientos.length > 0 ? (
            movimientos.map((movimiento) => (
              <article key={movimiento.id} className="rounded-lg border border-slate-200 p-4 text-sm">
                <p className="font-semibold text-slate-950">
                  {movimiento.productos?.nombre_producto ?? "Producto"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateTime(movimiento.created_at)} · {formatTipo(movimiento.tipo_movimiento ?? movimiento.tipo)}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  <Info label="Cantidad" value={formatStock(movimiento.cantidad)} />
                  <Info label="Origen" value={movimiento.almacen_origen?.nombre ?? "-"} />
                  <Info label="Destino" value={movimiento.almacen_destino?.nombre ?? "-"} />
                  <Info label="Obs." value={movimiento.observacion ?? movimiento.motivo ?? "-"} />
                </dl>
              </article>
            ))
          ) : (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
              No hay movimientos.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-950">{value}</dd>
    </div>
  );
}
