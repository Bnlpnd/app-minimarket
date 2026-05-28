# Patrones UI y convenciones de componentes -- app-minimarket

Usa esta referencia cuando crees o modifiques componentes, layouts o estilos en este proyecto.

## Stack y restricciones

- Next.js 16.2.6 + React 19.2.4 + TypeScript 5 (strict)
- Tailwind CSS 4 via `@tailwindcss/postcss` -- NO shadcn/ui, NO component library
- Todos los componentes son custom, escritos a mano
- `"use client"` en todos los componentes y pages (excepto `app/layout.tsx` y `app/page.tsx`)
- No hay estado global -- solo `useState`, `useEffect`, `useCallback`, `useMemo`
- Path alias: `@/*` mapea a raiz del proyecto

## Estructura de archivos

```
app/
  layout.tsx          -- RootLayout, Geist fonts, lang="es-PE"
  page.tsx            -- redirect("/login")
  globals.css         -- Tailwind import + CSS vars
  login/page.tsx      -- Login form, RPC login_app, localStorage
  dashboard/page.tsx  -- AdminDashboard + WorkerDashboard (1076 lineas)
  mis-datos/page.tsx  -- Datos del trabajador autenticado (525 lineas)
  productos/
    page.tsx           -- Listado con quick-edit y paginacion (586 lineas)
    nuevo/page.tsx     -- Crear/editar producto (810 lineas, ?id= para editar)
    importar/page.tsx  -- Wrapper para ProductoImportCsv
    mantenimiento/page.tsx -- CRUD catalogos admin-only (551 lineas)
  pedidos/
    page.tsx           -- Wrapper para PedidosList
    nuevo/page.tsx     -- Wrapper para PedidoNuevoForm
    [id]/page.tsx      -- Wrapper para PedidoDetalle
  almacen/
    page.tsx           -- Wrapper para AlmacenDashboard
    movimientos/       -- Wrapper para AlmacenMovimientos
    transferencias/    -- Wrapper para AlmacenTransferencias
    ajustes/           -- Wrapper para AlmacenAjustes
    agregar-stock/     -- Wrapper para AlmacenAgregarStock
    abastecimiento/    -- Wrapper para AlmacenAbastecimiento
  clientes/
    page.tsx           -- Wrapper para ClienteModule
    [id]/pedidos/      -- Wrapper para ClientePedidosModule
  preparacion/         -- Wrapper para PreparacionModule
  personal/            -- Wrapper para PersonalModule
  pagos/               -- Wrapper para PagosYapeValidator
  proveedores/         -- Wrapper para ProveedoresModule

components/
  Layout.tsx           -- Layout principal, Sidebar en <Suspense> (66 lineas)
  Header.tsx           -- Header mobile-only (34 lineas)
  Sidebar.tsx          -- Navegacion lateral w-72, bg-white (196 lineas)
  AdminOnly.tsx        -- Guard de acceso admin (44 lineas)
  QuickProductoCreator.tsx -- Modal mini-form crear producto (275 lineas)
  ProductoSearch.tsx   -- Input de busqueda simple (27 lineas)
  ui/
    SearchableSelect.tsx -- Combobox autocomplete filtrable (214 lineas)
    Toast.tsx          -- Banner/toast de feedback (118 lineas)
  ProductoTable.tsx    -- Tabla + cards responsive (396 lineas)
  ProductoForm.tsx     -- Formulario producto (1183 lineas)
  ProductoImportCsv.tsx -- Importador CSV (1036 lineas)
  ProductoCatalogManager.tsx -- CRUD de catalogos inline (281 lineas)
  PedidoNuevoForm.tsx  -- Wizard 5 pasos (2098 lineas)
  PedidosList.tsx      -- Listado pedidos con filtros (414 lineas)
  PedidoDetalle.tsx    -- Detalle + acciones pedido (648 lineas)
  AlmacenDashboard.tsx -- Dashboard almacen con quick-edit (630 lineas)
  AlmacenMovimientos.tsx -- Historial de movimientos (206 lineas)
  AlmacenTransferencias.tsx -- Transferencia entre almacenes (715 lineas)
  AlmacenAjustes.tsx   -- Ajuste por conteo fisico (335 lineas)
  AlmacenAgregarStock.tsx -- Ingresar stock nuevo a almacen (590 lineas)
  AlmacenAbastecimiento.tsx -- Lista de productos por reabastecer (267 lineas)
  PreparacionModule.tsx -- Cola de preparacion (684 lineas)
  ClienteModule.tsx    -- CRUD clientes con deuda (532 lineas)
  ClientePedidosModule.tsx -- Historial pedidos por cliente (934 lineas)
  ProveedoresModule.tsx -- CRUD proveedores (448 lineas)
  PersonalModule.tsx   -- Nomina completa (1459 lineas)
  PagosYapeValidator.tsx -- Validacion pagos Yape (379 lineas)
  personal/
    AttendanceWeekBlock.tsx  -- Bloque asistencia semanal (348 lineas)
    DiscountWeekBlock.tsx    -- Bloque descuentos semanal (170 lineas)
    PaymentHistoryBlock.tsx  -- Historial de pagos (290 lineas)

lib/
  supabaseClient.ts    -- Client Supabase (nullable)
  authRoles.ts         -- getStoredAppUser, signOut, isAdmin, isTrabajador
  theme.ts             -- colors (tokens), colorsForAlmacen, stockChipClass
  dateUtils.ts         -- formatDate, formatDateTime, parseInputDate, formatTime
  whatsapp.ts          -- generarMensajePedido, generarLinkWhatsApp
  catalogDefaults.ts   -- Presentaciones y unidades iniciales
  inputUtils.ts        -- selectOnFocus (auto-select input text on focus)
  searchUtils.ts       -- normalizeForSearch, searchTokens, matchesSearch
  supabaseQueryUtils.ts -- fetchAllRows (paginated Supabase fetching)
  imageUtils.ts        -- compressImage (comprime a JPEG <= 1MB antes de subir)
```

