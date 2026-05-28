# Schema de Supabase y patrones de query -- app-minimarket

Usa esta referencia cuando trabajes con consultas Supabase, tipos TypeScript o esquema de base de datos en este proyecto.

## Stack

- Next.js 16.2.6 + React 19.2.4 + TypeScript 5 (strict)
- Supabase JS ^2.106.1 -- client en `lib/supabaseClient.ts`
- El client puede ser `null` si faltan env vars -- siempre verificar `if (!supabase)` antes de usar
- Path alias: `@/*` apunta a la raiz del proyecto
- Moneda: Soles peruanos (S/)

## Client Supabase

```
// lib/supabaseClient.ts
export const supabase: SupabaseClient | null
export const supabaseConfigError: string | null
```

- `cleanEnvValue()` strip comillas de env vars
- Auth config: `persistSession: true, autoRefreshToken: true`
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Gotchas / trampas verificadas

Leer esto ANTES de tocar stock, compras o autorizacion. Todo confirmado en el codigo / migraciones.

- ⚠️ **SEGURIDAD: NINGUNA tabla tiene RLS.** Todos los grants son `to anon, authenticated` (cualquier usuario logueado). La proteccion admin/trabajador es SOLO client-side: ocultar botones/links en el Sidebar + `checkAccess()` que redirige. Cualquiera con sesion (o el anon key) puede llamar cualquier tabla/RPC directo. Los RPC son `SECURITY DEFINER` (corren como owner, ignoran permisos del caller). NO confiar en el cliente para autorizacion; cualquier validacion real tendria que ir en el RPC.
- ⚠️ **Columnas GENERATED (no escribirlas, fallan o se ignoran):**
  - `proveedor_compras.saldo` = `total - monto_pagado` (`generated always ... stored`).
  - `proveedor_compra_items.subtotal` = `cantidad * precio_unitario` (`generated always ... stored`).
  - `proveedor_compras.monto_pagado` y `estado_pago` los setea un TRIGGER al insertar/actualizar/borrar en `proveedor_pagos` (`recalcular_pago_compra`) y al cambiar `total`/`monto_pagado` de la cabecera (`recalcular_estado_compra`). **Re-leer la fila despues de escribir**, no asumir el valor calculado en el cliente.
- ⚠️ **`stock_movimientos` tiene DOS columnas de tipo:** `tipo` (legacy, NOT NULL) y `tipo_movimiento` (la actual). Todo INSERT debe llenar AMBAS o falla con `null value in column "tipo" violates not-null constraint`. Esto rompio `guardar_stock_desglosado` y se arreglo en `20260527040000`. Mismo valor en ambas (ej. `'ajuste', 'ajuste'`).
- ⚠️ **`ajustar_stock` hace SET ABSOLUTO** de `producto_almacen.stock_actual = p_stock_contado` (NO incrementa) y **NO toca** `producto_almacen_presentacion` ni `unidades_sueltas`. Resultado: tras un ajuste, el desglose por presentacion queda desincronizado del total. Para mantener el desglose coherente usar `guardar_stock_desglosado` en vez de `ajustar_stock`.

## Tablas y tipos (types/database.ts)

### Enums como union types

| Tipo | Valores |
|------|---------|
| `PedidoEstado` | `pendiente`, `pago_enviado`, `pago_validado`, `en_preparacion`, `listo_para_recoger`, `entregado`, `cancelado` |
| `PagoMetodo` | `yape`, `efectivo`, `otro`, `transferencia` |
| `PagoEstado` | `pendiente`, `enviado`, `validado`, `rechazado` |
| `StockMovimientoTipo` | `ingreso`, `salida_venta`, `salida_pedido`, `ajuste`, `transferencia`, `merma`, `devolucion` |
| `TipoEntrega` | `llevar_ahora`, `recoger_despues`, `enviar` |
| `PedidoEstadoPago` | `pagado`, `debe` |
| `ProveedorCompraEstadoPago` | `pagado`, `parcial`, `pendiente` |
| `ProveedorCompraTipoDoc` | `boleta`, `factura`, `nota`, `sin_documento` |
| `ProveedorPagoMetodo` | `efectivo`, `yape`, `transferencia`, `otro` |
| `ProductoLoteOrigen` | `inicial`, `compra`, `transferencia`, `ajuste` |
| `LoteEstadoVencimiento` | `vencido`, `urgente`, `proximo`, `ok`, `null` |

### Interfaces principales

