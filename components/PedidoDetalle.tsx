"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { formatDateTime, formatTime } from "@/lib/dateUtils";
import { generarLinkWhatsApp, generarMensajePedido } from "@/lib/whatsapp";
import type {
  Cliente,
  DetallePedido,
  Pago,
  Pedido,
  PedidoEstado,
  Producto,
} from "@/types/database";

type UsuarioPerfil = {
  id: string;
  nombres: string | null;
  apellidos: string | null;
};

type PedidoDetalleData = Pedido & {
  clientes: Cliente | null;
  pagos: Pago | null | Pago[];
};

type DetalleConProducto = DetallePedido & {
  productos: Pick<
    Producto,
    "codigo_interno" | "nombre_producto" | "presentacion"
  > | null;
};

type Message = {
  type: "success" | "error";
  text: string;
};

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatEstado(value: string) {
  return value.replaceAll("_", " ");
}

function getPago(pedido: PedidoDetalleData | null) {
  if (!pedido) {
    return null;
  }

  return Array.isArray(pedido.pagos) ? pedido.pagos[0] : pedido.pagos;
}

function getUserName(user: UsuarioPerfil | undefined) {
  if (!user) {
    return "Sin registrar";
  }

  const fullName = `${user.nombres ?? ""} ${user.apellidos ?? ""}`.trim();
  return fullName || user.id;
}

const whatsappNegocio =
  process.env.NEXT_PUBLIC_WHATSAPP_NEGOCIO ?? "942025999";

