"use client";

/** 客户端图片处理：统一摆正方向、限制尺寸、按需裁掉透明留白。 */

export type LoadedImage = { image: HTMLImageElement; width: number; height: number; url: string; cleanup: () => void };

export async function loadImageFile(file: File): Promise<LoadedImage> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("图片无法解码，请换一张试试"));
    image.src = url;
  });
  return { image, width: image.naturalWidth, height: image.naturalHeight, url, cleanup: () => URL.revokeObjectURL(url) };
}

export function trimTransparent(image: HTMLImageElement, width: number, height: number): { x: number; y: number; width: number; height: number } {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { x: 0, y: 0, width, height };
    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { x: 0, y: 0, width, height };
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  } catch {
    return { x: 0, y: 0, width, height };
  }
}

/** 输出 192×192 的透明 PNG，作为底栏图标资源。 */
export async function renderIcon(file: File, options: { scale: number; fit: "contain" | "cover"; trim: boolean }): Promise<Blob> {
  const loaded = await loadImageFile(file);
  try {
    const box = options.trim ? trimTransparent(loaded.image, loaded.width, loaded.height) : { x: 0, y: 0, width: loaded.width, height: loaded.height };
    const size = 192;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片");
    context.clearRect(0, 0, size, size);
    const ratio = options.fit === "cover" ? Math.max(size / box.width, size / box.height) : Math.min(size / box.width, size / box.height);
    const drawWidth = box.width * ratio * options.scale;
    const drawHeight = box.height * ratio * options.scale;
    context.drawImage(loaded.image, box.x, box.y, box.width, box.height, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图标导出失败")), "image/png");
    });
  } finally {
    loaded.cleanup();
  }
}

/** 卡背 / 内容面底图：限制长边并转成 JPEG/PNG，避免超大图拖慢底栏与卡片。 */
export async function renderBackdrop(file: File, maxSide = 1400): Promise<Blob> {
  const loaded = await loadImageFile(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(loaded.width, loaded.height));
    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片");
    context.drawImage(loaded.image, 0, 0, width, height);
    const type = /png|webp/i.test(file.type) ? "image/webp" : "image/jpeg";
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片导出失败")), type, 0.9);
    });
  } finally {
    loaded.cleanup();
  }
}

export function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type });
}
