/**
 * Paleta de colores del sistema — Santa Ana minimarket
 *
 * Filosofia: tienda de abarrotes cercana, ordenada y confiable.
 * Sigue el manual de marca: azul Santa Ana (santa-*) como color
 * principal, dorado Halo (halo-*) como acento. El almacen "Tienda"
 * usa el azul institucional y "Casa" el dorado para distinguirlos.
 * Amarillo/naranja para warnings, rose/red para errores y peligro.
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
  // Almacen Tienda (azul Santa Ana — el lugar donde se vende)
  tienda: {
    chip: "bg-santa-100 text-santa-800 border-santa-200",
    chipStrong: "bg-santa-600 text-white",
    text: "text-santa-700",
    bg: "bg-santa-50",
    bgStrong: "bg-santa-600",
    border: "border-santa-200",
    borderStrong: "border-santa-400",
    accent: "text-santa-600",
  },

  // Almacen Casa (dorado Halo — el lugar de reserva)
  casa: {
    chip: "bg-halo-100 text-halo-800 border-halo-200",
    chipStrong: "bg-halo-700 text-white",
    text: "text-halo-700",
    bg: "bg-halo-50",
    bgStrong: "bg-halo-600",
    border: "border-halo-200",
    borderStrong: "border-halo-400",
    accent: "text-halo-600",
  },

  // Stock niveles
  stockOk: {
    chip: "bg-santa-100 text-santa-800 border-santa-200",
    text: "text-santa-700",
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