## Layout y navegacion

### app/layout.tsx
- Server component (no `"use client"`)
- `lang="es-PE"` en `<html>`
- Geist + Geist_Mono fonts via `next/font/google`
- Body: `min-h-full flex flex-col`

### Layout.tsx
- `"use client"`, recibe `title`, `description`, `children`
- Sidebar fijo en desktop (`md:pl-72`), overlay en mobile con `isMenuOpen`
- Sidebar envuelto en `<Suspense fallback={null}>` (requerido por `useSearchParams` en Sidebar)
- Content area: `max-w-6xl mx-auto`
- Brand: "Minimarket Santa Ana"

### Sidebar.tsx
- 7 grupos de navegacion: Dashboard, Productos, Ventas, Almacenes, Clientes, Proveedores, Personal
- Fondo `bg-white` con `border-r border-slate-200`, ancho `w-72`
- Activo via `usePathname()` + `useSearchParams()` para matching de `?tab=`
- Active color: `bg-emerald-50 text-emerald-800`
- Inactive: `text-slate-600 hover:bg-slate-100 hover:text-slate-950`
- Flat list (no collapsible groups), group labels en `text-xs uppercase text-slate-400`
- Imports `signOut` from `@/lib/authRoles`
- Role-based filtering: grupo "Personal" solo visible para admin
- Exports `navigationItems` array para uso externo
- Footer section:
  - Ayuda link: `<a href="/manual.html?role={rol}">` abre en nueva ventana
  - User info: nombres + apellidos + rol (capitalize)
  - Sign-out button: `text-red-700 hover:bg-red-50`, con `window.confirm` antes de cerrar
- Prop opcional `onNavigate` para cerrar menu mobile
- Helper `getUserRole()` lee rol de localStorage con fallback a "trabajador"

### Header.tsx
- Solo mobile (`md:hidden`), sticky top
- Hamburger menu con 3 spans animados
- Muestra titulo de pagina

## Paleta de colores (sistema de diseno)

