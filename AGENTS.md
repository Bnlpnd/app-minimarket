# App Minimarket -- Contexto del proyecto

Minimarket Santa Ana: sistema de gestion para minimarket peruano. Moneda: Soles (S/).

## Stack

- Next.js 16.2.6 + React 19.2.4 + TypeScript 5 (strict)
- Supabase JS ^2.106.1 (client puede ser null, siempre verificar)
- Tailwind CSS 4 (sin shadcn/ui, todo custom)
- Estado: solo hooks React (useState, useEffect, useCallback, useMemo)
- Path alias: `@/*` -> raiz del proyecto
- Build: `next dev --webpack`

## Estructura clave

```
lib/
  supabaseClient.ts   -- export supabase (nullable!) + supabaseConfigError
  authRoles.ts        -- getStoredAppUser(), getCurrentUserProfile(), isAdmin(), isTrabajador(), signOut(), AppRole type
  dateUtils.ts        -- formatDate(DD-MM-YYYY), formatDateTime, parseInputDate(YYYY-MM-DD), formatTime(HH:MM)
  whatsapp.ts         -- generarMensajePedido(), generarLinkWhatsApp()
  catalogDefaults.ts  -- PRESENTACIONES_INICIALES (17), UNIDADES_BASE_INICIALES (10)
  inventoryUtils.ts   -- getStockProductId(), getBaseStockByName(), getStockDisponible(), isStockBajo(), getStockLevel(), toPresentationStock(), toBaseQuantity(), resolveCasaTiendaIds(), buildReservadoMap()
  pricing.ts          -- calcularPrecioPorCantidad() para precios por mayor escalonados
  searchUtils.ts      -- normalizeForSearch(), matchesSearch() busqueda accent-insensitive
  supabaseQueryUtils.ts -- fetchAllRows() paginacion mas de 1000 filas
  validators.ts       -- validatePhonePe(), validatePrice(), validateQuantity(), validateUnits(), validateHorarioLaboral(), combineValidations()
  inputUtils.ts       -- selectOnFocus() para inputs numericos
  loteUtils.ts        -- calcularEstadoVencimiento(), estadoVencimientoUI(), formatFechaCorta(), fechaHoyInput()
  payrollUtils.ts     -- hoursBetween(), elegirTurnoParaAsistencia(), pagoPorDia(), calcularPagoSemanal() (turnos + bono)
  productoDelete.ts   -- deleteProducto(), fetchProductosNoEliminables() -- OJO: no transaccional (ver skill minimarket-productos)
  imageUtils.ts       -- compressImage() a <=1MB JPEG en el navegador (NO rellena fondo: PNG transparente -> fondo negro)
  theme.ts            -- colors (tokens), colorsForAlmacen(), stockChipClass() -- no hardcodear colores

types/
  database.ts         -- 46 interfaces/types (incluye lotes, proveedor_compras, turnos, abonos)
  index.ts            -- AppSection type

components/           -- todos "use client", logica de negocio pesada
  Layout.tsx (72), Header.tsx (34), Sidebar.tsx (195), AdminOnly.tsx (44)
  ui/SearchableSelect.tsx (214) combobox custom, ui/Toast.tsx (118) notificaciones
  ProductoForm.tsx (1512), ProductoTable.tsx (490), ProductoImportCsv.tsx (1627), QuickProductoCreator.tsx (275)
  PedidoNuevoForm.tsx (2300), PedidosList.tsx (414), PedidoDetalle.tsx (648)
  AlmacenDashboard.tsx (630), AlmacenProductos.tsx (916) stock desglosado, AlmacenVencimientos.tsx (453) lotes
  AlmacenMovimientos.tsx (206), AlmacenTransferencias.tsx (758), AlmacenAjustes.tsx (370)
  AlmacenAgregarStock.tsx (720), AlmacenAbastecimiento.tsx (267)
  PreparacionModule.tsx (684), ClienteModule.tsx (532), ClientePedidosModule.tsx (944)
  ProveedoresModule.tsx (439), ProveedorComprasModule.tsx (1355) compras/pagos, PagosYapeValidator.tsx (379)
  PersonalModule.tsx (1770)
  personal/AttendanceWeekBlock.tsx (352), personal/DiscountWeekBlock.tsx (170), personal/PaymentHistoryBlock.tsx (386)

app/
  dashboard/page.tsx (1197)   -- AdminDashboard + WorkerDashboard con metricas avanzadas
  productos/page.tsx (595)    -- listado con quick-edit, filtros stock, borrar, paginacion
  productos/nuevo/page.tsx (934) -- crear/editar producto con presentaciones y precios mayor
  productos/mantenimiento/page.tsx (551) -- CRUD catalogos admin-only
  productos/importar/page.tsx (73) -- wrapper ProductoImportCsv (admin-only)
  login/page.tsx (107)        -- RPC login_app, localStorage
  mis-datos/page.tsx (914)    -- autoservicio trabajador: marcar ingreso/salida
  proveedores/page.tsx (68)   -- tabs: listado (ProveedoresModule) + compras (ProveedorComprasModule)
  almacen/productos/page.tsx (16)    -- stock desglosado por presentacion
  almacen/vencimientos/page.tsx (15) -- lotes y fechas de vencimiento
  almacen/agregar-stock/page.tsx (18), almacen/abastecimiento/page.tsx (15), almacen/ajustes/page.tsx (18)
```

