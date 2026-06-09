// Downscale + re-encode an image on add, before it ever touches storage. Caps the
// longest side and re-encodes to WebP (≈25-35% of JPEG; also strips EXIF). A 4MB
// phone photo → ~100-300KB. Returns the processed blob and its pixel dimensions.

const MAX_SIDE = 1600;
const QUALITY = 0.8;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality);
  });
}

export async function processImage(
  file: File
): Promise<{ blob: Blob; width: number; height: number }> {
  // from-image respects EXIF orientation so portrait photos aren't sideways
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvasToBlob(canvas, "image/webp", QUALITY);
  return { blob, width, height };
}
