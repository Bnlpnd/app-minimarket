/**
 * Identidad de marca — Santa Ana minimarket.
 *
 * Isotipo recreado en vector (SVG) a partir del manual de marca: casa-bolsa
 * con olas (toldo de mercado), halo dorado y monograma "SA" en serif.
 *
 * Variantes (`tone`):
 *   - "color"  : casa azul, olas y SA en blanco, halo dorado. Para fondos claros.
 *   - "onDark" : recuadro azul noche, casa blanca, olas y SA azul, halo dorado.
 *                Es la version "app icon".
 *   - "mono"   : un solo color (currentColor) para impresiones / sellos.
 *
 * Uso:
 *   <BrandMark />                 -> isotipo + nombre (lockup horizontal)
 *   <BrandMark compact />         -> solo isotipo
 *   <BrandIso size={40} />        -> solo isotipo
 *   <BrandIso tone="onDark" />    -> app icon
 */

const AZUL = "#143a73"; // Azul Santa Ana
const NOCHE = "#0c234b"; // Azul Noche
const DORADO = "#d7a33a"; // Dorado Halo
const BLANCO = "#ffffff";

type Tone = "color" | "onDark" | "mono";

type IsoProps = {
  /** Tamano del isotipo en px. Default 40. */
  size?: number;
  tone?: Tone;
  className?: string;
};

function palette(tone: Tone) {
  if (tone === "onDark") {
    return { bg: NOCHE, casa: BLANCO, trazos: AZUL, halo: DORADO };
  }
  if (tone === "mono") {
    return { bg: "transparent", casa: "currentColor", trazos: BLANCO, halo: "currentColor" };
  }
  return { bg: "transparent", casa: AZUL, trazos: BLANCO, halo: DORADO };
}

export function BrandIso({ size = 40, tone = "color", className }: IsoProps) {
  const c = palette(tone);
  const serif = { fontFamily: "var(--font-playfair), Georgia, serif" } as const;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Santa Ana minimarket"
      className={`shrink-0 ${className ?? ""}`}
    >
      {/* Fondo (solo en app icon) */}
      {tone === "onDark" ? <rect width="120" height="120" rx="26" fill={c.bg} /> : null}

      {/* Halo dorado detras del techo */}
      <g transform="rotate(-7 60 13)">
        <ellipse
          cx="60"
          cy="13"
          rx="25"
          ry="7.5"
          fill="none"
          stroke={c.halo}
          strokeWidth="4"
        />
      </g>

      {/* Casa-bolsa */}
      <path
        d="M60 20 L94 48 L94 92 Q94 106 80 106 L40 106 Q26 106 26 92 L26 48 Z"
        fill={c.casa}
      />

      {/* Olas / toldo */}
      <path
        d="M26 56 q5.67 -7.5 11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0"
        fill="none"
        stroke={c.trazos}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Monograma SA */}
      <text
        x="49"
        y="99"
        textAnchor="middle"
        style={serif}
        fontSize="62"
        fontWeight={600}
        fill={c.trazos}
      >
        S
      </text>
      <text
        x="76"
        y="103"
        textAnchor="middle"
        style={serif}
        fontSize="42"
        fontWeight={600}
        fill={c.trazos}
      >
        A
      </text>
    </svg>
  );
}

type BrandMarkProps = {
  /** Si true, muestra solo el isotipo (sin el nombre). */
  compact?: boolean;
  /** Tamano del isotipo en px. Default 40. */
  size?: number;
  tone?: Tone;
  className?: string;
};

export function BrandMark({ compact = false, size = 40, tone = "color", className }: BrandMarkProps) {
  return (
    <span className={`flex items-center gap-3 ${className ?? ""}`}>
      <BrandIso size={size} tone={tone} />
      {compact ? null : (
        <span className="flex flex-col leading-none">
          <span className="font-display text-xl font-semibold tracking-tight text-santa-800">
            Santa Ana
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <span aria-hidden="true" className="h-px w-3 bg-halo-500" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-santa-700">
              Minimarket
            </span>
            <span aria-hidden="true" className="h-px w-3 bg-halo-500" />
          </span>
        </span>
      )}
    </span>
  );
}
