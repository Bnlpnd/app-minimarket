/**
 * Identidad de marca — Santa Ana minimarket.
 *
 * Isotipo: casa con olas y halo dorado sobre fondo azul noche, segun el
 * manual de marca. Se usa solo el isotipo en mobile y el isotipo + nombre
 * (Playfair Display) en desktop.
 *
 *   <BrandMark />            -> isotipo + nombre
 *   <BrandMark compact />    -> solo isotipo (mobile / colapsado)
 */

type BrandMarkProps = {
  /** Si true, muestra solo el isotipo (sin el nombre). */
  compact?: boolean;
  /** Tamano del isotipo en px. Default 40. */
  size?: number;
  className?: string;
};

export function BrandIso({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Santa Ana minimarket"
      className="shrink-0"
    >
      {/* Fondo azul noche con esquinas redondeadas */}
      <rect width="48" height="48" rx="12" fill="#0c234b" />
      {/* Halo dorado sobre la casa */}
      <path
        d="M14 17 a10 8 0 0 1 20 0"
        fill="none"
        stroke="#d7a33a"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* Techo de la casa */}
      <path d="M24 14.5 L33.5 23 L14.5 23 Z" fill="#ffffff" />
      {/* Cuerpo de la casa */}
      <rect x="18" y="23" width="12" height="9.5" fill="#ffffff" />
      {/* Puerta */}
      <rect x="22.4" y="26.5" width="3.2" height="6" rx="0.4" fill="#0c234b" />
      {/* Olas doradas */}
      <path
        d="M12.5 37.5 q3 -2.6 6 0 t6 0 t6 0 t6 0"
        fill="none"
        stroke="#d7a33a"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandMark({ compact = false, size = 40, className }: BrandMarkProps) {
  return (
    <span className={`flex items-center gap-3 ${className ?? ""}`}>
      <BrandIso size={size} />
      {compact ? null : (
        <span className="flex flex-col leading-none">
          <span className="font-display text-lg font-semibold tracking-tight text-santa-800">
            Santa Ana
          </span>
          <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-halo-600">
            minimarket
          </span>
        </span>
      )}
    </span>
  );
}
