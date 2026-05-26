# Sistema de inventario multi-almacen -- app-minimarket

Usa esta referencia cuando trabajes con stock, almacenes, transferencias, ajustes, movimientos, agregar stock o abastecimiento.

## Arquitectura de stock

### Dos niveles de stock
1. **productos.stock_actual** -- stock global del producto (puede estar desactualizado)
2. **producto_almacen.stock_actual** -- stock real por almacen (fuente de verdad)

### Producto base y presentaciones vinculadas
- Un producto puede tener `producto_base_id` apuntando a otro producto.
- El stock real vive en el producto base, no en la presentacion.
- `unidades_equivalentes` indica cuantas unidades base equivale 1 unidad de la presentacion.
- Todos los componentes resuelven `producto_base` para leer/escribir stock correctamente.

### Almacenes predeterminados
- **Tienda** (alias "Negocio") -- almacen de venta directa, stock visible al cliente
- **Casa** -- almacen de reserva/deposito

### Tabla producto_almacen
```ts
interface ProductoAlmacen {
  id: string;
  producto_id: string;
  almacen_id: string;
  stock_actual: number;        // fuente de verdad para este almacen
  stock_minimo_local: number | null;
  costo_promedio: number | null;
  ubicacion_interna: string | null;
}
```

### Tabla stock_movimientos
```ts
interface StockMovimiento {
  id: string;
  producto_id: string;
  pedido_id: string | null;
  almacen_origen_id: string | null;
  almacen_destino_id: string | null;
  tipo: string;                    // campo legacy
  tipo_movimiento: StockMovimientoTipo;  // campo actual
  cantidad: number;
  costo_unitario: number | null;
  stock_anterior: number | null;
  stock_nuevo: number | null;
  referencia: string | null;
  motivo: string | null;
  observacion: string | null;
  usuario_id: string | null;
  registrado_por_id: string | null;
}
```

**StockMovimientoTipo**: `ingreso`, `salida_venta`, `salida_pedido`, `ajuste`, `transferencia`, `merma`, `devolucion`

### Tablas de transferencias (solicitud/items)
```ts
interface AlmacenTransferenciaSolicitud {
  id: string;
  estado: string;       // "enviado" | "recibido"
  observacion: string | null;
  created_at: string;
}

interface AlmacenTransferenciaItem {
  id: string;
  solicitud_id: string;
  producto_id: string;
  cantidad_solicitada: number;
  cantidad_recibida: number | null;
  almacen_origen_id: string | null;
  almacen_destino_id: string | null;
}
```

### Tablas de abastecimiento
```ts
interface AbastecimientoPedido {
  id: string;
  proveedor_id: string | null;
  urgencia: "baja" | "normal" | "alta";
  estado: "pendiente" | "enviado" | "comprado" | "cancelado";
  observacion: string | null;
  created_at: string;
}

interface AbastecimientoItem {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  observacion: string | null;
}
```

### Stock reservado
- **stock_reservas** -- tabla de reservas por carritos/pedidos abiertos
- **vista_stock_reservado** -- vista que agrupa reservas por `(producto_id, almacen_id)` con `total_reservado`
- Se usa para calcular stock disponible = stock_actual - reservado

## Libreria inventoryUtils.ts

Archivo: `lib/inventoryUtils.ts`. Centraliza toda la logica de resolucion de stock.

### Funciones principales
```ts
// Resuelve al ID del producto base (para stock). Retorna producto_base_id o el id propio.
getStockProductId(producto): string

// Unidades equivalentes por venta. Retorna unidades_equivalentes (min 1).
getUnitsPerSale(producto): number

// Filas de stock del producto base (o propias si no tiene base).
getBaseStockRows(producto): StockRow[]

// Stock del producto base buscando por nombre de almacen (ej. "Tienda", "Casa").
getBaseStockByName(producto, name): number

// Stock del producto base buscando por almacen_id.
getBaseStockByAlmacen(producto, almacenId): number

// Convierte stock base a unidades de presentacion (Math.floor).
toPresentationStock(producto, baseStock): number

// Residuo de la division base/presentacion.
presentationRemainder(producto, baseStock): number

// Convierte cantidad de presentacion a unidades base.
toBaseQuantity(producto, presentationQuantity): number

// Stock disponible = stock_actual - reservado.
getStockDisponible(producto, almacenId, reservadoMap): number

// Indica si stock disponible <= umbral (stock_minimo o STOCK_BAJO_DEFAULT=10).
isStockBajo(producto, almacenId, reservadoMap): boolean

// Nivel de stock para colorear UI: "sin" | "bajo" | "ok".
getStockLevel(producto, almacenId, reservadoMap): "sin" | "bajo" | "ok"

// Resuelve IDs de Casa y Tienda (tolera "Negocio" como sinonimo de "Tienda").
resolveCasaTiendaIds(almacenes): { casaId: string | null; tiendaId: string | null }

// Construye Map<"producto_id::almacen_id", cantidad_reservada>.
buildReservadoMap(rows): StockReservadoMap

// Lee cantidad reservada de un Map preconstruido.
getStockReservado(reservadoMap, productoId, almacenId): number

// Resuelve ID base con un Map<id, producto_base_id> precargado.
resolveStockId(productoId, basePorProducto): string

// Type guard: producto tiene base vinculada.
tieneProductoBase(producto): boolean
```