**Producto** (tabla `productos`)
- `id`, `codigo_interno` (autogenerado), `categoria_id`, `subcategoria_id`, `nombre_producto`, `marca_id`
- `producto_base_id: string | null` -- referencia al producto que guarda inventario (para presentaciones derivadas)
- `unidades_equivalentes: number` -- cuantas unidades base equivale una unidad de este producto (default 1)
- `presentacion: string | null`, `unidad_base: string | null`
- `stock_actual: number | null`, `stock_minimo: number | null`
- `precio_compra_referencial: number | null`, `precio_venta: number | null`
- `imagen_url: string | null`, `activo: boolean`
- `created_at`, `updated_at`

**ProductoAlmacen** (tabla `producto_almacen`)
- `id`, `producto_id`, `almacen_id` (unique `producto_id,almacen_id`), `stock_actual: number` (fuente de verdad del total)
- `unidades_sueltas: number` -- unidades fuera de cualquier presentacion. `stock_actual = SUM(pres x factor) + unidades_sueltas` (lo mantiene `guardar_stock_desglosado`)
- `stock_minimo_local: number | null`, `costo_promedio: number | null`, `ubicacion_interna: string | null`

**ProductoAlmacenPresentacion** (tabla `producto_almacen_presentacion`) -- NUEVA (`20260527030000`)
- `id`, `producto_id`, `almacen_id`
- `presentacion_compra_id` -> `producto_presentaciones_compra.id`
- `cantidad: number` -- cantidad REAL de esa presentacion en ese almacen (lo que cargas es lo que ves; ya no se recalcula partiendo el total)
- `updated_at`
- Unique: `(producto_id, almacen_id, presentacion_compra_id)`

**ProductoLote** (tabla `producto_lotes`) -- NUEVA (`20260526150000`)
- `id`, `producto_id`, `almacen_id`
- `cantidad_inicial: number` (check > 0), `cantidad_actual: number` (check >= 0; se ajusta al descartar)
- `fecha_ingreso: string` (default current_date), `fecha_vencimiento: string | null`
- `origen: ProductoLoteOrigen`, `notas: string | null`, `activo: boolean`
- Lotes = metadata para alertas de vencimiento. Las ventas NO descuentan de lote (sin FIFO); `producto_almacen.stock_actual` sigue siendo la verdad del "cuanto hay".

**ProductoPresentacionCompra** (tabla `producto_presentaciones_compra`)
- `id`, `producto_id`, `proveedor_id: string | null`
- `nombre_presentacion`, `unidades_por_presentacion`, `costo_presentacion: number | null`
- `costo_unitario: number | null`, `es_principal: boolean`
- `observacion: string | null`, `activo: boolean`

**ProductoPrecioMayor** (tabla `producto_precios_mayor`)
- `id`, `producto_id`, `cantidad_minima`, `precio_unitario`
- `precio_total: number | null` -- precio total del paquete (si tipo_precio=paquete)
- `tipo_precio: "paquete" | "unitario"` -- como interpretar el precio
- `descripcion: string | null`, `activo`

**Pedido** (tabla `pedidos`)
- `id`, `cliente_id: string | null`, `estado: PedidoEstado`
- Audit trail: `registrado_por_id`, `preparado_por_id`, `entregado_por_id` (perfil)
- Audit trail app: `app_registrado_por_id`, `app_preparado_por_id`, `app_entregado_por_id` (app_usuarios)
- `fecha_recojo`, `hora_recojo`, `subtotal`, `descuento`, `total`
- `metodo_pago: PagoMetodo | null`, `tipo_entrega: TipoEntrega`
- `direccion_entrega`, `referencia_entrega`, `nota_cliente`
- `fecha_pedido`, `detalle_manual: string | null`
- `monto_a_cuenta: number`, `estado_pago: PedidoEstadoPago`
- `observaciones`, `stock_descontado: boolean`
- `preparado_at`, `entregado_at`
- `imagen_papel_url: string | null` -- foto del pedido escrito en papel
- `created_at`, `updated_at`

**DetallePedido** (tabla `detalle_pedido`)
- `id`, `pedido_id`, `producto_id`, `cantidad`, `precio_unitario`, `subtotal`
- `producto_stock_id: string | null` -- producto base que guarda inventario (auto via trigger)
- `cantidad_base: number | null` -- cantidad en unidades base (auto via trigger)
- `almacen_id: string | null`, `preparado: boolean`
- `marcado_por_id`, `app_marcado_por_id`, `fecha_marcado`
- `cantidad_preparada: number | null`, `observacion_preparacion: string | null`

**Pago** (tabla `pagos`)
- `id`, `pedido_id`, `metodo: PagoMetodo`, `estado: PagoEstado`, `monto: number`
- `captura_yape_url: string | null`, `observacion_rechazo: string | null`
- `validado_por_id`, `validado_at`

