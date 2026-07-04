// ============================================================================
// images.js — automatic photo compression before upload.
// Phone cameras produce 4–12 MB photos; a condition photo needs ~200 KB.
// Downscale to a sane size and re-encode as JPEG so uploads are fast even on
// warehouse Wi-Fi and the free storage tier lasts for years.
// ============================================================================

const MAX_DIMENSION_PX = 1600;
const JPEG_QUALITY = 0.82;

export async function compressImage(file) {
  // Non-images or already-small files pass straight through.
  if (!file.type.startsWith("image/") || file.size < 300 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file; // compression didn't help

    const name = (file.name || "photo").replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // Older browser or odd format — degrade gracefully to the original file.
    return file;
  }
}
