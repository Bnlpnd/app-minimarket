/* eslint-disable @next/next/no-img-element */

/**
 * Identidad de marca — Santa Ana minimarket.
 *
 * Usa los logos oficiales (PNG) optimizados en public/brand/, generados con
 * `node scripts/build-brand-assets.mjs` a partir de los originales.
 *
 *   <BrandIso size={40} />              -> isotipo cuadrado (recuadro azul)
 *   <BrandMark variant="horizontal" /> -> isotipo + nombre al lado (sidebar)
 *   <BrandMark variant="vertical" />   -> isotipo + nombre debajo (login)
 *   <BrandMark variant="isotipo" />    -> solo la casa (sin recuadro)
 *
 * Las superficies de marca (sidebar, header, login) son blancas, por eso los
 * PNG con fondo blanco encajan sin halos. El badge se recorta con border-radius
 * para ocultar las esquinas blancas del recuadro.
 */

type IsoProps = {
  /** Lado del badge en px. Default 40. */
  size?: number;
  className?: string;
};

export function BrandIso({ size = 40, className }: IsoProps) {
  return (
    <img
      src="/brand/iso-badge.png"
      alt="Santa Ana minimarket"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-[22%] ${className ?? ""}`}
    />
  );
}

type Variant = "horizontal" | "vertical" | "isotipo";

const ASSETS: Record<Variant, { src: string; w: number; h: number }> = {
  horizontal: { src: "/brand/horizontal.png", w: 720, h: 233 },
  vertical: { src: "/brand/vertical.png", w: 540, h: 541 },
  isotipo: { src: "/brand/isotipo.png", w: 256, h: 313 },
};

type BrandMarkProps = {
  variant?: Variant;
  className?: string;
  alt?: string;
};

export function BrandMark({
  variant = "horizontal",
  className,
  alt = "Santa Ana minimarket",
}: BrandMarkProps) {
  const a = ASSETS[variant];
  return (
    <img
      src={a.src}
      alt={alt}
      width={a.w}
      height={a.h}
      className={className}
    />
  );
}
