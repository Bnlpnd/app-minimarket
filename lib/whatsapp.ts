import { formatDate, formatTime } from "@/lib/dateUtils";
import type {
  Cliente,
  DetallePedido,
  PagoMetodo,
  Pedido,
  Producto,
  TipoEntrega,
} from "@/types/database";

export type DetallePedidoWhatsapp = Pick<
  DetallePedido,
  "cantidad" | "precio_unitario" | "subtotal"
> & {
  productos: Pick<Producto, "nombre_producto"> | null;
};

type PedidoWhatsapp = Pick<
  Pedido,
  | "fecha_recojo"
  | "hora_recojo"
  | "metodo_pago"
  | "total"
  | "tipo_entrega"
  | "direccion_entrega"
  | "referencia_entrega"
  | "nota_cliente"
>;

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatMetodoPago(value: PagoMetodo | null) {
  return value ? value.toUpperCase() : "Sin metodo";
}

function formatTipoEntrega(value: TipoEntrega | null) {
  if (value === "llevar_ahora") {
    return "Llevar ahora";
  }

  if (value === "recoger_despues") {
    return "Recoger despues";
  }

  if (value === "enviar") {
    return "Enviar";
  }

  return "Sin tipo de entrega";
}

export function generarMensajePedido(
  pedido: PedidoWhatsapp,
  cliente: Pick<Cliente, "nombres" | "telefono"> | null,
  detalles: DetallePedidoWhatsapp[],
  tieneCapturaYape = false,
) {
  const productos = detalles
    .map((detalle, index) => {
      const nombre = detalle.productos?.nombre_producto ?? "Producto";
      const cantidad = Number(detalle.cantidad);
      const precioUnitario = Number(detalle.precio_unitario);
      const subtotal = Number(detalle.subtotal);

      return `${index + 1}. ${cantidad} x ${nombre} - ${formatMoney(
        precioUnitario,
      )} c/u - Subtotal: ${formatMoney(subtotal)}`;
    })
    .join("\n");

  const entrega = [
    `Tipo de entrega: ${formatTipoEntrega(pedido.tipo_entrega)}`,
    pedido.tipo_entrega === "recoger_despues"
      ? `Recojo: ${formatDate(pedido.fecha_recojo)} ${formatTime(pedido.hora_recojo)}`
      : null,
    pedido.tipo_entrega === "enviar"
      ? `Direccion: ${pedido.direccion_entrega ?? "Sin direccion"}`
      : null,
    pedido.tipo_entrega === "enviar" && pedido.referencia_entrega
      ? `Referencia: ${pedido.referencia_entrega}`
      : null,
  ].filter(Boolean);

  return [
    "Nuevo pedido",
    "",
    `Cliente: ${cliente?.nombres ?? "Sin cliente"}`,
    `WhatsApp: ${cliente?.telefono ?? "Sin WhatsApp"}`,
    "",
    "Productos:",
    productos || "Sin productos registrados.",
    "",
    `Total: ${formatMoney(pedido.total)}`,
    ...entrega,
    `Metodo de pago: ${formatMetodoPago(pedido.metodo_pago)}`,
    tieneCapturaYape ? "Captura registrada en el sistema." : null,
    pedido.nota_cliente ? `Observaciones: ${pedido.nota_cliente}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function generarLinkWhatsApp(numeroNegocio: string, mensaje: string) {
  const numeroLimpio = numeroNegocio.replace(/\D/g, "");
  return `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(mensaje)}`;
}
