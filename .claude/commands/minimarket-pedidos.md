# Workflow de pedidos -- app-minimarket

Usa esta referencia cuando trabajes con el flujo de pedidos, pagos, estados o preparacion.

## State machine de pedidos

```
                                    +-- cancelado
                                    |
pendiente -----> pago_enviado -----> pago_validado -----> en_preparacion -----> listo_para_recoger -----> entregado
    |                 |                    ^                                                                  |
    |                 +--- rechazado ---> pendiente                                                           |
    |                                      ^                                                                 |
    +---- (efectivo) ---------------------+---> pago_validado ---> en_preparacion ...                         |
    |                                                                                                        |
    +---- (a credito, desde preparacion) -> pago_validado ---> en_preparacion ...                             |
                                                                                                             |
                                           entregado = locked por trigger DB (no mas updates)
```

### Estados (PedidoEstado)

| Estado | Significado | Quien lo setea |
|--------|-------------|---------------|
| `pendiente` | Pedido creado, aun sin pago confirmado | Sistema al crear pedido con efectivo, o al rechazar pago |
| `pago_enviado` | Cliente envio captura Yape | Sistema al crear pedido con yape + captura |
| `pago_validado` | Admin valido el pago Yape; o marcado a credito desde preparacion | PagosYapeValidator, PedidoDetalle, PreparacionModule (marcarACredito) |
| `en_preparacion` | Trabajador tomo el pedido (trigger descuenta stock) | PreparacionModule, PedidoNuevoForm (enviarAPreparacion), PedidoDetalle |
| `listo_para_recoger` | Todos los items preparados | PreparacionModule |
| `entregado` | Cliente recogio el pedido (trigger bloquea updates) | PreparacionModule o PedidoDetalle |
| `cancelado` | Pedido cancelado | PedidoDetalle |

### Estado de pago (PedidoEstadoPago)

| Estado | Cuando |
|--------|--------|
| `pagado` | Pago validado, efectivo confirmado, o monto_a_cuenta >= total al crear |
| `debe` | Pago rechazado, sin pago, o pagoTipo="debe" con monto_a_cuenta < total al crear |

**Nota:** estado_pago ya no es siempre "debe" al crear. Si pagoTipo="total" o monto_a_cuenta cubre el total, se crea como "pagado".

## Librerias de soporte

### pricing.ts (calcularPrecioPorCantidad)

```ts
// Tipos
type PriceTierInput = {
  cantidad_minima: number | null;
  precio_total?: number | null;
  precio_unitario?: number | null;
  tipo_precio?: "paquete" | "unitario" | string | null;
  activo?: boolean | null;
};

type PricingResult = {
  subtotal: number;
  precioUnitarioPromedio: number;
  breakdown: PricingBreakdownItem[];
};

// Uso
calcularPrecioPorCantidad(cantidad, precioBase, tiers)
// Si cantidad es entero y hay tiers, aplica greedy descendente:
// - Ordena tiers por cantidad DESC
// - Para cada tier calcula blocks = floor(remaining / tier.cantidad)
// - El sobrante va a precio regular
// Resultado: subtotal acumulado + promedio ponderado
```

### validators.ts

```ts
// Validadores centralizados (retornan { ok: true } o { ok: false, error: string })
normalizePhonePe(value)       // Quita no-digitos, quita prefijo 51
validatePhonePe(value, opts)  // 9 digitos empezando en 9
validatePrice(value, opts)    // Numero finito >= 0 (allowZero)
validateQuantity(value, opts) // Numero finito > 0 (allowZero)
validateUnits(value)          // > 0 (evita division por cero)
validateHorarioLaboral(ingreso, salida) // salida > ingreso, mismo dia
validateCodigoInterno(value)  // No vacio, >= 2 chars
combineValidations(...results) // Retorna primer error
```

## Creacion de pedido (PedidoNuevoForm.tsx -- 2098 lineas)

