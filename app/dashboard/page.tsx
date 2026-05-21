import Link from "next/link";
import { Layout } from "@/components/Layout";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type { Cliente, PagoMetodo, Pedido, PedidoEstado, Producto } from "@/types/database";

export const dynamic = "force-dynamic";

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

type DashboardData = {
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
  errors: string[];
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
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date.toISOString();
}

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  return new Date(value).toLocaleDateString("es-PE");
}

function formatTime(value: string | null) {
  return value ? value.slice(0, 5) : "Sin hora";
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

async function getPedidoCount(filters: {
  estado?: PedidoEstado;
  createdAtGte?: string;
  createdAtLt?: string;
}) {
  if (!supabase) {
    return { count: 0, error: "No hay conexion configurada a Supabase." };
  }

  let query = supabase.from("pedidos").select("*", { count: "exact", head: true });

  if (filters.estado) {
    query = query.eq("estado", filters.estado);
  }

  if (filters.createdAtGte) {
    query = query.gte("created_at", filters.createdAtGte);
  }

  if (filters.createdAtLt) {
    query = query.lt("created_at", filters.createdAtLt);
  }

  const { count, error } = await query;

  return {
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

async function getPersonalActivoCount() {
  if (!supabase) {
    return { count: 0, error: "No hay conexion configurada a Supabase." };
  }

  const { count, error } = await supabase
    .from("usuarios_perfil")
    .select("*", { count: "exact", head: true })
    .eq("activo", true);

  return {
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

async function loadDashboardData(): Promise<DashboardData> {
  const empty: DashboardData = {
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
    errors: [],
  };

  if (supabaseConfigError || !supabase) {
    return {
      ...empty,
      errors: [supabaseConfigError ?? "No hay conexion configurada a Supabase."],
    };
  }

  const todayStart = startOfTodayIso();
  const tomorrowStart = startOfTomorrowIso();
  const weekStart = startOfWeekIso();

  const [
    pendientesResult,
    preparacionResult,
    listosResult,
    ventasDiaResult,
    pedidosDiaResult,
    descuentosSemanaResult,
    personalResult,
    pagosPorValidarResult,
    ultimosPedidosResult,
    productosResult,
  ] = await Promise.all([
    getPedidoCount({ estado: "pendiente" }),
    getPedidoCount({ estado: "en_preparacion" }),
    getPedidoCount({ estado: "listo_para_recoger" }),
    getPedidoCount({ createdAtGte: todayStart, createdAtLt: tomorrowStart }),
    supabase
      .from("pedidos")
      .select("total")
      .gte("created_at", todayStart)
      .lt("created_at", tomorrowStart),
    supabase.from("pedidos").select("descuento").gte("created_at", weekStart),
    getPersonalActivoCount(),
    getPedidoCount({ estado: "pago_enviado" }),
    supabase
      .from("pedidos")
      .select(
        `
          id,
          estado,
          fecha_recojo,
          hora_recojo,
          total,
          metodo_pago,
          created_at,
          clientes(nombres, telefono)
        `,
      )
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("productos")
      .select("id,codigo_interno,nombre_producto,stock_actual,stock_minimo")
      .eq("activo", true)
      .not("stock_minimo", "is", null)
      .range(0, 2499),
  ]);

  const errors = [
    pendientesResult.error ? `Pendientes: ${pendientesResult.error}` : null,
    preparacionResult.error ? `En preparacion: ${preparacionResult.error}` : null,
    listosResult.error ? `Listos: ${listosResult.error}` : null,
    ventasDiaResult.error ? `Ventas del dia: ${ventasDiaResult.error}` : null,
    pedidosDiaResult.error ? `Monto del dia: ${pedidosDiaResult.error.message}` : null,
    descuentosSemanaResult.error
      ? `Descuentos de la semana: ${descuentosSemanaResult.error.message}`
      : null,
    personalResult.error ? `Personal: ${personalResult.error}` : null,
    pagosPorValidarResult.error
      ? `Pagos por validar: ${pagosPorValidarResult.error}`
      : null,
    ultimosPedidosResult.error
      ? `Ultimos pedidos: ${ultimosPedidosResult.error.message}`
      : null,
    productosResult.error ? `Stock bajo: ${productosResult.error.message}` : null,
  ].filter(Boolean) as string[];

  const montoDia = ((pedidosDiaResult.data ?? []) as Pick<Pedido, "total">[])
    .reduce((sum, pedido) => sum + Number(pedido.total ?? 0), 0);
  const descuentoSemana = (
    (descuentosSemanaResult.data ?? []) as Pick<Pedido, "descuento">[]
  ).reduce((sum, pedido) => sum + Number(pedido.descuento ?? 0), 0);
  const productosStockBajo = (
    (productosResult.data ?? []) as ProductoStockBajo[]
  )
    .filter((producto) => {
      const stockActual = Number(producto.stock_actual ?? 0);
      const stockMinimo = Number(producto.stock_minimo ?? 0);
      return stockActual <= stockMinimo;
    })
    .sort((a, b) => Number(a.stock_actual ?? 0) - Number(b.stock_actual ?? 0))
    .slice(0, 8);

  return {
    pedidosPendientes: pendientesResult.count,
    pedidosEnPreparacion: preparacionResult.count,
    pedidosListos: listosResult.count,
    ventasDia: ventasDiaResult.count,
    montoDia,
    descuentoSemana,
    personalActivo: personalResult.count,
    pagosPorValidar: pagosPorValidarResult.count,
    ultimosPedidos: (ultimosPedidosResult.data ?? []) as unknown as PedidoResumen[],
    productosStockBajo,
    errors,
  };
}

export default async function DashboardPage() {
  const data = await loadDashboardData();

  return (
    <Layout
      title="Dashboard"
      description="Resumen operativo de pedidos, pagos, personal y stock."
    >
      <div className="space-y-5">
        {data.errors.length > 0 ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">Algunas consultas no se pudieron cargar.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {data.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Acciones rapidas
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Lo mas frecuente queda arriba para operar rapido en tienda.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/pedidos/nuevo"
                className="inline-flex h-11 items-center justify-center rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                Agregar nuevo pedido
              </Link>
              <Link
                href="/compras/nueva"
                className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Agregar boleta de compra
              </Link>
              <Link
                href="/pagos"
                className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Validar pagos
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Pedidos pendientes"
            value={String(data.pedidosPendientes)}
            detail="Pedidos aun no validados o atendidos"
          />
          <MetricCard
            label="Pedidos en preparacion"
            value={String(data.pedidosEnPreparacion)}
            detail="Ya descuentan stock por regla del sistema"
          />
          <MetricCard
            label="Listos para recoger"
            value={String(data.pedidosListos)}
            detail="Pendientes de entrega"
          />
          <MetricCard
            label="Ventas/pedidos del dia"
            value={String(data.ventasDia)}
            detail="Pedidos creados hoy"
          />
          <MetricCard
            label="Monto del dia"
            value={formatMoney(data.montoDia)}
            detail="Suma total de pedidos de hoy"
          />
          <MetricCard
            label="Descuentos de la semana"
            value={formatMoney(data.descuentoSemana)}
            detail="Control comercial semanal"
          />
          <MetricCard
            label="Personal activo"
            value={String(data.personalActivo)}
            detail="Usuarios registrados activos"
          />
          <MetricCard
            label="Pagos por validar"
            value={String(data.pagosPorValidar)}
            detail="Capturas Yape pendientes"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel title="Ultimos 5 pedidos">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
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
                  {data.ultimosPedidos.length > 0 ? (
                    data.ultimosPedidos.map((pedido) => {
                      const cliente = getCliente(pedido.clientes);

                      return (
                          <tr key={pedido.id}>
                            <td className="px-3 py-3 font-medium text-slate-950">
                              <Link
                                href={`/pedidos/${pedido.id}`}
                                className="hover:underline"
                              >
                                #{pedido.id.slice(0, 8)}
                              </Link>
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              <p>{cliente?.nombres ?? "Sin cliente"}</p>
                              <p className="text-xs text-slate-500">
                                {cliente?.telefono ?? "Sin WhatsApp"}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              {formatDate(pedido.fecha_recojo)}{" "}
                              {formatTime(pedido.hora_recojo)}
                            </td>
                            <td className="px-3 py-3 text-slate-600 capitalize">
                              {formatMetodo(pedido.metodo_pago)}
                            </td>
                            <td className="px-3 py-3 font-medium text-slate-950">
                              {formatMoney(pedido.total)}
                            </td>
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
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                        Aun no hay pedidos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Productos con stock bajo">
            <div className="space-y-2">
              {data.productosStockBajo.length > 0 ? (
                data.productosStockBajo.map((producto) => (
                  <div
                    key={producto.id}
                    className="rounded-md border border-slate-200 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">
                          {producto.nombre_producto}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {producto.codigo_interno}
                        </p>
                      </div>
                      <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                        Stock {Number(producto.stock_actual ?? 0)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Minimo: {Number(producto.stock_minimo ?? 0)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                  No hay productos por debajo de su stock minimo.
                </p>
              )}
            </div>
          </Panel>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            Siguiente mejora recomendada
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Para que la boleta de compras afecte stock y costos, conviene crear
            un modulo de compras con proveedor, comprobante, detalle de productos
            y movimientos de stock de entrada. El boton ya queda listo como acceso.
          </p>
        </section>
      </div>
    </Layout>
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
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