**StockMovimiento** (tabla `stock_movimientos`)
- `id`, `producto_id`, `pedido_id: string | null`
- `almacen_origen_id`, `almacen_destino_id`
- `tipo: string` (legacy NOT NULL) + `tipo_movimiento: StockMovimientoTipo` -- AMBOS obligatorios al insertar (ver Gotchas)
- `cantidad`, `costo_unitario`, `stock_anterior`, `stock_nuevo`
- `referencia`, `motivo`, `observacion`, `usuario_id`, `registrado_por_id`

**Cliente** (tabla `clientes`)
- `id`, `nombres`, `apellidos`, `telefono`, `direccion`, `direccion_entrega`
- `referencia`, `documento`, `observacion`, `activo`

**AppUsuario** (tabla `app_usuarios`)
- `id`, `email`, `rol: "admin" | "trabajador" | "cliente"`
- `nombres`, `apellidos: string | null`, `telefono: string | null`
- `pago_hora: number`, `horas_semana: number`, `gastos_semana: number`
- `horario_laboral: string | null`
- `bono_asistencia_completa: number` -- bono semanal si asiste completo (default 0; `20260526100000`)
- `activo`

**PersonalTurno** (tabla `personal_turnos`) -- NUEVA (`20260526100000`)
- `id`, `usuario_id`, `nombre`
- `dias_aplica: number[]` -- dias JS de la semana: 0=Dom, 1=Lun, ..., 6=Sab (smallint[], check cardinality > 0)
- `hora_inicio: string`, `hora_fin: string` (time; check `hora_fin > hora_inicio`)
- `monto_pago: number` -- lo que cobra el dia si cumple el turno; `tarifa_hora = monto_pago / horas(inicio, fin)` se calcula en runtime
- `activo: boolean`, `created_at`, `updated_at`

**PersonalAsistencia** (tabla `personal_asistencias`)
- `id`, `usuario_id`, `fecha` (unique `usuario_id,fecha`), `hora_ingreso`, `hora_salida`
- `productividad: 1 | 2 | 3` (1=No la dio, 2=Normal, 3=Extra)
- `turno_id: string | null` -- turno que cubrio (NULL = usa tarifa general `pago_hora`)
- `observacion`
- Trigger `no_asistencia_futura`: rechaza INSERT/UPDATE con `fecha > current_date`

**PersonalDescuento** (tabla `personal_descuentos`)
- `id`, `usuario_id`, `fecha`, `detalle`, `monto`

**PersonalPago** (tabla `personal_pagos`)
- `id`, `usuario_id`, `semana_inicio` (unique `usuario_id,semana_inicio`), `semana_fin`
- `horas_trabajadas`, `pago_hora`, `descuentos`, `monto_pagado`
- `estado: "pendiente" | "pagado"`, `observacion`

**Tablas de catalogo**: `Categoria`, `Subcategoria` (con `categoria_id`), `Marca`, `Almacen`, `Presentacion`, `UnidadBase`, `Proveedor`, `Rol`, `UsuarioPerfil`

### Proveedores: compras y pagos (NUEVO -- 20260526180000)

**ProveedorCompra** (tabla `proveedor_compras`)
- `id`, `proveedor_id`, `fecha_compra` (default current_date)
- `numero_documento: string | null`, `tipo_documento: ProveedorCompraTipoDoc`
- `subtotal`, `descuento`, `total` (checks >= 0)
- `monto_pagado: number` -- lo setea trigger desde `proveedor_pagos` (NO escribir a mano)
- `saldo: number` -- GENERATED `total - monto_pagado` (read-only)
- `estado_pago: ProveedorCompraEstadoPago` -- lo setea trigger (NO escribir a mano)
- `observacion`, `created_at`, `updated_at`

**ProveedorCompraItem** (tabla `proveedor_compra_items`)
- `id`, `compra_id`
- `producto_id: string | null` -- NULL = item "libre" (texto + precio)
- `descripcion: string | null` -- usado cuando `producto_id` es NULL
- `cantidad: number` (check > 0), `precio_unitario: number` (check >= 0)
- `subtotal: number` -- GENERATED `cantidad * precio_unitario` (read-only)
- `fecha_vencimiento: string | null`, `almacen_destino_id: string | null`
- `registrar_stock: boolean` (default true) -- si true + producto_id, la APP llama a `ajustar_stock` y crea lote (la logica NO esta en trigger, para evitar doble update)
- Constraint: `producto_id is not null OR trim(descripcion) <> ''`

**ProveedorPago** (tabla `proveedor_pagos`)
- `id`, `compra_id`, `fecha_pago` (default current_date)
- `monto: number` (check > 0), `metodo: ProveedorPagoMetodo`
- `referencia: string | null`, `observacion: string | null`, `created_at`
- INSERT/UPDATE/DELETE dispara `recalcular_pago_compra` -> actualiza `monto_pagado`/`estado_pago` de la cabecera

### Tablas de almacen y abastecimiento

