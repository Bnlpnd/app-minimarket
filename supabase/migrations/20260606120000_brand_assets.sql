-- =====================================================================
-- Catalogo de identidad de marca: Santa Ana minimarket
-- Guarda las versiones del logo/isotipo (SVG vectorial) para usarlas
-- segun el contexto (favicon, sidebar, login, impresion, etc).
-- Las versiones son recreaciones vectoriales fieles del manual de marca:
-- casa-bolsa con olas, halo dorado y monograma "SA" serif.
-- =====================================================================

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  descripcion text,
  uso text,
  formato text not null default 'svg',
  contenido text not null,
  actualizado_at timestamptz not null default now()
);

comment on table public.brand_assets is
  'Versiones del logo/isotipo de Santa Ana minimarket (SVG) para uso por contexto.';

grant select on public.brand_assets to anon, authenticated;

insert into public.brand_assets (slug, nombre, descripcion, uso, contenido) values
(
  'app-icon',
  'App icon',
  'Isotipo sobre recuadro azul noche redondeado, casa blanca, olas y SA en azul, halo dorado.',
  'favicon, icono de app/PWA, avatares',
  $svg$<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Santa Ana minimarket"><rect width="120" height="120" rx="26" fill="#0c234b"/><g transform="rotate(-7 60 13)"><ellipse cx="60" cy="13" rx="25" ry="7.5" fill="none" stroke="#d7a33a" stroke-width="4"/></g><path d="M60 20 L94 48 L94 92 Q94 106 80 106 L40 106 Q26 106 26 92 L26 48 Z" fill="#ffffff"/><path d="M26 56 q5.67 -7.5 11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0" fill="none" stroke="#143a73" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><text x="49" y="99" text-anchor="middle" font-family="Georgia, serif" font-size="62" font-weight="600" fill="#143a73">S</text><text x="76" y="103" text-anchor="middle" font-family="Georgia, serif" font-size="42" font-weight="600" fill="#143a73">A</text></svg>$svg$
),
(
  'isotipo-color',
  'Isotipo a color',
  'Casa azul con olas y SA en blanco, halo dorado, fondo transparente. Para fondos claros.',
  'sidebar, header, login, documentos',
  $svg$<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Santa Ana minimarket"><g transform="rotate(-7 60 13)"><ellipse cx="60" cy="13" rx="25" ry="7.5" fill="none" stroke="#d7a33a" stroke-width="4"/></g><path d="M60 20 L94 48 L94 92 Q94 106 80 106 L40 106 Q26 106 26 92 L26 48 Z" fill="#143a73"/><path d="M26 56 q5.67 -7.5 11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><text x="49" y="99" text-anchor="middle" font-family="Georgia, serif" font-size="62" font-weight="600" fill="#ffffff">S</text><text x="76" y="103" text-anchor="middle" font-family="Georgia, serif" font-size="42" font-weight="600" fill="#ffffff">A</text></svg>$svg$
),
(
  'isotipo-mono',
  'Isotipo monocromo',
  'Version a un solo color (carbon) con olas y SA en blanco. Para impresion / sellos.',
  'impresion B/N, sellos, marcas de agua',
  $svg$<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Santa Ana minimarket"><g transform="rotate(-7 60 13)"><ellipse cx="60" cy="13" rx="25" ry="7.5" fill="none" stroke="#1f2430" stroke-width="4"/></g><path d="M60 20 L94 48 L94 92 Q94 106 80 106 L40 106 Q26 106 26 92 L26 48 Z" fill="#1f2430"/><path d="M26 56 q5.67 -7.5 11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><text x="49" y="99" text-anchor="middle" font-family="Georgia, serif" font-size="62" font-weight="600" fill="#ffffff">S</text><text x="76" y="103" text-anchor="middle" font-family="Georgia, serif" font-size="42" font-weight="600" fill="#ffffff">A</text></svg>$svg$
),
(
  'horizontal',
  'Lockup horizontal',
  'Isotipo a color a la izquierda y nombre "Santa Ana / MINIMARKET" a la derecha.',
  'encabezados anchos, membretes, firmas de correo',
  $svg$<svg xmlns="http://www.w3.org/2000/svg" width="470" height="140" viewBox="0 0 470 140" role="img" aria-label="Santa Ana minimarket"><g transform="translate(8 10)"><g transform="rotate(-7 60 13)"><ellipse cx="60" cy="13" rx="25" ry="7.5" fill="none" stroke="#d7a33a" stroke-width="4"/></g><path d="M60 20 L94 48 L94 92 Q94 106 80 106 L40 106 Q26 106 26 92 L26 48 Z" fill="#143a73"/><path d="M26 56 q5.67 -7.5 11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><text x="49" y="99" text-anchor="middle" font-family="Georgia, serif" font-size="62" font-weight="600" fill="#ffffff">S</text><text x="76" y="103" text-anchor="middle" font-family="Georgia, serif" font-size="42" font-weight="600" fill="#ffffff">A</text></g><text x="150" y="72" font-family="Georgia, serif" font-size="56" font-weight="600" fill="#143a73">Santa Ana</text><line x1="152" y1="98" x2="176" y2="98" stroke="#d7a33a" stroke-width="2.4"/><text x="186" y="105" font-family="Arial, sans-serif" font-size="18" letter-spacing="6" font-weight="600" fill="#143a73">MINIMARKET</text><line x1="404" y1="98" x2="428" y2="98" stroke="#d7a33a" stroke-width="2.4"/></svg>$svg$
),
(
  'vertical',
  'Lockup vertical',
  'Isotipo a color arriba y nombre "Santa Ana / MINIMARKET" centrado debajo.',
  'piezas cuadradas, redes sociales, posters',
  $svg$<svg xmlns="http://www.w3.org/2000/svg" width="300" height="360" viewBox="0 0 300 360" role="img" aria-label="Santa Ana minimarket"><g transform="translate(90 14)"><g transform="rotate(-7 60 13)"><ellipse cx="60" cy="13" rx="25" ry="7.5" fill="none" stroke="#d7a33a" stroke-width="4"/></g><path d="M60 20 L94 48 L94 92 Q94 106 80 106 L40 106 Q26 106 26 92 L26 48 Z" fill="#143a73"/><path d="M26 56 q5.67 -7.5 11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0 t11.33 0" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><text x="49" y="99" text-anchor="middle" font-family="Georgia, serif" font-size="62" font-weight="600" fill="#ffffff">S</text><text x="76" y="103" text-anchor="middle" font-family="Georgia, serif" font-size="42" font-weight="600" fill="#ffffff">A</text></g><text x="150" y="220" text-anchor="middle" font-family="Georgia, serif" font-size="58" font-weight="600" fill="#143a73">Santa Ana</text><line x1="64" y1="250" x2="92" y2="250" stroke="#d7a33a" stroke-width="2.6"/><text x="150" y="258" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" letter-spacing="7" font-weight="600" fill="#143a73">MINIMARKET</text><line x1="208" y1="250" x2="236" y2="250" stroke="#d7a33a" stroke-width="2.6"/></svg>$svg$
)
on conflict (slug) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  uso = excluded.uso,
  contenido = excluded.contenido,
  actualizado_at = now();