### Wizard de 5 pasos (orden actual)
1. **Productos** -- auto-carga todos los productos al montar (sin busqueda obligatoria), debounce 350ms para filtrar, busca por codigo/nombre/marca/categoria/subcategoria, carrito con cantidades y precios mayoristas
2. **Cliente** -- busqueda por nombres/telefono/direccion/referencia, crear nuevo si no existe (check duplicado por telefono)
3. **Entrega** -- tipo_entrega (llevar_ahora, recoger_despues, enviar), fecha/hora auto-seteo al elegir tipo, direccion si enviar, observaciones
4. **Confirmar** -- resumen con tabla items + totales + stock warnings
5. **Pago** -- metodo_pago, pagoTipo toggle (total vs debe), monto_a_cuenta, captura Yape, botones guardar + enviar WhatsApp

**Importante:** El orden es Confirmar=step4, Pago=step5 (NO al reves).

### Producto cards con imagen

Los cards de productos muestran:
- Imagen del producto (producto.imagen_url) o placeholder "IMG"
- Nombre + codigo + marca
- Stock por almacen (Tienda / Casa) con reservas descontadas
- Precio base
- Indicador de stock bajo/agotado con colores (rojo=0, naranja<=umbral)

### Stock reservas (RPCs de carrito)

```ts
// Al agregar producto al carrito:
supabase.rpc("reservar_stock_carrito", {
  p_producto_id, p_almacen_id, p_cantidad_base,
  p_usuario_id, p_sesion_id
})
// Retorna reservaId (string)

// Al cambiar cantidad:
supabase.rpc("actualizar_reserva_carrito", {
  p_reserva_id, p_cantidad_base
})

// Al cambiar almacen: liberar vieja + crear nueva
supabase.rpc("liberar_reserva", { p_reserva_id })

// Al desmontar componente / cancelar:
supabase.rpc("liberar_reservas_carrito", {
  p_usuario_id, p_sesion_id
})

// Al guardar pedido, asociar reservas:
supabase.rpc("asociar_reservas_a_pedido", {
  p_reserva_ids, p_pedido_id
})
```

El mapa de reservas se carga de `vista_stock_reservado` y se usa para mostrar stock disponible real.

### Precios mayoristas (wholesale pricing)

```ts
// Cada item usa:
getItemPricing(item) -> calcularPrecioPorCantidad(cantidad, precioBase, producto_precios_mayor)
// Retorna { subtotal, precioUnitarioPromedio, breakdown }
// El total del carrito suma pricing.subtotal por item
```

### Presentation-aware stock

```ts
// Stock real esta en producto_base.producto_almacen (no productos.stock_actual)
getStockProductId(producto)          // Retorna producto_base_id si existe, sino producto.id
getBaseStockByAlmacen(producto, id)  // Lee stock de producto_base si aplica
toBaseQuantity(producto, cantidad)   // Convierte a unidades base
toPresentationStock(producto, base)  // Convierte de base a presentacion
stockIn(producto, almacenId)         // Shortcut: stock en presentacion por almacen
```

### Toggle pago tipo (total vs debe)

```ts
// En step 5 antes de guardar:
pagoTipo: "total" | "debe"
// "total" -> estado_pago="pagado", monto_a_cuenta=total
// "debe"  -> estado_pago="debe" si monto_a_cuenta < total, sino "pagado"
//            monto_a_cuenta = valor ingresado por usuario
//            observacionPago se guarda en pedido.observaciones
```

### Logica de guardado

```
1. Insert pedido:
   - estado: "pago_enviado" si yape con captura, sino "pendiente"
   - estado_pago: condicional (ver toggle pago arriba)
   - monto_a_cuenta: total si pagoTipo="total", valor ingresado si "debe"
   - app_registrado_por_id: usuario logueado
   - detalle_manual: "cantidad x nombre" por cada item (join "; ")

2. Insert detalle_pedido (por cada item del carrito):
   - producto_id, producto_stock_id, cantidad, cantidad_base
   - precio_unitario: pricing.precioUnitarioPromedio
   - almacen_id del almacen seleccionado

3. Asociar reservas al pedido:
   - RPC asociar_reservas_a_pedido(reservaIds, pedidoId)

4. Insert pago:
   - metodo, estado ("enviado" si yape con captura, sino "pendiente")
   - monto: total del pedido
   - captura_yape_url si aplica
```

