"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Image as ImageIcon, Maximize2, Move, RotateCcw, X, ZoomIn } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

export type CoverMeta = { focusX: number; focusY: number; zoom: number; ratio: number; collapsedHeight: number };

export const DEFAULT_COVER_META: CoverMeta = { focusX: 50, focusY: 50, zoom: 1, ratio: 16 / 9, collapsedHeight: 176 };

type Props = {
  file: File;
  nickname: string;
  avatar?: string;
  onCancel: () => void;
  onSaved: (url: string, meta: CoverMeta) => void;
  onNotice: (message: string) => void;
};

export function coverBackground(url: string | null | undefined, meta: Partial<CoverMeta> | null | undefined) {
  if (!url) return undefined;
  const zoom = Math.min(3, Math.max(1, Number(meta?.zoom) || 1));
  const x = Math.min(100, Math.max(0, Number(meta?.focusX) ?? 50));
  const y = Math.min(100, Math.max(0, Number(meta?.focusY) ?? 50));
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${zoom * 100}% auto`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: "no-repeat",
  } as const;
}

async function readImage(file: File): Promise<{ url: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("图片无法解码，请换一张试试"));
    image.src = url;
  });
  return { url, width: image.naturalWidth, height: image.naturalHeight };
}

export default function CoverEditor({ file, nickname, avatar, onCancel, onSaved, onNotice }: Props) {
  const [source, setSource] = useState<{ url: string; width: number; height: number } | null>(null);
  const [meta, setMeta] = useState<CoverMeta>(DEFAULT_COVER_META);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fullView, setFullView] = useState(false);
  const dragRef = useRef<{ x: number; y: number; focusX: number; focusY: number; width: number; height: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void readImage(file).then((result) => {
      if (!alive) { URL.revokeObjectURL(result.url); return; }
      setSource(result);
      setMeta((current) => ({ ...current, ratio: result.width / result.height }));
    }).catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "图片无法读取"); });
    return () => { alive = false; };
  }, [file]);

  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);

  const dragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!source) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, focusX: meta.focusX, focusY: meta.focusY, width: rect.width, height: rect.height };
  };

  const dragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // 拖动方向与背景位置相反：向右拖，画面跟着手指走。
    const nextX = Math.min(100, Math.max(0, drag.focusX - ((event.clientX - drag.x) / Math.max(1, drag.width)) * 100));
    const nextY = Math.min(100, Math.max(0, drag.focusY - ((event.clientY - drag.y) / Math.max(1, drag.height)) * 100));
    setMeta((current) => ({ ...current, focusX: Math.round(nextX), focusY: Math.round(nextY) }));
  };

  const dragEnd = () => { dragRef.current = null; };

  const save = async () => {
    if (!source) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      // 保留完整原图，取景参数单独保存，展开时才有更多画面可看。
      form.set("file", file);
      form.set("meta", JSON.stringify(meta));
      const { browserDb } = await import("@/lib/browser-db");
      const db = await browserDb();
      const { data } = await db.auth.getSession();
      if (!data.session) throw new Error("登录后才能上传封面");
      const response = await fetch("/api/v1/me/cover", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((payload as { error?: string }).error || "封面上传失败");
      const url = (payload as { data?: { cover_url?: string } }).data?.cover_url;
      if (!url) throw new Error("封面上传未完成，请重试");
      onSaved(url, meta);
      onNotice("封面已更新");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "封面上传失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const background = useMemo(() => source ? coverBackground(source.url, meta) : undefined, [source, meta]);

  return (
    <div className="cover-editor" role="dialog" aria-modal="true" aria-label="编辑个人封面">
      <div className="cover-editor-head">
        <button type="button" onClick={onCancel} aria-label="取消"><X size={19} /></button>
        <strong>{fullView ? "完整封面" : "调整封面"}</strong>
        <div>
          <button type="button" onClick={() => setFullView((value) => !value)} aria-label={fullView ? "返回取景" : "查看完整封面"}>
            {fullView ? <ImageIcon size={17} /> : <Maximize2 size={17} />}
          </button>
          <button type="button" className="cover-editor-save" disabled={!source || busy} onClick={() => void save()}>
            {busy ? "上传中…" : <><Check size={16} /> 保存</>}
          </button>
        </div>
      </div>

      {fullView ? (
        <div className="cover-editor-full">
          {source && <img src={source.url} alt="封面原图" />}
          <p>原图会完整保留，主页收起时只显示取景窗口，下拉或点击可看到更多画面。</p>
        </div>
      ) : (
        <div className="cover-editor-body">
          <div className="cover-editor-stage" style={background} onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
            <span className="cover-editor-stage-hint"><Move size={13} /> 拖动取景</span>
            <span className="cover-editor-stage-ratio">{source ? `${source.width}×${source.height}` : "读取中…"}</span>
          </div>

          <label className="cover-editor-zoom">
            <span><ZoomIn size={14} /> 缩放</span>
            <input type="range" min={1} max={3} step={0.01} value={meta.zoom} onChange={(event) => setMeta((current) => ({ ...current, zoom: Number(event.target.value) }))} />
          </label>

          <div className="cover-editor-previews">
            <figure>
              <figcaption>主页收起效果</figcaption>
              <div className="cover-editor-collapsed" style={background}>
                <span className="cover-editor-avatar">{avatar ? <img src={avatar} alt="" /> : <i />}</span>
                <div><strong>{nickname || "探索者"}</strong><small>你的简介会显示在这里</small></div>
              </div>
            </figure>
            <figure>
              <figcaption>下拉展开效果</figcaption>
              <div className="cover-editor-expanded" style={background}>
                <span className="cover-editor-avatar">{avatar ? <img src={avatar} alt="" /> : <i />}</span>
                <div><strong>{nickname || "探索者"}</strong><small>你的简介会显示在这里</small></div>
              </div>
            </figure>
          </div>

          <p className="cover-editor-note">
            支持横图与竖图。收起时是一个适度高度的横向窗口，不会因为竖图把主页首屏撑满。
            取景只影响显示窗口，原图始终完整保留。
          </p>
          <button type="button" className="cover-editor-reset" onClick={() => setMeta((current) => ({ ...DEFAULT_COVER_META, ratio: current.ratio }))}>
            <RotateCcw size={14} /> 重置取景
          </button>
        </div>
      )}
      {error && <p className="cover-editor-error" role="alert">{error}</p>}
    </div>
  );
}
