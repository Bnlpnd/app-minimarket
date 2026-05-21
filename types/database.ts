export type PedidoEstado =
  | "pendiente"
  | "pago_enviado"
  | "pago_validado"
  | "en_preparacion"
  | "listo_para_recoger"
  | "entregado"
  | "cancelado";

export type PagoMetodo = "yape" | "efectivo" | "otro" | "transferencia";

export type PagoEstado = "pendiente" | "enviado" | "validado" | "rechazado";

export type StockMovimientoTipo = "entrada" | "salida" | "ajuste" | "venta";

export interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export type PedidoEstadoPago = "pagado" | "debe";

export interface Subcategoria {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Marca {
  id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Producto {
  id: string;
  codigo_interno: string;
  categoria_id: string;
  subcategoria_id: string;
  nombre_producto: string;
  marca_id: string;
  presentacion: string | null;
  unidad_base: string | null;
  stock_actual: number | null;
  stock_minimo: number | null;
  precio_compra_referencial: number | null;
  precio_venta: number | null;
  imagen_url: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Cliente {
  id: string;
  nombres: string;
  apellidos: string | null;
  telefono: string | null;
  direccion: string | null;
  referencia: string | null;
  documento: string | null;
  observacion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Pedido {
  id: string;
  cliente_id: string | null;
  estado: PedidoEstado;
  registrado_por_id: string | null;
  preparado_por_id: string | null;
  entregado_por_id: string | null;
  fecha_recojo: string | null;
  hora_recojo: string | null;
  subtotal: number;
  descuento: number;
  total: number;
  metodo_pago: PagoMetodo | null;
  nota_cliente: string | null;
  fecha_pedido: string;
  detalle_manual: string | null;
  monto_a_cuenta: number;
  estado_pago: PedidoEstadoPago;
  observaciones: string | null;
  stock_descontado: boolean;
  preparado_at: string | null;
  entregado_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DetallePedido {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  preparado: boolean;
  cantidad_preparada: number | null;
  observacion_preparacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pago {
  id: string;
  pedido_id: string;
  metodo: PagoMetodo;
  estado: PagoEstado;
  monto: number;
  captura_yape_url: string | null;
  observacion_rechazo: string | null;
  validado_por_id: string | null;
  validado_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockMovimiento {
  id: string;
  producto_id: string;
  pedido_id: string | null;
  tipo: StockMovimientoTipo;
  cantidad: number;
  stock_anterior: number | null;
  stock_nuevo: number | null;
  motivo: string | null;
  registrado_por_id: string | null;
  created_at: string;
}