**AlmacenTransferenciaSolicitud** (tabla `almacen_transferencias_solicitudes`)
- `id`, `estado: "pendiente" | "enviado" | "recibido" | "cancelado"`
- `observacion: string | null`
- `created_at`, `updated_at`

**AlmacenTransferenciaItem** (tabla `almacen_transferencias_items`)
- `id`, `solicitud_id`, `producto_id`
- `cantidad_solicitada: number`, `cantidad_recibida: number | null`
- `almacen_origen_id: string | null`, `almacen_destino_id: string | null` -- direccion por item
- `created_at`, `updated_at`
- Constraint: `almacen_origen_id <> almacen_destino_id`

**AbastecimientoPedido** (tabla `abastecimiento_pedidos`)
- `id`, `proveedor_id: string | null`
- `estado: "pendiente" | "enviado" | "comprado" | "cancelado"`
- `urgencia: "baja" | "normal" | "alta"`
- `observacion: string | null`
- `created_at`, `updated_at`

**AbastecimientoItem** (tabla `abastecimiento_items`)
- `id`, `pedido_id`, `producto_id`, `cantidad: number`
- `observacion: string | null`
- `created_at`, `updated_at`

### Reservas de stock y pagos de clientes

**StockReserva** (tabla `stock_reservas`)
- `id`, `producto_id`, `almacen_id`
- `cantidad_base: number` -- cantidad en unidades base reservada
- `usuario_id: uuid | null`, `pedido_id: uuid | null`, `sesion_id: text | null`
- `expires_at: timestamptz` -- default `now() + 30 min`, se extiende a 7 dias al asociar pedido
- `created_at`, `updated_at`
- Reservas activas: tienen `pedido_id` asociado o `expires_at > now()`
- Trigger: se liberan automaticamente al cambiar pedido a `cancelado` o `en_preparacion`

**ClienteAbono** (tabla `cliente_abonos`)
- `id`, `cliente_id`, `fecha_pago: string`
- `monto_total: number` -- check > 0
- `metodo: "efectivo" | "yape" | "transferencia" | "otro"`
- `observacion: string | null`, `registrado_por_id: string | null`
- `created_at`, `updated_at`

### Vistas (views, no tablas)

| Vista | Columnas clave | Uso |
|-------|----------------|-----|
| `vista_stock_reservado` | `producto_id`, `almacen_id`, `total_reservado: numeric` | Suma `cantidad_base` de reservas activas por producto+almacen. La consume `lib/inventoryUtils.ts` para stock disponible |
| `vista_lotes_vencimiento` | extiende `ProductoLote` + `nombre_producto`, `codigo_interno`, `unidad_base`, `almacen_nombre`, `estado_vencimiento`, `dias_restantes` | Lotes activos con `cantidad_actual > 0`. `estado_vencimiento` (`vencido`/`urgente <=7d`/`proximo <=30d`/`ok`) y `dias_restantes` YA calculados con `current_date`. Para pagina /vencimientos y widget dashboard |
| `vista_proveedor_resumen` | `proveedor_id`, `proveedor_nombre`, `compras_total`, `compras_monto_total`, `pagos_total`, `deuda_total`, `compras_con_saldo`, `ultima_compra` | Resumen por proveedor (solo `activo = true`). `deuda_total = SUM(total - monto_pagado)` |
| `vista_pagos_proveedor_mensual` | `mes` (`YYYY-MM`), `metodo`, `pagos_cantidad`, `monto_total` | Pagos a proveedores agrupados por mes + metodo |

## RPCs de Supabase

Todos los RPC son `SECURITY DEFINER` (corren como owner). El grant es `to anon, authenticated`.

