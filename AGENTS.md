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
  authRoles.ts        -- getStoredAppUser(), getCurrentUserProfile(), isAdmin(), isTrabajador()
  dateUtils.ts        -- formatDate(DD-MM-YYYY), formatDateTime, parseInputDate(YYYY-MM-DD), formatTime(HH:MM)
  whatsapp.ts         -- generarMensajePedido(), generarLinkWhatsApp()
  catalogDefaults.ts  -- PRESENTACIONES_INICIALES (17), UNIDADES_BASE_INICIALES (10)

types/
  database.ts         -- 19+ interfaces de todas las tablas Supabase
  index.ts            -- AppSection type

components/           -- todos "use client", logica de negocio pesada
  Layout.tsx (62), Header.tsx (35), Sidebar.tsx (112), AdminOnly.tsx (45)
  ProductoForm.tsx (869), ProductoTable.tsx (381), ProductoImportCsv.tsx (1037)
  PedidoNuevoForm.tsx (1436), PedidosList.tsx (276), PedidoDetalle.tsx (632)
  AlmacenDashboard.tsx (590), AlmacenMovimientos.tsx (207), AlmacenTransferencias.tsx (286), AlmacenAjustes.tsx (284)
  PreparacionModule.tsx (508), ClienteModule.tsx (528), ClientePedidosModule.tsx (572)
  ProveedoresModule.tsx (402), PersonalModule.tsx (1501), PagosYapeValidator.tsx (380)

app/                  -- pages, mayoria son wrappers salvo:
  dashboard/page.tsx (654)    -- AdminDashboard + WorkerDashboard con metricas
  productos/page.tsx (529)    -- listado con quick-edit y paginacion
  productos/nuevo/page.tsx (614)        -- crear/editar producto (?id= para edit)
  productos/mantenimiento/page.tsx (530) -- CRUD catalogos admin-only
  login/page.tsx (107)        -- RPC login_app, localStorage
```

## Schema de base de datos

### Enums (union types)
- **PedidoEstado**: pendiente | pago_enviado | pago_validado | en_preparacion | listo_para_recoger | entregado | cancelado
- **PagoMetodo**: yape | efectivo | otro | transferencia
- **PagoEstado**: pendiente | enviado | validado | rechazado
- **StockMovimientoTipo**: ingreso | salida_venta | salida_pedido | ajuste | transferencia | merma | devolucion
- **TipoEntrega**: llevar_ahora | recoger_despues | enviar
- **PedidoEstadoPago**: pagado | debe

### Tablas principales
- **productos**: id, codigo_interno (auto), categoria_id, subcategoria_id, nombre_producto, marca_id, presentacion, stock_actual, stock_minimo, precio_compra_referencial, precio_venta, imagen_url, activo
- **producto_almacen**: producto_id + almacen_id (unique), stock_actual (fuente de verdad), stock_minimo_local, costo_promedio
- **producto_presentaciones_compra**: producto_id, nombre_presentacion, unidades_por_presentacion, costo_presentacion, es_principal
- **producto_precios_mayor**: producto_id, cantidad_minima, precio_unitario, descripcion, activo
- **pedidos**: 27 campos. cliente_id, estado, tipo_entrega, subtotal/descuento/total, metodo_pago, monto_a_cuenta, estado_pago, stock_descontado. Audit: app_registrado_por_id, app_preparado_por_id, app_entregado_por_id + preparado_at, entregado_at
- **detalle_pedido**: pedido_id, producto_id, cantidad, precio_unitario, subtotal, almacen_id, preparado, cantidad_preparada, app_marcado_por_id
- **pagos**: pedido_id, metodo, estado, monto, captura_yape_url, observacion_rechazo, validado_por_id
- **clientes**: nombres, apellidos, telefono, direccion, direccion_entrega, documento, observacion, activo
- **stock_movimientos**: producto_id, almacen_origen_id, almacen_destino_id, tipo + tipo_movimiento (ambos), cantidad, stock_anterior, stock_nuevo, motivo
- **app_usuarios**: email, rol (admin|trabajador|cliente), nombres, pago_hora, horas_semana, gastos_semana, horario_laboral, activo
- **personal_asistencias**: usuario_id + fecha (unique), hora_ingreso, hora_salida, productividad (1|2|3)
- **personal_descuentos**: usuario_id, fecha, detalle, monto
- **personal_pagos**: usuario_id + semana_inicio (unique), horas_trabajadas, pago_hora, descuentos, monto_pagado, estado (pendiente|pagado)
- **Catalogos**: categorias, subcategorias (con categoria_id), marcas, almacenes, presentaciones, unidades_base, proveedores

### RPCs
- `login_app(p_email, p_password)` -> {id, email, rol, nombres, apellidos}
- `ajustar_stock(p_producto_id, p_almacen_id, p_stock_contado, p_observacion, p_usuario_id)`
- `transferir_stock(...)` -- entre almacenes
- `crear_app_usuario(p_email, p_password, p_rol, p_nombres, p_apellidos, p_telefono, p_pago_hora, p_horas_semana, p_gastos_semana, p_horario_laboral, p_activo)`

### Storage buckets
- `productos` -> `imagenes/{safeCodigo}-{timestamp}.{ext}` (max 1MB, jpg/png/webp)
- `pagos` -> `capturas/{clientePart}-{timestamp}.{ext}`

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
supabase.from("personal_asistencias").upsert(payload, { onConflict: "usuario_id,fecha" })

// Busqueda OR con marca
query.or(`codigo_interno.ilike.%${term}%,nombre_producto.ilike.%${term}%,marca_id.in.(${ids})`)

// FK puede ser array u objeto -- normalizar siempre
const item = Array.isArray(relation) ? relation[0] : relation;

// Error unique violation
if (error.code === "23505") { /* duplicado */ }
```

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

