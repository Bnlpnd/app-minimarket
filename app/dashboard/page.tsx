"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { getCurrentUserProfile, getStoredAppUser, isTrabajador } from "@/lib/authRoles";
import { formatDate, formatTime } from "@/lib/dateUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import type {
  AppUsuario,
  Cliente,
  PagoMetodo,
  Pedido,
  PedidoEstado,
  Producto,
  VistaLoteVencimiento,
} from "@/types/database";
import { estadoVencimientoUI, formatFechaCorta } from "@/lib/loteUtils";

type PedidoResumen = Pick<
  Pedido,
  | "id"
  | "estado"
  | "fecha_recojo"
  | "hora_recojo"
  | "total"
  | "metodo_pago"
  | "created_at"
> & {
  clientes:
    | Pick<Cliente, "nombres" | "telefono">
    | Pick<Cliente, "nombres" | "telefono">[]
    | null;
};

type ProductoStockBajo = Pick<
  Producto,
  "id" | "codigo_interno" | "nombre_producto" | "stock_actual" | "stock_minimo"
>;

type AdminData = {
  pedidosPendientes: number;
  pedidosEnPreparacion: number;
  pedidosListos: number;
  ventasDia: number;
  montoDia: number;
  descuentoSemana: number;
  personalActivo: number;
  pagosPorValidar: number;
  ultimosPedidos: PedidoResumen[];
  productosStockBajo: ProductoStockBajo[];
  proximosVencer: VistaLoteVencimiento[];
  errors: string[];
};

type StockBajoTienda = {
  id: string;
  nombre_producto: string;
  stock_tienda: number;
  stock_casa: number;
  stock_minimo: number;
};

type SolicitudPendiente = {
  id: string;
  created_at: string;
  items_count: number;
};

type TopVendido = {
  producto_id: string;
  nombre_producto: string;
  cantidad: number;
};

type ClienteDeuda = {
  id: string;
  nombres: string;
  telefono: string | null;
  deuda_total: number;
  cards_pendientes: number;
};

type WorkerData = {
  ultimosPedidos: PedidoResumen[];
  ventasHoy: number;
  entregadosHoy: number;
  pagoSemana: number;
  trabajador: Pick<AppUsuario, "pago_hora" | "horas_semana" | "gastos_semana"> | null;
  stockBajoTienda: StockBajoTienda[];
  solicitudesPendientes: SolicitudPendiente[];
  topVendidosHoy: TopVendido[];
  clientesConDeuda: ClienteDeuda[];
  proximosVencer: VistaLoteVencimiento[];
  errors: string[];
};

const emptyAdminData: AdminData = {
  pedidosPendientes: 0,
  pedidosEnPreparacion: 0,
  pedidosListos: 0,
  ventasDia: 0,
  montoDia: 0,
  descuentoSemana: 0,
  personalActivo: 0,
  pagosPorValidar: 0,
  ultimosPedidos: [],
  productosStockBajo: [],
  proximosVencer: [],
  errors: [],
};

const emptyWorkerData: WorkerData = {
  ultimosPedidos: [],
  ventasHoy: 0,
  entregadosHoy: 0,
  pagoSemana: 0,
  trabajador: null,
  stockBajoTienda: [],
  solicitudesPendientes: [],
  topVendidosHoy: [],
  clientesConDeuda: [],
  proximosVencer: [],
  errors: [],
};

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function startOfTomorrowIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function startOfWeekIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString();
}

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatEstado(value: PedidoEstado) {
  return value.replaceAll("_", " ");
}

function formatMetodo(value: PagoMetodo | null) {
  return value ?? "Sin pago";
}

function getCliente(
  relation:
    | Pick<Cliente, "nombres" | "telefono">
    | Pick<Cliente, "nombres" | "telefono">[]
    | null,
) {
  return Array.isArray(relation) ? relation[0] : relation;
}

