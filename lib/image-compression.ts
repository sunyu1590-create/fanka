export const MAX_UPLOAD_IMAGE_BYTES = 4 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function loadImage(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).then((bitmap) => ({
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片无法读取，请换一张图片再试")); };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片压缩失败，请换一张图片再试")), "image/webp", quality);
  });
}

export async function compressUploadImage(file: File): Promise<File> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type) || file.size === 0) throw new Error("仅支持有效的 JPG、PNG、WebP 图片");
  const { image, width, height, release } = await loadImage(file);
  try {
    if (!width || !height) throw new Error("图片尺寸无效");
    let scale = Math.min(1, 2400 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("当前设备无法处理图片");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const quality = [0.88, 0.82, 0.76, 0.70, 0.64, 0.58, 0.52][attempt];
      blob = await canvasBlob(canvas, quality);
      if (blob.size <= MAX_UPLOAD_IMAGE_BYTES) break;
      scale *= 0.82;
    }
    if (blob && blob.size > MAX_UPLOAD_IMAGE_BYTES && file.size <= MAX_UPLOAD_IMAGE_BYTES) return file;
    if (!blob || blob.size > MAX_UPLOAD_IMAGE_BYTES) throw new Error("压缩后图片仍超过 4 MB，请选择更小的图片");
    if (file.size <= MAX_UPLOAD_IMAGE_BYTES && file.size <= blob.size) return file;
    const stem = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${stem}.webp`, { type: "image/webp", lastModified: file.lastModified });
  } finally {
    release();
  }
}
