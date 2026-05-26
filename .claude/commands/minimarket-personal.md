# Nomina y gestion de personal -- app-minimarket

Usa esta referencia cuando trabajes con usuarios, asistencias, descuentos o pagos de personal.

## Acceso

- Modulo admin: `PersonalModule.tsx` (1459 lineas), ruta `/personal`
- Pagina self-service: `app/mis-datos/page.tsx` (525 lineas), ruta `/mis-datos`
- Sub-componentes: `components/personal/AttendanceWeekBlock.tsx` (348), `DiscountWeekBlock.tsx` (170), `PaymentHistoryBlock.tsx` (290)

## Estructura del modulo admin (PersonalModule)

### Dos tabs principales (URL params)
1. **Listado interno** (`?tab=listado` o `?tab=nuevo`) -- CRUD de usuarios con registro/edicion
2. **Pago semanal** (`?tab=pago`) -- Asistencia, descuentos y calculo de pago

Tab se lee de URL search params con `useSearchParams()` y `getInitialTab()`.

### Imports clave
```ts
import { matchesSearch } from "@/lib/searchUtils";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import { validateHorarioLaboral, validatePhonePe } from "@/lib/validators";
import { AttendanceWeekBlock } from "@/components/personal/AttendanceWeekBlock";
import { DiscountWeekBlock } from "@/components/personal/DiscountWeekBlock";
import { PaymentHistoryBlock } from "@/components/personal/PaymentHistoryBlock";
```

### Filtros del listado
- Busqueda: `matchesSearch(search, [email, nombres, apellidos, telefono, rol])`
- Filtro rol: `"todos" | "admin" | "trabajador"`
- Filtro estado: `"todos" | "activos" | "inactivos"`

## Modelo de datos

### AppUsuario (tabla `app_usuarios`)
```ts
interface AppUsuario {
  id: string;
  email: string;
  rol: "admin" | "trabajador" | "cliente";
  nombres: string;
  apellidos: string | null;
  telefono: string | null;
  pago_hora: number;
  horas_semana: number;
  gastos_semana: number;
  horario_laboral: string | null;
  activo: boolean;
}
```

Tipo interno del modulo (excluye rol cliente):
```ts
type UsuarioInterno = Omit<AppUsuario, "rol"> & { rol: "admin" | "trabajador" };
```

### PersonalAsistencia (tabla `personal_asistencias`)
```ts
interface PersonalAsistencia {
  id: string;
  usuario_id: string;
  fecha: string;           // YYYY-MM-DD
  hora_ingreso: string | null;  // HH:MM
  hora_salida: string | null;   // HH:MM
  productividad: 1 | 2 | 3;
  observacion: string | null;
}
```

**Escala de productividad:**
| Valor | Significado |
|-------|-------------|
| 1 | No la dio |
| 2 | Normal |
| 3 | Extra |

### PersonalDescuento (tabla `personal_descuentos`)
```ts
interface PersonalDescuento {
  id: string;
  usuario_id: string;
  fecha: string;
  detalle: string;
  monto: number;
}
```

### PersonalPago (tabla `personal_pagos`)
```ts
interface PersonalPago {
  id: string;
  usuario_id: string;
  semana_inicio: string;    // YYYY-MM-DD (lunes)
  semana_fin: string;       // YYYY-MM-DD (domingo)
  horas_trabajadas: number;
  pago_hora: number;
  descuentos: number;
  monto_pagado: number;
  estado: "pendiente" | "pagado";
  observacion: string | null;
}
```

## Registro de usuario

### RPC crear_app_usuario
```ts
supabase.rpc("crear_app_usuario", {
  p_admin_id: string,       // ID del admin que registra (desde getStoredAppUser)
  p_email: string,
  p_password: string,
  p_rol: "admin" | "trabajador",
  p_nombres: string,
  p_apellidos: string | null,
  p_telefono: string | null,
  p_pago_hora: number,
  p_horas_semana: number,
  p_gastos_semana: 0,        // hardcoded a 0
  p_horario_laboral: string | null,
})
```

Validaciones pre-submit: `validatePhonePe(telefono)`, email/password/nombres requeridos, pago_hora y horas_semana deben ser numeros positivos.

### Edicion de usuario
Actualiza directamente en tabla `app_usuarios`:
```ts
supabase.from("app_usuarios").update({
  nombres, apellidos, telefono, rol,
  pago_hora, horas_semana,
  horario_laboral, activo
}).eq("id", userId)
```

## Pago semanal (WeeklyPaySection)

WeeklyPaySection delega las 3 acciones a sub-componentes.

### Selector de trabajador
- Filtra `app_usuarios` con rol `trabajador` y `activo: true`
- Al seleccionar, carga asistencias + descuentos + pago de la semana

