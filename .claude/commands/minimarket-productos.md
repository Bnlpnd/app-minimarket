# Catalogo de productos: formulario, import CSV, precios y borrado -- app-minimarket

Usa esta referencia cuando crees o edites un producto, configures presentaciones de venta o de compra, precios por mayor, importes productos por CSV/Excel, comprimas imagenes o borres un producto.

## Modelo de datos

### Producto base vs presentacion de venta
- Un producto con `producto_base_id` apuntando a otro producto es una **presentacion de venta** (ej. "Pack x6").
- `unidades_equivalentes` indica cuantas unidades base vale 1 unidad de la presentacion (un "Pack x6" vale 6).
- El **stock real vive siempre en el producto BASE** (`producto_almacen` del base). Ver skill `minimarket-inventario` para la resolucion de stock.
- `codigo_interno` se **autogenera** al guardar (insert con `codigo_interno: null`). Es unique -> error `23505` si choca.
- Un producto NO puede ser su propio base (validado en `handleSubmit`).

```
producto_base_id = null         -> ES el producto base (guarda stock)
producto_base_id != null        -> es presentacion de venta de otro
unidades_equivalentes           -> factor de conversion a unidades base
unidad_base                     -> "kg" | "und" | "lt" | "ml"... (default "und")
```

Trigger `normalizar_detalle_pedido_stock` (DB): al insertar en `detalle_pedido` resuelve `producto_stock_id = coalesce(producto_base_id, id)` y `cantidad_base = cantidad * unidades_equivalentes`.

### Dos tipos de "presentacion" -- no confundir
| Concepto | Tabla | Que modela |
| --- | --- | --- |
| Presentacion de **venta** | `productos` (con `producto_base_id`) | Un SKU vendible distinto (Pack x6) que descuenta del base |
| Presentacion de **compra** | `producto_presentaciones_compra` | Como se compra/ingresa (Saco x49, Caja x12). Solo multiplica al ingresar stock |

### producto_presentaciones_compra
```ts
{
  producto_id: string;
  proveedor_id: string | null;
  nombre_presentacion: string;          // "Saco x49", "Caja x12"
  unidades_por_presentacion: number;    // 49
  costo_presentacion: number | null;    // costo TOTAL de la presentacion
  es_principal: boolean;                // solo una principal por producto
  activo: boolean;
}
```
- `costo_unitario` derivado: `costo_presentacion / unidades_por_presentacion`.
- La presentacion "x1 unidad" (la principal con `unidades=1`) se maneja implicita y NO aparece en la lista del form. Solo se editan las que tienen `unidades_por_presentacion > 1`.

### producto_precios_mayor (precios por mayor)
```ts
{
  producto_id: string;
  cantidad_minima: number;              // desde cuantas unidades base aplica
  precio_unitario: number | null;       // precio por unidad
  precio_total: number | null;          // precio del bloque completo
  tipo_precio: "paquete" | "unitario";  // como interpretar el precio
  descripcion: string | null;
  activo: boolean;
}
```

## lib/pricing.ts -- calculo escalonado

`calcularPrecioPorCantidad(cantidad, precioBase, tiers)` -> `{ subtotal, precioUnitarioPromedio, breakdown }`.

Algoritmo greedy descendente por bloques:
1. `normalizeTier` convierte cada tier a `{ cantidad, precio, descripcion }`:
   - `tipo_precio === "unitario"` -> `precio = precio_unitario * cantidad`
   - cualquier otro (`"paquete"`) -> `precio = precio_total ?? precio_unitario` (el precio del bloque)
2. Filtra tiers con `activo !== false` y `cantidad` entera, ordena descendente por cantidad.
3. Si la cantidad no es entera o no hay tiers -> precio regular (`cantidad * precioBase`).
4. Para cada tier: `blocks = floor(remaining / tier.cantidad)`, suma `blocks * tier.precio`, descuenta.
5. El residuo se cobra a `precioBase`.

