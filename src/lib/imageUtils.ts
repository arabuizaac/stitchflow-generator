/** Resize + compress an image File to base64 (without data URL prefix) for AI analysis. */
export async function fileToCompressedBase64(
  file: File,
  maxDim = 1024,
  quality = 0.85,
): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  const previewUrl = URL.createObjectURL(file);
  const img = await loadImage(previewUrl);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const mimeType = "image/jpeg";
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const base64 = dataUrl.split(",")[1] ?? "";
  return { base64, mimeType, previewUrl };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