## Schema de base de datos

### Enums (union types)
- **PedidoEstado**: pendiente | pago_enviado | pago_validado | en_preparacion | listo_para_recoger | entregado | cancelado
- **PagoMetodo**: yape | efectivo | otro | transferencia
- **PagoEstado**: pendiente | enviado | validado | rechazado
- **StockMovimientoTipo**: ingreso | salida_venta | salida_pedido | ajuste | transferencia | merma | devolucion
- **TipoEntrega**: llevar_ahora | recoger_despues | enviar
- **PedidoEstadoPago**: pagado | debe
- **ProveedorCompraEstadoPago**: pagado | parcial | pendiente
- **ProveedorCompraTipoDoc**: boleta | factura | nota | sin_documento
- **ProductoLoteOrigen**: inicial | compra | transferencia | ajuste
- **LoteEstadoVencimiento**: vencido | urgente (<=7d) | proximo (<=30d) | ok | null

### Tablas principales
- **productos**: id, codigo_interno (auto), producto_base_id, unidades_equivalentes, categoria_id, subcategoria_id, nombre_producto, marca_id, presentacion, unidad_base, stock_actual, stock_minimo, precio_compra_referencial, precio_venta, imagen_url, activo
- **producto_almacen**: producto_id + almacen_id (unique), stock_actual (fuente de verdad), unidades_sueltas, stock_minimo_local, costo_promedio
- **producto_almacen_presentacion**: producto_id + almacen_id + presentacion_compra_id (unique), cantidad. Desglose REAL por presentacion. stock_actual = SUM(cantidad*factor) + unidades_sueltas
- **producto_presentaciones_compra**: producto_id, proveedor_id, nombre_presentacion, unidades_por_presentacion, costo_presentacion, costo_unitario, es_principal, observacion, activo
- **producto_precios_mayor**: producto_id, cantidad_minima, precio_unitario, precio_total, tipo_precio (paquete|unitario), descripcion, activo
- **producto_lotes**: producto_id, almacen_id, cantidad_inicial, cantidad_actual, fecha_ingreso, fecha_vencimiento, origen (inicial|compra|transferencia|ajuste), notas. NO se consume por FIFO en ventas
- **vista_lotes_vencimiento**: producto_lotes + estado_vencimiento + dias_restantes calculados server-side (current_date)
- **pedidos**: 28+ campos. cliente_id, estado, tipo_entrega, subtotal/descuento/total, metodo_pago, monto_a_cuenta, estado_pago, stock_descontado, imagen_papel_url. Audit: app_registrado_por_id, app_preparado_por_id, app_entregado_por_id + preparado_at, entregado_at
- **detalle_pedido**: pedido_id, producto_id, producto_stock_id, cantidad, cantidad_base, precio_unitario, subtotal, almacen_id, preparado, cantidad_preparada, app_marcado_por_id
- **pagos**: pedido_id, metodo, estado, monto, captura_yape_url, observacion_rechazo, validado_por_id, validado_at
- **clientes**: nombres, apellidos, telefono, direccion, direccion_entrega, referencia, documento, observacion, activo
- **cliente_abonos**: cliente_id, fecha_pago, monto_total, metodo, observacion, registrado_por_id
- **stock_movimientos**: producto_id, almacen_origen_id, almacen_destino_id, tipo + tipo_movimiento (ambos), cantidad, stock_anterior, stock_nuevo, motivo
- **stock_reservas**: producto_id, almacen_id, cantidad_base, usuario_id, sesion_id, pedido_id, expira_at (30 min)
- **vista_stock_reservado**: view que agrega reservas activas por producto+almacen
- **almacen_transferencias_solicitudes**: id, estado (pendiente|enviado|recibido|cancelado)
- **almacen_transferencias_items**: solicitud_id, producto_id, cantidad_solicitada, cantidad_recibida, almacen_origen_id, almacen_destino_id
- **abastecimiento_pedidos**: proveedor_id, estado (pendiente|enviado|comprado|cancelado), urgencia (baja|normal|alta)
- **abastecimiento_items**: pedido_id, producto_id, cantidad
- **proveedor_compras**: proveedor_id, fecha_compra, numero_documento, tipo_documento, subtotal/descuento/total, monto_pagado (trigger), **saldo GENERATED** (total-monto_pagado), estado_pago (trigger)
- **proveedor_compra_items**: compra_id, producto_id (NULL=item libre con descripcion), cantidad, precio_unitario, **subtotal GENERATED**, fecha_vencimiento, almacen_destino_id, registrar_stock
- **proveedor_pagos**: compra_id, fecha_pago, monto (>0), metodo, referencia. Insert/delete dispara trigger que recalcula la cabecera
- **vista_proveedor_resumen**: deuda_total, compras_total, ultima_compra por proveedor. **vista_pagos_proveedor_mensual**: pagos por mes+metodo
- **app_usuarios**: email, rol (admin|trabajador|cliente), nombres, pago_hora, horas_semana, gastos_semana, bono_asistencia_completa, horario_laboral, activo
- **personal_turnos**: usuario_id, nombre, dias_aplica smallint[] (0=Dom..6=Sab), hora_inicio, hora_fin, monto_pago, activo. tarifa_hora = monto_pago/horas(inicio,fin) en runtime
- **personal_asistencias**: usuario_id + fecha (unique), turno_id, hora_ingreso, hora_salida, productividad (1|2|3). Trigger rechaza fecha futura
- **personal_descuentos**: usuario_id, fecha, detalle, monto
- **personal_pagos**: usuario_id + semana_inicio (unique), horas_trabajadas, pago_hora, descuentos, monto_pagado, estado (pendiente|pagado)
- **Catalogos**: categorias, subcategorias (con categoria_id), marcas, almacenes, presentaciones, unidades_base, proveedores

