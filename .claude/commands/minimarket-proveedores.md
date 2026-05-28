# Compras y pagos a proveedores -- app-minimarket

Usa esta referencia cuando trabajes con proveedores, compras, boletas, pagos a proveedor, deudas, abonos a proveedor, o registrar stock desde una compra.

## Acceso

- Modulo principal: `components/ProveedorComprasModule.tsx` (1355 lineas) -- registrar compras/boletas, pagos parciales, items opcionales, sumar stock + crear lote
- CRUD de proveedores: `components/ProveedoresModule.tsx` (472 lineas)
- Pagina con tabs: `app/proveedores/page.tsx`, ruta `/proveedores`
  - `?tab=listado` (default) -> ProveedoresModule (CRUD distribuidores)
  - `?tab=compras` -> ProveedorComprasModule (boletas, pagos, deudas)
- Contrato DB: `supabase/migrations/20260526180000_proveedor_compras_pagos.sql`
- `ajustar_stock`: `supabase/migrations/20260522120000_almacen_modular_v1.sql` (linea ~362)

## Modelo de datos

### proveedor_compras (cabecera)
```
id              uuid PK
proveedor_id    uuid NOT NULL -> proveedores (on delete restrict)
fecha_compra    date NOT NULL default current_date
numero_documento text          -- ej "B001-123456"
tipo_documento  text NOT NULL default 'boleta'
                  check in ('boleta','factura','nota','sin_documento')
subtotal        numeric(12,2) >= 0
descuento       numeric(12,2) >= 0   -- la app lo deja en 0
total           numeric(12,2) >= 0
monto_pagado    numeric(12,2) >= 0   -- lo recalcula el trigger, NO escribir a mano
saldo           numeric(12,2) GENERATED ALWAYS AS (total - monto_pagado) STORED
estado_pago     text NOT NULL default 'pendiente'
                  check in ('pagado','parcial','pendiente')  -- lo recalcula el trigger
observacion     text
```
- `saldo` es columna generada (NO insertable/updatable). Puede ser **negativo** si monto_pagado > total.
- Indices: por proveedor, por fecha desc, parcial por estado (where estado_pago <> 'pagado').

### proveedor_compra_items (detalle OPCIONAL)
```
id               uuid PK
compra_id        uuid NOT NULL -> proveedor_compras (on delete cascade)
producto_id      uuid -> productos (on delete restrict)  -- NULL = item libre
descripcion      text                 -- usado cuando producto_id es NULL
cantidad         numeric(12,3) > 0
precio_unitario  numeric(12,4) >= 0
subtotal         numeric(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
fecha_vencimiento date
almacen_destino_id uuid -> almacenes
registrar_stock  boolean NOT NULL default true
```
- CHECK `proveedor_compra_items_producto_o_descripcion`: `producto_id IS NOT NULL OR trim(descripcion) <> ''`.
- Los items son opcionales: una compra puede ser solo cabecera + pagos (al inicio anotar cada producto es tedioso).
- `registrar_stock` + `producto_id` -> la APP (no el trigger) suma stock y crea lote. Logica en cliente para evitar dobles updates.

### proveedor_pagos (abonos)
```
id          uuid PK
compra_id   uuid NOT NULL -> proveedor_compras (on delete cascade)
fecha_pago  date NOT NULL default current_date
monto       numeric(12,2) > 0     -- estrictamente positivo
metodo      text NOT NULL default 'efectivo'
              check in ('efectivo','yape','transferencia','otro')
referencia  text                  -- ej N° operacion Yape
observacion text
```

### Grants
Las 3 tablas tienen `grant select, insert, update, delete to anon, authenticated`. No hay RLS. Ver gotcha de seguridad.

## Triggers (importante)

| Trigger | Tabla | Cuando | Efecto |
|---------|-------|--------|--------|
| `trg_pagos_recalcular` | proveedor_pagos | AFTER insert/update/delete | `recalcular_pago_compra`: suma todos los pagos de la compra -> setea `monto_pagado` y `estado_pago` en la cabecera |
| `trg_compras_estado` | proveedor_compras | BEFORE insert/update OF total,monto_pagado | `recalcular_estado_compra`: recalcula `estado_pago` segun total vs monto_pagado |
| `set_proveedor_compras_updated_at` | proveedor_compras | BEFORE update | toca `updated_at` |

