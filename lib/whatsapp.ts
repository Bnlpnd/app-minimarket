import type { Cliente, DetallePedido, PagoMetodo, Pedido, Producto } from "@/types/database";

export type DetallePedidoWhatsapp = Pick<
  DetallePedido,
  "cantidad" | "precio_unitario" | "subtotal"
> & {
  productos: Pick<Producto, "nombre_producto"> | null;
};

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  return new Date(value).toLocaleDateString("es-PE");
}

function formatTime(value: string | null) {
  if (!value) {
    return "Sin hora";
  }

  return value.slice(0, 5);
}

function formatMetodoPago(value: PagoMetodo | null) {
  return value ? value.toUpperCase() : "Sin metodo";
}

export function generarMensajePedido(
  pedido: Pick<Pedido, "fecha_recojo" | "hora_recojo" | "metodo_pago" | "total">,
  cliente: Pick<Cliente, "nombres" | "telefono"> | null,
  detalles: DetallePedidoWhatsapp[],
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
    `Fecha de recojo: ${formatDate(pedido.fecha_recojo)}`,
    `Hora de recojo: ${formatTime(pedido.hora_recojo)}`,
    `Metodo de pago: ${formatMetodoPago(pedido.metodo_pago)}`,
    "",
    "Si el pago fue por Yape, revisar la captura en el sistema.",
  ].join("\n");
}

export function generarLinkWhatsApp(numeroNegocio: string, mensaje: string) {
  const numeroLimpio = numeroNegocio.replace(/\D/g, "");
  return `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(mensaje)}`;
}