### Tipo compartido
```ts
type ProductWithStockPresentation = {
  id: string;
  producto_base_id?: string | null;
  unidades_equivalentes?: number | null;
  stock_minimo?: number | null;
  producto_almacen?: StockRow[] | null;
  producto_base?: {
    id: string;
    producto_almacen?: StockRow[] | null;
  } | null;
};
```

### Patron de prefetch de producto base
Todos los componentes de inventario siguen este patron para resolver stock real:
```ts
// 1. Cargar productos con producto_almacen
// 2. Extraer baseIds unicos de producto_base_id
// 3. Fetch productos base con su producto_almacen
// 4. Merge: producto.producto_base = baseMap.get(producto.producto_base_id)
const baseIds = [...new Set(data.map(p => p.producto_base_id).filter(Boolean))];
const baseMap = new Map();
if (baseIds.length > 0) {
  const { data: baseRows } = await supabase
    .from("productos")
    .select("id,nombre_producto,producto_almacen(almacen_id,stock_actual,almacenes(id,nombre))")
    .in("id", baseIds);
  for (const row of baseRows ?? []) baseMap.set(row.id, row);
}
const merged = data.map(p => p.producto_base_id ? { ...p, producto_base: baseMap.get(p.producto_base_id) } : p);
```

## RPCs de stock

### ajustar_stock
```ts
supabase.rpc("ajustar_stock", {
  p_producto_id: string,    // usar getStockProductId() para resolver base
  p_almacen_id: string,
  p_stock_contado: number,  // nuevo stock real contado
  p_observacion: string,
  p_usuario_id: string | null
})
```
- Calcula diferencia automaticamente
- Crea movimiento tipo `ajuste`
- Actualiza `producto_almacen.stock_actual`

### transferir_stock
```ts
supabase.rpc("transferir_stock", {
  p_producto_id: string,         // usar getStockProductId() para resolver base
  p_almacen_origen_id: string,
  p_almacen_destino_id: string,
  p_cantidad: number,
  p_observacion: string,
  p_usuario_id: string | null
})
```
- Validaciones: origen != destino, cantidad > 0, cantidad <= stock origen
- Crea movimiento tipo `transferencia`

## Modulos de almacen

### AlmacenDashboard.tsx (631 lineas)

**Proposito:** Vista principal de stock por almacen con edicion rapida.

**Comportamiento:**
- Requiere seleccionar almacen + criterio de busqueda antes de cargar datos
- Carga todos los productos via `fetchAllRows` (paginacion automatica)
- Prefetch de producto_base para presentaciones vinculadas
- Filtros: busqueda, categoria, almacen, stock (todos/bajo/sin_stock)
- Quick-edit campos: `stock_minimo`, `precio_venta`, `precio_compra_referencial`
- Usa `getBaseStockByName()` y `getStockProductId()` de inventoryUtils

**Ajuste rapido de stock:**
```ts
async function ajustar(producto, target: "tienda" | "casa") {
  await supabase.rpc("ajustar_stock", {
    p_producto_id: getStockProductId(producto),  // resuelve base
    p_almacen_id: almacen.id,
    p_stock_contado: nuevoStock,
    p_observacion: producto.producto_base_id
      ? `Ajuste rapido desde almacen (${almacen.nombre}) - vinculado a base`
      : `Ajuste rapido desde almacen (${almacen.nombre})`,
    p_usuario_id: null
  });
}
```

**Guardar datos del producto:**
```ts
await supabase.from("productos").update({
  stock_minimo: valor,
  precio_venta: valor,
  precio_compra_referencial: valor
}).eq("id", productoId);
```

