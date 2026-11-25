/**
 * 封面取景几何：服务端 sharp 与浏览器 canvas 共用同一套计算，
 * 保证「编辑器里看到的」与「最终保存的」是同一块画面。
 */
export type CropInput = { focusX?: number; focusY?: number; zoom?: number } | null | undefined;

export type CropRect = { left: number; top: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function cropRect(sourceWidth: number, sourceHeight: number, crop: CropInput, targetRatio = 600 / 800): CropRect {
  const width = Math.max(1, Math.round(sourceWidth));
  const height = Math.max(1, Math.round(sourceHeight));
  const focusX = clamp(Number(crop?.focusX ?? 50), 0, 100);
  const focusY = clamp(Number(crop?.focusY ?? 50), 0, 100);
  const zoom = clamp(Number(crop?.zoom ?? 1), 1, 3);

  // zoom 先把可视区域缩小，等效于放大观察。
  const windowWidth = Math.max(1, Math.round(width / zoom));
  const windowHeight = Math.max(1, Math.round(height / zoom));
  const windowLeft = Math.round((width - windowWidth) * (focusX / 100));
  const windowTop = Math.round((height - windowHeight) * (focusY / 100));

  // 在可视窗口内取最大的目标比例区域，再按焦点偏移。
  let cropWidth = windowWidth;
  let cropHeight = Math.round(cropWidth / targetRatio);
  if (cropHeight > windowHeight) {
    cropHeight = windowHeight;
    cropWidth = Math.round(cropHeight * targetRatio);
  }
  const left = windowLeft + Math.max(0, Math.round((windowWidth - cropWidth) * (focusX / 100)));
  const top = windowTop + Math.max(0, Math.round((windowHeight - cropHeight) * (focusY / 100)));

  return {
    left: clamp(left, 0, Math.max(0, width - cropWidth)),
    top: clamp(top, 0, Math.max(0, height - cropHeight)),
    width: Math.max(1, Math.min(cropWidth, width)),
    height: Math.max(1, Math.min(cropHeight, height)),
  };
}
