# Workflow de pedidos -- app-minimarket

Usa esta referencia cuando trabajes con el flujo de pedidos, pagos, estados o preparacion.

## State machine de pedidos

```
                                    +-- cancelado
                                    |
pendiente -----> pago_enviado -----> pago_validado -----> en_preparacion -----> listo_para_recoger -----> entregado
    |                 |                                        ^
    |                 +--- rechazado ---> pendiente            |
    |                                                         |
    +---- (efectivo) ----------------------------------------+
```

### Estados (PedidoEstado)

| Estado | Significado | Quien lo setea |
|--------|-------------|---------------|
| `pendiente` | Pedido creado, aun sin pago confirmado | Sistema al crear pedido con efectivo, o al rechazar pago |
| `pago_enviado` | Cliente envio captura Yape | Sistema al crear pedido con yape + captura |
| `pago_validado` | Admin valido el pago Yape | PagosYapeValidator o PedidoDetalle |
| `en_preparacion` | Trabajador tomo el pedido | PreparacionModule o WorkerDashboard |
| `listo_para_recoger` | Todos los items preparados | PreparacionModule |
| `entregado` | Cliente recogio el pedido | PreparacionModule o PedidoDetalle |
| `cancelado` | Pedido cancelado | PedidoDetalle |

### Estado de pago (PedidoEstadoPago)

| Estado | Cuando |
|--------|--------|
| `pagado` | Pago validado o efectivo confirmado |
| `debe` | Pago rechazado o sin pago |

## Creacion de pedido (PedidoNuevoForm.tsx -- 1436 lineas)

### Wizard de 5 pasos
1. **Productos** -- busqueda con debounce 350ms, busca tambien por marca, carrito con cantidades
2. **Cliente** -- busqueda por nombres/telefono, crear nuevo si no existe (check duplicado por telefono)
3. **Entrega** -- tipo_entrega (llevar_ahora, recoger_despues, enviar), fecha/hora recojo, direccion si enviar
4. **Pago** -- metodo_pago, monto_a_cuenta, captura Yape (upload a bucket `pagos`)
5. **Confirmar** -- resumen final con boton guardar

### Logica de guardado
```
1. Insert pedido:
   - estado: "pago_enviado" si yape con captura, sino "pendiente"
   - estado_pago: "debe" siempre al crear
   - app_registrado_por_id: usuario logueado
   - fecha_pedido: hoy ISO

2. Insert detalle_pedido (por cada item del carrito):
   - producto_id, cantidad, precio_unitario, subtotal
   - almacen_id del almacen seleccionado

3. Insert pago:
   - metodo, estado ("enviado" si yape con captura, sino "pendiente")
   - monto: total del pedido
   - captura_yape_url si aplica
```

### URL params soportados
- `?duplicar={pedidoId}` -- carga items de un pedido existente para duplicar
- `?cliente={clienteId}` -- preselecciona cliente

### Stock warnings
Al seleccionar almacen, verifica stock disponible. Si Tienda no tiene suficiente, sugiere Casa.

### Carrito (Cart sub-componente)
- Dual display: tabla en desktop + cards en mobile
- Calcula subtotal por item y total general
- Campo descuento global que resta del subtotal

## Listado de pedidos (PedidosList.tsx -- 276 lineas)

### Filtros
- Estado (dropdown con todos los PedidoEstado)
- Fecha recojo (input date)
- Busqueda: match contra `pedido.id`, `id.slice(0,8)`, `cliente.nombres`, `cliente.telefono`
- URL param: `?pedido=` para busqueda inicial

### Query
```ts
supabase.from("pedidos").select(`*, clientes(*), pagos(*)`)
  .order("created_at", { ascending: false })
```

### Normalizacion de pagos
```ts
function getPago(pagos) {
  // pagos puede ser array o single object dependiendo de la relacion
  return Array.isArray(pagos) ? pagos[0] : pagos;
}
```

## Detalle de pedido (PedidoDetalle.tsx -- 632 lineas)

### Datos cargados
- Pedido con clientes + pagos (embed)
- Detalle_pedido con productos (embed)
- `usuarios_perfil` para nombres de responsables

### Acciones disponibles

**Validar pago Yape:**
```ts
// 1. Update pago
pagos.update({ estado: "validado", validado_at: now, observacion_rechazo: null })
// 2. Update pedido
pedidos.update({ estado: "pago_validado", estado_pago: "pagado" })
```

**Rechazar pago:**
```ts
// Requiere observacion_rechazo
// 1. Update pago
pagos.update({ estado: "rechazado", observacion_rechazo })
// 2. Update pedido
pedidos.update({ estado: "pendiente", estado_pago: "debe" })
```

**Cambiar estado generico:**
```ts
pedidos.update({ estado: nuevoEstado, ...extraPayload })
```

**WhatsApp:**
- `generarMensajePedido()` construye mensaje multilinea con items, totales, fecha recojo
- `generarLinkWhatsApp(numeroNegocio, mensaje)` genera URL `wa.me`
- `NEXT_PUBLIC_WHATSAPP_NEGOCIO` env var (default "942025999")

## Preparacion (PreparacionModule.tsx -- 508 lineas)

### Cola de pedidos
```ts
// Filtro de cola
estado IN (pendiente, pago_validado, en_preparacion, listo_para_recoger)
// Pendiente solo si metodo_pago='efectivo'
// Orden: fecha_recojo ASC
```

### Layout
- Sidebar 380px con lista de pedidos (max-h-680px scroll)
- Area principal con checklist de items
- URL param: `?pedido=` para seleccionar pedido automaticamente

### Acciones de preparacion

**Tomar pedido (pasar a en_preparacion):**
```ts
pedidos.update({
  estado: "en_preparacion",
  app_preparado_por_id: userId,
  preparado_at: new Date().toISOString()
})
```

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
- Requiere que TODOS los items esten `preparado: true`
- Actualiza estado a `listo_para_recoger`

**Marcar entregado:**
```ts
pedidos.update({
  estado: "entregado",
  app_entregado_por_id: userId,
  entregado_at: new Date().toISOString()
})
```

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

## Pedidos por cliente (ClientePedidosModule.tsx -- 572 lineas)

### Funcionalidades
- Historial de pedidos del cliente
- Crear pedido manual con `detalle_manual` (textarea libre)
- Registrar pagos parciales: actualiza `monto_a_cuenta` del pedido
- Calculo de saldo: `getSaldo() = total - monto_a_cuenta`
- Upsert pago con `onConflict: "pedido_id"`
- Links: duplicar pedido (`/pedidos/nuevo?duplicar={id}`), nuevo con cliente (`/pedidos/nuevo?cliente={id}`)

### Resumen de pedido
```ts
// Muestra primeros 3 productos o detalle_manual
getPedidoResumen(detalle, detalleManual)
```

## Deuda de clientes (ClienteModule.tsx)

```ts
// Carga pedidos donde estado_pago='debe'
// Calcula deuda = sum(total - monto_a_cuenta) por cliente
function getDebtByClient(pedidos) {
  // Map clienteId -> saldo total pendiente
}
```
