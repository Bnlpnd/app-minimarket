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

export type StockMovimientoTipo =
  | "ingreso"
  | "salida_venta"
  | "salida_pedido"
  | "ajuste"
  | "transferencia"
  | "merma"
  | "devolucion";

export type TipoEntrega = "llevar_ahora" | "recoger_despues" | "enviar";

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
  producto_base_id: string | null;
  unidades_equivalentes: number;
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

export interface Almacen {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductoAlmacen {
  id: string;
  producto_id: string;
  almacen_id: string;
  stock_actual: number;
  stock_minimo_local: number | null;
  costo_promedio: number | null;
  ubicacion_interna: string | null;
  created_at: string;
  updated_at: string;
}

export interface Presentacion {
  id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnidadBase {
  id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  observacion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductoPresentacionCompra {
  id: string;
  producto_id: string;
  proveedor_id: string | null;
  nombre_presentacion: string;
  unidades_por_presentacion: number;
  costo_presentacion: number | null;
  costo_unitario: number | null;
  es_principal: boolean;
  observacion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductoPrecioMayor {
  id: string;
  producto_id: string;
  cantidad_minima: number;
  precio_unitario: number;
  precio_total: number | null;
  tipo_precio: "paquete" | "unitario";
  descripcion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Rol {
  id: number;
  nombre: string;
  descripcion: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsuarioPerfil {
  id: string;
  rol_id: number | null;
  nombres: string | null;
  apellidos: string | null;
  telefono: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppUsuario {
  id: string;
  email: string;
  rol: "admin" | "trabajador" | "cliente";
  nombres: string;
  apellidos: string | null;
  telefono: string | null;
  pago_hora: number;
  horas_semana: number;
  gastos_semana: number;
  horario_laboral: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonalAsistencia {
  id: string;
  usuario_id: string;
  fecha: string;
  hora_ingreso: string | null;
  hora_salida: string | null;
  productividad: 1 | 2 | 3;
  observacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalDescuento {
  id: string;
  usuario_id: string;
  fecha: string;
  detalle: string;
  monto: number;
  created_at: string;
  updated_at: string;
}

export interface PersonalPago {
  id: string;
  usuario_id: string;
  semana_inicio: string;
  semana_fin: string;
  horas_trabajadas: number;
  pago_hora: number;
  descuentos: number;
  monto_pagado: number;
  estado: "pendiente" | "pagado";
  observacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cliente {
  id: string;
  nombres: string;
  apellidos: string | null;
  telefono: string | null;
  direccion: string | null;
  direccion_entrega: string | null;
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
  app_registrado_por_id: string | null;
  app_preparado_por_id: string | null;
  app_entregado_por_id: string | null;
  fecha_recojo: string | null;
  hora_recojo: string | null;
  subtotal: number;
  descuento: number;
  total: number;
  metodo_pago: PagoMetodo | null;
  tipo_entrega: TipoEntrega;
  direccion_entrega: string | null;
  referencia_entrega: string | null;
  nota_cliente: string | null;
  fecha_pedido: string;
  detalle_manual: string | null;
  monto_a_cuenta: number;
  estado_pago: PedidoEstadoPago;
  observaciones: string | null;
  stock_descontado: boolean;
  preparado_at: string | null;
  entregado_at: string | null;
  imagen_papel_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DetallePedido {
  id: string;
  pedido_id: string;
  producto_id: string;
  producto_stock_id: string | null;
  cantidad: number;
  cantidad_base: number | null;
  precio_unitario: number;
  subtotal: number;
  almacen_id: string | null;
  preparado: boolean;
  marcado_por_id: string | null;
  app_marcado_por_id: string | null;
  fecha_marcado: string | null;
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
  almacen_origen_id: string | null;
  almacen_destino_id: string | null;
  tipo: string;
  tipo_movimiento: StockMovimientoTipo;
  cantidad: number;
  costo_unitario: number | null;
  stock_anterior: number | null;
  stock_nuevo: number | null;
  referencia: string | null;
  motivo: string | null;
  observacion: string | null;
  usuario_id: string | null;
  registrado_por_id: string | null;
  created_at: string;
}

export interface AlmacenTransferenciaSolicitud {
  id: string;
  estado: "pendiente" | "enviado" | "recibido" | "cancelado";
  observacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlmacenTransferenciaItem {
  id: string;
  solicitud_id: string;
  producto_id: string;
  cantidad_solicitada: number;
  cantidad_recibida: number | null;
  almacen_origen_id: string | null;
  almacen_destino_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AbastecimientoPedido {
  id: string;
  proveedor_id: string | null;
  estado: "pendiente" | "enviado" | "comprado" | "cancelado";
  urgencia: "baja" | "normal" | "alta";
  observacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface AbastecimientoItem {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  observacion: string | null;
  created_at: string;
  updated_at: string;
}