| Uso | Clase |
|-----|-------|
| Fondo principal | `bg-slate-50` |
| Cards/panels | `bg-white border border-slate-200 shadow-sm rounded-lg` |
| Texto principal | `text-slate-950` |
| Texto secundario | `text-slate-600` |
| Texto terciario | `text-slate-500` |
| Boton primario | `bg-emerald-700 text-white hover:bg-emerald-800` |
| Boton secundario | `border border-slate-300 text-slate-700 hover:bg-slate-50` |
| Boton peligro | `border border-red-300 text-red-700` |
| Boton disabled | `disabled:bg-slate-300` |
| Input focus | `focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100` |
| Input base | `h-11 rounded-md border border-slate-300 bg-white px-3 text-sm` |
| Exito | `border-emerald-200 bg-emerald-50 text-emerald-700` |
| Error | `border-red-200 bg-red-50 text-red-700` |
| Warning | `border-amber-200 bg-amber-50 text-amber-800` |
| Badge activo | `bg-emerald-50 text-emerald-700` |
| Badge inactivo | `bg-slate-100 text-slate-600` |
| Badge estado | `bg-slate-100 text-slate-700 rounded-md px-2 py-1 text-xs font-medium capitalize` |
| Tab activo | `bg-slate-900 text-white` |
| Tab inactivo | `text-slate-600 hover:bg-slate-100` |
| Sidebar active | `bg-emerald-50 text-emerald-800` |
| Sidebar inactive | `text-slate-600 hover:bg-slate-100 hover:text-slate-950` |

## Tokens de color (lib/theme.ts)

**Convencion: NO hardcodear colores en componentes nuevos.** Importa el objeto
`colors` (o los helpers) y aplicalos como className. Asi un refresco de paleta
es un solo cambio en `lib/theme.ts`.

```tsx
import { colors, colorsForAlmacen, stockChipClass } from "@/lib/theme";
```

El objeto `colors` (todas las claves son strings de clases Tailwind, `as const`):

| Grupo | Clave | Para que |
|-------|-------|----------|
| Almacen Tienda (emerald) | `tienda.{chip,chipStrong,text,bg,bgStrong,border,borderStrong,accent}` | almacen de venta |
| Almacen Casa (indigo) | `casa.{chip,chipStrong,text,bg,bgStrong,border,borderStrong,accent}` | almacen de reserva |
| Stock nivel | `stockOk.{chip,text}` / `stockBajo.{chip,text,bg,border}` / `stockSin.{chip,text,bg,border}` | chips de stock |
| Vencimiento | `vencido` / `vencimientoUrgente` (orange) / `vencimientoProximo` (amber) | chips de caducidad |
| Botones | `btnPrimary` (emerald) / `btnSecondary` / `btnDanger` / `btnDangerSolid` / `btnAccent` (amber) | incluyen hover/active/disabled |
| Feedback | `feedbackSuccess` / `feedbackError` (rose) / `feedbackWarning` / `feedbackInfo` (sky) | banners de mensaje |
| Layout | `panelBg` / `panelBorder` / `pageBg` / `tableHeader` | fondos y headers |

Helpers:
- `colorsForAlmacen(nombre)` -> devuelve `colors.casa` si `nombre.toLowerCase() === "casa"`, si no `colors.tienda` (case-insensitive, tolera "Negocio" -> Tienda).
- `stockChipClass(actual, minimo)` -> string de chip: `stockSin` si `actual <= 0`, `stockBajo` si `actual <= minimo`, si no `stockOk`.

```tsx
<span className={`rounded px-2 py-1 text-xs ${stockChipClass(stock, min)}`}>{stock}</span>
<span className={colorsForAlmacen(alm.nombre).chip}>{alm.nombre}</span>
```

## SearchableSelect (components/ui/SearchableSelect.tsx)

Combobox custom (input editable + dropdown filtrable) que reemplaza al `<select>`
cuando hay muchas opciones. Usado en pickers de marca / categoria / subcategoria /
presentacion / producto (p.ej. en QuickProductoCreator).