### Carga de datos (loadData)
Carga en paralelo con `Promise.all` usando `fetchAllRows`:
- Usuarios internos (admin + trabajador), ordered by created_at desc
- Asistencias de la semana actual
- Descuentos de la semana actual
- Pagos de la semana actual
- Historia de asistencias (ultimas 12 semanas)
- Historia de descuentos (ultimas 12 semanas)
- Historia de pagos (todos)

### Calculo de semana
```ts
function getWeekRange(referenceDate = new Date()) {
  // Calcula lunes (inicio) y domingo (fin) de la semana
  // Retorna { start: string, end: string, label: string }
}
```

### Tres acciones del trabajador

#### 1. Asistencia (AttendanceWeekBlock)

Sub-componente con calendario semanal de circulos por dia.

**UI:** Calendario semanal con circulos (L, M, Mi, J, V, S, D). Circulo verde = seleccionado, amber = tiene registro, blanco = sin registro. Navegacion semanal con botones < > (no puede avanzar mas alla de la semana actual).

**Ingreso/Salida separados:** Dos secciones colapsables (IngresoSection, SalidaSection) con logica de bloqueo:
- Si ya hay ingreso registrado y no es admin: bloqueado con mensaje "Solo el admin puede modificar"
- Si ya hay salida registrada y no es admin: bloqueado igual
- Admin puede siempre editar

```ts
// saveIngreso: preserva hora_salida + productividad si existe registro previo
async function saveIngreso(fecha: string, hora: string, observacion: string) {
  // Valida hora ingreso < hora salida existente con validateHorarioLaboral
  supabase.from("personal_asistencias").upsert({
    usuario_id, fecha,
    hora_ingreso: hora || null,
    hora_salida: existing?.hora_salida ?? null,
    productividad: existing?.productividad ?? 2,
    observacion: normalizeSpaces(observacion) || existing?.observacion || null,
  }, { onConflict: "usuario_id,fecha" })
}

// saveSalida: preserva hora_ingreso si existe registro previo
async function saveSalida(fecha: string, hora: string, productividad: number) {
  // Valida hora salida > hora ingreso existente con validateHorarioLaboral
  supabase.from("personal_asistencias").upsert({
    usuario_id, fecha,
    hora_ingreso: existing?.hora_ingreso ?? null,
    hora_salida: hora || null,
    productividad: productividad || 2,
    observacion: existing?.observacion ?? null,
  }, { onConflict: "usuario_id,fecha" })
}
```

**Componentes internos de AttendanceWeekBlock:**
- `IngresoForm`: inputs hora (time) + observacion (text), boton "Guardar ingreso"
- `SalidaForm`: inputs hora (time) + productividad (select 1/2/3), boton "Guardar salida"
- `useStateValue(defaultValue)`: mini hook que resetea cuando el default cambia

**editAttendance (admin-only):** Abre el dia en ambos formularios para re-editar.

#### 2. Descuento (DiscountWeekBlock)

Sub-componente con calendario semanal + formulario inline.

**UI:** Mismo patron de circulos semanales. Al seleccionar dia, actualiza discountForm.fecha. Formulario con campos detalle (texto) y monto (number). Soporta edicion de descuentos existentes (editingDiscountId).

```ts
// Insert o update segun editingDiscountId
const result = editingDiscountId
  ? supabase.from("personal_descuentos").update(payload).eq("id", editingDiscountId)
  : supabase.from("personal_descuentos").insert(payload);
```

**Lista semanal:** Muestra descuentos filtrados por la semana visible con fecha, detalle, monto. Admin puede editar cada uno.

#### 3. Pago (PaymentHistoryBlock)

Sub-componente con metricas de la semana actual + historico con grafico SVG.

**Metricas actuales (5 cards):**
- Semana (label del rango)
- Pago x hora
- Horas trabajadas (registradas o default)
- Descuentos semana
- Monto a pagar (bold)

**Registrar pago (admin-only):**
```ts
supabase.from("personal_pagos").upsert({
  usuario_id,
  semana_inicio,
  semana_fin,
  horas_trabajadas: hoursForPay,
  pago_hora,
  descuentos: discountTotal,
  monto_pagado: amount,
  estado: "pagado",
}, { onConflict: "usuario_id,semana_inicio" })
```

**Historico con filtro semana/mes:**
- Agrupa datos en buckets por semana (getMondayOf) o mes (yyyy-mm)
- Muestra ultimos 8 buckets
- Grafico SVG con 4 barras por bucket: pago (verde), horas (azul), descuentos (amber), productividad (morado)
- Leyenda con totales acumulados

### Calculo de horas
```ts
function hoursBetween(start: string, end: string): number {
  // Parsea formato "HH:MM"
  // Si end <= start, retorna 0 (NO soporta jornadas nocturnas/overnight)
  // Retorna diferencia en horas (puede ser decimal, ej: 8.5)
}
```