```ts
// Ej: precioBase=1, tiers=[{cantidad_minima:6, precio_total:5, tipo_precio:"paquete"}]
// cantidad=13 -> 2 bloques de 6 (S/10) + 1 suelta (S/1) = S/11
calcularPrecioPorCantidad(13, 1, tiers);
```

## ProductoForm.tsx -- crear / editar

Componente presentacional (recibe catalogos y callbacks; el padre `app/productos/nuevo/page.tsx` hace todas las queries). Secciones:

1. **Datos**: nombre (con sugerencias de productos similares al tipear, solo en modo crear), categoria, subcategoria (filtrada por categoria), marca, presentacion (usa `nombre` como id, no UUID), unidad base, precio compra **por unidad**, precio venta, stock inicial + almacen + fecha vto (solo crear), stock minimo, imagen.
2. **Precios por mayor**: el usuario tipea **precio TOTAL** del bloque ("medio saco S/68"); el unitario se calcula al guardar (`total / cantidad_minima`). Botones agregar/quitar escala.
3. **Presentaciones de compra**: nombre, unidades por presentacion, costo total, radio "Principal". Solo se persisten las que tienen `unidades_por_presentacion > 1`.
4. **Vinculo a producto base**: select de productos base + `unidades_equivalentes`.
5. **Imagen**: subida a bucket `productos`.

### Toggles saco/kg (stock minimo y stock inicial)
Los inputs de stock minimo y stock inicial tienen un `<select>` de "modo" (`stockMinimoMode`, `stockInicialMode`): `""` = unidad base, `idx-N` = la presentacion de compra N. `getModeFactor(mode)` resuelve el factor; al guardar (`handleSubmit`) se multiplica el numero tipeado por el factor. Asi el usuario tipea "4", elige "Saco x49" y se guardan 196 kg.

### Subida de imagen
```ts
// handleImageChange: valida tipo (jpg/png/webp) y si > 1MB llama compressImage()
// uploadSelectedImage: sube a bucket "productos" en imagenes/{safeCodigo}-{timestamp}.{ext}
//   upsert:false, devuelve getPublicUrl().publicUrl
// buildImagePath: safeCodigo = codigo_interno||nombre reemplazando [^a-zA-Z0-9-_] por "-"
```
- `removeStoredImage()`: parsea la URL publica (`/storage/v1/object/public/productos/`), borra del storage y limpia `imagen_url` (requiere guardar para persistir).

### Persistencia en handleSubmit del padre (nuevo/page.tsx)
- `unidades_por_presentacion` de la presentacion principal se fija **siempre en 1** desde aqui; el factor real vive en `unidades_equivalentes` cuando hay base.
- `precio_compra_referencial` = precio por unidad (con 2 decimales).
- Stock inicial: si hay cantidad + almacen, llama RPC `ajustar_stock` (resolviendo base con `productoBaseId ?? productoIdCreado` y multiplicando por `unidades_equivalentes`). Si no, crea fila Tienda con stock 0 para que aparezca en listados.
- Precios mayor: **DELETE todos + INSERT** los del form, siempre con `tipo_precio: "paquete"`, `precio_total` y `precio_unitario = total/cantidad`.
- Presentaciones de compra dinamicas (unidades > 1): DELETE de las previas con `unidades_por_presentacion > 1` + INSERT nuevas.
- Tras editar -> reset a form vacio y `router.replace("/productos/nuevo")`. Tras crear -> redirige a `/almacen/agregar-stock?producto=<id>`.

## QuickProductoCreator.tsx
Modal de alta rapida inline (usado en compras a proveedor). Pide solo nombre, categoria, subcategoria, marca, presentacion, unidad base, precio venta. Inserta directo en `productos` con defaults (`stock_minimo: 10`, `activo: true`) y llama `onCreated(producto)` para autoseleccionarlo. No crea stock ni presentaciones; el resto se completa editando luego.