### RPCs
- `login_app(p_email, p_password)` -> {id, email, rol, nombres, apellidos}
- `ajustar_stock(p_producto_id, p_almacen_id, p_stock_contado, p_observacion, p_usuario_id)` -- SET ABSOLUTO, no incrementa, no sincroniza el desglose por presentacion
- `guardar_stock_desglosado(p_producto_id, p_almacen_id, p_presentaciones jsonb [{id,cantidad}], p_unidades_sueltas, p_observacion, p_usuario_id)` -- reemplaza desglose y recalcula stock_actual
- `descartar_lote(...)` -- marca lote vencido/descartado y descuenta del stock
- `transferir_stock(...)` -- entre almacenes
- `crear_app_usuario(p_email, p_password, p_rol, p_nombres, p_apellidos, p_telefono, p_pago_hora, p_horas_semana, p_gastos_semana, p_horario_laboral, p_admin_id)`
- `reservar_stock_carrito(p_producto_id, p_almacen_id, p_cantidad_base, p_usuario_id, p_sesion_id)`
- `actualizar_reserva_carrito(p_reserva_id, p_cantidad_base)`
- `liberar_reserva(p_reserva_id)` / `liberar_reservas_carrito(p_usuario_id, p_sesion_id)`
- `asociar_reservas_a_pedido(p_reserva_ids[], p_pedido_id)`
- `limpiar_reservas_expiradas()`