| RPC | Parametros | Uso |
|-----|-----------|-----|
| `login_app` | `p_email, p_password` | Login -- devuelve `{id, email, rol, nombres, apellidos}` |
| `ajustar_stock` | `p_producto_id, p_almacen_id, p_stock_contado, p_observacion, p_usuario_id` | SET ABSOLUTO de `stock_actual` por conteo. NO toca presentaciones ni `unidades_sueltas` (ver Gotchas) |
| `guardar_stock_desglosado` | `p_producto_id, p_almacen_id, p_presentaciones jsonb, p_unidades_sueltas, p_observacion, p_usuario_id` -> `numeric` | Reemplaza el desglose por presentacion + sueltas y recalcula `stock_actual = SUM(cantidad x factor) + sueltas`. Registra movimiento `ajuste` con la diferencia. Devuelve el nuevo total |
| `descartar_lote` | `p_lote_id, p_motivo?` -> `void` | Marca lote `activo=false`, `cantidad_actual=0` y resta `cantidad_actual` del `stock_actual` del almacen. Atomico (`for update`) |
| `transferir_stock` | (ver AlmacenTransferencias) | Transferencia entre almacenes |
| `crear_app_usuario` | 11 params (email, password, rol, nombres, apellidos, telefono, pago_hora, horas_semana, gastos_semana, horario_laboral, admin_id) | Crear usuario |
| `reservar_stock_carrito` | `p_producto_id, p_almacen_id, p_cantidad_base, p_usuario_id?, p_sesion_id?` | Reservar stock al agregar al carrito. Valida disponibilidad. Retorna uuid de reserva |
| `actualizar_reserva_carrito` | `p_reserva_id, p_cantidad_base` | Cambiar cantidad reservada. Valida stock para incrementos |
| `liberar_reserva` | `p_reserva_id` | Quitar reserva (al sacar del carrito) |
| `liberar_reservas_carrito` | `p_usuario_id?, p_sesion_id?` | Vaciar carrito: borra reservas sin pedido del usuario/sesion. Retorna cantidad eliminada |
| `asociar_reservas_a_pedido` | `p_reserva_ids uuid[], p_pedido_id` | Vincular reservas a pedido guardado. Extiende expiracion a 7 dias |
| `limpiar_reservas_expiradas` | (sin params) | Cleanup de reservas sin pedido con `expires_at < now()`. Retorna cantidad eliminada |

### Firmas SQL (las nuevas)

```sql
guardar_stock_desglosado(
  p_producto_id uuid,
  p_almacen_id uuid,
  p_presentaciones jsonb,   -- [{ id: pres_id, cantidad: 14 }, ...]
  p_unidades_sueltas numeric default 0,
  p_observacion text default null,
  p_usuario_id uuid default null
) returns numeric          -- nuevo stock_actual total
-- Idempotente: borra el desglose previo y reinserta. stock_nuevo = SUM(cant x factor) + sueltas.
-- Si stock_nuevo <> stock_anterior, inserta stock_movimientos llenando tipo Y tipo_movimiento.

descartar_lote(p_lote_id uuid, p_motivo text default null) returns void
```

## Triggers importantes

| Trigger / funcion | Tabla | Efecto |
|-------------------|-------|--------|
| `normalizar_detalle_pedido_stock` | `detalle_pedido` | Auto-llena `producto_stock_id` y `cantidad_base` en INSERT/UPDATE |
| `descontar_stock_pedido_en_preparacion` | `pedidos` | Al pasar a `en_preparacion`, descuenta stock y registra movimientos |
| `liberar_reservas_pedido_trigger` | `pedidos` | Al pasar a `cancelado` o `en_preparacion`, borra reservas asociadas |
| `proteger_pedido_entregado` | `pedidos` | Bloquea UPDATE de pedidos entregados excepto pago (monto_a_cuenta, estado_pago, metodo_pago, observaciones) |
| `no_borrar_pedido_entregado` | `pedidos` | Bloquea DELETE de pedidos entregados |
| `proteger_detalle_pedido_entregado` | `detalle_pedido` | Bloquea UPDATE/DELETE de items si el pedido esta entregado |
| `recalcular_pago_compra` | `proveedor_pagos` (after INS/UPD/DEL) | Recalcula `monto_pagado` y `estado_pago` de `proveedor_compras` |
| `recalcular_estado_compra` | `proveedor_compras` (before INS/UPD de total, monto_pagado) | Setea `estado_pago` (pagado/parcial/pendiente) |
| `no_asistencia_futura` | `personal_asistencias` (before INS/UPD) | Rechaza `fecha > current_date` |

## Storage buckets

| Bucket | Path pattern | Uso |
|--------|-------------|-----|
| `productos` | `imagenes/{safeCodigo}-{timestamp}.{ext}` | Fotos de productos (max 1MB, jpg/png/webp) |
| `pagos` | `capturas/{clientePart}-{timestamp}.{ext}` | Capturas Yape |
| `pedidos_manuales` | (libre) | Fotos de pedidos escritos en papel (max 2MB, jpg/png/webp) |

## Librerias utilitarias (lib/)

### authRoles.ts -- Autenticacion y roles

```ts
export type AppRole = "admin" | "trabajador" | "cliente" | string;
export type CurrentUserProfile = { id, email, nombres, apellidos, activo, roles: { nombre: AppRole } | null };
export function getStoredAppUser(): { id, email, rol, nombres, apellidos } | null
export async function getCurrentUserProfile(): Promise<{ profile: CurrentUserProfile | null, error: null }>
export function isAdmin(profile): boolean
export function isTrabajador(profile): boolean
export function signOut(): void  // borra localStorage y redirige a /login
```

- localStorage key: `app_minimarket_user`
- `signOut()` borra la sesion local y hace `window.location.href = "/login"`
- ⚠️ Esto es autorizacion SOLO client-side. No protege la DB (ver Gotchas).