### Resumen de pago (getPaySummary)
```ts
function getPaySummary(worker, asistencias, descuentos) {
  // registeredHours = sum de hoursBetween(ingreso, salida) de asistencias
  // hoursForPay = registeredHours > 0 ? registeredHours : worker.horas_semana
  //   ^ Si no hay asistencias registradas, usa horas_semana default
  // discountTotal = sum de descuentos.monto
  // amount = max(0, hoursForPay * pago_hora - discountTotal)
  // Nunca negativo
}
```

**Logica clave:** Si no hay asistencias registradas en la semana, se asume que trabajo las `horas_semana` configuradas en su perfil.

## Pagina /mis-datos (worker self-service)

Pagina completa para que el trabajador vea su propia informacion. Acceso: cualquier usuario logueado (redirige a login si no hay sesion). No requiere admin.

### Carga de datos
```ts
// Carga datos del trabajador logueado
supabase.from("app_usuarios")
  .select("id,nombres,apellidos,email,pago_hora,horas_semana,gastos_semana,horario_laboral,rol")
  .eq("id", userId).maybeSingle()

// Ultimas 60 asistencias, 60 descuentos, 30 pagos del usuario
```

### Header del trabajador
- Nombre completo + rol capitalizado
- 3 metricas: Costo x hora, Horas/semana, Pago estimado semana
- Horario laboral si existe

### Tabs: asistencia | descuento | pago

#### Tab asistencia: Marcar ingreso/salida one-tap
Seccion "Hoy" con dos botones grandes:
- **"Marcar mi ingreso"**: Registra hora actual (`nowHHMM()`) como ingreso del dia
- **"Marcar mi salida"**: Registra hora actual como salida del dia

**Restricciones:**
- Solo puede marcar ingreso una vez por dia (si ya hay ingreso, boton deshabilitado con "Ingreso ya registrado")
- Solo puede marcar salida si ya tiene ingreso y no tiene salida previa
- Valida que salida > ingreso con `validateHorarioLaboral`
- Mensaje: "Tu admin es quien puede editar o corregir registros anteriores."

```ts
// marcarIngreso: upsert preservando datos existentes
supabase.from("personal_asistencias").upsert({
  usuario_id, fecha: todayIso(),
  hora_ingreso: nowHHMM(),
  hora_salida: asistenciaHoy?.hora_salida ?? null,
  productividad: asistenciaHoy?.productividad ?? 2,
  observacion: asistenciaHoy?.observacion ?? null,
}, { onConflict: "usuario_id,fecha" })

// marcarSalida: requiere ingreso previo, upsert preservando ingreso
supabase.from("personal_asistencias").upsert({
  usuario_id, fecha: todayIso(),
  hora_ingreso: asistenciaHoy.hora_ingreso,
  hora_salida: nowHHMM(),
  productividad: asistenciaHoy.productividad ?? 2,
  observacion: asistenciaHoy.observacion ?? null,
}, { onConflict: "usuario_id,fecha" })
```

Debajo: lista de asistencias historicas con fecha, rango horario y horas trabajadas.

#### Tab descuento: vista readonly
Lista de descuentos del trabajador con fecha, detalle y monto (en rojo con signo -). Mensaje si no hay: "No tienes descuentos registrados. Buen trabajo."

#### Tab pago: vista readonly
Lista de pagos semanales con rango de semana, horas/descuentos, monto pagado y estado (pagado en verde, pendiente en amber).

### Componentes internos de /mis-datos
- `Panel({ title, subtitle, children })`: card wrapper con titulo
- `Metric({ label, value })`: metrica individual con label uppercase
- `TabButton({ active, onClick, children })`: boton de tab estilizado

## Dashboard del trabajador (app/dashboard/page.tsx)

### Datos cargados (WorkerData)
```ts
type WorkerData = {
  ultimosPedidos: PedidoResumen[];       // Pedidos en estados activos (hasta 30)
  ventasHoy: number;                     // count registrado por este worker hoy
  entregadosHoy: number;                 // count entregado por este worker hoy
  pagoSemana: number;                    // pago_hora * horas_semana - gastos_semana
  trabajador: Pick<AppUsuario, "pago_hora" | "horas_semana" | "gastos_semana"> | null;
  stockBajoTienda: StockBajoTienda[];    // Productos con stock Tienda <= stock_minimo (hasta 8)
  solicitudesPendientes: SolicitudPendiente[]; // Transferencias estado "enviado" (hasta 10)
  topVendidosHoy: TopVendido[];          // Top 5 productos por cantidad vendida hoy
  clientesConDeuda: ClienteDeuda[];      // Clientes con pedidos estado_pago "debe" (hasta 8)
  errors: string[];
};
```

### Secciones del worker dashboard