**Links:** Enlaza a transferencias y ajustes con `?producto=` param.

**Stock total (funcion local):**
```ts
function stockTotal(producto) {
  const rows = producto.producto_base?.producto_almacen ?? producto.producto_almacen;
  return rows.reduce((sum, stock) => sum + Number(stock.stock_actual ?? 0), 0);
}
```

### AlmacenTransferencias.tsx (715 lineas)

**Proposito:** Gestionar transferencias entre almacenes con modelo solicitud/items y pedidos de abastecimiento.

**Modelo de datos:**
- Ya NO usa `transferir_stock` directamente para crear transferencias
- Crea solicitudes en `almacen_transferencias_solicitudes` + items en `almacen_transferencias_items`
- La RPC `transferir_stock` se ejecuta solo al **confirmar** la recepcion
- Soporta multi-item: varios productos por solicitud

**Direcciones de transferencia:**
```ts
type TransferDireccion = "casa_a_negocio" | "negocio_a_casa";
```

**Dos carritos independientes:**
1. **transferCart** -- lista de transferencias entre almacenes (WhatsApp a almacen)
2. **pedidoCart** -- lista de abastecimiento/pedidos a proveedor (WhatsApp al duenio)

**Vista dual Negocio/Casa:**
- Columna izquierda: stock en Negocio (Tienda)
- Columna derecha: stock en Casa
- Cada producto muestra botones "Transferir" y "Hacer pedido"
- Filtros: busqueda, categoria, subcategoria, nivel stock (bajo/sin/normal/alto/todos)
- Default filter: `stockFilter = "bajo"`

**Nivel de stock (funcion local en componente):**
```ts
function getStockLevel(producto) {
  const negocio = getBaseStockByName(producto, "Tienda");
  const minimo = Number(producto.stock_minimo ?? 10);
  if (negocio <= 0) return "sin";
  if (negocio <= minimo) return "bajo";
  if (negocio > minimo * 3) return "alto";
  return "normal";
}
```

**Proveedor principal:** extraido de `producto_presentaciones_compra` (primer item con proveedor).

**Flujo de transferencia:**
1. Agregar productos al carrito de transferencia
2. Elegir direccion por item (Casa->Negocio o Negocio->Casa)
3. Insertar solicitud en `almacen_transferencias_solicitudes` con estado "enviado"
4. Insertar items en `almacen_transferencias_items` con origen/destino
5. Generar mensaje WhatsApp con la lista y abrir link
6. Mas tarde: "Confirmar envio recibido" ejecuta `transferir_stock` RPC por cada item

**Flujo de abastecimiento (desde transferencias):**
1. Agregar productos al carrito de pedido
2. Elegir proveedor y urgencia
3. Insertar en `abastecimiento_pedidos` + `abastecimiento_items`
4. Generar mensaje WhatsApp al duenio con link a `/almacen/abastecimiento`

**Confirmacion de transferencia:**
```ts
async function confirmarTransferencia(solicitud) {
  for (const item of solicitud.almacen_transferencias_items) {
    const cantidad = Number(item.cantidad_recibida ?? item.cantidad_solicitada);
    const productoStockId = getStockProductId({
      id: item.productos.id,
      producto_base_id: item.productos.producto_base_id ?? null,
    });
    await supabase.rpc("transferir_stock", {
      p_producto_id: productoStockId,
      p_almacen_origen_id: origenId,
      p_almacen_destino_id: destinoId,
      p_cantidad: cantidad,
      p_observacion: `Confirmacion solicitud ${solicitud.id.slice(0, 8)}`,
      p_usuario_id: null,
    });
  }
  await supabase.from("almacen_transferencias_solicitudes")
    .update({ estado: "recibido" }).eq("id", solicitud.id);
}
```

**Solicitudes guardadas:** muestra las ultimas 5 solicitudes con items editables (cantidad_recibida via onBlur).

**Query de solicitudes con alias FK:**
```ts
supabase.from("almacen_transferencias_solicitudes").select(`
  *,
  almacen_transferencias_items(
    id, cantidad_solicitada, cantidad_recibida,
    almacen_origen_id, almacen_destino_id,
    productos(id,nombre_producto,presentacion,producto_base_id),
    almacen_origen:almacenes!almacen_transferencias_items_almacen_origen_id_fkey(id,nombre),
    almacen_destino:almacenes!almacen_transferencias_items_almacen_destino_id_fkey(id,nombre)
  )
`)
```

