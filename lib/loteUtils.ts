import type {
  LoteEstadoVencimiento,
  ProductoLoteOrigen,
  VistaLoteVencimiento,
} from "@/types/database";

/**
 * Calcula el estado de vencimiento de un lote en runtime.
 * La vista_lotes_vencimiento ya lo trae calculado, pero esto sirve para
 * recalcular en cliente al editar fechas.
 */
export function calcularEstadoVencimiento(
  fechaVencimiento: string | null | undefined,
  hoy: Date = new Date(),
): LoteEstadoVencimiento {
  if (!fechaVencimiento) return null;
  const vto = parseDateOnly(fechaVencimiento);
  const ref = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const diffDias = Math.floor((vto.getTime() - ref.getTime()) / 86400000);
  if (diffDias < 0) return "vencido";
  if (diffDias <= 7) return "urgente";
  if (diffDias <= 30) return "proximo";
  return "ok";
}

/**
 * Parsea 'YYYY-MM-DD' en hora local (no UTC). Evita el bug clasico de
 * new Date('2025-12-31') que devuelve 2025-12-30 en zonas con offset negativo.
 */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Formatea YYYY-MM-DD a DD/MM/YYYY para la UI. */
export function formatFechaCorta(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

/** Devuelve la fecha de hoy en YYYY-MM-DD usando componentes locales. */
export function fechaHoyInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Clases tailwind para colorear chips/lineas segun estado.
 * Usado en widget dashboard y pagina /vencimientos.
 */
export function estadoVencimientoUI(estado: LoteEstadoVencimiento) {
  switch (estado) {
    case "vencido":
      return {
        label: "Vencido",
        badge: "bg-red-100 text-red-700 border-red-200",
        row: "bg-red-50/50",
      };
    case "urgente":
      return {
        label: "≤ 7 dias",
        badge: "bg-orange-100 text-orange-700 border-orange-200",
        row: "bg-orange-50/50",
      };
    case "proximo":
      return {
        label: "≤ 30 dias",
        badge: "bg-amber-100 text-amber-700 border-amber-200",
        row: "",
      };
    case "ok":
      return {
        label: "OK",
        badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
        row: "",
      };
    default:
      return {
        label: "Sin vto",
        badge: "bg-slate-100 text-slate-600 border-slate-200",
        row: "",
      };
  }
}

/**
 * Etiqueta corta para mostrar origen del lote.
 */
export function labelOrigenLote(origen: ProductoLoteOrigen): string {
  switch (origen) {
    case "inicial":
      return "Stock inicial";
    case "compra":
      return "Compra";
    case "transferencia":
      return "Transferencia";
    case "ajuste":
      return "Ajuste";
    default:
      return origen;
  }
}

/**
 * Suma cantidad_actual de lotes activos por producto+almacen.
 * Util para conciliar: si suma_lotes != stock_actual, hay diferencia
 * (no es bug; pasa cuando hay stock sin lote o ajustes manuales).
 */
export function sumarLotesPorProductoAlmacen(
  lotes: VistaLoteVencimiento[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const lote of lotes) {
    const key = `${lote.producto_id}::${lote.almacen_id}`;
    map.set(key, (map.get(key) ?? 0) + Number(lote.cantidad_actual));
  }
  return map;
}