### Storage buckets
- `productos` -> `imagenes/{safeCodigo}-{timestamp}.{ext}` (max 1MB, jpg/png/webp)
- `pagos` -> `capturas/{clientePart}-{timestamp}.{ext}`
- `pedidos_manuales` -> fotos de pedidos en papel

## Patrones de query Supabase

```ts
// Select con FK embeds
supabase.from("pedidos").select("*, clientes(nombres, telefono), pagos(*)")

// Select con alias FK
supabase.from("stock_movimientos").select(`*,
  almacen_origen:almacenes!stock_movimientos_almacen_origen_id_fkey(nombre)`)

// Conteo head-only
supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("estado", "pendiente")

// Upsert con conflicto
supabase.from("producto_almacen").upsert(payload, { onConflict: "producto_id,almacen_id" })

// Paginacion completa (mas de 1000 filas)
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
const { data, error } = await fetchAllRows(query.order("nombre"));

// Busqueda client-side accent-insensitive
import { matchesSearch } from "@/lib/searchUtils";
const filtered = items.filter(item => matchesSearch(term, [item.nombre, item.codigo]));

// FK puede ser array u objeto -- normalizar siempre
const item = Array.isArray(relation) ? relation[0] : relation;

// Error unique violation
if (error.code === "23505") { /* duplicado */ }
```

## Sistema de presentaciones y stock base

```
producto_base_id != null -> es una presentacion de venta (ej: "Pack x6")
unidades_equivalentes    -> cuantas unidades del base equivale (ej: 6)
stock real               -> siempre en producto_almacen del producto BASE
stock disponible         -> stock_actual - reservas activas (vista_stock_reservado)
```

Usar `lib/inventoryUtils.ts` para resolver stock:
- `getStockProductId(producto)` -> devuelve producto_base_id o id
- `getBaseStockByName(producto, "Tienda")` -> stock del base por almacen
- `toPresentationStock(producto, baseStock)` -> cuantas presentaciones caben
- `getStockDisponible(producto, almacenId, reservadoMap)` -> stock real disponible

## State machine de pedidos

```
pendiente -> pago_enviado -> pago_validado -> en_preparacion -> listo_para_recoger -> entregado
    |             |                                 ^
    |             +-- rechazado -> pendiente         |
    +---- (efectivo, directo) ----------------------+
```

- Crear con yape+captura: estado=pago_enviado, pago.estado=enviado
- Crear sin captura/efectivo: estado=pendiente, pago.estado=pendiente
- Validar pago: pedido->pago_validado+pagado, pago->validado
- Rechazar pago: pedido->pendiente+debe, pago->rechazado (requiere observacion)
- Preparar: pedido->en_preparacion, set app_preparado_por_id + preparado_at
- Listo: requiere todos detalle_pedido.preparado=true
- Entregado: set app_entregado_por_id + entregado_at
- Pedidos entregados estan bloqueados (triggers protegen UPDATE/DELETE)

## Inventario multi-almacen

- Almacenes default: **Tienda** (venta) y **Casa** (reserva)
- Stock real esta en `producto_almacen`, no en `productos.stock_actual`
- Stock disponible = stock_actual - reservas (stock_reservas/vista_stock_reservado)
- Ajuste: RPC `ajustar_stock` con stock contado
- Transferencia: solicitud multi-item con estados pendiente->enviado->recibido
- Abastecimiento: pedidos a proveedores con urgencia
- Al crear producto: upsert stock inicial en Tienda

## Convencion UI