### Post-creation action panel

Despues de guardar, step 5 muestra un panel con:
- Estado del pedido creado + estado de pago
- Boton "Confirmar pago" (si estado_pago="debe") -> update pedido.estado_pago="pagado"
- Boton "Enviar a preparacion" -> update estado="en_preparacion" + redirect a /preparacion?pedido=id
- Boton "Nueva venta" -> resetForNewSale()

### URL params soportados
- `?duplicar={pedidoId}` -- carga items de un pedido existente (con base stocks)
- `?cliente={clienteId}` -- preselecciona cliente y carga su direccion/referencia

### Mobile UX en carrito
- Grid: cantidad | img | nombre + toggle T/C + precio/unidad + boton S/ | subtotal | quitar
- Toggle T/C: circulo con letra que cambia almacen entre Tienda y Casa
- Boton S/: prompt para vender por monto (calcula cantidad = monto / precioUnit)

### Stock warnings
Al seleccionar almacen, verifica stock disponible (descontando reservas). Si Tienda no tiene suficiente, sugiere Casa.

## Listado de pedidos (PedidosList.tsx -- 414 lineas)

### Filtros
- Estado (dropdown con todos los PedidoEstado)
- Fecha recojo (input date)
- Busqueda: matchesSearch contra `pedido.id`, `id.slice(0,8)`, `cliente.nombres`, `cliente.telefono`, `pedido.estado`, `pedido.metodo_pago`
- URL param: `?pedido=` para busqueda inicial

### Columnas de la tabla

| Columna | Detalle |
|---------|---------|
| Pedido | #id.slice(0,8) |
| Cliente | clientes.nombres |
| WhatsApp | clientes.telefono |
| Recojo | fecha_recojo formateada |
| Hora | hora_recojo formateada |
| Total | pedido.total |
| **Deuda** | Si estado_pago="debe": total - monto_a_cuenta (badge amber). Si pagado: "-" |
| Pago | metodo del pago (o metodo_pago fallback) |
| Estado | badge con estado formateado |
| Accion | Ver detalle + acciones rapidas |

### Acciones rapidas inline (quick payment)

**Para pedidos con estado="pago_enviado":**
- Boton "Pago OK" -> `validarPago(pedidoId)`: actualiza pago.estado="validado" + pedido.estado="pago_validado" + estado_pago="pagado"
- Boton "Rechazar" -> abre input de motivo inline -> `rechazarPago(pedidoId)`: requiere observacion, pago.estado="rechazado" + pedido.estado="pendiente" + estado_pago="debe"

**Para pedidos con estado="pendiente" o "pago_validado":**
- Boton "Preparar" -> Link a `/preparacion?pedido={pedidoId}`

### Query
```ts
supabase.from("pedidos")
  .select(`*, clientes(nombres, telefono), pagos(metodo, estado, captura_yape_url)`)
  .order("created_at", { ascending: false })
// Usa fetchAllRows para paginacion automatica
```

### Normalizacion de pagos
```ts
function getPago(pedido) {
  // pagos puede ser array o single object dependiendo de la relacion
  return Array.isArray(pedido.pagos) ? pedido.pagos[0] : pedido.pagos;
}
```

## Detalle de pedido (PedidoDetalle.tsx -- 649 lineas)

### Datos cargados
- Pedido con clientes + pagos (embed)
- Detalle_pedido con productos (embed: codigo_interno, nombre_producto, presentacion)
- Usuarios responsables: busca en app_usuarios (app_*_por_id) y usuarios_perfil (legacy *_por_id) como fallback

### Layout
- Columna izquierda: datos pedido + tabla productos + nota cliente
- Columna derecha (360px): cliente, pago (con captura Yape), responsables, acciones

### Acciones disponibles

**Validar pago Yape:**
```ts
// 1. Update pago
pagos.update({ estado: "validado", validado_at: now })
// 2. Update pedido
pedidos.update({ estado: "pago_validado", estado_pago: "pagado" })
```

**Rechazar pago:**
```ts
// 1. Update pago
pagos.update({ estado: "rechazado" })
// 2. Update pedido
pedidos.update({ estado: "pendiente", estado_pago: "debe" })
```