Logica de estado (en ambos triggers):
```
monto_pagado >= total AND total > 0  -> 'pagado'
monto_pagado > 0                     -> 'parcial'
else                                 -> 'pendiente'
```

CONSECUENCIA practica:
- **NO escribir** `estado_pago`, `monto_pagado` ni `saldo` desde el cliente. Insertar/borrar en `proveedor_pagos` los recalcula solo.
- Al insertar la cabecera se manda `monto_pagado: 0`; el pago inicial se inserta despues como fila en `proveedor_pagos` y el trigger actualiza la cabecera.
- Despues de insertar/eliminar un pago, **re-leer la compra** (`loadCompras`) para tener `monto_pagado`/`estado_pago`/`saldo` frescos. No fies del valor que tenias en memoria.

## Vistas

### vista_proveedor_resumen (deuda por proveedor)
```sql
select proveedor_id, proveedor_nombre,
  count(c.id)                                    as compras_total,
  coalesce(sum(c.total),0)                       as compras_monto_total,
  coalesce(sum(c.monto_pagado),0)                as pagos_total,
  coalesce(sum(c.total - c.monto_pagado),0)      as deuda_total,
  count(c.id) filter (where c.estado_pago <> 'pagado') as compras_con_saldo,
  max(c.fecha_compra)                            as ultima_compra
from proveedores p left join proveedor_compras c on c.proveedor_id = p.id
where p.activo = true
group by p.id, p.nombre;
```
El modulo filtra client-side `r.compras_total > 0` para no mostrar proveedores sin compras.

### vista_pagos_proveedor_mensual
`mes (YYYY-MM)`, `metodo`, `pagos_cantidad`, `monto_total`, agrupado por mes+metodo, orden mes desc. (Definida, aun no consumida por el modulo.)

## Flujo del componente (ProveedorComprasModule)

### Carga inicial
- `loadCatalogos()` (Promise.all): proveedores activos, almacenes activos, productos activos (con `fetchAllRows`), categorias, subcategorias, marcas, presentaciones.
- `loadCompras()`: re-corre cuando cambian filtros (proveedor, estado, desde, hasta). `loadResumen()`: vista_proveedor_resumen.
- `defaultAlmacen`: almacen llamado "casa" (case-insensitive) o el primero. Default de cada item nuevo.

### Registrar compra (`saveCompra`, lineas ~328-477)
Validaciones pre-submit: proveedor requerido; `total` finito y >= 0; `pagoInicial` entre 0 y total.

Orden de escritura (NO transaccional, pasos secuenciales):
```
1) INSERT proveedor_compras (cabecera) con monto_pagado: 0  -> .select("id").single()
   Si falla: aborta, muestra error.
2) Filtra itemsValidos (cantidad>0, precio>=0, producto_id o descripcion).
   Si hay items: INSERT proveedor_compra_items (batch).
     payload: registrar_stock = it.registrar_stock && Boolean(it.producto_id)
              descripcion = producto_id ? null : descripcion.trim()
   Si falla: "Compra creada pero los items fallaron", recarga y aborta.
3) Efecto de stock por item (loop ~418-447):
   skip si !producto_id || !registrar_stock || !almacen_destino_id  (continue)
   - lee producto_almacen.stock_actual del par (producto, almacen)
   - rpc ajustar_stock(producto, almacen, stock_contado = actual + cantidad, obs, null)
   - si fecha_vencimiento: INSERT producto_lotes
       { cantidad_inicial: cant, cantidad_actual: cant, fecha_vencimiento,
         origen: 'compra', notas: 'Compra <id8>' }
4) Pago inicial (si pagoInicial > 0): INSERT proveedor_pagos
   Si falla: "Compra creada pero el pago fallo", recarga y aborta.
5) Success "Compra registrada correctamente", resetForm, recarga compras + resumen.
```

### Abonos posteriores (`registrarAbono`, lineas ~509-542)
- Valida solo `monto > 0` (ver gotcha: NO valida contra saldo).
- INSERT en `proveedor_pagos` { compra_id, fecha_pago, monto, metodo, referencia }.
- El trigger recalcula la cabecera; el modulo recarga `loadCompras` + `loadResumen` + re-lee pagos del detalle.
- Form de abono solo se muestra si `compra.estado_pago !== 'pagado'`.

