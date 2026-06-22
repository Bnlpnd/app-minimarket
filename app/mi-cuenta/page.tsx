"use client";

/* eslint-disable react-hooks/set-state-in-effect */

/**
 * Area del cliente (solo lectura): sus pedidos, su deuda y sus pagos/abonos.
 * No permite editar. Usa el encabezado de la tienda (sin sidebar admin).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StoreHeader } from "@/components/store/StoreHeader";
import { getStoredAppUser, setStoredAppUser, type StoredAppUser } from "@/lib/authRoles";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { formatDate } from "@/lib/dateUtils";
import type { ClienteAbono, Pedido } from "@/types/database";

type PedidoCliente = Pick<
  Pedido,
  | "id"
  | "estado"
  | "estado_pago"
  | "total"
  | "monto_a_cuenta"
  | "fecha_pedido"
  | "fecha_recojo"
  | "created_at"
  | "detalle_manual"
>;

function money(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  pago_enviado: "bg-orange-100 text-orange-800",
  pago_validado: "bg-sky-100 text-sky-800",
  en_preparacion: "bg-blue-100 text-blue-800",
  listo_para_recoger: "bg-santa-100 text-santa-800",
  entregado: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-slate-100 text-slate-600",
};

export default function MiCuentaPage() {
  const [session, setSession] = useState<StoredAppUser | null | "loading">("loading");
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [abonos, setAbonos] = useState<ClienteAbono[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const stored = getStoredAppUser();
      setSession(stored);
      if (!stored) {
        setLoading(false);
        return;
      }
      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? "Sin conexion a Supabase.");
        setLoading(false);
        return;
      }

      // Asegurar vinculo a cliente (identidad tomada del JWT) si falta.
      let clienteId = stored.cliente_id ?? null;
      if (!clienteId) {
        const { data } = await supabase.rpc("cliente_sync_self", {});
        const linked = data?.[0] as { cliente_id: string } | undefined;
        clienteId = linked?.cliente_id ?? null;
        if (clienteId) {
          const updated = { ...stored, cliente_id: clienteId };
          setStoredAppUser(updated);
          setSession(updated);
        }
      }

      if (!clienteId) {
        setLoading(false);
        return;
      }

      const [pedRes, aboRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select(
            "id,estado,estado_pago,total,monto_a_cuenta,fecha_pedido,fecha_recojo,created_at,detalle_manual",
          )
          .eq("cliente_id", clienteId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("cliente_abonos")
          .select("*")
          .eq("cliente_id", clienteId)
          .order("fecha_pago", { ascending: false })
          .limit(100),
      ]);

      if (pedRes.error) setError(`No se pudieron cargar tus pedidos: ${pedRes.error.message}`);
      setPedidos((pedRes.data ?? []) as PedidoCliente[]);
      setAbonos((aboRes.data ?? []) as ClienteAbono[]);
      setLoading(false);
    }
    void init();
  }, []);

  const deudaTotal = useMemo(
    () =>
      pedidos
        .filter((p) => p.estado !== "cancelado")
        .reduce(
          (sum, p) =>
            sum + Math.max(0, Number(p.total ?? 0) - Number(p.monto_a_cuenta ?? 0)),
          0,
        ),
    [pedidos],
  );
  const totalPagado = useMemo(
    () => abonos.reduce((sum, a) => sum + Number(a.monto_total ?? 0), 0),
    [abonos],
  );

  return (
    <div className="min-h-screen bg-crema">
      <StoreHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {session === "loading" || loading ? (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Cargando tu cuenta...
          </p>
        ) : !session ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
            <h1 className="font-display text-2xl font-semibold text-santa-900">
              Inicia sesión
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Entra con tu cuenta para ver tus pedidos, deudas y pagos.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex h-11 items-center rounded-md bg-santa-800 px-5 text-sm font-semibold text-white hover:bg-santa-900"
            >
              Ir a la tienda
            </Link>
          </div>
        ) : (
          <>
            <header className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-halo-600">
                Mi cuenta
              </p>
              <h1 className="font-display mt-1 text-3xl font-semibold text-santa-900">
                Hola, {session.nombres?.split(" ")[0] ?? "cliente"}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Aquí ves tus pedidos, tu deuda y tus pagos. Es solo lectura.
              </p>
            </header>

            {error ? (
              <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label="Pedidos" value={String(pedidos.length)} />
              <SummaryCard
                label="Deuda actual"
                value={money(deudaTotal)}
                tone={deudaTotal > 0 ? "debt" : "ok"}
              />
              <SummaryCard label="Total pagado" value={money(totalPagado)} />
            </section>

            <section className="mt-6">
              <h2 className="mb-3 text-base font-semibold text-slate-950">Mis pedidos</h2>
              {pedidos.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
                  Todavía no tienes pedidos.
                </p>
              ) : (
                <ul className="space-y-3">
                  {pedidos.map((p) => {
                    const saldo = Math.max(
                      0,
                      Number(p.total ?? 0) - Number(p.monto_a_cuenta ?? 0),
                    );
                    return (
                      <li
                        key={p.id}
                        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-950">
                              Pedido #{p.id.slice(0, 8)}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatDate(p.fecha_pedido ?? p.created_at)}
                            </p>
                          </div>
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${
                              ESTADO_BADGE[p.estado] ?? "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {p.estado.replaceAll("_", " ")}
                          </span>
                        </div>
                        {p.detalle_manual ? (
                          <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                            {p.detalle_manual}
                          </p>
                        ) : null}
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                          <span className="text-slate-500">
                            Total <strong className="text-slate-900">{money(p.total)}</strong>
                          </span>
                          {saldo > 0 ? (
                            <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                              Debes {money(saldo)}
                            </span>
                          ) : (
                            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                              Pagado
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="mt-8">
              <h2 className="mb-3 text-base font-semibold text-slate-950">Mis pagos</h2>
              {abonos.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
                  Aún no registras pagos.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Fecha</th>
                        <th className="px-4 py-3 font-medium">Método</th>
                        <th className="px-4 py-3 text-right font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {abonos.map((a) => (
                        <tr key={a.id}>
                          <td className="px-4 py-3 text-slate-700">{formatDate(a.fecha_pago)}</td>
                          <td className="px-4 py-3 capitalize text-slate-600">{a.metodo}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {money(a.monto_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "debt";
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          tone === "debt" ? "text-amber-700" : "text-santa-900"
        }`}
      >
        {value}
      </p>
    </article>
  );
}
