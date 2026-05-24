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
  layout.tsx          -- RootLayout, Geist fonts, lang="es"
  page.tsx            -- redirect("/login")
  globals.css         -- Tailwind import + CSS vars
  login/page.tsx      -- Login form, RPC login_app, localStorage
  dashboard/page.tsx  -- AdminDashboard + WorkerDashboard (654 lineas)
  productos/
    page.tsx           -- Listado con quick-edit y paginacion (529 lineas)
    nuevo/page.tsx     -- Crear/editar producto (614 lineas, ?id= para editar)
    importar/page.tsx  -- Wrapper para ProductoImportCsv
    mantenimiento/page.tsx -- CRUD catalogos admin-only (530 lineas)
  pedidos/
    page.tsx           -- Wrapper para PedidosList
    nuevo/page.tsx     -- Wrapper para PedidoNuevoForm
    [id]/page.tsx      -- Wrapper para PedidoDetalle
  almacen/
    page.tsx           -- Wrapper para AlmacenDashboard
    movimientos/       -- Wrapper para AlmacenMovimientos
    transferencias/    -- Wrapper para AlmacenTransferencias
    ajustes/           -- Wrapper para AlmacenAjustes
  clientes/
    page.tsx           -- Wrapper para ClienteModule
    [id]/pedidos/      -- Wrapper para ClientePedidosModule
  preparacion/         -- Wrapper para PreparacionModule
  personal/            -- Wrapper para PersonalModule
  pagos/               -- Wrapper para PagosYapeValidator
  proveedores/         -- Wrapper para ProveedoresModule

components/
  Layout.tsx           -- Layout principal (sidebar + content)
  Header.tsx           -- Header mobile-only
  Sidebar.tsx          -- Navegacion lateral w-72
  AdminOnly.tsx        -- Guard de acceso admin
  ProductoSearch.tsx   -- Input de busqueda simple
  ProductoTable.tsx    -- Tabla + cards responsive
  ProductoForm.tsx     -- Formulario producto (869 lineas)
  ProductoImportCsv.tsx -- Importador CSV (1037 lineas)
  ProductoCatalogManager.tsx -- CRUD de catalogos inline
  PedidoNuevoForm.tsx  -- Wizard 5 pasos (1436 lineas)
  PedidosList.tsx      -- Listado pedidos con filtros
  PedidoDetalle.tsx    -- Detalle + acciones pedido
  AlmacenDashboard.tsx -- Dashboard almacen con quick-edit
  AlmacenMovimientos.tsx -- Historial de movimientos
  AlmacenTransferencias.tsx -- Transferencia entre almacenes
  AlmacenAjustes.tsx   -- Ajuste por conteo fisico
  PreparacionModule.tsx -- Cola de preparacion
  ClienteModule.tsx    -- CRUD clientes con deuda
  ClientePedidosModule.tsx -- Historial pedidos por cliente
  ProveedoresModule.tsx -- CRUD proveedores
  PersonalModule.tsx   -- Nomina completa (1501 lineas)
  PagosYapeValidator.tsx -- Validacion pagos Yape

lib/
  supabaseClient.ts    -- Client Supabase (nullable)
  authRoles.ts         -- getStoredAppUser, isAdmin, isTrabajador
  dateUtils.ts         -- formatDate, formatDateTime, parseInputDate, formatTime
  whatsapp.ts          -- generarMensajePedido, generarLinkWhatsApp
  catalogDefaults.ts   -- Presentaciones y unidades iniciales
```

## Layout y navegacion

### Layout.tsx
- `"use client"`, recibe `title`, `description`, `children`
- Sidebar fijo en desktop (`md:pl-72`), overlay en mobile con `isMenuOpen`
- Content area: `max-w-6xl mx-auto`
- Brand: "Minimarket Santa Ana"

### Sidebar.tsx
- 8 grupos de navegacion con 16 items totales
- Activo via `usePathname()` match
- Ancho `w-72`, fondo `bg-slate-950`
- Prop opcional `onNavigate` para cerrar menu mobile

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

### Sub-componentes inline
Los componentes grandes definen sub-componentes como funciones en el mismo archivo:
- `Field`, `QuickCreate` en ProductoForm.tsx
- `Panel`, `Info` en PedidoDetalle.tsx
- `Cart` en PedidoNuevoForm.tsx
- `MetricCard`, `ActionLink`, `Panel`, `ErrorPanel` en dashboard/page.tsx

## Autenticacion (lib/authRoles.ts)

```tsx
// Leer usuario de localStorage
getStoredAppUser() -> { id, email, rol, nombres, apellidos } | null

// Construir perfil con roles
getCurrentUserProfile() -> { profile, error }

// Verificar rol
isAdmin(profile)     // profile?.roles?.nombre === "admin"
isTrabajador(profile) // profile?.roles?.nombre === "trabajador"
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
