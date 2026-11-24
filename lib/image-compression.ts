export const MAX_UPLOAD_IMAGE_BYTES = 4 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** 已足够小的文件不再重压（保留 PNG 透明通道与原始字节）。 */
const SKIP_RECOMPRESS_BYTES = 600 * 1024;

type LoadedImage = { image: CanvasImageSource; width: number; height: number; release: () => void };

/**
 * 解码并按 EXIF 方向校正；超大图在解码阶段即降采样，
 * 避免 8000×8000 原图直接进 canvas 撑爆移动端内存。
 */
async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = probe;
    const maxSide = Math.max(width, height);
    if (maxSide > 4096) {
      const scale = 4096 / maxSide;
      probe.close();
      const resized = await createImageBitmap(file, {
        imageOrientation: "from-image",
        resizeWidth: Math.max(1, Math.round(width * scale)),
        resizeHeight: Math.max(1, Math.round(height * scale)),
        resizeQuality: "high",
      });
      return { image: resized, width: resized.width, height: resized.height, release: () => resized.close() };
    }
    return { image: probe, width, height, release: () => probe.close() };
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片无法读取，请换一张图片再试")); };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片压缩失败，请换一张图片再试")), type, quality);
  });
}

/**
 * 截图启发：以 64×64 采样估算「颜色数量」与「边缘密度」。
 * 教程截图/代码截图颜色少、边缘锐，重压会产生文字糊边与色块。
 */
function detectScreenshot(source: CanvasImageSource, width: number, height: number): boolean {
  try {
    const sample = document.createElement("canvas");
    sample.width = 64;
    sample.height = 64;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(source, 0, 0, width, height, 0, 0, 64, 64);
    const data = context.getImageData(0, 0, 64, 64).data;
    const colors = new Set<number>();
    let edgeCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      colors.add((data[i] >> 3 << 10) | (data[i + 1] >> 3 << 5) | (data[i + 2] >> 3));
    }
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 63; x += 1) {
        const a = (y * 64 + x) * 4;
        const b = a + 4;
        const delta = Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
        if (delta > 120) edgeCount += 1;
      }
    }
    return colors.size < 512 || edgeCount > 900;
  } catch {
    return false;
  }
}

export async function compressUploadImage(file: File): Promise<File> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type) || file.size === 0) throw new Error("仅支持有效的 JPG、PNG、WebP、GIF 图片");
  // GIF 动图整文件透传：canvas 重编码只保留首帧，动画是内容本体不能丢。
  // 服务端缩略图管线只取首帧生成 -480/-960 变体，原图仍为动图。
  if (file.type === "image/gif") {
    if (file.size > MAX_UPLOAD_IMAGE_BYTES) throw new Error("GIF 超过 4 MB，请压缩后再上传");
    return file;
  }
  if (file.size <= SKIP_RECOMPRESS_BYTES) return file;

  const { image, width, height, release } = await loadImage(file);
  try {
    if (!width || !height) throw new Error("图片尺寸无效");
    // 长图（教程长截图）保分辨率：只降质量优先于降尺寸，否则文字不可读。
    const aspect = Math.max(width, height) / Math.min(width, height);
    const isLongImage = aspect >= 3;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("当前设备无法处理图片");

    let scale = Math.min(1, (isLongImage ? 3200 : 2400) / Math.max(width, height));
    // 统一输出 WebP（保留 alpha 通道，PNG 透明不丢）。
    const outputType = "image/webp";
    let blob: Blob | null = null;
    const screenshot = detectScreenshot(image, width, height);
    const ladder = screenshot
      ? [0.92, 0.88, 0.84, 0.80, 0.76, 0.72, 0.68]
      : [0.88, 0.82, 0.76, 0.70, 0.64, 0.58, 0.52];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await canvasBlob(canvas, ladder[attempt], outputType);
      if (blob.size <= MAX_UPLOAD_IMAGE_BYTES) break;
      if (isLongImage && attempt < 3) continue; // 长图先只降质量
      scale *= 0.82;
    }
    if (blob && blob.size > MAX_UPLOAD_IMAGE_BYTES && file.size <= MAX_UPLOAD_IMAGE_BYTES) return file;
    if (!blob || blob.size > MAX_UPLOAD_IMAGE_BYTES) throw new Error("压缩后图片仍超过 4 MB，请选择更小的图片");
    if (file.size <= blob.size) return file;
    const stem = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${stem}.webp`, { type: outputType, lastModified: file.lastModified });
  } finally {
    release();
  }
}