export default function DashboardPage() {
  const [dashboardRole, setDashboardRole] = useState<"admin" | "trabajador" | "cliente" | "none">("none");
  const [isCheckingRole, setIsCheckingRole] = useState(true);

  useEffect(() => {
    async function checkRole() {
      const { profile } = await getCurrentUserProfile();
      if (!profile) {
        setDashboardRole("none");
      } else if (isTrabajador(profile)) {
        setDashboardRole("trabajador");
      } else if (profile.roles?.nombre === "admin") {
        setDashboardRole("admin");
      } else {
        setDashboardRole("cliente");
      }
      setIsCheckingRole(false);
    }

    void checkRole();
  }, []);

  return (
    <Layout
      title="Dashboard"
      description={
        dashboardRole === "trabajador"
          ? "Acciones de venta, preparacion y resumen personal."
          : "Resumen operativo de pedidos, pagos, personal y stock."
      }
    >
      {isCheckingRole ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
          Cargando dashboard...
        </section>
      ) : dashboardRole === "trabajador" ? (
        <WorkerDashboard />
      ) : dashboardRole === "admin" ? (
        <AdminDashboard />
      ) : (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <h2 className="text-base font-semibold text-amber-950">Acceso requerido</h2>
          <p className="mt-2">
            Inicia sesion con un usuario admin o trabajador para ver el dashboard.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
          >
            Ir al login
          </Link>
        </section>
      )}
    </Layout>
  );
}