**Cambiar estado generico:**
```ts
pedidos.update({ estado: nuevoEstado, ...extraPayload })
// Entregado agrega entregado_at
// Cancelado no agrega extra
```

**WhatsApp:**
- `generarMensajePedido()` construye mensaje multilinea con items, totales, fecha recojo
- `generarLinkWhatsApp(numeroNegocio, mensaje)` genera URL `wa.me`
- `NEXT_PUBLIC_WHATSAPP_NEGOCIO` env var (default "942025999")

## Preparacion (PreparacionModule.tsx -- 684 lineas)

### Cola de pedidos
```ts
// Filtro de cola (incluye pago_enviado ahora)
estado IN (pendiente, pago_enviado, pago_validado, en_preparacion, listo_para_recoger)
// Orden: fecha_recojo ASC
```

### Layout
- Sidebar 380px con lista de pedidos (max-h-680px scroll), cada card muestra estado + badge pago (Pagado/Debe)
- Area principal con info del pedido + checklist de items
- URL param: `?pedido=` para seleccionar pedido automaticamente
- Si pedido seleccionado ya no esta en cola (entregado), limpia panel derecho automaticamente

### Race condition guard (pasarEnPreparacion)

```ts
// 1. Re-leer pedido para detectar si otro trabajador ya lo proceso
const fresh = await supabase.from("pedidos")
  .select("estado, stock_descontado")
  .eq("id", selectedPedido.id).maybeSingle();

// 2. Si stock_descontado=true O estado=en_preparacion, abortar
if (fresh.data?.stock_descontado || fresh.data?.estado === "en_preparacion") {
  // "Otro trabajador ya tomo este pedido. Refrescando..."
  return;
}

// 3. Solo entonces hacer el update
pedidos.update({
  estado: "en_preparacion",
  app_preparado_por_id: currentUserId,
  preparado_at: new Date().toISOString()
})
// Nota: el trigger de DB lanza "Stock insuficiente" si no hay stock
```

### Acciones de preparacion

**Pasar a en_preparacion:** Race condition guard + update con app_preparado_por_id + preparado_at. Stock descontado por trigger DB.

**Marcar item preparado:**
```ts
detalle_pedido.update({
  preparado: true,
  cantidad_preparada,
  app_marcado_por_id: userId,
  fecha_marcado: new Date().toISOString()
})
```

**Marcar listo:**
- Requiere que TODOS los items esten `preparado: true` (allPrepared)
- Pedidos manuales sin items: allPrepared=true (nada que marcar)
- Actualiza estado a `listo_para_recoger`

**Marcar entregado:**
```ts
pedidos.update({
  estado: "entregado",
  app_entregado_por_id: userId,
  entregado_at: new Date().toISOString()
})
// Si estado_pago="debe": mensaje especial "Entregado a credito. Cobra desde modulo del cliente."
// Limpia seleccion y recarga cola
```

**Marcar a credito (nueva accion):**
```ts
// Para pedidos pendientes o pago_enviado que se quieren preparar sin esperar pago
pedidos.update({
  estado_pago: "debe",
  monto_a_cuenta: 0,
  estado: (pendiente | pago_enviado) ? "pago_validado" : estado_actual
})
// Permite continuar con preparacion sin pago confirmado
```

**Confirmar pago (nueva accion):**
```ts
// Para pedidos que estan como "debe" y el pago se recibio
pedidos.update({
  estado_pago: "pagado",
  monto_a_cuenta: selectedPedido.total
})
```

### Checklist con stock display
Cada item del checklist muestra stock disponible leido desde producto_base.producto_almacen (o producto_almacen directo) filtrado por almacen_id del detalle.

## Validacion de pagos Yape (PagosYapeValidator.tsx -- 380 lineas)

### Filtros
```ts
// Pedidos con estado='pago_enviado'
// Filtra a: pago.metodo='yape' AND pago.estado='enviado'
```

### Flujo de validacion
1. Ver captura Yape (imagen del bucket `pagos`)
2. Validar: pago -> `validado`, pedido -> `pago_validado` + `pagado`
3. Rechazar: requiere observacion, pago -> `rechazado`, pedido -> `pendiente` + `debe`