**WhatsApp:**
- Almacen: `942025999`
- Duenio/abastecimiento: `943104987`

### AlmacenAjustes.tsx (336 lineas)

**Proposito:** Ajuste de stock por conteo fisico.

**Default almacen:** Tienda

**Datos mostrados:**
- Stock actual (del sistema, via `getBaseStockByAlmacen`)
- Stock contado (input del usuario)
- Diferencia calculada automaticamente

**Resolucion de producto base:**
```ts
const productoStockId = producto ? getStockProductId(producto) : productoId;
```

**Observacion:**
```ts
const obs = [normalizeSpaces(motivo), normalizeSpaces(observacion)]
  .filter(Boolean)
  .join(" - ");
// motivo default: "Conteo fisico"
```

**Prefetch de producto base:** usa el mismo patron de prefetch (baseIds -> baseMap -> merge).

**Flujo:**
1. Seleccionar almacen
2. Buscar producto (debounce 350ms, fetchAllRows, limite 20 resultados)
3. Ver stock actual vs contado
4. Ingresar motivo + observacion
5. Ejecutar RPC `ajustar_stock` con `getStockProductId()`

### AlmacenMovimientos.tsx (207 lineas)

**Proposito:** Historial de movimientos de stock.

**Query con alias FK:**
```ts
supabase.from("stock_movimientos").select(`
  *,
  productos(codigo_interno,nombre_producto),
  almacen_origen:almacenes!stock_movimientos_almacen_origen_id_fkey(nombre),
  almacen_destino:almacenes!stock_movimientos_almacen_destino_id_fkey(nombre)
`)
```

**Filtros:**
- Por tipo_movimiento (dropdown)
- Limite: 200 resultados
- Muestra `tipo_movimiento` o campo `tipo` legacy como fallback

### AlmacenAgregarStock.tsx (590 lineas)

**Proposito:** Ingreso rapido de stock por presentacion de compra.

**Ruta:** `/almacen/agregar-stock`

**Dos secciones:**
1. **Agregar cantidad** -- formulario de ingreso rapido por presentacion
2. **Stock por almacen** -- tabla editable con stock base actual

**Seccion "Agregar cantidad":**
- Selecciona producto, almacen, presentacion de compra
- Calcula: `total = cantidadPresentaciones * unidadesPorPresentacion + unidadesSueltas`
- Ejecuta `ajustar_stock` con `stock_actual + total` (ingreso aditivo)

**Jerarquia para resolver unidades por presentacion:**
1. Si el usuario eligio una presentacion de compra, usa `unidades_por_presentacion` de esa
2. Si producto declara `unidades_equivalentes > 1`, usa ese valor
3. Si hay presentacion_compra unica, usa `unidades_por_presentacion`
4. Si la presentacion textual tiene "x N" (ej. "Pack x4"), parsea N
5. Fallback a 1

**Presentaciones de compra ordenadas:** principal primero (`es_principal`), luego mayor cantidad.

**Ingreso rapido:**
```ts
async function agregarCantidad() {
  const actual = stockForAlmacen(productoIngreso, almacenIngresoId);
  await supabase.rpc("ajustar_stock", {
    p_producto_id: getStockProductId(productoIngreso),
    p_almacen_id: almacenIngresoId,
    p_stock_contado: actual + totalIngreso,
    p_observacion: `Ingreso rapido: ${cantidadPresentaciones} presentacion(es) x ${unidadesPorPresentacion} + ${unidadesSueltas} unidad(es)`,
    p_usuario_id: null,
  });
}
```

**Seccion tabla:**
- Filtros: busqueda, almacen, categoria, subcategoria
- Muestra equivalencia: "= N presentacion(es) + M sueltas" cuando unidades_equivalentes > 1
- Muestra vinculo a producto base con badge emerald
- Edicion directa de stock base (ajustar_stock RPC)
- Link a editar producto (`/productos/nuevo?id=`)

### AlmacenAbastecimiento.tsx (267 lineas)

**Proposito:** Revisar y ajustar pedidos de reposicion/abastecimiento.

**Ruta:** `/almacen/abastecimiento`

**Filtros:** proveedor, estado, urgencia, fecha.

**Query:**
```ts
supabase.from("abastecimiento_pedidos").select(`
  *,
  proveedores(id,nombre,telefono),
  abastecimiento_items(
    id, cantidad, observacion,
    productos(id,nombre_producto,presentacion)
  )
`).order("created_at", { ascending: false }).limit(100)
```