### inventoryUtils.ts -- Stock multi-almacen y presentaciones

```ts
export const STOCK_BAJO_DEFAULT = 10;  // umbral si producto.stock_minimo es null
export type StockReservadoMap = Map<string, number>;  // key = "producto_id::almacen_id"

// Construir y consultar mapa de reservas
export function buildReservadoMap(rows: Array<{producto_id, almacen_id, total_reservado}>): StockReservadoMap
export function getStockReservado(reservadoMap, productoId, almacenId): number

// Resolver producto base para inventario
export function getStockProductId(producto): string  // producto_base_id || producto.id
export function getUnitsPerSale(producto): number     // unidades_equivalentes, min 1
export function tieneProductoBase(producto): boolean

// Stock por almacen (sobre producto base)
export function getBaseStockRows(producto): StockRow[]
export function getBaseStockByName(producto, name): number    // busca por nombre almacen
export function getBaseStockByAlmacen(producto, almacenId): number

// Conversion presentacion <-> base
export function toPresentationStock(producto, baseStock): number  // floor(base / units)
export function presentationRemainder(producto, baseStock): number  // base % units
export function toBaseQuantity(producto, presentationQty): number  // qty * units

// Stock disponible = stock_actual - reservado
export function getStockDisponible(producto, almacenId, reservadoMap): number
export function isStockBajo(producto, almacenId, reservadoMap): boolean
export function getStockLevel(producto, almacenId, reservadoMap): "sin" | "bajo" | "ok"

// Almacenes conocidos
export function resolveCasaTiendaIds(almacenes): { casaId: string | null, tiendaId: string | null }
export function resolveStockId(productoId, basePorProducto: Map): string
```

### loteUtils.ts -- Lotes y vencimientos

```ts
export function calcularEstadoVencimiento(fechaVencimiento, hoy?): LoteEstadoVencimiento  // vencido / urgente <=7d / proximo <=30d / ok
export function parseDateOnly(value): Date          // 'YYYY-MM-DD' en hora LOCAL (evita off-by-one UTC)
export function formatFechaCorta(value): string     // YYYY-MM-DD -> DD/MM/YYYY
export function fechaHoyInput(): string             // hoy en YYYY-MM-DD (componentes locales)
export function estadoVencimientoUI(estado): { ... }  // clases tailwind para chip/linea por estado
export function labelOrigenLote(origen): string
export function sumarLotesPorProductoAlmacen(...)
```

### imageUtils.ts -- Compresion de imagenes (cliente)

```ts
export async function compressImage(
  file: File,
  options?: { maxSizeBytes?, maxWidth?, maxHeight?, initialQuality? }
): Promise<File>
```

- Redimensiona + re-encodea a JPEG bajando calidad hasta caber en `maxSizeBytes` (default 1MB; max 1920x1920, q 0.85->0.2)
- Si el archivo ya cumple el tamano, lo retorna tal cual. Usar antes de subir a storage.

### payrollUtils.ts -- Nomina con turnos

```ts
export function hoursBetween(inicio, fin): number   // 0 si fin<=inicio (no overnight)
export function diaSemana(fechaIso): number          // 0=Dom..6=Sab (local)
export function elegirTurnoParaAsistencia(...): PersonalTurno | null  // matchea turno por dia
export function pagoPorDia(...): number               // horas_reales x tarifa_hora del turno (o pago_hora general)
export type ResumenSemanaPago = { ... }
export function calcularPagoSemanal(args): ResumenSemanaPago
```

### productoDelete.ts -- Borrado de productos

```ts
export type DeleteProductoResult = { ok: true } | { ok: false; reason: string }
export async function deleteProducto(productoId, imagenUrl): Promise<DeleteProductoResult>
export async function fetchProductosNoEliminables(): Promise<Set<string>>  // ids en uso (pedidos / base de otra presentacion)
```

- `deleteProducto` valida que no este en uso, borra relaciones en cascada y la imagen del bucket. Requiere los grants DELETE de `20260526210000` (productos, producto_almacen, presentaciones_compra, precios_mayor, producto_lotes, stock_reservas, stock_movimientos).

### theme.ts -- Tokens de color

```ts
export const colors = { tienda, casa, stockOk, stockBajo, stockSin, vencido, vencimientoUrgente, vencimientoProximo, btnPrimary, btnSecondary, btnDanger, ... }
export function colorsForAlmacen(nombre): { ... }   // emerald=Tienda, indigo=Casa
export function stockChipClass(...): string
```

- Tienda = emerald, Casa = indigo. Estados de stock: ok=emerald, bajo=amber, sin=rose. Vencimiento: vencido=rose, urgente=orange, proximo=amber.

### pricing.ts -- Calculo de precios por mayor

