/**
 * Paleta de colores del sistema — Minimarket Santa Ana
 *
 * Filosofia: tienda de abarrotes joven y cercana, pero seria.
 * Verde fresco (emerald) como color principal, indigo cariñoso para
 * la dimension "Casa", amarillo/naranja para warnings y acciones
 * llamativas, rose/red para errores y peligro.
 *
 * No uses colores hard-coded en tus componentes. Importa estos tokens
 * y aplicalos como className. Asi cuando refresquemos la paleta es un
 * solo cambio en este archivo.
 *
 * Convencion de naming:
 *   bg<X>     = fondo solido o suave
 *   text<X>   = color de texto
 *   border<X> = color de borde
 *   chip<X>   = badge/chip completo (bg + text + border)
 *   btn<X>    = boton (incluye hover)
 */

// ===== Colores semanticos =====

export const colors = {
  // Almacen Tienda (verde fresco — el lugar donde se vende)
  tienda: {
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    chipStrong: "bg-emerald-600 text-white",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    bgStrong: "bg-emerald-600",
    border: "border-emerald-200",
    borderStrong: "border-emerald-400",
    accent: "text-emerald-600",
  },

  // Almacen Casa (indigo carinoso — el lugar de reserva)
  casa: {
    chip: "bg-indigo-100 text-indigo-800 border-indigo-200",
    chipStrong: "bg-indigo-600 text-white",
    text: "text-indigo-700",
    bg: "bg-indigo-50",
    bgStrong: "bg-indigo-600",
    border: "border-indigo-200",
    borderStrong: "border-indigo-400",
    accent: "text-indigo-600",
  },

  // Stock niveles
  stockOk: {
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    text: "text-emerald-700",
  },
  stockBajo: {
    chip: "bg-amber-100 text-amber-800 border-amber-200",
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  stockSin: {
    chip: "bg-rose-100 text-rose-800 border-rose-200",
    text: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
  },

  // Vencimiento
  vencido: "bg-rose-100 text-rose-800 border-rose-200",
  vencimientoUrgente: "bg-orange-100 text-orange-800 border-orange-200",
  vencimientoProximo: "bg-amber-100 text-amber-800 border-amber-200",

  // Acciones / botones
  btnPrimary:
    "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300",
  btnSecondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100",
  btnDanger:
    "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 active:bg-rose-100 disabled:opacity-50",
  btnDangerSolid:
    "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800",
  btnAccent:
    "bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700",

  // Feedback (mensajes)
  feedbackSuccess: "border-emerald-200 bg-emerald-50 text-emerald-800",
  feedbackError: "border-rose-200 bg-rose-50 text-rose-800",
  feedbackWarning: "border-amber-200 bg-amber-50 text-amber-800",
  feedbackInfo: "border-sky-200 bg-sky-50 text-sky-800",

  // Paneles / fondos
  panelBg: "bg-white",
  panelBorder: "border-slate-200",
  pageBg: "bg-slate-50",

  // Headers de tabla
  tableHeader: "bg-slate-50 text-slate-600",
} as const;

/** Resuelve color por nombre de almacen (case-insensitive, tolera "Negocio"). */
export function colorsForAlmacen(nombre: string | null | undefined) {
  const n = (nombre ?? "").toLowerCase();
  if (n === "casa") return colors.casa;
  return colors.tienda;
}

/** Devuelve clases de chip segun el nivel de stock vs minimo. */
export function stockChipClass(
  actual: number,
  minimo: number,
): string {
  if (actual <= 0) return colors.stockSin.chip;
  if (actual <= minimo) return colors.stockBajo.chip;
  return colors.stockOk.chip;
}