## ProductoTable.tsx -- listado
- Tabla desktop (`hidden lg:block`) + cards mobile (`lg:hidden`).
- Stock Tienda/Casa via `getBaseStockByName()` (resuelve base), readonly.
- Quick-edit solo metadata: `precio_compra` (-> `precio_compra_referencial`), `precio_venta`, `stock_minimo`. NO edita stock.
- Calcula margen: `(venta - costo) / costo * 100`, coloreado por tramos.
- Boton "Eliminar" solo si llega `onDelete` (admin); se deshabilita si el id esta en `productosNoEliminables`.

## Import CSV/Excel (ProductoImportCsv.tsx)
Carga masiva, admin-only (`app/productos/importar/page.tsx` envuelve en `<AdminOnly>`).

- **Plantilla**: `downloadPlantilla()` genera un XLSX con 6 hojas (Productos + catalogos de referencia + Instrucciones) via `exceljs` (import dinamico para no inflar el bundle).
- **Lectura**: `readSpreadsheet()` detecta XLSX (lee hoja "Productos" o la primera) vs CSV. `decodeCsv` quita BOM y elige UTF-8 vs windows-1252 por scoring. `parseCsv` soporta separador `,` o `;`, comillas escapadas e ignora lineas que empiezan con `#`.
- **Headers**: `csvRowsToObjects` normaliza (lowercase, sin acentos) y aplica `ALIAS_MAP` (ej. `precio_compra_referencial` -> `precio_compra`, `stock_actual` -> `stock_tienda`). Columnas no oficiales se avisan como "no reconocidas".
- **Columnas obligatorias**: `nombre_producto, categoria, subcategoria, marca, presentacion, precio_venta`. Si faltan, no carga.
- **Validacion por fila** (`buildImportRows`): si una fila tiene `errors`, marca la celda en rojo. `canImport = rows > 0 && invalidRows === 0` -> **el boton Guardar se bloquea si hay cualquier fila invalida**.
- **Stock por presentacion**: `stock_final = stock_<alm> + stock_<alm>_pres * pres_compra_unidades`. Usar `stock_*_pres` exige `pres_compra_unidades > 0`.
- **Upsert idempotente**: busca existente por `codigo_interno` o por natural key `categoria_id|subcategoria_id|marca_id|nombre|presentacion`. Existe -> update; no existe -> insert (codigo autogenerado).
- **Catalogos**: `ensureCategoria/Subcategoria/Marca` crean si no existen (con retry ante carrera). `ensurePresentacion` sincroniza el catalogo de presentaciones.
- **Stock**: `upsertStock` hace `upsert` en `producto_almacen` con `onConflict: "producto_id,almacen_id"`. **Reemplaza** el stock (no suma).
- **Error 23505** (codigo duplicado) al insertar -> fila contada como `omitido`, no aborta el import.
- Reporte final descargable/copiable con creados/actualizados/omitidos/errores/presentaciones/lotes.

## Borrado: lib/productoDelete.ts
```ts
deleteProducto(productoId, imagenUrl): Promise<{ ok: true } | { ok: false; reason: string }>
```
1. Bloquea si el producto esta en `detalle_pedido` (como `producto_id` o `producto_stock_id`) -> sugiere desactivar.
2. Bloquea si es base de otra presentacion (`productos.producto_base_id = id`).
3. Borra la imagen del storage si la URL apunta al bucket `productos`.
4. Borra relaciones (`producto_almacen`, `producto_presentaciones_compra`, `producto_precios_mayor`, `producto_lotes`, `stock_reservas`, `stock_movimientos`) y luego el producto.

```ts
fetchProductosNoEliminables(): Promise<Set<string>>
```
Devuelve un Set con ids que tienen ventas o son base de otro, para deshabilitar el boton en el listado sin 1 query por fila.

El listado (`app/productos/page.tsx`) llama `deleteProducto()` compartido. El form de edicion (`nuevo/page.tsx`) tiene su PROPIA copia (ver gotchas).