### Eliminar pago (`eliminarPago`, lineas ~544-566)
- `window.confirm` -> DELETE en proveedor_pagos -> trigger recalcula -> recarga.

### Crear producto al vuelo
`QuickProductoCreator` (modal). Al crear, agrega el producto a la lista en memoria y lo asigna al item que disparo el quick-create (`quickForItemKey`).

### Patron de query / cast
- `(data ?? []) as Tipo[]`, guard `if (!supabase) return;`, `fetchAllRows` para listas grandes.
- `matchesSearch(busqueda, [numero_documento, proveedores?.nombre, observacion])` para filtrar client-side.

## Gotchas / trampas verificadas

- ⚠️ **CRITICO -- el efecto de stock no chequea errores y no es transaccional.** El loop ~418-447 hace `await supabase.rpc("ajustar_stock", ...)` y `await ...producto_lotes.insert(...)` **sin leer `.error`**. Si falla a mitad: los items previos ya mutaron stock, la cabecera + items + pago ya estan guardados, y se muestra "Compra registrada correctamente" igual. **No hay rollback.** Al tocar este flujo: chequear cada `.error`, acumular fallos, y avisar de estado parcial (no asumir exito).
- ⚠️ **`ajustar_stock` hace SET ABSOLUTO sobre una lectura previa del cliente** (`stock_contado = actual + cantidad`, donde `actual` se leyo antes en JS). El RPC re-lee con `FOR UPDATE`, pero el `actual` que usas vino de una lectura sin lock -> **race lost-update** si dos procesos suman al mismo par (producto, almacen). Ademas el ingreso se registra en `stock_movimientos` con `tipo='ajuste'`/`tipo_movimiento='ajuste'` (NO `'ingreso'`) -> auditoria enganosa: una compra parece un ajuste manual de inventario.
- ⚠️ **Truncamiento de decimales.** `proveedor_compra_items.cantidad` es `numeric(12,3)` pero `ajustar_stock` y `producto_almacen.stock_actual` son `numeric(10,2)`. Cantidades con 3 decimales (ej 1.250 kg) se **truncan a 1.25** al sumar al stock.
- ⚠️ **Los abonos no validan contra el saldo.** `registrarAbono` solo exige `monto > 0`. Abonos acumulados pueden **exceder el total** y dejar `saldo` NEGATIVO -- la columna generada lo permite y el trigger marca 'pagado'. (El placeholder del input muestra el saldo pero no lo impone.) Solo el pago inicial de `saveCompra` valida `pagoInicial <= total`.
- ⚠️ **No pelear con las columnas generadas / triggers.** Nunca insertar/actualizar `saldo` (GENERATED), ni escribir `estado_pago`/`monto_pagado` directo en la cabecera: el trigger los pisa. Re-leer la compra despues de cualquier cambio en pagos.
- ⚠️ **SEGURIDAD: `/proveedores` no tiene gate de rol.** `app/proveedores/page.tsx` **NO** llama `checkAccess()`/`getCurrentUserProfile()` (a diferencia de paginas admin como `productos/mantenimiento`). Sin RLS y con grants a `anon`/`authenticated`, cualquier rol que llegue por URL puede registrar compras y pagos. El unico gating real es ocultar el link en el Sidebar -- no es seguridad.
- ⚠️ **Item con `registrar_stock=true` pero sin `almacen_destino_id` se salta en silencio.** El `continue` (linea ~419) lo descarta sin avisar; el item igual se guarda en `proveedor_compra_items` pero **no suma stock ni crea lote**. El usuario cree que cargo stock y no paso nada. (En la UI el select de almacen aparece solo si hay producto; su opcion vacia "Sin almacen (no suma stock)" es valida.)
- ⚠️ **El lote solo se crea si hay `fecha_vencimiento`.** Sin fecha vto, se suma stock pero no se registra `producto_lotes` (no hay trazabilidad de lote para ese ingreso).
- ⚠️ El `total` de la cabecera es **independiente** de la suma de items. La UI ofrece un boton "usar" para copiar `itemsTotal` a `total`, pero no lo fuerza: podes guardar un total que no cuadre con el detalle.