```ts
export type PriceTierInput = { cantidad_minima, precio_total?, precio_unitario?, tipo_precio?, descripcion?, activo? }
export type PricingResult = { subtotal: number, precioUnitarioPromedio: number, breakdown: PricingBreakdownItem[] }

export function calcularPrecioPorCantidad(cantidad, precioBase, tiers): PricingResult
```

- Soporta `tipo_precio: "paquete" | "unitario"` para interpretar precio
- Aplica tiers de mayor a menor (greedy), residuo a precio regular
- Solo aplica tiers a cantidades enteras

### searchUtils.ts -- Busqueda local

```ts
export function normalizeForSearch(value): string  // lowercase, sin acentos, sin especiales
export function searchTokens(query): string[]       // split en tokens normalizados
export function matchesSearch(query, values): boolean  // todos los tokens presentes en alguno de los values
```

### supabaseQueryUtils.ts -- Paginacion completa

```ts
export async function fetchAllRows<T>(query, options?): Promise<{ data: T[], error }>
```

- Pagina automaticamente con `range()` en bloques de 1000 (configurable)
- `maxRows` default 10000, para evitar traer tablas gigantes
- El `query` debe soportar `.range(from, to)` (cualquier select de Supabase)

### validators.ts -- Validacion centralizada

```ts
export type ValidationResult = { ok: true } | { ok: false, error: string }

export function normalizePhonePe(value): string       // deja 9 digitos, quita prefijo 51
export function validatePhonePe(value, { optional? }): ValidationResult
export function validatePrice(value, { allowZero?, label? }): ValidationResult
export function validateQuantity(value, { label?, allowZero? }): ValidationResult
export function validateUnits(value): ValidationResult  // > 0, evita division por cero
export function validateHorarioLaboral(ingreso, salida): ValidationResult  // salida > ingreso
export function validateCodigoInterno(value): ValidationResult  // no vacio, min 2 chars
export function combineValidations(...results): ValidationResult  // primer error o ok

export const PHONE_PE: RegExp  // /^9\d{8}$/
export const DIGITS_ONLY: RegExp  // /^\d+$/
```

### inputUtils.ts -- Helpers de input

```ts
export const selectOnFocus: (event: FocusEvent<HTMLInputElement>) => void
```

- Selecciona todo el texto del input al recibir foco (para inputs numericos)

### dateUtils.ts -- Formateo de fechas

```ts
export function formatDate(value): string      // DD/MM/YYYY o "Sin fecha"
export function formatDateTime(value): string  // DD/MM/YYYY HH:MM
export function parseInputDate(value): string  // YYYY-MM-DD (para inputs type="date")
export function formatTime(value): string      // HH:MM o "Sin hora"
```

### whatsapp.ts -- Mensajes WhatsApp

```ts
export function generarMensajePedido(pedido, cliente, detalles, tieneCapturaYape?): string
export function generarLinkWhatsApp(numeroNegocio, mensaje): string  // https://wa.me/...
```

### catalogDefaults.ts -- Catalogos iniciales

- `PRESENTACIONES_INICIALES`: 17 items (paquete, caja, plancha, saco, balde, java, unidad, medio saco, bolsa, botella, bidon, doypack, frasco, lata, sobre, sachet, pote)
- `UNIDADES_BASE_INICIALES`: 10 items (litro, kilo, gramo, mililitro, unidad, sachet, casillero, paquete, bolsa, caja)

## Patrones de query frecuentes

### Select con FKs (Supabase embeds)
```ts
supabase.from("pedidos").select(`
  *,
  clientes(nombres, telefono),
  pagos(*)
`)

supabase.from("productos").select(`
  *,
  categorias(nombre),
  subcategorias(nombre),
  marcas(nombre),
  producto_almacen(*, almacenes(id, nombre)),
  producto_base:productos!producto_base_id(id, producto_almacen(almacen_id, stock_actual, almacenes(id, nombre)))
`, { count: "exact" })
```

### FK con alias (movimientos)
```ts
supabase.from("stock_movimientos").select(`
  *,
  productos(nombre_producto, codigo_interno),
  almacen_origen:almacenes!stock_movimientos_almacen_origen_id_fkey(nombre),
  almacen_destino:almacenes!stock_movimientos_almacen_destino_id_fkey(nombre)
`)
```

### Conteo head-only
```ts
supabase.from("pedidos")
  .select("*", { count: "exact", head: true })
  .eq("estado", "pendiente")
```

### Upsert con conflicto
```ts
supabase.from("producto_almacen").upsert({
  producto_id, almacen_id, stock_actual
}, { onConflict: "producto_id,almacen_id" })

supabase.from("personal_asistencias").upsert(payload, {
  onConflict: "usuario_id,fecha"
})

supabase.from("pagos").upsert(payload, {
  onConflict: "pedido_id"
})
```

