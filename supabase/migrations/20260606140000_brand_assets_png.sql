-- =====================================================================
-- Reemplaza las recreaciones SVG por los logos oficiales (PNG) de
-- Santa Ana minimarket, alojados en /public/brand y servidos por la app.
-- Las versiones optimizadas se generan con scripts/build-brand-assets.mjs.
-- =====================================================================

-- Quitar slugs antiguos de la primera version (SVG recreado)
delete from public.brand_assets where slug in ('isotipo-color', 'isotipo-mono');

insert into public.brand_assets (slug, nombre, descripcion, uso, formato, contenido) values
  ('app-icon', 'App icon', 'Isotipo dentro del recuadro azul noche (esquinas redondeadas).', 'favicon, badges, header mobile', 'png', '/brand/iso-badge.png'),
  ('isotipo', 'Isotipo', 'Casa azul con halo dorado, sin recuadro.', 'marca sola sobre fondo claro', 'png', '/brand/isotipo.png'),
  ('horizontal', 'Lockup horizontal', 'Isotipo + nombre "Santa Ana / MINIMARKET" al costado.', 'sidebar, encabezados anchos, membretes', 'png', '/brand/horizontal.png'),
  ('vertical', 'Lockup vertical', 'Isotipo arriba + nombre "Santa Ana / MINIMARKET" debajo.', 'login, piezas cuadradas, redes', 'png', '/brand/vertical.png'),
  ('gris', 'Lockup en grises', 'Version monocroma en grises del lockup vertical.', 'impresion B/N, fondos especiales', 'png', '/brand/gris.png'),
  ('guino', 'Mascota guiño', 'Casa con cara guiñando un ojo.', 'estados vacios, 404, stickers', 'png', '/brand/guino.png')
on conflict (slug) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  uso = excluded.uso,
  formato = excluded.formato,
  contenido = excluded.contenido,
  actualizado_at = now();