function AdminDashboard() {
  const [data, setData] = useState<AdminData>(emptyAdminData);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (supabaseConfigError || !supabase) {
        setData({ ...emptyAdminData, errors: [supabaseConfigError ?? "No hay conexion configurada a Supabase."] });
        setIsLoading(false);
        return;
      }

      const todayStart = startOfTodayIso();
      const tomorrowStart = startOfTomorrowIso();
      const weekStart = startOfWeekIso();

      const [
        pendientes,
        preparacion,
        listos,
        ventasDia,
        pedidosDia,
        descuentosSemana,
        personal,
        pagos,
        ultimos,
        productos,
      ] = await Promise.all([
        supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("estado", "pendiente"),
        supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("estado", "en_preparacion"),
        supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("estado", "listo_para_recoger"),
        supabase.from("pedidos").select("*", { count: "exact", head: true }).gte("created_at", todayStart).lt("created_at", tomorrowStart),
        supabase.from("pedidos").select("total").gte("created_at", todayStart).lt("created_at", tomorrowStart),
        supabase.from("pedidos").select("descuento").gte("created_at", weekStart),
        supabase.from("app_usuarios").select("*", { count: "exact", head: true }).eq("activo", true),
        supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("estado", "pago_enviado"),
        supabase
          .from("pedidos")
          .select("id,estado,fecha_recojo,hora_recojo,total,metodo_pago,created_at,clientes(nombres, telefono)")
          .order("created_at", { ascending: false })
          .limit(5),
        fetchAllRows<ProductoStockBajo & { producto_almacen?: Array<{ stock_actual: number; almacenes?: { nombre: string } | { nombre: string }[] | null }> }>(
          supabase
            .from("productos")
            .select("id,codigo_interno,nombre_producto,stock_actual,stock_minimo,producto_almacen(stock_actual,almacenes(nombre))")
            .eq("activo", true)
            .not("stock_minimo", "is", null),
        ),
      ]);

      // Lotes proximos a vencer (en paralelo con resto del dashboard).
      const vencerResult = await supabase
        .from("vista_lotes_vencimiento")
        .select("*")
        .in("estado_vencimiento", ["vencido", "urgente", "proximo"])
        .order("fecha_vencimiento", { ascending: true })
        .limit(8);

      const errors = [
        pendientes.error ? `Pendientes: ${pendientes.error.message}` : null,
        preparacion.error ? `En preparacion: ${preparacion.error.message}` : null,
        listos.error ? `Listos: ${listos.error.message}` : null,
        ventasDia.error ? `Ventas del dia: ${ventasDia.error.message}` : null,
        pedidosDia.error ? `Monto del dia: ${pedidosDia.error.message}` : null,
        descuentosSemana.error ? `Descuentos de la semana: ${descuentosSemana.error.message}` : null,
        personal.error ? `Personal: ${personal.error.message}` : null,
        pagos.error ? `Pagos por validar: ${pagos.error.message}` : null,
        ultimos.error ? `Ultimos pedidos: ${ultimos.error.message}` : null,
        productos.error ? `Stock bajo: ${productos.error.message}` : null,
        vencerResult.error ? `Vencimientos: ${vencerResult.error.message}` : null,
      ].filter(Boolean) as string[];

      const montoDia = ((pedidosDia.data ?? []) as Pick<Pedido, "total">[]).reduce(
        (sum, pedido) => sum + Number(pedido.total ?? 0),
        0,
      );
      const descuentoSemana = ((descuentosSemana.data ?? []) as Pick<Pedido, "descuento">[]).reduce(
        (sum, pedido) => sum + Number(pedido.descuento ?? 0),
        0,
      );
      const productosStockBajoRaw = (productos.data ?? []) as Array<
        ProductoStockBajo & { producto_almacen?: Array<{ stock_actual: number; almacenes?: { nombre: string } | { nombre: string }[] | null }> }
      >;
      const tiendaStock = (producto: typeof productosStockBajoRaw[number]) => {
        const rows = producto.producto_almacen ?? [];
        for (const row of rows) {
          const a = row.almacenes;
          const name = Array.isArray(a) ? a[0]?.nombre : a?.nombre;
          if ((name ?? "").toLowerCase() === "tienda") {
            return Number(row.stock_actual ?? 0);
          }
        }
        return Number(producto.stock_actual ?? 0);
      };
      const productosStockBajo = productosStockBajoRaw
        .map((producto) => ({ ...producto, stock_actual: tiendaStock(producto) }))
        .filter((producto) => Number(producto.stock_actual ?? 0) <= Number(producto.stock_minimo ?? 0))
        .sort((a, b) => Number(a.stock_actual ?? 0) - Number(b.stock_actual ?? 0))
        .slice(0, 8);

      setData({
        pedidosPendientes: pendientes.count ?? 0,
        pedidosEnPreparacion: preparacion.count ?? 0,
        pedidosListos: listos.count ?? 0,
        ventasDia: ventasDia.count ?? 0,
        montoDia,
        descuentoSemana,
        personalActivo: personal.count ?? 0,
        pagosPorValidar: pagos.count ?? 0,
        ultimosPedidos: (ultimos.data ?? []) as unknown as PedidoResumen[],
        productosStockBajo,
        proximosVencer: ((vencerResult.data ?? []) as VistaLoteVencimiento[]),
        errors,
      });
      setIsLoading(false);
    }

    void loadData();
  }, []);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Cargando indicadores...
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <ErrorPanel errors={data.errors} />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Acciones rapidas</h2>
            <p className="mt-1 text-sm text-slate-600">Lo mas frecuente queda arriba para operar rapido.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ActionLink href="/pedidos/nuevo" primary>Agregar venta</ActionLink>
            <ActionLink href="/almacen">Almacen</ActionLink>
            <ActionLink href="/pagos">Validar pagos</ActionLink>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pedidos pendientes" value={String(data.pedidosPendientes)} detail="Pedidos aun no atendidos" />
        <MetricCard label="Pedidos en preparacion" value={String(data.pedidosEnPreparacion)} detail="Ya descuentan stock por regla del sistema" />
        <MetricCard label="Listos para recoger" value={String(data.pedidosListos)} detail="Pendientes de entrega" />
        <MetricCard label="Ventas/pedidos del dia" value={String(data.ventasDia)} detail="Pedidos creados hoy" />
        <MetricCard label="Monto del dia" value={formatMoney(data.montoDia)} detail="Suma total de pedidos de hoy" />
        <MetricCard label="Descuentos de la semana" value={formatMoney(data.descuentoSemana)} detail="Control comercial semanal" />
        <MetricCard label="Personal activo" value={String(data.personalActivo)} detail="Usuarios activos" />
        <MetricCard label="Pagos por validar" value={String(data.pagosPorValidar)} detail="Capturas Yape pendientes" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <PedidosPanel pedidos={data.ultimosPedidos} title="Ultimos 5 pedidos" action={<Link href="/pedidos" className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Lista de pedidos</Link>} />
        <Panel title="Productos con stock bajo" action={<Link href="/almacen/transferencias" className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Transferencias</Link>}>
          <div className="space-y-2">
            {data.productosStockBajo.length > 0 ? (
              data.productosStockBajo.map((producto) => (
                <div key={producto.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">{producto.nombre_producto}</p>
                      <p className="mt-1 text-xs text-slate-500">{producto.codigo_interno}</p>
                    </div>
                    <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                      Stock {Number(producto.stock_actual ?? 0)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Minimo: {Number(producto.stock_minimo ?? 0)}</p>
                </div>
              ))
            ) : (
              <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">No hay productos por debajo de su stock minimo.</p>
            )}
          </div>
        </Panel>
      </section>

      <VencimientosPanel lotes={data.proximosVencer} />
    </div>
  );
}