- Paleta: emerald primario (Tienda), indigo (Casa), slate texto/fondo, rose error, amber warning
- Tokens en `lib/theme.ts`: importar `colors`, `colorsForAlmacen()`, `stockChipClass()` -- no hardcodear colores en componentes nuevos
- Componentes compartidos: `ui/SearchableSelect` (combobox; OJO no es accent-insensitive), `ui/Toast`
- Sidebar: bg-white con border-r, 7 grupos, links activos bg-emerald-50 text-emerald-800
- Inputs: h-11, border-slate-300, focus:border-emerald-600 focus:ring-emerald-100
- Cards: bg-white border-slate-200 rounded-lg shadow-sm
- Responsive: tabla desktop (hidden lg:block) + cards mobile (lg:hidden)
- Mensajes: `type Message = { type: "success"|"error"; text: string }`
- Ternarios: `{cond ? <X /> : null}` (no &&)
- Async onClick: `onClick={() => void fn()}`
- Cast Supabase: `(data ?? []) as Tipo[]`
- Event handlers: `(event) =>` (nombre completo)
- Guard Supabase: `if (!supabase) return;` al inicio
- Layout wraps Sidebar en `<Suspense>` por useSearchParams
- lang="es-PE" en html root

## Auth y roles

- localStorage key: `app_minimarket_user` -> {id, email, rol, nombres, apellidos}
- Login: RPC `login_app`, post-login redirect `/dashboard`
- Logout: `signOut()` de lib/authRoles.ts (borra localStorage + redirect)
- Admin: todo. Trabajador: productos, pedidos, almacen, preparacion, mis-datos. Cliente: dashboard basico.
- Patron de acceso: `checkAccess() -> getCurrentUserProfile() -> isAdmin()/isTrabajador()`
- Sidebar filtra grupos por rol (Personal solo admin)

## Seguridad (importante)

- **NINGUNA tabla tiene RLS.** Los grants son `to anon, authenticated` (cualquiera con sesion). Los RPC son `SECURITY DEFINER` (corren como owner).
- La proteccion por rol es **SOLO client-side**: ocultar links/botones + `checkAccess()` que redirige. Cualquiera puede llamar tablas/RPC directo via la anon key. No confiar en el cliente para autorizacion.
- No todas las paginas tienen `checkAccess()` (ej. `/proveedores` no lo tiene). El borrado de productos y el registro de compras no estan protegidos server-side.

## Nomina

- Productividad: 1=No la dio, 2=Normal, 3=Extra
- Semana: lunes a domingo (getWeekRange)
- Horas: hoursBetween(HH:MM, HH:MM), retorna 0 si fin<=inicio (no overnight)
- **Turnos** (personal_turnos): horas DENTRO del turno pagan tarifa del turno (monto/horas); fuera, pago_hora general. Calculo en `lib/payrollUtils.ts`
- **Bono** (app_usuarios.bono_asistencia_completa): se suma si cumple TODOS los turnos de la semana. OJO: dia con 2 turnos solo paga uno (subpago); ver skill minimarket-personal
- Pago: max(0, horas * pago_hora - descuentos). Si no hay asistencias, usa horas_semana default.
- Asistencia: upsert por usuario_id+fecha. Pago: upsert por usuario_id+semana_inicio.
- Asistencia split: saveIngreso y saveSalida separados (upsert preservando el otro campo)
- Sub-componentes: AttendanceWeekBlock, DiscountWeekBlock, PaymentHistoryBlock
- Mis datos (/mis-datos): autoservicio trabajador para marcar ingreso/salida

## Skills disponibles (.claude/commands/)

Cargar la skill del dominio antes de trabajar en el. Cada una trae el detalle + una seccion `Gotchas / trampas verificadas`:
- **minimarket-db** -- schema, tipos, RPCs, triggers, vistas, patrones de query
- **minimarket-inventario** -- stock multi-almacen, desglose por presentacion, lotes/vencimiento, transferencias
- **minimarket-productos** -- catalogo, presentaciones, precios mayor, import CSV, borrado
- **minimarket-proveedores** -- compras, boletas, pagos parciales, deuda
- **minimarket-pedidos** -- flujo de pedidos, pagos, preparacion, reservas
- **minimarket-personal** -- nomina, asistencias, turnos, bonos
- **minimarket-ui** -- patrones UI, tokens de color, componentes compartidos
