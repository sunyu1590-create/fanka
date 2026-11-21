"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Move, RotateCcw, X, ZoomIn } from "lucide-react";

const OUTPUT = 512;

type Props = {
  file: File;
  /** 已有头像框：预览里同步展示，保证裁剪结果与最终显示一致 */
  frameUrl?: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob, previewUrl: string) => void;
};

async function loadBitmap(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  // createImageBitmap 带 imageOrientation 可以按 EXIF 摆正手机拍的照片；
  // 不支持时回退到 <img>，现代浏览器本身也会按 EXIF 渲染。
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
    } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("图片无法解码，请换一张试试"));
    image.src = url;
  });
  return { image, width: image.naturalWidth, height: image.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
}

export default function AvatarCropper({ file, frameUrl, onCancel, onConfirm }: Props) {
  const [source, setSource] = useState<{ image: CanvasImageSource; width: number; height: number } | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    void loadBitmap(file).then((result) => {
      if (!alive) { result.cleanup(); return; }
      cleanupRef.current = result.cleanup;
      setSource({ image: result.image, width: result.width, height: result.height });
    }).catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "图片无法读取"); });
    return () => { alive = false; cleanupRef.current(); };
  }, [file]);

  // 舞台边长跟随布局，保证圆形窗口在不同屏幕上都是正方形。
  const [stage, setStage] = useState(300);
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setStage(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    if (!source) return { scale: 1, drawWidth: 0, drawHeight: 0 };
    const base = Math.max(stage / source.width, stage / source.height);
    const scale = base * zoom;
    return { scale, drawWidth: source.width * scale, drawHeight: source.height * scale };
  }, [source, stage, zoom]);

  const clampOffset = useCallback((next: { x: number; y: number }, drawWidth: number, drawHeight: number) => {
    const maxX = Math.max(0, (drawWidth - stage) / 2);
    const maxY = Math.max(0, (drawHeight - stage) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }, [stage]);

  useEffect(() => {
    if (!source) return;
    setOffset((current) => clampOffset(current, geometry.drawWidth, geometry.drawHeight));
  }, [source, geometry.drawWidth, geometry.drawHeight, clampOffset]);

  // 主画布绘制：窗口外压暗，窗口内清晰。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = stage * dpr;
    canvas.height = stage * dpr;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, stage, stage);
    context.fillStyle = "#111214";
    context.fillRect(0, 0, stage, stage);
    const cx = stage / 2 + offset.x;
    const cy = stage / 2 + offset.y;
    context.drawImage(source.image, cx - geometry.drawWidth / 2, cy - geometry.drawHeight / 2, geometry.drawWidth, geometry.drawHeight);
    // 圆形范围内重新绘制一遍，确保没有被压暗层影响。
    context.save();
    context.beginPath();
    context.arc(stage / 2, stage / 2, stage / 2 - 10, 0, Math.PI * 2);
    context.clip();
    context.drawImage(source.image, cx - geometry.drawWidth / 2, cy - geometry.drawHeight / 2, geometry.drawWidth, geometry.drawHeight);
    context.restore();
    // 压暗层
    context.save();
    context.beginPath();
    context.rect(0, 0, stage, stage);
    context.arc(stage / 2, stage / 2, stage / 2 - 10, 0, Math.PI * 2, true);
    context.fillStyle = "rgba(8, 9, 11, .68)";
    context.fill();
    context.restore();
    context.beginPath();
    context.arc(stage / 2, stage / 2, stage / 2 - 10, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255,255,255,.55)";
    context.lineWidth = 1;
    context.stroke();
  }, [source, stage, offset, geometry]);

  const pointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "touch" && (event as unknown as { isPrimary?: boolean }).isPrimary === false) return;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y };
  };

  const pointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampOffset({ x: drag.originX + (event.clientX - drag.startX), y: drag.originY + (event.clientY - drag.startY) }, geometry.drawWidth, geometry.drawHeight);
    setOffset(next);
  };

  const pointerUp = (event: React.PointerEvent) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const touchStart = (event: React.TouchEvent) => {
    if (event.touches.length !== 2) return;
    const a = event.touches[0];
    const b = event.touches[1];
    pinchRef.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
  };

  const touchMove = (event: React.TouchEvent) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const a = event.touches[0];
    const b = event.touches[1];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    setZoom(Math.min(4, Math.max(1, pinch.zoom * (distance / Math.max(1, pinch.distance)))));
  };

  const touchEnd = () => { pinchRef.current = null; };

  const outputBlob = useCallback(async (): Promise<Blob> => {
    if (!source) throw new Error("图片尚未就绪");
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片");
    const scale = geometry.scale * (OUTPUT / stage);
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;
    const cx = OUTPUT / 2 + offset.x * (OUTPUT / stage);
    const cy = OUTPUT / 2 + offset.y * (OUTPUT / stage);
    context.fillStyle = "#111214";
    context.fillRect(0, 0, OUTPUT, OUTPUT);
    context.drawImage(source.image, cx - drawWidth / 2, cy - drawHeight / 2, drawWidth, drawHeight);
    // 圆外裁掉，输出正方形资源，统一由圆形遮罩展示。
    const type = /png|webp/i.test(file.type) ? "image/png" : "image/jpeg";
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片导出失败")), type, 0.92);
    });
  }, [source, geometry.scale, stage, offset, file.type]);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const blob = await outputBlob();
      onConfirm(blob, URL.createObjectURL(blob));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片处理失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="avatar-cropper" role="dialog" aria-modal="true" aria-label="裁剪头像">
      <div className="avatar-cropper-head">
        <button type="button" onClick={onCancel} aria-label="取消"><X size={19} /></button>
        <strong>调整头像</strong>
        <button type="button" className="avatar-cropper-confirm" disabled={!source || busy} onClick={() => void confirm()}>
          {busy ? "处理中…" : <><Check size={16} /> 使用</>}
        </button>
      </div>
      <p className="avatar-cropper-hint"><Move size={14} /> 拖动调整位置，双指或滑块缩放</p>
      <div className="avatar-cropper-body">
        <div
          ref={stageRef}
          className="avatar-cropper-stage"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          onTouchStart={touchStart}
          onTouchMove={touchMove}
          onTouchEnd={touchEnd}
        >
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
        </div>
        <aside className="avatar-cropper-side">
          <span className="avatar-cropper-side-label">小尺寸预览</span>
          <div className="avatar-cropper-mini-row">
            <span className="avatar-cropper-mini">
              {source && <canvas ref={(node) => {
                if (!node || !source) return;
                const size = 72;
                node.width = size; node.height = size;
                const context = node.getContext("2d");
                if (!context) return;
                context.clearRect(0, 0, size, size);
                context.save();
                context.beginPath();
                context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                context.clip();
                context.fillStyle = "#111214";
                context.fillRect(0, 0, size, size);
                const scale = geometry.scale * (size / stage);
                context.drawImage(source.image, size / 2 + offset.x * (size / stage) - source.width * scale / 2, size / 2 + offset.y * (size / stage) - source.height * scale / 2, source.width * scale, source.height * scale);
                context.restore();
              }} />}
              {frameUrl && <img className="avatar-cropper-frame" src={frameUrl} alt="" />}
            </span>
            <small>评论区与消息列表使用的尺寸</small>
          </div>
          <label className="avatar-cropper-zoom">
            <span><ZoomIn size={14} /> 缩放</span>
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <button type="button" className="avatar-cropper-reset" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>
            <RotateCcw size={14} /> 重置
          </button>
          <p className="avatar-cropper-note">取消不会修改原头像；确认后才会保存。</p>
        </aside>
      </div>
      {error && <p className="avatar-cropper-error" role="alert">{error}</p>}
    </div>
  );
}