**Estados de abastecimiento:** pendiente, enviado, comprado, cancelado

**Urgencias:** baja, normal, alta

**Acciones por pedido:**
- Cambiar estado (select inline)
- Cambiar urgencia (select inline)
- Reenviar WhatsApp al duenio (`943104987`)
- Editar cantidad por item (onBlur update)

**WhatsApp:**
- Duenio: `943104987`
- Incluye link a la app: `https://app-minimarket.vercel.app/almacen/abastecimiento`

## Stock en productos

### Productos page (app/productos/page.tsx)

**Filtros de stock (checkboxes):**
- `showStockTienda` -- solo productos con stock Tienda > 0
- `showStockCasa` -- solo productos con stock Casa > 0
- `showStockBajo` -- productos donde stock Tienda <= stock_minimo

**Enriquecimiento con producto base:**
```ts
// Prefetch base info para mostrar nombre de producto base
const baseIds = [...new Set(data.map(p => p.producto_base_id).filter(Boolean))];
const baseInfo = new Map();
if (baseIds.length > 0) {
  const { data: baseRows } = await supabase.from("productos").select("id,nombre_producto").in("id", baseIds);
  baseRows.forEach(row => baseInfo.set(row.id, row));
}
```

**Quick-edit de stock por almacen:**
```ts
// Usa getBaseStockByName de inventoryUtils
function buildQuickValues(productos) {
  return Object.fromEntries(
    productos.map(producto => [producto.id, {
      precio_venta: ...,
      stock_minimo: ...,
      stock_tienda: String(getBaseStockByName(producto, "Tienda")),
      stock_casa: String(getBaseStockByName(producto, "Casa")),
    }])
  );
}
```

**Guardado rapido (handleQuickSave):**
1. Para cada almacen (Tienda, Casa): ejecutar `ajustar_stock` RPC
2. Luego: `productos.update({ precio_venta, stock_minimo })`

### Stock total (ProductoTable.tsx)
```ts
function getStockTotal(producto) {
  return producto.producto_almacen?.reduce(
    (sum, pa) => sum + Number(pa.stock_actual ?? 0), 0
  ) ?? 0;
}
```

## Stock en pedidos

### Creacion de pedido
- Cada item del carrito tiene un `almacen_id` seleccionado
- `stock_descontado: boolean` en pedido (para control de descuento de stock)
- Stock warnings al seleccionar almacen con stock insuficiente

### Preparacion (PreparacionModule.tsx)
- Al pasar a `en_preparacion`, se asocia `app_preparado_por_id`
- Checklist por item: `cantidad_preparada` puede diferir de `cantidad` original
- Solo cuando TODOS los items estan `preparado: true` se puede marcar `listo_para_recoger`

## Stock en importacion CSV (ProductoImportCsv.tsx)

**Upsert de stock al importar:**
```ts
supabase.from("producto_almacen").upsert({
  producto_id,
  almacen_id: tiendaId,  // siempre Tienda
  stock_actual: stockDelCSV
}, { onConflict: "producto_id,almacen_id" });
```

**Natural key para detectar productos existentes:**
```ts
const key = `${categoriaId}|${subcategoriaId}|${marcaId}|${normalizedNombre}|${normalizedPresentacion}`;
```

**Paginacion al buscar existentes:** 1000 productos por pagina.

## Stock bajo (Dashboard)

```ts
// Admin dashboard carga productos con stock bajo
supabase.from("productos")
  .select("id,codigo_interno,nombre_producto,stock_actual,stock_minimo")
  .eq("activo", true)
  .not("stock_minimo", "is", null)
  .range(0, 2499)

// Filtra: stock_actual <= stock_minimo
// Ordena: stock_actual ASC
// Muestra: top 8
```

## Producto: presentaciones de compra

### Modelo de costos
```
precio_compra_presentacion          -- lo que cuesta la presentacion (ej: caja de 24)
unidades_por_presentacion           -- cuantas unidades trae (ej: 24)
costo_unitario = precio / unidades  -- costo por unidad calculado

stock_inicial = (presentaciones * unidades_por_presentacion) + sueltas
```

### Precios por mayor (ProductoPrecioMayor)
- 3 escalas default: x3, x6, x12 unidades
- Se borran y reinsertan al guardar producto (`delete` + `insert`)

### Presentacion principal
- Flag `es_principal: boolean` en `producto_presentaciones_compra`
- Al guardar: primero `update({ es_principal: false })` todos, luego set el nuevo como principal