### Paginacion
```ts
const from = (page - 1) * PAGE_SIZE;
const to = from + PAGE_SIZE - 1;
query.range(from, to)

// O usar fetchAllRows para cargar todo en bloques:
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
const { data, error } = await fetchAllRows(supabase.from("productos").select("*"));
```

### Busqueda OR con marca
```ts
const matchingMarcaIds = marcas
  .filter(m => m.nombre.toLowerCase().includes(term.toLowerCase()))
  .map(m => m.id);
const parts = [
  `codigo_interno.ilike.%${term}%`,
  `nombre_producto.ilike.%${term}%`,
];
if (matchingMarcaIds.length > 0) {
  parts.push(`marca_id.in.(${matchingMarcaIds.join(",")})`);
}
query.or(parts.join(","));
```

### Busqueda local con searchUtils
```ts
import { matchesSearch } from "@/lib/searchUtils";
const filtered = productos.filter(p =>
  matchesSearch(searchTerm, [p.codigo_interno, p.nombre_producto, p.marca?.nombre])
);
```

### Relacion Supabase devuelve array u objeto
El patron de normalizacion para FKs que pueden llegar como array o single:
```ts
function getCliente(relation: Pick<Cliente, "nombres"> | Pick<Cliente, "nombres">[] | null) {
  return Array.isArray(relation) ? relation[0] : relation;
}
```

### Error 23505 (unique violation)
```ts
if (error.code === "23505") {
  // "Ya existe un X con ese Y"
}
```

### Guardar stock por desglose de presentacion
```ts
// Reemplaza el desglose completo + sueltas y recalcula el total.
const { data: nuevoTotal } = await supabase.rpc("guardar_stock_desglosado", {
  p_producto_id: productoId,
  p_almacen_id: almacenId,
  p_presentaciones: [
    { id: presCajaX40Id, cantidad: 14 },
    { id: presCajaX100Id, cantidad: 7 },
  ],
  p_unidades_sueltas: 3,
  p_observacion: "Conteo fisico",
  p_usuario_id: userId,
});
// nuevoTotal = SUM(cantidad x unidades_por_presentacion) + sueltas.
// NO usar ajustar_stock aqui: dejaria el desglose desincronizado.
```

### Lotes y vencimientos
```ts
// Listar lotes activos con estado ya calculado
const { data } = await supabase.from("vista_lotes_vencimiento").select("*")
  .order("fecha_vencimiento", { ascending: true });
// cada fila trae estado_vencimiento y dias_restantes listos para UI

// Descartar un lote (resta del stock del almacen)
await supabase.rpc("descartar_lote", { p_lote_id: loteId, p_motivo: "Vencido" });
```

### Compras a proveedor (re-leer tras escribir)
```ts
// 1) Insertar pago. El trigger recalcula monto_pagado/estado_pago de la cabecera.
await supabase.from("proveedor_pagos").insert({ compra_id, monto, metodo });
// 2) Re-leer la compra para tener saldo/estado actualizados (NO calcular en cliente).
const { data: compra } = await supabase.from("proveedor_compras")
  .select("total, monto_pagado, saldo, estado_pago").eq("id", compraId).single();
```

### Reservas de stock (carrito)
```ts
// Reservar al agregar al carrito
const { data: reservaId } = await supabase.rpc("reservar_stock_carrito", {
  p_producto_id: stockProductId,
  p_almacen_id: tiendaId,
  p_cantidad_base: cantidadBase,
  p_usuario_id: userId,
  p_sesion_id: sessionId,
});

// Actualizar cantidad
await supabase.rpc("actualizar_reserva_carrito", {
  p_reserva_id: reservaId,
  p_cantidad_base: nuevaCantidadBase,
});

// Liberar una reserva
await supabase.rpc("liberar_reserva", { p_reserva_id: reservaId });

// Vaciar carrito completo
await supabase.rpc("liberar_reservas_carrito", { p_usuario_id: userId });

// Asociar reservas al guardar pedido
await supabase.rpc("asociar_reservas_a_pedido", {
  p_reserva_ids: [id1, id2],
  p_pedido_id: pedidoId,
});

// Consultar stock disponible (para UI)
const { data: reservados } = await supabase.from("vista_stock_reservado").select("*");
const reservadoMap = buildReservadoMap(reservados ?? []);
const disponible = getStockDisponible(producto, almacenId, reservadoMap);
```

### Validacion en formularios
```ts
import { validatePrice, validateQuantity, combineValidations } from "@/lib/validators";
const result = combineValidations(
  validatePrice(precio, { label: "El precio de venta" }),
  validateQuantity(cantidad),
);
if (!result.ok) {
  setMessage({ type: "error", text: result.error });
  return;
}
```