export function PedidoDetalle({ pedidoId }: { pedidoId: string }) {
  const [pedido, setPedido] = useState<PedidoDetalleData | null>(null);
  const [detalles, setDetalles] = useState<DetalleConProducto[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, UsuarioPerfil>>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadUsuarios = useCallback(async (pedidoData: PedidoDetalleData) => {
    if (!supabase) {
      return;
    }

    const ids = [
      pedidoData.registrado_por_id,
      pedidoData.preparado_por_id,
      pedidoData.entregado_por_id,
    ].filter(Boolean) as string[];

    if (ids.length === 0) {
      setUsuarios({});
      return;
    }

    const { data, error } = await supabase
      .from("usuarios_perfil")
      .select("id, nombres, apellidos")
      .in("id", ids);

    if (error) {
      setUsuarios({});
      return;
    }

    setUsuarios(
      Object.fromEntries(
        ((data ?? []) as UsuarioPerfil[]).map((usuario) => [usuario.id, usuario]),
      ),
    );
  }, []);

  const loadPedido = useCallback(async () => {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const [pedidoResult, detalleResult] = await Promise.all([
      supabase
        .from("pedidos")
        .select(
          `
            *,
            clientes(*),
            pagos(*)
          `,
        )
        .eq("id", pedidoId)
        .single(),
      supabase
        .from("detalle_pedido")
        .select(
          `
            *,
            productos(codigo_interno, nombre_producto, presentacion)
          `,
        )
        .eq("pedido_id", pedidoId)
        .order("created_at", { ascending: true }),
    ]);

    if (pedidoResult.error) {
      setMessage({
        type: "error",
        text: `No se pudo cargar el pedido: ${pedidoResult.error.message}`,
      });
      setPedido(null);
      setDetalles([]);
      setIsLoading(false);
      return;
    }

    if (detalleResult.error) {
      setMessage({
        type: "error",
        text: `No se pudo cargar el detalle: ${detalleResult.error.message}`,
      });
      setDetalles([]);
    } else {
      setDetalles((detalleResult.data ?? []) as DetalleConProducto[]);
    }

    const pedidoData = pedidoResult.data as PedidoDetalleData;
    setPedido(pedidoData);
    await loadUsuarios(pedidoData);
    setIsLoading(false);
  }, [loadUsuarios, pedidoId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPedido();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPedido]);

  const pago = getPago(pedido);
  const totalDetalle = useMemo(() => {
    return detalles.reduce((sum, detalle) => sum + Number(detalle.subtotal), 0);
  }, [detalles]);
  const whatsappLink = useMemo(() => {
    if (!pedido) {
      return "#";
    }

    const mensaje = generarMensajePedido(
      pedido,
      pedido.clientes,
      detalles,
      Boolean(pago?.captura_yape_url),
    );
    return generarLinkWhatsApp(whatsappNegocio, mensaje);
  }, [detalles, pago?.captura_yape_url, pedido]);

  async function updatePedidoEstado(
    estado: PedidoEstado,
    successMessage: string,
    extraPayload: Record<string, string | boolean | null> = {},
  ) {
    if (!supabase || !pedido) {
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    const { error } = await supabase
      .from("pedidos")
      .update({ estado, ...extraPayload })
      .eq("id", pedido.id);

    setIsUpdating(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo actualizar el pedido: ${error.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: successMessage });
    await loadPedido();
  }

  async function validarPago() {
    if (!supabase || !pedido || !pago) {
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    const { error: pagoError } = await supabase
      .from("pagos")
      .update({ estado: "validado", validado_at: new Date().toISOString() })
      .eq("id", pago.id);

    if (pagoError) {
      setIsUpdating(false);
      setMessage({
        type: "error",
        text: `No se pudo validar el pago: ${pagoError.message}`,
      });
      return;
    }

    const { error: pedidoError } = await supabase
      .from("pedidos")
      .update({ estado: "pago_validado", estado_pago: "pagado" })
      .eq("id", pedido.id);

    setIsUpdating(false);

    if (pedidoError) {
      setMessage({
        type: "error",
        text: `Pago validado, pero no se pudo actualizar el pedido: ${pedidoError.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Pago validado correctamente." });
    await loadPedido();
  }

  async function rechazarPago() {
    if (!supabase || !pedido || !pago) {
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    const { error: pagoError } = await supabase
      .from("pagos")
      .update({ estado: "rechazado" })
      .eq("id", pago.id);

    if (pagoError) {
      setIsUpdating(false);
      setMessage({
        type: "error",
        text: `No se pudo rechazar el pago: ${pagoError.message}`,
      });
      return;
    }

    const { error: pedidoError } = await supabase
      .from("pedidos")
      .update({ estado: "pendiente", estado_pago: "debe" })
      .eq("id", pedido.id);

    setIsUpdating(false);

    if (pedidoError) {
      setMessage({
        type: "error",
        text: `Pago rechazado, pero no se pudo actualizar el pedido: ${pedidoError.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Pago rechazado correctamente." });
    await loadPedido();
  }

  if (isLoading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Cargando pedido...
      </section>
    );
  }

  if (!pedido) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        No se pudo cargar el pedido.
      </section>
    );
  }

  const cliente = pedido.clientes;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/pedidos"
          className="inline-flex h-10 w-fit items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Volver a pedidos
        </Link>
        <Link
          href="/preparacion"
          className="inline-flex h-10 w-fit items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700"
        >
          Ir a preparacion
        </Link>
        <a
          href={whatsappLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 w-fit items-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Enviar resumen por WhatsApp
        </a>
      </div>

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

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel title={`Pedido #${pedido.id.slice(0, 8)}`}>
            <div className="grid gap-3 md:grid-cols-4">
              <Info label="Estado" value={formatEstado(pedido.estado)} />
              <Info label="Fecha recojo" value={formatDateTime(pedido.fecha_recojo)} />
              <Info label="Hora recojo" value={formatTime(pedido.hora_recojo)} />
              <Info label="Total" value={formatMoney(pedido.total)} strong />
              <Info label="Entrega" value={pedido.tipo_entrega.replaceAll("_", " ")} />
            </div>
          </Panel>

          <Panel title="Productos del pedido">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">Codigo</th>
                    <th className="px-3 py-3 font-medium">Producto</th>
                    <th className="px-3 py-3 font-medium">Cantidad</th>
                    <th className="px-3 py-3 font-medium">Precio</th>
                    <th className="px-3 py-3 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detalles.length > 0 ? (
                    detalles.map((detalle) => (
                      <tr key={detalle.id}>
                        <td className="px-3 py-3 font-medium text-slate-950">
                          {detalle.productos?.codigo_interno ?? "-"}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <p className="font-medium text-slate-950">
                            {detalle.productos?.nombre_producto ?? "Producto"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {detalle.productos?.presentacion ?? "Sin presentacion"}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {Number(detalle.cantidad)}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {formatMoney(detalle.precio_unitario)}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-950">
                          {formatMoney(detalle.subtotal)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                        Este pedido no tiene productos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end text-sm">
              <p className="rounded-md bg-slate-50 px-4 py-2 font-semibold text-slate-950">
                Total detalle: {formatMoney(totalDetalle)}
              </p>
            </div>
          </Panel>

          <Panel title="Nota del cliente">
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              {pedido.nota_cliente || pedido.observaciones || "Sin nota registrada."}
            </p>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Cliente">
            <Info label="Nombre" value={cliente?.nombres ?? "Sin cliente"} />
            <Info label="WhatsApp" value={cliente?.telefono ?? "Sin WhatsApp"} />
            <Info
              label="Direccion"
              value={
                pedido.direccion_entrega ??
                cliente?.direccion_entrega ??
                cliente?.direccion ??
                "Sin direccion"
              }
            />
            <Info label="Referencia" value={cliente?.referencia ?? "Sin referencia"} />
          </Panel>

          <Panel title="Pago">
            <Info label="Metodo" value={pago?.metodo ?? pedido.metodo_pago ?? "Sin pago"} />
            <Info label="Estado pago" value={pago?.estado ?? pedido.estado_pago} />
            <Info label="Monto" value={formatMoney(pago?.monto ?? pedido.total)} strong />
            {pago?.captura_yape_url ? (
              <a
                href={pago.captura_yape_url}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pago.captura_yape_url}
                  alt="Captura de pago Yape"
                  className="mt-3 h-56 w-full rounded-md border border-slate-200 object-cover"
                />
              </a>
            ) : (
              <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                Sin captura de Yape.
              </p>
            )}
          </Panel>

          <Panel title="Responsables">
            <Info
              label="Registrado por"
              value={getUserName(
                pedido.registrado_por_id
                  ? usuarios[pedido.registrado_por_id]
                  : undefined,
              )}
            />
            <Info
              label="Preparado por"
              value={getUserName(
                pedido.preparado_por_id
                  ? usuarios[pedido.preparado_por_id]
                  : undefined,
              )}
            />
            <Info
              label="Entregado por"
              value={getUserName(
                pedido.entregado_por_id
                  ? usuarios[pedido.entregado_por_id]
                  : undefined,
              )}
            />
          </Panel>

          <Panel title="Acciones">
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => void validarPago()}
                disabled={isUpdating || !pago || pago.estado === "validado"}
                className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Validar pago
              </button>
              <button
                type="button"
                onClick={() => void rechazarPago()}
                disabled={isUpdating || !pago || pago.estado === "rechazado"}
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                Rechazar pago
              </button>
              <button
                type="button"
                onClick={() =>
                  void updatePedidoEstado(
                    "en_preparacion",
                    "Pedido enviado a preparacion. El stock se descuenta automaticamente.",
                  )
                }
                disabled={
                  isUpdating ||
                  pedido.estado === "en_preparacion" ||
                  pedido.estado === "entregado" ||
                  pedido.estado === "cancelado"
                }
                className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Pasar a en preparacion
              </button>
              <button
                type="button"
                onClick={() =>
                  void updatePedidoEstado(
                    "listo_para_recoger",
                    "Pedido marcado como listo para recoger.",
                  )
                }
                disabled={
                  isUpdating ||
                  pedido.estado === "listo_para_recoger" ||
                  pedido.estado === "entregado" ||
                  pedido.estado === "cancelado"
                }
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                Marcar listo para recoger
              </button>
              <button
                type="button"
                onClick={() =>
                  void updatePedidoEstado("entregado", "Pedido marcado como entregado.", {
                    entregado_at: new Date().toISOString(),
                  })
                }
                disabled={
                  isUpdating ||
                  pedido.estado === "entregado" ||
                  pedido.estado === "cancelado"
                }
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                Marcar entregado
              </button>
              <button
                type="button"
                onClick={() =>
                  void updatePedidoEstado("cancelado", "Pedido cancelado.")
                }
                disabled={isUpdating || pedido.estado === "cancelado"}
                className="h-10 rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                Cancelar
              </button>
            </div>
            <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
              La preparacion con checklist se mantiene en el modulo Preparacion.
            </p>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Info({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1 break-words text-sm capitalize ${
          strong ? "font-semibold text-slate-950" : "text-slate-700"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
