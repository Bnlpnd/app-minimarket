"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { formatDate, formatTime } from "@/lib/dateUtils";
import type { Almacen, Cliente, DetallePedido, Pedido, Producto } from "@/types/database";

type UsuarioPerfil = {
  id: string;
  nombres: string | null;
  apellidos: string | null;
  activo: boolean;
};

type PedidoPreparacion = Pedido & {
  clientes: Pick<Cliente, "nombres" | "telefono"> | null;
};

type DetallePreparacion = DetallePedido & {
  productos: Pick<
    Producto,
    "codigo_interno" | "nombre_producto" | "presentacion" | "stock_actual"
  > | null;
  almacenes: Pick<Almacen, "nombre"> | null;
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

function getUserName(user: UsuarioPerfil) {
  const fullName = `${user.nombres ?? ""} ${user.apellidos ?? ""}`.trim();
  return fullName || user.id;
}

export function PreparacionModule() {
  const [pedidos, setPedidos] = useState<PedidoPreparacion[]>([]);
  const [selectedPedido, setSelectedPedido] = useState<PedidoPreparacion | null>(
    null,
  );
  const [detalles, setDetalles] = useState<DetallePreparacion[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioPerfil[]>([]);
  const [preparadorId, setPreparadorId] = useState("");
  const [entregadorId, setEntregadorId] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetalle, setIsLoadingDetalle] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  async function getCurrentUserProfileId() {
    if (!supabase) {
      return null;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      return null;
    }

    const { data } = await supabase
      .from("usuarios_perfil")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    return data?.id ?? null;
  }

  const loadPedidos = useCallback(async () => {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const [pedidosResult, usuariosResult] = await Promise.all([
      supabase
        .from("pedidos")
        .select(
          `
            *,
            clientes(nombres, telefono)
          `,
        )
        .in("estado", [
          "pendiente",
          "pago_validado",
          "en_preparacion",
          "listo_para_recoger",
        ])
        .order("fecha_recojo", { ascending: true }),
      supabase
        .from("usuarios_perfil")
        .select("id,nombres,apellidos,activo")
        .eq("activo", true)
        .order("nombres", { ascending: true }),
    ]);

    if (pedidosResult.error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar pedidos de preparacion: ${pedidosResult.error.message}`,
      });
      setPedidos([]);
    } else {
      setPedidos(
        ((pedidosResult.data ?? []) as PedidoPreparacion[]).filter((pedido) => {
          if (pedido.estado === "pendiente") {
            return pedido.metodo_pago === "efectivo";
          }

          return true;
        }),
      );
    }

    if (usuariosResult.error) {
      setUsuarios([]);
    } else {
      setUsuarios((usuariosResult.data ?? []) as UsuarioPerfil[]);
    }

    setIsLoading(false);
  }, []);

  async function loadDetalle(pedido: PedidoPreparacion) {
    if (!supabase) {
      return;
    }

    setSelectedPedido(pedido);
    setPreparadorId(pedido.preparado_por_id ?? "");
    setEntregadorId(pedido.entregado_por_id ?? "");
    setIsLoadingDetalle(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("detalle_pedido")
      .select(
        `
          *,
          productos(codigo_interno,nombre_producto,presentacion,stock_actual),
          almacenes(nombre)
        `,
      )
      .eq("pedido_id", pedido.id)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo cargar el checklist: ${error.message}`,
      });
      setDetalles([]);
    } else {
      setDetalles((data ?? []) as DetallePreparacion[]);
    }

    setIsLoadingDetalle(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPedidos();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPedidos]);

  const allPrepared = useMemo(() => {
    return detalles.length > 0 && detalles.every((detalle) => detalle.preparado);
  }, [detalles]);

  async function pasarEnPreparacion() {
    if (!supabase || !selectedPedido) {
      return;
    }

    const currentUserId = await getCurrentUserProfileId();
    const responsableId = preparadorId || currentUserId;

    if (usuarios.length > 0 && !responsableId) {
      setMessage({
        type: "error",
        text: "Selecciona un responsable de preparacion.",
      });
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    const { error } = await supabase
      .from("pedidos")
      .update({
        estado: "en_preparacion",
        preparado_por_id: responsableId,
        preparado_at: new Date().toISOString(),
      })
      .eq("id", selectedPedido.id);

    setIsUpdating(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo pasar a preparacion: ${error.message}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text: "Pedido en preparacion. El stock se desconto una sola vez.",
    });
    await loadPedidos();
    await loadDetalle({ ...selectedPedido, estado: "en_preparacion" });
  }

  async function updateChecklist(detalle: DetallePreparacion, preparado: boolean) {
    if (!supabase) {
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    const currentUserId = await getCurrentUserProfileId();
    const marcadorId = preparado ? currentUserId ?? (preparadorId || null) : null;
    const { error } = await supabase
      .from("detalle_pedido")
      .update({
        preparado,
        cantidad_preparada: preparado ? detalle.cantidad : null,
        marcado_por_id: marcadorId,
        fecha_marcado: preparado ? new Date().toISOString() : null,
      })
      .eq("id", detalle.id);

    setIsUpdating(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo actualizar el checklist: ${error.message}`,
      });
      return;
    }

    if (selectedPedido) {
      await loadDetalle(selectedPedido);
    }
  }

  async function marcarListo() {
    if (!supabase || !selectedPedido) {
      return;
    }

    if (!allPrepared) {
      setMessage({
        type: "error",
        text: "Completa todo el checklist antes de marcar listo para recoger.",
      });
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    const { error } = await supabase
      .from("pedidos")
      .update({ estado: "listo_para_recoger" })
      .eq("id", selectedPedido.id);

    setIsUpdating(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo marcar listo: ${error.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Pedido listo para recoger." });
    await loadPedidos();
    await loadDetalle({ ...selectedPedido, estado: "listo_para_recoger" });
  }

  async function marcarEntregado() {
    if (!supabase || !selectedPedido) {
      return;
    }

    const currentUserId = await getCurrentUserProfileId();
    const responsableId = entregadorId || currentUserId;

    if (usuarios.length > 0 && !responsableId) {
      setMessage({
        type: "error",
        text: "Selecciona quien entrega el pedido.",
      });
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    const { error } = await supabase
      .from("pedidos")
      .update({
        estado: "entregado",
        entregado_por_id: responsableId,
        entregado_at: new Date().toISOString(),
      })
      .eq("id", selectedPedido.id);

    setIsUpdating(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo marcar entregado: ${error.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Pedido marcado como entregado." });
    setSelectedPedido(null);
    setDetalles([]);
    await loadPedidos();
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

      <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-base font-semibold text-slate-950">
              Cola de preparacion
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Pagos validados y pendientes en efectivo listos para preparar.
            </p>
          </div>
          <div className="max-h-[680px] space-y-2 overflow-auto p-4">
            {isLoading ? (
              <p className="text-sm text-slate-500">Cargando pedidos...</p>
            ) : pedidos.length > 0 ? (
              pedidos.map((pedido) => (
                <button
                  key={pedido.id}
                  type="button"
                  onClick={() => void loadDetalle(pedido)}
                  className={`w-full rounded-md border p-3 text-left text-sm hover:bg-slate-50 ${
                    selectedPedido?.id === pedido.id
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200"
                  }`}
                >
                  <span className="block font-medium text-slate-950">
                    #{pedido.id.slice(0, 8)} - {pedido.clientes?.nombres ?? "Sin cliente"}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                      {formatDate(pedido.fecha_recojo)} {formatTime(pedido.hora_recojo)}
                  </span>
                  <span className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">
                    {formatEstado(pedido.estado)}
                  </span>
                </button>
              ))
            ) : (
              <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                No hay pedidos para preparar.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {selectedPedido ? (
            <>
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">
                      Pedido #{selectedPedido.id.slice(0, 8)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {selectedPedido.clientes?.nombres ?? "Sin cliente"} -{" "}
                      {selectedPedido.clientes?.telefono ?? "Sin WhatsApp"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Total: {formatMoney(selectedPedido.total)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600 capitalize">
                      Entrega: {selectedPedido.tipo_entrega.replaceAll("_", " ")}
                      {selectedPedido.tipo_entrega === "enviar"
                        ? ` - ${selectedPedido.direccion_entrega ?? "Sin direccion"}`
                        : ""}
                    </p>
                  </div>
                  <Link
                    href={`/pedidos/${selectedPedido.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Ver detalle
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      Responsable de preparacion
                    </span>
                    <select
                      value={preparadorId}
                      onChange={(event) => setPreparadorId(event.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="">Usuario actual o sin asignar</option>
                      {usuarios.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>
                          {getUserName(usuario)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      Responsable de entrega
                    </span>
                    <select
                      value={entregadorId}
                      onChange={(event) => setEntregadorId(event.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="">Usuario actual o sin asignar</option>
                      {usuarios.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>
                          {getUserName(usuario)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void pasarEnPreparacion()}
                    disabled={
                      isUpdating ||
                      selectedPedido.estado === "en_preparacion" ||
                      selectedPedido.estado === "listo_para_recoger"
                    }
                    className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Pasar a en preparacion
                  </button>
                  <button
                    type="button"
                    onClick={() => void marcarListo()}
                    disabled={isUpdating || selectedPedido.estado === "listo_para_recoger"}
                    className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Marcar listo
                  </button>
                  <button
                    type="button"
                    onClick={() => void marcarEntregado()}
                    disabled={isUpdating || selectedPedido.estado !== "listo_para_recoger"}
                    className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    Marcar entregado
                  </button>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-5">
                  <h2 className="text-base font-semibold text-slate-950">
                    Checklist
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Marca cada producto cuando este preparado.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Listo</th>
                        <th className="px-4 py-3 font-medium">Producto</th>
                        <th className="px-4 py-3 font-medium">Cantidad</th>
                    <th className="px-4 py-3 font-medium">Almacen</th>
                    <th className="px-4 py-3 font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isLoadingDetalle ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            Cargando checklist...
                          </td>
                        </tr>
                      ) : detalles.length > 0 ? (
                        detalles.map((detalle) => (
                          <tr key={detalle.id}>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={detalle.preparado}
                                onChange={(event) =>
                                  void updateChecklist(detalle, event.target.checked)
                                }
                                className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-950">
                                {detalle.productos?.nombre_producto ?? "Producto"}
                              </p>
                              <p className="text-xs text-slate-500">
                                {detalle.productos?.codigo_interno ?? "Sin codigo"} -{" "}
                                {detalle.productos?.presentacion ?? "Sin presentacion"}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {Number(detalle.cantidad)}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {detalle.almacenes?.nombre ?? "Tienda"}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-950">
                              {formatMoney(detalle.subtotal)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            El pedido no tiene detalle.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
              Selecciona un pedido para ver su checklist.
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
