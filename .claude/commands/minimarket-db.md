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
- `id`, `producto_id`, `almacen_id`, `stock_actual: number`
- `stock_minimo_local: number | null`, `costo_promedio: number | null`, `ubicacion_interna: string | null`

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
- `tipo: string`, `tipo_movimiento: StockMovimientoTipo` (ambos campos coexisten)
- `cantidad`, `costo_unitario`, `stock_anterior`, `stock_nuevo`
- `referencia`, `motivo`, `observacion`, `usuario_id`, `registrado_por_id`

**Cliente** (tabla `clientes`)
- `id`, `nombres`, `apellidos`, `telefono`, `direccion`, `direccion_entrega`
- `referencia`, `documento`, `observacion`, `activo`

**AppUsuario** (tabla `app_usuarios`)
- `id`, `email`, `rol: "admin" | "trabajador" | "cliente"`
- `nombres`, `apellidos: string | null`, `telefono: string | null`
- `pago_hora: number`, `horas_semana: number`, `gastos_semana: number`
- `horario_laboral: string | null`, `activo`

**PersonalAsistencia** (tabla `personal_asistencias`)
- `id`, `usuario_id`, `fecha`, `hora_ingreso`, `hora_salida`
- `productividad: 1 | 2 | 3` (1=No la dio, 2=Normal, 3=Extra)
- `observacion`

**PersonalDescuento** (tabla `personal_descuentos`)
- `id`, `usuario_id`, `fecha`, `detalle`, `monto`

**PersonalPago** (tabla `personal_pagos`)
- `id`, `usuario_id`, `semana_inicio`, `semana_fin`
- `horas_trabajadas`, `pago_hora`, `descuentos`, `monto_pagado`
- `estado: "pendiente" | "pagado"`, `observacion`

**Tablas de catalogo**: `Categoria`, `Subcategoria` (con `categoria_id`), `Marca`, `Almacen`, `Presentacion`, `UnidadBase`, `Proveedor`, `Rol`, `UsuarioPerfil`

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
- `expires_at: timestamptz` -- default now() + 30 min, se extiende a 7 dias al asociar pedido
- `created_at`, `updated_at`
- Reservas activas: tienen `pedido_id` asociado o `expires_at > now()`
- Trigger: se liberan automaticamente al cambiar pedido a `cancelado` o `en_preparacion`

**vista_stock_reservado** (vista, no tabla)
- `producto_id`, `almacen_id`, `total_reservado: numeric`
- Suma de `cantidad_base` de reservas activas agrupada por producto+almacen
- Usada por `lib/inventoryUtils.ts` para calcular stock disponible

**ClienteAbono** (tabla `cliente_abonos`)
- `id`, `cliente_id`, `fecha_pago: string`
- `monto_total: number` -- check > 0
- `metodo: "efectivo" | "yape" | "transferencia" | "otro"`
- `observacion: string | null`, `registrado_por_id: string | null`
- `created_at`, `updated_at`

## RPCs de Supabase

| RPC | Parametros | Uso |
|-----|-----------|-----|
| `login_app` | `p_email, p_password` | Login -- devuelve `{id, email, rol, nombres, apellidos}` |
| `ajustar_stock` | `p_producto_id, p_almacen_id, p_stock_contado, p_observacion, p_usuario_id` | Ajuste de stock por conteo |
| `transferir_stock` | (ver AlmacenTransferencias) | Transferencia entre almacenes |
| `crear_app_usuario` | 11 params (email, password, rol, nombres, apellidos, telefono, pago_hora, horas_semana, gastos_semana, horario_laboral, activo) | Crear usuario |
| `reservar_stock_carrito` | `p_producto_id, p_almacen_id, p_cantidad_base, p_usuario_id?, p_sesion_id?` | Reservar stock al agregar al carrito. Valida disponibilidad. Retorna uuid de reserva |
| `actualizar_reserva_carrito` | `p_reserva_id, p_cantidad_base` | Cambiar cantidad reservada. Valida stock para incrementos |
| `liberar_reserva` | `p_reserva_id` | Quitar reserva (al sacar del carrito) |
| `asociar_reservas_a_pedido` | `p_reserva_ids uuid[], p_pedido_id` | Vincular reservas a pedido guardado. Extiende expiracion a 7 dias |
| `liberar_reservas_carrito` | `p_usuario_id?, p_sesion_id?` | Vaciar carrito: borra reservas sin pedido del usuario/sesion. Retorna cantidad eliminada |
| `limpiar_reservas_expiradas` | (sin params) | Cleanup de reservas sin pedido con expires_at < now(). Retorna cantidad eliminada |

## Triggers importantes

| Trigger | Tabla | Efecto |
|---------|-------|--------|
| `normalizar_detalle_pedido_stock` | `detalle_pedido` | Auto-llena `producto_stock_id` y `cantidad_base` en INSERT/UPDATE |
| `descontar_stock_pedido_en_preparacion` | `pedidos` | Al pasar a `en_preparacion`, descuenta stock y registra movimientos |
| `liberar_reservas_pedido_trigger` | `pedidos` | Al pasar a `cancelado` o `en_preparacion`, borra reservas asociadas |
| `proteger_pedido_entregado` | `pedidos` | Bloquea cambios a pedidos entregados excepto pago (monto_a_cuenta, estado_pago, metodo_pago, observaciones) |
| `no_borrar_pedido_entregado` | `pedidos` | Bloquea DELETE de pedidos entregados |
| `proteger_detalle_pedido_entregado` | `detalle_pedido` | Bloquea UPDATE/DELETE de items si el pedido esta entregado |

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