```tsx
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";

<SearchableSelect
  value={marcaId}                                   // id seleccionado ("" = nada)
  options={marcas.map((m) => ({ id: m.id, label: m.nombre }))}
  onChange={(id) => setMarcaId(id)}                 // recibe el id (o "" al limpiar)
  placeholder="Buscar..."
/>
```

Props: `value: string`, `options: SearchableOption[]` (`{ id, label, sub? }`),
`onChange: (id) => void`, `placeholder?`, `className?`, `disabled?`,
`emptyText?` (default "Sin coincidencias"), `required?` (si true oculta la "✕" para limpiar).

- Filtra `label` y `sub` con `query.trim().toLowerCase().includes(...)`.
- Teclado: ArrowDown/ArrowUp navegan el highlight, Enter selecciona el resaltado, Escape cierra.
- Click fuera o blur sin elegir mantiene el valor previo (no inventa seleccion).
- `useId()` genera el id del `<ul role="listbox">` (a11y: `role="combobox"`, `aria-controls`, `aria-autocomplete="list"`).
- Cuando NO esta enfocado y hay `value`, el input muestra el `label` de la opcion; al enfocar muestra el `query`.

## Toast (components/ui/Toast.tsx)

Componente de feedback estandar. No es un provider global ni un hook: es un
componente controlado por el `message` que le pasa el padre (mismo patron que
el `Message` local). Render dual: banner inline en desktop (`sm:flex`, mantiene
el flow) + toast flotante fijo arriba en mobile (`fixed inset-x-3 top-3`).

```tsx
import { Toast, type ToastMessage } from "@/components/ui/Toast";

const [msg, setMsg] = useState<ToastMessage | null>(null);
// ...
setMsg({ type: "success", text: "Guardado." });   // dispara y se auto-cierra
<Toast message={msg} onDismiss={() => setMsg(null)} />
```

- `type`: `"success" | "error" | "warning" | "info"` (estilos via STYLES_INLINE/STYLES_FLOATING + ICONS).
- Auto-dismiss: success/info/warning a los `autoDismissMs` (default 4000). `error` persiste hasta cerrar con la X. `autoDismissMs <= 0` desactiva.
- a11y: `role="alert"` para error, `role="status"` para el resto.

## QuickProductoCreator (components/QuickProductoCreator.tsx)

Modal mini-form para crear un producto al vuelo cuando falta en medio de otro
flujo (ej: armando una compra a proveedor) sin abandonar la pantalla. Pide solo
lo minimo: nombre, categoria, subcategoria, marca, presentacion, unidad base,
precio venta. Defaults fijos: `activo=true`, `stock_minimo=10`, `unidadBase="und"`.

```tsx
<QuickProductoCreator
  open={showCreator}
  onClose={() => setShowCreator(false)}
  onCreated={(producto) => { /* el padre autoselecciona el producto creado */ }}
  initialName={searchTerm}              // pre-rellena el nombre con lo ya tipeado
  categorias={categorias}
  subcategorias={subcategorias}
  marcas={marcas}
  presentaciones={presentaciones}
/>
```

- Inserta directo en `productos` (`.insert(...).select("*").single()`) y llama `onCreated(data)`.
- Reset de campos en `useEffect` al pasar `open` a true (re-aplica `initialName`).
- Catalogos (categorias/subcategorias/marcas/presentaciones) los pasa el padre; los pickers son `SearchableSelect`. Subcategorias se filtran por `categoria_id`.
- Overlay full-screen (`fixed inset-0 z-50`), sheet desde abajo en mobile, centrado en desktop.

## Patrones de componente

### Acceso y permisos
```tsx
const [hasAccess, setHasAccess] = useState(false);
const [isCheckingAccess, setIsCheckingAccess] = useState(true);

useEffect(() => {
  async function checkAccess() {
    const { profile } = await getCurrentUserProfile();
    const allowed = isAdmin(profile) || isTrabajador(profile);
    setHasAccess(allowed);
    setIsCheckingAccess(false);
    if (allowed) void loadData();
  }
  void checkAccess();
}, []);

// En JSX:
{isCheckingAccess ? <Loading /> : null}
{!isCheckingAccess && !hasAccess ? <AccessDenied /> : null}
{hasAccess ? <Content /> : null}
```