## Pedidos por cliente (ClientePedidosModule.tsx -- 1111 lineas)

### Tablas usadas
- `clientes` -- datos del cliente
- `pedidos` con embed `detalle_pedido(id,cantidad,precio_unitario,subtotal,productos!producto_id(nombre_producto))`
- `cliente_abonos` -- historial de pagos del cliente (ultimos 50)

### Funcionalidades
- Historial de pedidos del cliente con filtro por fecha y toggle "Debe"
- Crear pedido manual con `detalle_manual` (textarea libre) + imagen del pedido en papel
- Pago FIFO con allocations + seleccion dirigida por card
- Historial de abonos del cliente
- Links: duplicar pedido, nuevo con cliente, ver detalle

### Pedido manual

```ts
// Insert con imagen opcional
pedidos.insert({
  cliente_id, fecha_pedido, fecha_recojo: fecha,
  tipo_entrega: "recoger_despues",
  detalle_manual: detalle,
  subtotal: total, total,
  monto_a_cuenta: min(montoACuenta, total),
  estado_pago: montoFinal >= total ? "pagado" : "debe",
  estado: "pendiente",
  metodo_pago: pagado ? "efectivo" : "otro",
  imagen_papel_url: imagenUrl  // upload a bucket pedidos_manuales
})
```

### Imagen de pedido manual

```ts
// Upload a bucket "pedidos_manuales"
// Path: pedidos_manuales/{clienteId.slice(0,8)}-{timestamp}.{ext}
// Tipos permitidos: jpeg, png, webp (max 2MB)
// Se muestra como thumbnail clicable en la card del pedido
```

### FIFO payment allocation

```ts
function allocateAmountFifo(amount, cards, priorityIds) {
  // 1. Cards seleccionadas explicitamente primero (en su orden)
  // 2. Luego el resto ordenado por fecha_pedido ASC (mas antigua primero)
  // 3. Para cada card: aplicar = min(remaining, saldo)
  //    nuevoACuenta = min(total, monto_a_cuenta + aplicar)
  //    nuevoEstadoPago = nuevoACuenta >= total ? "pagado" : "debe"
  // Retorna { allocations: Allocation[], sobrante: number }
}
```

### Targeted payment (card selection)

- Boton "Aplicar pago aqui" en cards con saldo pendiente -> toggleSelected(pedidoId)
- Cards seleccionadas se priorizan en la distribucion FIFO
- Preview de allocations se actualiza en tiempo real (useMemo)
- Si sobrante > 0, el boton de pago se deshabilita

### Registro de pago (registerPayment)

```ts
// 1. Insert en cliente_abonos (historial)
cliente_abonos.insert({
  cliente_id, fecha_pago, monto_total, metodo,
  observacion: "Distribuido en N pedido(s)",
  registrado_por_id: usuario logueado
})

// 2. Para cada allocation en secuencia:
pedidos.update({
  monto_a_cuenta: alloc.nuevoACuenta,
  estado_pago: alloc.nuevoEstadoPago,
  metodo_pago: pagoForm.metodo,
  observaciones: "Deuda cancelada/Abono registrado desde modulo de cliente"
})
pagos.upsert({
  pedido_id, metodo, estado, monto: nuevoACuenta
}, { onConflict: "pedido_id" })
```

### Resumen de pedido
```ts
// Muestra primeros 3 productos o detalle_manual
getPedidoResumen(pedido)
// Pedido manual = detalle_pedido vacio (esPedidoManual)
// Solo pedidos con items reales se pueden duplicar
```

### Pedidos entregados
- Badge "ENTREGADO" visible
- Locked: no se puede editar (trigger DB bloquea updates)
- Solo se puede registrar pago pendiente si tiene saldo
- Pedidos con items se pueden duplicar, manuales no

## Deuda de clientes (ClienteModule.tsx)

```ts
// Carga pedidos donde estado_pago='debe'
// Calcula deuda = sum(total - monto_a_cuenta) por cliente
function getDebtByClient(pedidos) {
  // Map clienteId -> saldo total pendiente
}
```