1. **Acciones rapidas:** Agregar venta, Transferencias, Stock
2. **Link "Mis datos":** Card enlace a `/mis-datos` con texto "Mis datos (asistencia, descuentos, pagos)"
3. **Pedidos por atender:** Lista de pedidos activos ordenados por urgencia (pendiente > pago_enviado > pago_validado > en_preparacion > listo). Con botones contextuales: "Validar pago" (pago_enviado), "Tomar y preparar" (pendiente), "Continuar"/"Entregar" (otros)
4. **Stock bajo en Tienda:** Productos con stock Tienda <= minimo. Muestra stock Tienda y Casa. Badge "Sin stock" (rojo) o "Bajo" (naranja). Link a transferencias.
5. **Transferencias por recibir:** Solicitudes en estado "enviado" con cantidad de items. Link para confirmar.
6. **Mas vendidos hoy:** Top 5 con ranking numerado (1-5). Calculado client-side agrupando detalle_pedido.
7. **Clientes con deuda:** Pedidos con estado_pago "debe", agrupados por cliente. Muestra nombre, telefono, deuda total, cantidad de pedidos. Link a `/clientes`.

### Accion "Tomar y preparar"
```ts
pedidos.update({
  estado: "en_preparacion",
  app_preparado_por_id: userId,
  preparado_at: new Date().toISOString()
}).eq("id", pedidoId).eq("estado", "pendiente")
// Luego navega a: /preparacion?pedido={pedidoId}
```

### Queries del worker dashboard
```ts
// Stock bajo: productos activos sin producto_base_id, con almacen embed
supabase.from("productos")
  .select("id,nombre_producto,stock_minimo,producto_base_id,producto_almacen(stock_actual,almacenes(nombre))")
  .eq("activo", true).is("producto_base_id", null).limit(500)

// Solicitudes transferencia pendientes
supabase.from("almacen_transferencias_solicitudes")
  .select("id, created_at, almacen_transferencias_items(id)")
  .eq("estado", "enviado").limit(10)

// Top vendidos hoy (detalle con inner join a pedidos del dia)
supabase.from("detalle_pedido")
  .select("cantidad, producto_id, productos!producto_id(nombre_producto), pedidos!inner(created_at, estado)")
  .gte("pedidos.created_at", todayStart).lt("pedidos.created_at", tomorrowStart)
  .neq("pedidos.estado", "cancelado").limit(500)

// Clientes con deuda
supabase.from("pedidos")
  .select("id, cliente_id, total, monto_a_cuenta, clientes(nombres, telefono)")
  .eq("estado_pago", "debe").not("cliente_id", "is", null).limit(500)
```

## Roles y permisos

### Roles del sistema
| Rol | Acceso |
|-----|--------|
| `admin` | Todo el sistema |
| `trabajador` | Productos (ver/editar), pedidos (crear/preparar), almacen, dashboard trabajador, /mis-datos |
| `cliente` | Solo dashboard basico (sin funcionalidad implementada) |

### Verificacion de roles (lib/authRoles.ts)
```ts
getStoredAppUser() -> { id, email, rol, nombres, apellidos } | null
getCurrentUserProfile() -> { profile: { roles: { nombre: string } } | null, error }
isAdmin(profile)      // profile?.roles?.nombre === "admin"
isTrabajador(profile) // profile?.roles?.nombre === "trabajador"
```

### Patrones de acceso por pagina
| Pagina | Requiere |
|--------|----------|
| `/personal` | admin |
| `/mis-datos` | cualquier usuario logueado |
| `/productos/mantenimiento` | admin |
| `/productos`, `/productos/nuevo` | admin o trabajador |
| `/pedidos/*` | admin o trabajador |
| `/almacen/*` | admin o trabajador |
| `/clientes/*` | admin o trabajador |
| `/proveedores` | admin o trabajador |
| `/pagos` | admin o trabajador |
| `/preparacion` | admin o trabajador |
| `/dashboard` | admin o trabajador (vistas diferentes) |
| `/login` | publico |

## Datos relacionados

### Tabla usuarios_perfil (legacy)
```ts
interface UsuarioPerfil {
  id: string;
  rol_id: number | null;
  nombres: string | null;
  apellidos: string | null;
  telefono: string | null;
  activo: boolean;
}
```
- Usada en PedidoDetalle para mostrar nombres de responsables
- `registrado_por_id`, `preparado_por_id`, `entregado_por_id` en pedidos referencian esta tabla

### Tabla roles (legacy)
```ts
interface Rol {
  id: number;
  nombre: string;
  descripcion: string | null;
}
```

### Audit trail en pedidos
Los pedidos tienen doble referencia de responsables:
- `registrado_por_id` / `preparado_por_id` / `entregado_por_id` -> `usuarios_perfil`
- `app_registrado_por_id` / `app_preparado_por_id` / `app_entregado_por_id` -> `app_usuarios`