### Mensajes de feedback
```tsx
type Message = { type: "success" | "error"; text: string };
const [message, setMessage] = useState<Message | null>(null);

// En JSX:
{message ? (
  <div className={`rounded-lg border p-4 text-sm ${
    message.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700"
  }`}>
    {message.text}
  </div>
) : null}
```

### Formularios
- Inputs siempre con `h-11`
- Labels: `<label className="block"><span className="text-sm font-medium text-slate-700">Label</span><input className="mt-1 ..." /></label>`
- Botones submit: `h-11` con texto "Guardando..." cuando `isSaving`
- Validacion client-side antes del submit, no se usa zod ni react-hook-form
- Pattern `emptyToNull()` para convertir strings vacios a null antes de enviar
- `selectOnFocus` de `lib/inputUtils.ts` en inputs numericos para auto-seleccionar al hacer focus

### Responsive: tabla + cards
```tsx
{/* Tabla solo desktop */}
<div className="hidden lg:block">
  <table>...</table>
</div>

{/* Cards solo mobile */}
<div className="space-y-3 lg:hidden">
  {items.map(item => <article>...</article>)}
</div>
```

### Loading states
```tsx
{isLoading ? (
  <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
    Cargando datos...
  </section>
) : null}
```

### Paginacion
```tsx
const PAGE_SIZE = 50; // o 100 en almacen
const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
// Botones Anterior/Siguiente con disabled states
```

### Client-side search (lib/searchUtils.ts)
```tsx
import { matchesSearch } from "@/lib/searchUtils";

// matchesSearch normaliza (lowercase, strip accents), tokeniza, y verifica que
// todos los tokens aparezcan en el haystack construido de los valores dados
const filtered = items.filter((item) =>
  matchesSearch(searchTerm, [item.nombre, item.codigo, item.marca])
);
```

### Paginated Supabase fetching (lib/supabaseQueryUtils.ts)
```tsx
import { fetchAllRows } from "@/lib/supabaseQueryUtils";

// fetchAllRows pagina automaticamente en bloques de 1000 (configurable)
// hasta un maximo de 10000 rows. Evita el limite de 1000 rows de Supabase.
const { data, error } = await fetchAllRows<Producto>(
  supabase.from("productos").select("*, categorias(nombre)")
);
```

### Sub-componentes inline
Los componentes grandes definen sub-componentes como funciones en el mismo archivo:
- `Field`, `QuickCreate` en ProductoForm.tsx
- `Panel`, `Info` en PedidoDetalle.tsx
- `Cart` en PedidoNuevoForm.tsx
- `MetricCard`, `ActionLink`, `Panel`, `ErrorPanel` en dashboard/page.tsx

### Sub-componentes extraidos (components/personal/)
PersonalModule usa sub-componentes en su propio subdirectorio:
- `AttendanceWeekBlock.tsx` -- bloque de asistencia semanal por trabajador
- `DiscountWeekBlock.tsx` -- bloque de descuentos semanal
- `PaymentHistoryBlock.tsx` -- historial de pagos procesados

## Autenticacion (lib/authRoles.ts)

```tsx
// Leer usuario de localStorage
getStoredAppUser() -> { id, email, rol, nombres, apellidos } | null

// Construir perfil con roles
getCurrentUserProfile() -> { profile, error }

// Verificar rol
isAdmin(profile)     // profile?.roles?.nombre === "admin"
isTrabajador(profile) // profile?.roles?.nombre === "trabajador"

// Cerrar sesion (limpia localStorage y redirige a /login)
signOut()
```

- Key de localStorage: `app_minimarket_user`
- Login via RPC `login_app` en `app/login/page.tsx`
- Post-login: `router.push("/dashboard")`

## Date utils (lib/dateUtils.ts)

