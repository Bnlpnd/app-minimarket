# Sistema de inventario multi-almacen -- app-minimarket

Usa esta referencia cuando trabajes con stock, almacenes, transferencias, ajustes o movimientos.

## Arquitectura de stock

### Dos niveles de stock
1. **productos.stock_actual** -- stock global del producto (puede estar desactualizado)
2. **producto_almacen.stock_actual** -- stock real por almacen (fuente de verdad)

### Almacenes predeterminados
- **Tienda** -- almacen de venta directa, stock visible al cliente
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

## RPCs de stock

### ajustar_stock
```ts
supabase.rpc("ajustar_stock", {
  p_producto_id: string,
  p_almacen_id: string,
  p_stock_contado: number,    // nuevo stock real contado
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
  // parametros similares a ajustar
  // origen y destino
})
```
- Validaciones: origen != destino, cantidad > 0, cantidad <= stock origen
- Crea movimiento tipo `transferencia`

## Modulos de almacen

### AlmacenDashboard.tsx (590 lineas)

**Proposito:** Vista principal de stock por almacen con edicion rapida.

**Comportamiento:**
- Requiere seleccionar almacen + criterio de busqueda antes de cargar datos
- Limite: 100 resultados por consulta
- Quick-edit campos: `stock_minimo`, `precio_venta`, `precio_compra_referencial`

**Ajuste rapido de stock:**
```ts
async function ajustar() {
  await supabase.rpc("ajustar_stock", {
    p_producto_id: producto.id,
    p_almacen_id: almacen.id,
    p_stock_contado: nuevoStock,
    p_observacion: `Ajuste rapido desde almacen (${almacen.nombre})`,
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

**Links:** Enlaza a transferencias con `?producto=` param.

### AlmacenTransferencias.tsx (286 lineas)

**Proposito:** Transferir stock entre almacenes.

**Defaults:**
- Origen: Casa
- Destino: Tienda

**Validaciones client-side:**
1. Origen != destino
2. Cantidad > 0
3. Cantidad <= stock disponible en origen

**Busqueda:** Productos con limite 20 resultados.

**Flujo:**
1. Seleccionar producto (busqueda)
2. Seleccionar origen y destino
3. Ingresar cantidad
4. Ejecutar RPC `transferir_stock`

### AlmacenAjustes.tsx (284 lineas)

**Proposito:** Ajuste de stock por conteo fisico.

**Default almacen:** Tienda

**Datos mostrados:**
- Stock actual (del sistema)
- Stock contado (input del usuario)
- Diferencia calculada automaticamente

**Observacion:**
```ts
const fullObservation = motivo + " - " + observacion;
// motivo default: "Conteo fisico"
```

**Flujo:**
1. Seleccionar almacen
2. Buscar producto
3. Ver stock actual vs contado
4. Ingresar motivo + observacion
5. Ejecutar RPC `ajustar_stock`

### AlmacenMovimientos.tsx (207 lineas)

**Proposito:** Historial de movimientos de stock.

**Query con alias FK:**
```ts
supabase.from("stock_movimientos").select(`
  *,
  productos(nombre_producto, codigo_interno),
  almacen_origen:almacenes!stock_movimientos_almacen_origen_id_fkey(nombre),
  almacen_destino:almacenes!stock_movimientos_almacen_destino_id_fkey(nombre)
`)
```

**Filtros:**
- Por tipo_movimiento (dropdown)
- Limite: 200 resultados
- Muestra `tipo_movimiento` o campo `tipo` legacy como fallback

## Stock en productos

### Productos page (app/productos/page.tsx)

**Quick-edit de stock por almacen:**
```ts
// Obtener stock por nombre de almacen
function getStockByName(producto, name) {
  const row = producto.producto_almacen?.find(
    stock => stock.almacenes?.nombre.toLowerCase() === name.toLowerCase()
  );
  return Number(row?.stock_actual ?? 0);
}

// Obtener almacen_id por nombre
function getAlmacenIdByName(producto, name, almacenes) {
  // Busca en producto_almacen primero, fallback a lista de almacenes
}
```

**Guardado rapido (handleQuickSave):**
1. Para cada almacen (Tienda, Casa): ejecutar `ajustar_stock` RPC
2. Luego: `productos.update({ precio_venta, stock_minimo })`

**Filtro importante:** Solo muestra productos con `stock Tienda > 0`:
```ts
const rows = data.filter(p => getStockByName(p, "Tienda") > 0);
```

### Stock total (ProductoTable.tsx)
```ts
function getStockTotal(producto) {
  // Suma stock_actual de todos los almacenes en producto_almacen
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
