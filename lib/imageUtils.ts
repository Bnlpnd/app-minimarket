/**
 * Comprime una imagen en el navegador hasta que pese <= maxSizeBytes.
 * Estrategia:
 *   1) Redimensiona si supera maxWidth/maxHeight (mantiene aspect ratio).
 *   2) Re-encodea como JPEG bajando calidad iterativamente (0.85 → 0.2).
 *   3) Si aun no cabe, reduce dimensiones al 70% y reintenta una vez.
 * Devuelve un File JPEG nuevo (incluso si el original era PNG/WebP).
 * Si el archivo original ya cumple el tamano, lo retorna tal cual.
 */
export async function compressImage(
  file: File,
  options: {
    maxSizeBytes?: number;
    maxWidth?: number;
    maxHeight?: number;
    initialQuality?: number;
  } = {},
): Promise<File> {
  const {
    maxSizeBytes = 1024 * 1024, // 1 MB
    maxWidth = 1920,
    maxHeight = 1920,
    initialQuality = 0.85,
  } = options;

  if (file.size <= maxSizeBytes) return file;

  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el canvas 2d.");
  ctx.drawImage(img, 0, 0, width, height);

  // Pasada 1: bajar calidad iterativamente.
  let quality = initialQuality;
  let blob = await canvasToBlob(canvas, "image/jpeg", quality);
  for (let i = 0; i < 6 && blob && blob.size > maxSizeBytes; i++) {
    quality = Math.max(0.2, quality - 0.15);
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
  }

  // Pasada 2: si todavia no cabe, reducir dimensiones al 70% y reintentar.
  if (!blob || blob.size > maxSizeBytes) {
    const newWidth = Math.round(width * 0.7);
    const newHeight = Math.round(height * 0.7);
    canvas.width = newWidth;
    canvas.height = newHeight;
    ctx.drawImage(img, 0, 0, newWidth, newHeight);
    blob = await canvasToBlob(canvas, "image/jpeg", 0.7);
    if (!blob || blob.size > maxSizeBytes) {
      throw new Error("La imagen es muy grande incluso despues de comprimir.");
    }
  }

  // Devolver como File JPEG. Renombrar extension si era distinta.
  const newName = file.name.replace(/\.[^.]+$/, ".jpg");
  return new File([blob], newName || "imagen.jpg", { type: "image/jpeg" });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Error leyendo archivo"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}