| Funcion | Formato |
|---------|---------|
| `formatDate(d)` | DD-MM-YYYY |
| `formatDateTime(d)` | DD-MM-YYYY HH:MM |
| `parseInputDate(d)` | YYYY-MM-DD (para inputs date) |
| `formatTime(t)` | HH:MM (slice 0-5) |

## Input utils (lib/inputUtils.ts)

```tsx
import { selectOnFocus } from "@/lib/inputUtils";

// Auto-selecciona todo el texto al hacer focus en un input numerico.
// Evita que al escribir "20" en un input con "1" quede "120".
<input type="number" onFocus={selectOnFocus} />
```

## Convenciones importantes

1. **Ternarios con null** -- usar `{condition ? <Component /> : null}` (no `&&`)
2. **void para async** -- `onClick={() => void handleAsync()}` o `void checkAccess()`
3. **Tipado de Supabase data** -- siempre castear: `(data ?? []) as Tipo[]`
4. **Event handlers** -- `(event) => ...` (nombre completo, no `e`)
5. **No se usa router.back()** -- navegacion siempre con `<Link href=...>`
6. **Scroll to top** -- en edit mode, `window.scrollTo({ top: 0, behavior: "smooth" })`
7. **WhatsApp** -- campo "WSP" para telefono, links via `wa.me`
8. **Normalize** -- `normalizeSpaces(v)` strip + single space, `normalizeKey(v)` + lowercase + NFD strip
9. **eslint suppression** -- `react-hooks/exhaustive-deps` y `react-hooks/set-state-in-effect` frecuentemente deshabilitados
10. **Supabase null guard** -- siempre `if (!supabase) return;` al inicio de funciones async
11. **selectOnFocus** -- usar en inputs numericos para auto-seleccionar texto al focus
12. **matchesSearch** -- usar para filtrado client-side con normalizacion y tokenizacion
13. **fetchAllRows** -- usar para queries Supabase que pueden superar 1000 filas
14. **colors (theme.ts)** -- no hardcodear colores en componentes nuevos, importar tokens

## Gotchas / limitaciones conocidas

Confirmadas en codigo. Documentadas para no tropezar:

- ⚠️ **SearchableSelect NO es accent-insensitive.** Filtra con `label.toLowerCase().includes(q)` (no usa `normalizeForSearch`), asi que "azucar" NO matchea "Azucar"/"Azúcar". Si necesitas busqueda sin tildes, pre-filtra las `options` con `matchesSearch` de `lib/searchUtils.ts` antes de pasarlas.
- ⚠️ **SearchableSelect — ArrowDown desde cerrado salta a index 1, no 0.** El mismo evento abre el dropdown (`highlight=0`) y luego hace `min(h+1, ...)`, dejando el highlight en la 2da opcion. Tambien: al enfocar un valor ya seleccionado, el input se ve vacio (`query=""`) hasta que tipeas o haces blur. Limitaciones de UX conocidas.
- ⚠️ **Sidebar — el link activo usa `pathname.startsWith(path + "/")`** (para rutas sin `?tab=`), asi que `/pedidos` y `/pedidos/nuevo` se resaltan a la vez. Ademas hay un `setUser(...)` sincrono dentro de un `useEffect` (dependiente de `pathname`) que dispara un render extra (de ahi el `react-hooks/set-state-in-effect` y el render duplicado).
- ⚠️ **Toast — el timer de auto-dismiss depende del texto del mensaje, no de un id.** El `useEffect` tiene deps `[message?.text, message?.type, autoDismissMs]`, asi que dos toasts identicos seguidos (mismo `text` y `type`) pueden NO reiniciar el timer. Para forzar reinicio, cambia el texto o el id del estado.
- ⚠️ **Imagenes — usar `compressImage` de `lib/imageUtils.ts`** antes de subir (storage max 1MB). OJO: re-encodea a JPEG y dibuja con `drawImage` SIN rellenar fondo blanco, asi que un **PNG transparente queda con fondo negro** tras comprimir.
