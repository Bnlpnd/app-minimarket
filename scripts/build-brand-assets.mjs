// Genera versiones optimizadas del logo Santa Ana a partir de los PNG
// originales en public/brand/. Recorta el margen blanco, redimensiona y
// comprime con paleta. Reejecutable: `node scripts/build-brand-assets.mjs`.
import sharp from "sharp";
import path from "node:path";

const DIR = path.resolve(process.cwd(), "public/brand");

// [origen, destino, anchoMax, opciones]
const JOBS = [
  // Isotipo cuadrado (recuadro azul noche) -> badge e icono de app
  ["iconcolor.png", "iso-badge.png", 160],
  // Casa azul sola (sin recuadro)
  ["isologocolor.png", "isotipo.png", 256],
  // Lockup horizontal (isotipo + nombre al lado)
  ["logocompleto.png", "horizontal.png", 720],
  // Lockup vertical (isotipo arriba + nombre debajo)
  ["logocolor.png", "vertical.png", 540],
  // Lockup en grises
  ["logogris.png", "gris.png", 540],
  // Mascota "guiño" (sin la ñ en el nombre de archivo)
  ["logoguino.png", "guino.png", 320],
];

async function run() {
  for (const [src, out, width] of JOBS) {
    const before = path.join(DIR, src);
    const after = path.join(DIR, out);
    await sharp(before)
      .trim({ threshold: 12 })
      .resize({ width, withoutEnlargement: true })
      .png({ compressionLevel: 9, quality: 82, palette: true })
      .toFile(after);
    const meta = await sharp(after).metadata();
    console.log(`${src} -> brand/${out} (${meta.width}x${meta.height})`);
  }

  // Favicon: recuadro azul recortado a cuadrado 256x256.
  const icon = path.resolve(process.cwd(), "app/icon.png");
  await sharp(path.join(DIR, "iconcolor.png"))
    .trim({ threshold: 12 })
    .resize({ width: 256, height: 256, fit: "cover" })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(icon);
  console.log("iconcolor.png -> app/icon.png (256x256)");

  // apple-touch-icon 180x180
  const apple = path.resolve(process.cwd(), "app/apple-icon.png");
  await sharp(path.join(DIR, "iconcolor.png"))
    .trim({ threshold: 12 })
    .resize({ width: 180, height: 180, fit: "cover" })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(apple);
  console.log("iconcolor.png -> app/apple-icon.png (180x180)");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
