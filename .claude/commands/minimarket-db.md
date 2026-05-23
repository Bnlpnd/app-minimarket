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

**ProductoPrecioMayor** (tabla `producto_precios_mayor`)
- `id`, `producto_id`, `cantidad_minima`, `precio_unitario`, `descripcion: string | null`, `activo`

**Pedido** (tabla `pedidos`) -- 27 campos
- `id`, `cliente_id: string | null`, `estado: PedidoEstado`
- Audit trail: `registrado_por_id`, `preparado_por_id`, `entregado_por_id` (perfil)
- Audit trail app: `app_registrado_por_id`, `app_preparado_por_id`, `app_entregado_por_id` (app_usuarios)
- `fecha_recojo`, `hora_recojo`, `subtotal`, `descuento`, `total`
- `metodo_pago: PagoMetodo | null`, `tipo_entrega: TipoEntrega`
- `direccion_entrega`, `referencia_entrega`, `nota_cliente`
- `fecha_pedido`, `detalle_manual: string | null`
- `monto_a_cuenta: number`, `estado_pago: PedidoEstadoPago`
- `observaciones`, `stock_descontado: boolean`
- `preparado_at`, `entregado_at`, `created_at`, `updated_at`

**DetallePedido** (tabla `detalle_pedido`)
- `id`, `pedido_id`, `producto_id`, `cantidad`, `precio_unitario`, `subtotal`
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

## RPCs de Supabase

| RPC | Parametros | Uso |
|-----|-----------|-----|
| `login_app` | `p_email, p_password` | Login -- devuelve `{id, email, rol, nombres, apellidos}` |
| `ajustar_stock` | `p_producto_id, p_almacen_id, p_stock_contado, p_observacion, p_usuario_id` | Ajuste de stock por conteo |
| `transferir_stock` | (ver AlmacenTransferencias) | Transferencia entre almacenes |
| `crear_app_usuario` | 11 params (email, password, rol, nombres, apellidos, telefono, pago_hora, horas_semana, gastos_semana, horario_laboral, activo) | Crear usuario |

## Storage buckets

| Bucket | Path pattern | Uso |
|--------|-------------|-----|
| `productos` | `imagenes/{safeCodigo}-{timestamp}.{ext}` | Fotos de productos (max 1MB, jpg/png/webp) |
| `pagos` | `capturas/{clientePart}-{timestamp}.{ext}` | Capturas Yape |

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
  producto_almacen(*, almacenes(id, nombre))
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

## Catalogos iniciales (lib/catalogDefaults.ts)

- `PRESENTACIONES_INICIALES`: 17 items (paquete, caja, plancha, saco, balde, java, unidad, medio saco, bolsa, botella, bidon, doypack, frasco, lata, sobre, sachet, pote)
- `UNIDADES_BASE_INICIALES`: 10 items (litro, kilo, gramo, mililitro, unidad, sachet, casillero, paquete, bolsa, caja)