## lib/imageUtils.ts -- compressImage
```ts
compressImage(file, { maxSizeBytes=1MB, maxWidth=1920, maxHeight=1920, initialQuality=0.85 })
```
- Si `file.size <= maxSizeBytes` devuelve el archivo **tal cual** (no toca nada).
- Redimensiona manteniendo aspect ratio, dibuja en canvas, re-encodea como **JPEG** bajando calidad iterativa (0.85 -> 0.2, hasta 6 pasadas). Si no cabe, reduce dimensiones al 70% y reintenta una vez; si aun no cabe, lanza error.
- Devuelve un `File` JPEG nuevo (renombra extension a `.jpg`).

## Gotchas / trampas verificadas

- **CRITICO: `lib/productoDelete.ts` NO es transaccional.**
  - (a) El chequeo `esBase` (~linea 42) lee `esBase.count` pero NO mira `esBase.error`. Si esa query falla, `count` es `null`, la condicion `> 0` es falsa y **procede a borrar igual**, pudiendo orfanar presentaciones que apuntaban al base.
  - (b) El loop de borrado de relaciones (~lineas 77-79) NO chequea `.error` de cada `delete`. Si una tabla falla (permiso, FK), el borrado sigue -> estado parcial inconsistente.
  - (c) Falta `producto_almacen_presentacion` en `tablasRelacionadas` (esa tabla referencia `producto_id`) -> filas huerfanas tras borrar.
  - Lo ideal: mover todo a un RPC `borrar_producto(...)` con transaccion.

- **`app/productos/nuevo/page.tsx` (`handleDelete`, ~linea 766) DUPLICA la logica de borrado** con el MISMO bug (`esBase.error` ignorado) y una lista de tablas DISTINTA e **incompleta**: solo borra `producto_almacen`, `producto_presentaciones_compra` y `producto_precios_mayor` (le faltan `producto_lotes`, `stock_reservas`, `stock_movimientos` y `producto_almacen_presentacion`). Deberia llamar a `deleteProducto()` compartido.

- **Precios por mayor LEGACY mal calculados.** La migracion `20260523093000` hizo backfill `precio_total = precio_unitario` para filas viejas, pero ahi `precio_unitario` era el precio POR UNIDAD. Como `calcularPrecioPorCantidad` trata `precio_total` como el total del bloque (`tipo_precio` default `'paquete'`), esas filas legacy **SUBCOBRAN por un factor de `cantidad_minima`** (cobra el precio de 1 unidad por todo el bloque). Las filas escritas por el form actual guardan ambos campos bien con `tipo_precio='paquete'`. Revisar/recalcular filas anteriores a esa migracion.

- **`compressImage` arruina PNG transparentes.** Convierte a JPEG y NO rellena fondo blanco antes de `drawImage` -> la transparencia queda con **fondo NEGRO**. Ademas solo comprime si el archivo supera el limite: un PNG transparente de 900KB se sube tal cual (sin aplanar) y se ve bien, pero uno de 1.2MB pasa por canvas y sale con fondo negro. Inconsistente segun tamano.

- **`parseNumber` del import se rompe con separadores de miles.** Solo cambia `,` por `.` (`"1,234.56"` -> `"1.234.56"` -> `NaN`). NO se permiten separadores de miles en el CSV: usar `1234.56`. Ademas, el import NO es transaccional: si una fila crea el producto OK pero falla el `upsertStock` posterior, el producto **queda creado sin stock** (no hay rollback).

- **SEGURIDAD: borrado sin proteccion server-side.** El `grant delete` en `productos` (y tablas relacionadas) es a `anon, authenticated` (migracion `20260526210000`) y NO hay RLS en `productos` (solo politicas de storage). El "solo admin puede borrar" es 100% client-side: `isAdminUser` leido de `localStorage` + boton oculto en la UI. Cualquier trabajador (o cualquiera con la anon key) puede invocar `deleteProducto()` / `supabase.from("productos").delete()` directo. Mover el borrado a un RPC `security definer` con verificacion de rol.