## Inventario multi-almacen

- Almacenes default: **Tienda** (venta) y **Casa** (reserva)
- Stock real esta en `producto_almacen`, no en `productos.stock_actual`
- Ajuste: RPC `ajustar_stock` con stock contado
- Transferencia: RPC `transferir_stock`, validar origen!=destino, cantidad<=stock
- Al crear producto: upsert stock inicial en Tienda
- Pagina productos filtra: solo muestra productos con stock Tienda > 0

## Convencion UI

- Paleta: emerald-700 primario, slate-950 texto, slate-50 fondo, red para error, amber para warning
- Inputs: h-11, border-slate-300, focus:border-emerald-600 focus:ring-emerald-100
- Cards: bg-white border-slate-200 rounded-lg shadow-sm
- Responsive: tabla desktop (hidden lg:block) + cards mobile (lg:hidden)
- Mensajes: `type Message = { type: "success"|"error"; text: string }`
- Ternarios: `{cond ? <X /> : null}` (no &&)
- Async onClick: `onClick={() => void fn()}`
- Cast Supabase: `(data ?? []) as Tipo[]`
- Event handlers: `(event) =>` (nombre completo)
- Guard Supabase: `if (!supabase) return;` al inicio

## Auth y roles

- localStorage key: `app_minimarket_user` -> {id, email, rol, nombres, apellidos}
- Login: RPC `login_app`, post-login redirect `/dashboard`
- Admin: todo. Trabajador: productos, pedidos, almacen, preparacion. Cliente: dashboard basico.
- Patron de acceso: `checkAccess() -> getCurrentUserProfile() -> isAdmin()/isTrabajador()`

## Nomina

- Productividad: 1=No la dio, 2=Normal, 3=Extra
- Semana: lunes a domingo (getWeekRange)
- Horas: hoursBetween(HH:MM, HH:MM), retorna 0 si fin<=inicio (no overnight)
- Pago: max(0, horas * pago_hora - descuentos). Si no hay asistencias, usa horas_semana default.
- Asistencia: upsert por usuario_id+fecha. Pago: upsert por usuario_id+semana_inicio.