function VencimientosPanel({ lotes }: { lotes: VistaLoteVencimiento[] }) {
  return (
    <Panel
      title="Lotes por vencer"
      action={
        <Link
          href="/almacen/vencimientos"
          className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Ver todos
        </Link>
      }
    >
      {lotes.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {lotes.map((lote) => {
            const ui = estadoVencimientoUI(lote.estado_vencimiento);
            return (
              <li
                key={lote.id}
                className={`flex items-center justify-between py-2 text-sm ${ui.row}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-950">{lote.nombre_producto}</p>
                  <p className="text-xs text-slate-500">
                    {lote.almacen_nombre} ·{" "}
                    {Number(lote.cantidad_actual).toFixed(2).replace(/\.00$/, "")}{" "}
                    {lote.unidad_base ?? "und"} · vence {formatFechaCorta(lote.fecha_vencimiento)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${ui.badge}`}
                >
                  {ui.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
          No hay lotes proximos a vencer. Todo bajo control.
        </p>
      )}
    </Panel>
  );
}

function WorkerDashboard() {
  const router = useRouter();
  const [data, setData] = useState<WorkerData>(emptyWorkerData);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingPedido, setIsUpdatingPedido] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const appUser = useMemo(() => getStoredAppUser(), []);

  async function loadData() {
    if (supabaseConfigError || !supabase || !appUser) {
      setData({
        ...emptyWorkerData,
        errors: [supabaseConfigError ?? "Debes iniciar sesion para ver tu dashboard."],
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const todayStart = startOfTodayIso();
    const tomorrowStart = startOfTomorrowIso();

    const [
      ultimos,
      ventasHoy,
      entregadosHoy,
      trabajador,
      stockRows,
      solicitudesRows,
      ventasHoyDetalle,
      pedidosDeudaRows,
      vencerRows,
    ] = await Promise.all([
      // Pedidos en estados activos (no entregados ni cancelados). El trabajador
      // necesita ver lo pendiente para atenderlo, no el historial.
      supabase
        .from("pedidos")
        .select("id,estado,fecha_recojo,hora_recojo,total,metodo_pago,created_at,clientes(nombres, telefono)")
        .in("estado", [
          "pendiente",
          "pago_enviado",
          "pago_validado",
          "en_preparacion",
          "listo_para_recoger",
        ])
        .order("fecha_recojo", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(30),
      supabase
        .from("pedidos")
        .select("*", { count: "exact", head: true })
        .eq("app_registrado_por_id", appUser.id)
        .gte("created_at", todayStart)
        .lt("created_at", tomorrowStart),
      supabase
        .from("pedidos")
        .select("*", { count: "exact", head: true })
        .eq("app_entregado_por_id", appUser.id)
        .gte("entregado_at", todayStart)
        .lt("entregado_at", tomorrowStart),
      supabase
        .from("app_usuarios")
        .select("pago_hora,horas_semana,gastos_semana")
        .eq("id", appUser.id)
        .maybeSingle(),
      // Productos activos con stock por almacen para detectar bajo en Tienda.
      supabase
        .from("productos")
        .select(
          "id,nombre_producto,stock_minimo,producto_base_id,producto_almacen(stock_actual,almacenes(nombre))",
        )
        .eq("activo", true)
        .is("producto_base_id", null)
        .limit(500),
      // Solicitudes de transferencia enviadas (esperando recibir).
      supabase
        .from("almacen_transferencias_solicitudes")
        .select("id, created_at, almacen_transferencias_items(id)")
        .eq("estado", "enviado")
        .order("created_at", { ascending: false })
        .limit(10),
      // Detalle de pedidos creados hoy para calcular top vendidos.
      supabase
        .from("detalle_pedido")
        .select(
          "cantidad, producto_id, productos!producto_id(nombre_producto), pedidos!inner(created_at, estado)",
        )
        .gte("pedidos.created_at", todayStart)
        .lt("pedidos.created_at", tomorrowStart)
        .neq("pedidos.estado", "cancelado")
        .limit(500),
      // Pedidos con deuda para agrupar por cliente.
      supabase
        .from("pedidos")
        .select("id, cliente_id, total, monto_a_cuenta, clientes(nombres, telefono)")
        .eq("estado_pago", "debe")
        .not("cliente_id", "is", null)
        .limit(500),
      // Lotes proximos a vencer (vencido/urgente/proximo).
      supabase
        .from("vista_lotes_vencimiento")
        .select("*")
        .in("estado_vencimiento", ["vencido", "urgente", "proximo"])
        .order("fecha_vencimiento", { ascending: true })
        .limit(8),
    ]);

    const errors = [
      ultimos.error ? `Ultimos pedidos: ${ultimos.error.message}` : null,
      ventasHoy.error ? `Ventas del dia: ${ventasHoy.error.message}` : null,
      entregadosHoy.error ? `Entregas del dia: ${entregadosHoy.error.message}` : null,
      trabajador.error ? `Pago semanal: ${trabajador.error.message}` : null,
      stockRows.error ? `Stock bajo: ${stockRows.error.message}` : null,
      solicitudesRows.error ? `Transferencias: ${solicitudesRows.error.message}` : null,
      ventasHoyDetalle.error ? `Top vendidos: ${ventasHoyDetalle.error.message}` : null,
      pedidosDeudaRows.error ? `Deudas: ${pedidosDeudaRows.error.message}` : null,
      vencerRows.error ? `Vencimientos: ${vencerRows.error.message}` : null,
    ].filter(Boolean) as string[];

    // Procesar stock bajo en Tienda.
    type StockProductoRow = {
      id: string;
      nombre_producto: string;
      stock_minimo: number | null;
      producto_almacen: Array<{
        stock_actual: number;
        almacenes: { nombre: string } | { nombre: string }[] | null;
      }>;
    };
    const stockBajoTienda: StockBajoTienda[] = ((stockRows.data ?? []) as unknown as StockProductoRow[])
      .map((row) => {
        const getNombre = (
          a: { nombre: string } | { nombre: string }[] | null,
        ) => (Array.isArray(a) ? a[0]?.nombre : a?.nombre) ?? "";
        const tienda = row.producto_almacen.find((s) => {
          const n = getNombre(s.almacenes).toLowerCase();
          return n === "tienda" || n === "negocio";
        });
        const casa = row.producto_almacen.find(
          (s) => getNombre(s.almacenes).toLowerCase() === "casa",
        );
        return {
          id: row.id,
          nombre_producto: row.nombre_producto,
          stock_tienda: Number(tienda?.stock_actual ?? 0),
          stock_casa: Number(casa?.stock_actual ?? 0),
          stock_minimo: Number(row.stock_minimo ?? 10),
        };
      })
      .filter((p) => p.stock_tienda <= p.stock_minimo)
      .sort((a, b) => a.stock_tienda - b.stock_tienda)
      .slice(0, 8);

    // Solicitudes de transferencia pendientes.
    const solicitudesPendientes: SolicitudPendiente[] = (
      (solicitudesRows.data ?? []) as Array<{
        id: string;
        created_at: string;
        almacen_transferencias_items: Array<{ id: string }> | null;
      }>
    ).map((s) => ({
      id: s.id,
      created_at: s.created_at,
      items_count: s.almacen_transferencias_items?.length ?? 0,
    }));

    // Top vendidos hoy (agrupar client-side).
    type DetalleVenta = {
      cantidad: number;
      producto_id: string;
      productos: { nombre_producto: string } | { nombre_producto: string }[] | null;
    };
    const ventasMap = new Map<string, { nombre: string; cantidad: number }>();
    for (const d of (ventasHoyDetalle.data ?? []) as unknown as DetalleVenta[]) {
      const nombre = Array.isArray(d.productos)
        ? d.productos[0]?.nombre_producto
        : d.productos?.nombre_producto;
      if (!d.producto_id || !nombre) continue;
      const prev = ventasMap.get(d.producto_id);
      ventasMap.set(d.producto_id, {
        nombre,
        cantidad: (prev?.cantidad ?? 0) + Number(d.cantidad ?? 0),
      });
    }
    const topVendidosHoy: TopVendido[] = Array.from(ventasMap.entries())
      .map(([producto_id, v]) => ({
        producto_id,
        nombre_producto: v.nombre,
        cantidad: v.cantidad,
      }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    // Clientes con deuda (agrupar pedidos).
    type PedidoDeudaRow = {
      id: string;
      cliente_id: string | null;
      total: number;
      monto_a_cuenta: number;
      clientes: { nombres: string; telefono: string | null } | { nombres: string; telefono: string | null }[] | null;
    };
    const deudaMap = new Map<string, ClienteDeuda>();
    for (const p of (pedidosDeudaRows.data ?? []) as unknown as PedidoDeudaRow[]) {
      if (!p.cliente_id) continue;
      const cliente = Array.isArray(p.clientes) ? p.clientes[0] : p.clientes;
      const saldo = Math.max(
        0,
        Number(p.total ?? 0) - Number(p.monto_a_cuenta ?? 0),
      );
      if (saldo <= 0) continue;
      const prev = deudaMap.get(p.cliente_id);
      deudaMap.set(p.cliente_id, {
        id: p.cliente_id,
        nombres: cliente?.nombres ?? "Sin nombre",
        telefono: cliente?.telefono ?? null,
        deuda_total: (prev?.deuda_total ?? 0) + saldo,
        cards_pendientes: (prev?.cards_pendientes ?? 0) + 1,
      });
    }
    const clientesConDeuda: ClienteDeuda[] = Array.from(deudaMap.values())
      .sort((a, b) => b.deuda_total - a.deuda_total)
      .slice(0, 8);

    const payroll = trabajador.data as Pick<AppUsuario, "pago_hora" | "horas_semana" | "gastos_semana"> | null;
    const pagoSemana =
      Number(payroll?.pago_hora ?? 0) * Number(payroll?.horas_semana ?? 0) -
      Number(payroll?.gastos_semana ?? 0);

    // Orden por urgencia: pendientes primero, luego pagos por validar, luego
    // en preparacion, finalmente listos para recoger.
    const orden: Record<PedidoEstado, number> = {
      pendiente: 0,
      pago_enviado: 1,
      pago_validado: 2,
      en_preparacion: 3,
      listo_para_recoger: 4,
      entregado: 5,
      cancelado: 6,
    };
    const pedidosOrdenados = ((ultimos.data ?? []) as unknown as PedidoResumen[]).sort(
      (a, b) => (orden[a.estado] ?? 99) - (orden[b.estado] ?? 99),
    );

    setData({
      ultimosPedidos: pedidosOrdenados,
      ventasHoy: ventasHoy.count ?? 0,
      entregadosHoy: entregadosHoy.count ?? 0,
      pagoSemana,
      trabajador: payroll,
      stockBajoTienda,
      solicitudesPendientes,
      topVendidosHoy,
      clientesConDeuda,
      proximosVencer: ((vencerRows.data ?? []) as VistaLoteVencimiento[]),
      errors,
    });
    setIsLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tomarPedido(pedido: PedidoResumen) {
    if (!supabase || !appUser) {
      return;
    }

    setIsUpdatingPedido(pedido.id);
    setMessage(null);
    const { error } = await supabase
      .from("pedidos")
      .update({
        estado: "en_preparacion",
        app_preparado_por_id: appUser.id,
        preparado_at: new Date().toISOString(),
      })
      .eq("id", pedido.id)
      .eq("estado", "pendiente");
    setIsUpdatingPedido(null);

    if (error) {
      setMessage(`No se pudo pasar a preparacion: ${error.message}`);
      return;
    }

    router.push(`/preparacion?pedido=${pedido.id}`);
  }

  if (isLoading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Cargando tus pedidos...
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <ErrorPanel errors={data.errors} />
      {message ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <ActionLink href="/pedidos/nuevo" primary>Agregar venta</ActionLink>
        <ActionLink href="/almacen/transferencias">Transferencias</ActionLink>
        <ActionLink href="/almacen/agregar-stock">Stock</ActionLink>
      </section>

      <Link
        href="/mis-datos"
        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <span>Mis datos (asistencia, descuentos, pagos)</span>
        <span aria-hidden="true">→</span>
      </Link>

      <Panel
        title="Pedidos por atender"
        action={
          <Link
            href="/preparacion"
            className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Ir a preparacion
          </Link>
        }
      >
        <div className="space-y-2">
          {data.ultimosPedidos.length > 0 ? (
            data.ultimosPedidos.map((pedido) => {
              const cliente = getCliente(pedido.clientes);
              const isPending = pedido.estado === "pendiente";
              const isListo = pedido.estado === "listo_para_recoger";
              const isEnPrep = pedido.estado === "en_preparacion";
              const isPagoEnviado = pedido.estado === "pago_enviado";
              const badgeClass = isPending
                ? "bg-amber-100 text-amber-800"
                : isPagoEnviado
                  ? "bg-orange-100 text-orange-800"
                  : isListo
                    ? "bg-emerald-100 text-emerald-800"
                    : isEnPrep
                      ? "bg-blue-100 text-blue-800"
                      : "bg-slate-100 text-slate-700";

              return (
                <article key={pedido.id} className="rounded-lg border border-slate-200 p-4 text-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">Pedido #{pedido.id.slice(0, 8)}</p>
                      <p className="mt-1 text-slate-600">
                        {cliente?.nombres ?? "Sin cliente"} - {cliente?.telefono ?? "Sin WhatsApp"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(pedido.fecha_recojo ?? pedido.created_at)} {formatTime(pedido.hora_recojo)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <p className="font-semibold text-slate-950">{formatMoney(pedido.total)}</p>
                      <span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-medium capitalize ${badgeClass}`}>
                        {formatEstado(pedido.estado)}
                      </span>
                      {isPagoEnviado ? (
                        <Link
                          href={`/pagos?pedido=${pedido.id}`}
                          className="inline-flex h-10 items-center rounded-md bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700"
                        >
                          Validar pago
                        </Link>
                      ) : isPending ? (
                        <button
                          type="button"
                          onClick={() => void tomarPedido(pedido)}
                          disabled={isUpdatingPedido === pedido.id}
                          className="h-10 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:bg-slate-300"
                        >
                          {isUpdatingPedido === pedido.id ? "Actualizando..." : "Tomar y preparar"}
                        </button>
                      ) : (
                        <Link
                          href={`/preparacion?pedido=${pedido.id}`}
                          className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {isListo ? "Entregar" : "Continuar"}
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
              No hay pedidos pendientes. Buen trabajo.
            </p>
          )}
        </div>
      </Panel>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Stock bajo en Tienda"
          action={
            data.stockBajoTienda.length > 0 ? (
              <Link
                href="/almacen/transferencias"
                className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Transferir desde Casa
              </Link>
            ) : null
          }
        >
          {data.stockBajoTienda.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {data.stockBajoTienda.map((prod) => (
                <li key={prod.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-950">{prod.nombre_producto}</p>
                    <p className="text-xs text-slate-500">
                      Tienda: {prod.stock_tienda} / min {prod.stock_minimo} - Casa: {prod.stock_casa}
                    </p>
                  </div>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      prod.stock_tienda <= 0
                        ? "bg-red-100 text-red-700"
                        : "bg-orange-100 text-orange-800"
                    }`}
                  >
                    {prod.stock_tienda <= 0 ? "Sin stock" : "Bajo"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
              Stock OK en Tienda.
            </p>
          )}
        </Panel>

        <VencimientosPanel lotes={data.proximosVencer} />

        <Panel
          title="Transferencias por recibir"
          action={
            data.solicitudesPendientes.length > 0 ? (
              <Link
                href="/almacen/transferencias"
                className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Confirmar
              </Link>
            ) : null
          }
        >
          {data.solicitudesPendientes.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {data.solicitudesPendientes.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-950">Solicitud #{s.id.slice(0, 8)}</p>
                    <p className="text-xs text-slate-500">{formatDate(s.created_at)}</p>
                  </div>
                  <span className="rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                    {s.items_count} item(s)
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
              No hay transferencias pendientes.
            </p>
          )}
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Mas vendidos hoy">
          {data.topVendidosHoy.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {data.topVendidosHoy.map((p, i) => (
                <li
                  key={p.producto_id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">
                      {i + 1}
                    </span>
                    <p className="font-medium text-slate-950">{p.nombre_producto}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">
                    {p.cantidad} und
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
              Aun no hay ventas hoy.
            </p>
          )}
        </Panel>

        <Panel
          title="Clientes con deuda"
          action={
            <Link
              href="/clientes"
              className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ver clientes
            </Link>
          }
        >
          {data.clientesConDeuda.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {data.clientesConDeuda.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <Link
                    href={`/clientes/${c.id}/pedidos`}
                    className="min-w-0 flex-1 pr-3 hover:underline"
                  >
                    <p className="truncate font-medium text-slate-950">{c.nombres}</p>
                    <p className="text-xs text-slate-500">
                      {c.cards_pendientes} pedido(s) - {c.telefono ?? "Sin WSP"}
                    </p>
                  </Link>
                  <span className="rounded-md bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-800">
                    {formatMoney(c.deuda_total)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
              Ningun cliente con saldo pendiente.
            </p>
          )}
        </Panel>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Ventas registradas hoy" value={String(data.ventasHoy)} detail="Pedidos creados con tu usuario" />
        <MetricCard label="Pedidos entregados hoy" value={String(data.entregadosHoy)} detail="Entregas marcadas por ti" />
        <MetricCard
          label="Pago estimado semanal"
          value={formatMoney(data.pagoSemana)}
          detail={`Hora ${formatMoney(Number(data.trabajador?.pago_hora ?? 0))} x ${Number(data.trabajador?.horas_semana ?? 0)} h - gastos`}
        />
      </section>
    </div>
  );
}

function PedidosPanel({ pedidos, title, action }: { pedidos: PedidoResumen[]; title: string; action?: React.ReactNode }) {
  return (
    <Panel title={title} action={action}>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3 font-medium">Pedido</th>
              <th className="px-3 py-3 font-medium">Cliente</th>
              <th className="px-3 py-3 font-medium">Recojo</th>
              <th className="px-3 py-3 font-medium">Pago</th>
              <th className="px-3 py-3 font-medium">Total</th>
              <th className="px-3 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pedidos.length > 0 ? (
              pedidos.map((pedido) => {
                const cliente = getCliente(pedido.clientes);

                return (
                  <tr key={pedido.id}>
                    <td className="px-3 py-3 font-medium text-slate-950">
                      <Link href={`/pedidos/${pedido.id}`} className="hover:underline">
                        #{pedido.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      <p>{cliente?.nombres ?? "Sin cliente"}</p>
                      <p className="text-xs text-slate-500">{cliente?.telefono ?? "Sin WhatsApp"}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatDate(pedido.fecha_recojo)} {formatTime(pedido.hora_recojo)}
                    </td>
                    <td className="px-3 py-3 text-slate-600 capitalize">{formatMetodo(pedido.metodo_pago)}</td>
                    <td className="px-3 py-3 font-medium text-slate-950">{formatMoney(pedido.total)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">
                        {formatEstado(pedido.estado)}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">Aun no hay pedidos registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ErrorPanel({ errors }: { errors: string[] }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p className="font-semibold">Algunas consultas no se pudieron cargar.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </section>
  );
}

function ActionLink({
  href,
  primary,
  children,
}: {
  href: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-semibold ${
        primary
          ? "bg-emerald-700 text-white hover:bg-emerald-800"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
