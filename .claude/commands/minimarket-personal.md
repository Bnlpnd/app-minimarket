# Nomina y gestion de personal -- app-minimarket

Usa esta referencia cuando trabajes con usuarios, asistencias, descuentos o pagos de personal.

## Acceso

- Modulo exclusivo para admin (`isAdmin(profile)`)
- Componente principal: `PersonalModule.tsx` (1501 lineas, el mas grande del proyecto)
- Ruta: `/personal`

## Estructura del modulo

### Dos tabs principales
1. **Listado interno** -- CRUD de usuarios con registro/edicion
2. **Pago semanal** -- Asistencia, descuentos y calculo de pago

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
  p_email: string,
  p_password: string,
  p_rol: "admin" | "trabajador" | "cliente",
  p_nombres: string,
  p_apellidos: string | null,
  p_telefono: string | null,
  p_pago_hora: number,
  p_horas_semana: number,
  p_gastos_semana: number,
  p_horario_laboral: string | null,
  p_activo: boolean
})
```

### Edicion de usuario
Actualiza directamente en tabla `app_usuarios`:
```ts
supabase.from("app_usuarios").update({
  nombres, apellidos, telefono, rol,
  pago_hora, horas_semana, gastos_semana,
  horario_laboral, activo
}).eq("id", userId)
```

## Pago semanal (WeeklyPaySection)

### Selector de trabajador
- Filtra `app_usuarios` con rol `trabajador` y `activo: true`
- Al seleccionar, carga asistencias + descuentos + pago de la semana

### Calculo de semana
```ts
function getWeekRange(date: Date) {
  // Calcula lunes (inicio) y domingo (fin) de la semana
  // Retorna { start: Date, end: Date }
  // Lunes = dia 1, Domingo = dia 0 -> retrocede al lunes anterior
}
```

### Tres acciones del trabajador

#### 1. Asistencia
- Fecha, hora_ingreso, hora_salida, productividad, observacion
- Upsert con `onConflict: "usuario_id,fecha"` (una asistencia por dia)

```ts
supabase.from("personal_asistencias").upsert({
  usuario_id,
  fecha,        // YYYY-MM-DD
  hora_ingreso, // HH:MM
  hora_salida,  // HH:MM
  productividad,
  observacion
}, { onConflict: "usuario_id,fecha" })
```

#### 2. Descuento
- Fecha, detalle (texto), monto (numerico)
- Insert simple, no upsert

```ts
supabase.from("personal_descuentos").insert({
  usuario_id,
  fecha,
  detalle,
  monto
})
```

- Eliminar descuento: `supabase.from("personal_descuentos").delete().eq("id", descuentoId)`

#### 3. Pago semanal
- Upsert con `onConflict: "usuario_id,semana_inicio"` (un pago por semana)

```ts
supabase.from("personal_pagos").upsert({
  usuario_id,
  semana_inicio,    // YYYY-MM-DD del lunes
  semana_fin,       // YYYY-MM-DD del domingo
  horas_trabajadas,
  pago_hora,
  descuentos,
  monto_pagado,
  estado: "pagado",
  observacion
}, { onConflict: "usuario_id,semana_inicio" })
```

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
function getPaySummary(trabajador, asistencias, descuentos) {
  // registeredHours = sum de hoursBetween(ingreso, salida) de asistencias
  // hoursForPay = registeredHours > 0 ? registeredHours : trabajador.horas_semana
  //   ^ Si no hay asistencias registradas, usa horas_semana default
  // discountTotal = sum de descuentos.monto
  // amount = max(0, hoursForPay * pago_hora - discountTotal)
  // Nunca negativo
}
```

**Logica clave:** Si no hay asistencias registradas en la semana, se asume que trabajo las `horas_semana` configuradas en su perfil.

## Dashboard del trabajador (app/dashboard/page.tsx)

### Metricas del trabajador
```ts
// Ventas registradas hoy
pedidos.count WHERE app_registrado_por_id = userId AND created_at = hoy

// Pedidos entregados hoy
pedidos.count WHERE app_entregado_por_id = userId AND entregado_at = hoy

// Pago estimado semanal
pago_hora * horas_semana - gastos_semana
```

### Accion "Tomar y preparar"
Desde el dashboard del trabajador, puede tomar pedidos pendientes:
```ts
pedidos.update({
  estado: "en_preparacion",
  app_preparado_por_id: userId,
  preparado_at: new Date().toISOString()
}).eq("id", pedidoId).eq("estado", "pendiente")

// Luego navega a: /preparacion?pedido={pedidoId}
```

## Roles y permisos

### Roles del sistema
| Rol | Acceso |
|-----|--------|
| `admin` | Todo el sistema |
| `trabajador` | Productos (ver/editar), pedidos (crear/preparar), almacen, dashboard trabajador |
| `cliente` | Solo dashboard basico (sin funcionalidad implementada) |

### Verificacion de roles (lib/authRoles.ts)
```ts
// Lee de localStorage key "app_minimarket_user"
getStoredAppUser() -> { id, email, rol, nombres, apellidos } | null

// Construye perfil con roles (no hace RPC)
getCurrentUserProfile() -> { profile: { roles: { nombre: string } } | null, error }

// Checks
isAdmin(profile)     // profile?.roles?.nombre === "admin"
isTrabajador(profile) // profile?.roles?.nombre === "trabajador"
```

### Patrones de acceso por pagina
| Pagina | Requiere |
|--------|----------|
| `/personal` | admin |
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
