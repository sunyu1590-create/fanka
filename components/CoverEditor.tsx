"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Image as ImageIcon, Maximize2, Move, RotateCcw, X, ZoomIn } from "lucide-react";

export type CoverMeta = { focusX: number; focusY: number; zoom: number; ratio: number; collapsedHeight: number };

export const DEFAULT_COVER_META: CoverMeta = { focusX: 50, focusY: 50, zoom: 1, ratio: 16 / 9, collapsedHeight: 176 };

/** 保存链路分阶段：处理图片 → 上传 → 保存资料 → 成功 / 失败（需求五界面区分）。 */
export type CoverSavePhase = "processing" | "idle" | "uploading" | "saving" | "success" | "error";

/** 已上传但未保存的资源：保存资料失败后重试直接复用，不再重复上传（需求 6.3）。 */
type StagedCover = { path: string; url: string };

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

/**
 * 上传前压到可接受体积。
 *
 * 封面在页面上最宽也就 1440 逻辑像素，长边 2400 已经足够；
 * 不压缩的话，12 MB 的原图要在「浏览器 → 我们的服务器 → Storage」走两遍，
 * 第二遍没有任何进度反馈，用户看到的就是卡在 99%。
 */
async function compressCover(file: File): Promise<File> {
  // 已经足够小就不动它，避免二次编码损失。
  if (file.size <= 1.2 * 1024 * 1024 && /^image\/(jpeg|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 2400;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // 浏览器不支持 createImageBitmap 时退回原图，上传逻辑本身不受影响。
    return file;
  }
}

const PHASE_TEXT: Record<CoverSavePhase, string> = {
  processing: "正在处理图片…",
  idle: "调整好取景后保存，原图会完整保留",
  uploading: "正在上传…",
  saving: "正在保存资料…",
  success: "保存成功",
  error: "上传或保存失败",
};

export default function CoverEditor({ file, nickname, avatar, onCancel, onSaved, onNotice }: Props) {
  const [source, setSource] = useState<{ url: string; width: number; height: number } | null>(null);
  const [meta, setMeta] = useState<CoverMeta>(DEFAULT_COVER_META);
  const [phase, setPhase] = useState<CoverSavePhase>("processing");
  const [error, setError] = useState("");
  const [failStage, setFailStage] = useState<"upload" | "save" | "">("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fullView, setFullView] = useState(false);
  const dragRef = useRef<{ x: number; y: number; focusX: number; focusY: number; width: number; height: number } | null>(null);
  const stagedRef = useRef<StagedCover | null>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setPhase("processing");
    setError("");
    void readImage(file).then((result) => {
      if (!alive) { URL.revokeObjectURL(result.url); return; }
      setSource(result);
      setMeta((current) => ({ ...current, ratio: result.width / result.height }));
      setPhase("idle");
    }).catch((cause) => {
      if (!alive) return;
      setPhase("error");
      setError(cause instanceof Error ? cause.message : "图片无法读取");
    });
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

  // 取消 / 关闭时回收「已上传但未保存」的暂存图，避免存储残留。
  const discardStaged = () => {
    const staged = stagedRef.current;
    if (!staged || savedRef.current) return;
    stagedRef.current = null;
    void (async () => {
      try {
        const { browserDb } = await import("@/lib/browser-db");
        const db = await browserDb();
        const { data } = await db.auth.getSession();
        if (!data.session) return;
        await fetch(`/api/v1/me/cover?path=${encodeURIComponent(staged.path)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
      } catch { /* 清理失败无碍，服务端不会引用未保存的暂存图 */ }
    })();
  };

  useEffect(() => () => { discardStaged(); // eslint-disable-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = () => {
    discardStaged();
    onCancel();
  };

  // 保存分两段真实反馈：上传（阶段一）→ 保存资料（阶段二）。
  // 上传成功后保存失败：保留暂存资源，重试只补保存资料这一步，不反复上传（需求 6.3）。
  const save = () => {
    if (!source || phase === "uploading" || phase === "saving") return;
    setError("");
    setFailStage("");
    void (async () => {
      try {
        const { browserDb } = await import("@/lib/browser-db");
        const db = await browserDb();
        const { data } = await db.auth.getSession();
        if (!data.session) throw new Error("登录后才能上传封面");
        const token = data.session.access_token;

        // 阶段一：上传（已有暂存资源时跳过，直接复用）。
        let staged = stagedRef.current;
        if (!staged) {
          setPhase("uploading");
          setUploadProgress(0);
          const payloadFile = await compressCover(file);
          staged = await new Promise<StagedCover>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/v1/me/cover");
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            // 服务端要把文件再转发到 Storage，这一段没有进度；给足时间并允许超时后重试。
            xhr.timeout = 120000;
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) setUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
            };
            xhr.ontimeout = () => reject(new Error("上传超时，请检查网络后重试"));
            xhr.onload = () => {
              let payload: { error?: string; data?: { cover_url?: string; path?: string } } = {};
              try { payload = JSON.parse(xhr.responseText || "{}"); } catch { /* 非 JSON 响应按失败处理 */ }
              const url = payload.data?.cover_url;
              const path = payload.data?.path;
              if (xhr.status >= 200 && xhr.status < 300 && url && path) resolve({ url, path });
              else reject(new Error(payload.error || (xhr.status === 413 ? "封面图片不能超过 12 MB" : `封面上传失败（${xhr.status || "网络异常"}）`)));
            };
            xhr.onerror = () => reject(new Error("网络异常，上传未完成，请重试"));
            xhr.onabort = () => reject(new Error("上传已中断，请重试"));
            const form = new FormData();
            // 保留完整原图，取景参数单独保存，展开时才有更多画面可看。
            form.set("file", payloadFile);
            form.set("meta", JSON.stringify(meta));
            xhr.send(form);
          });
          stagedRef.current = staged;
        }

        // 阶段二：保存资料（传输 100% 不代表资料已保存）。
        setPhase("saving");
        const response = await fetch("/api/v1/me/cover", {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ path: staged.path, meta }),
        });
        const payload = await response.json().catch(() => ({} as { error?: string }));
        if (!response.ok) throw new Error(payload.error || `资料保存失败（${response.status || "网络异常"}）`);

        savedRef.current = true;
        setPhase("success");
        onSaved(staged.url, meta);
        onNotice("封面已更新");
      } catch (cause) {
        setPhase("error");
        setFailStage(stagedRef.current ? "save" : "upload");
        setError(cause instanceof Error ? cause.message : "上传或保存失败，请重试");
      }
    })();
  };

  const background = useMemo(() => source ? coverBackground(source.url, meta) : undefined, [source, meta]);
  const busy = phase === "processing" || phase === "uploading" || phase === "saving" || phase === "success";
  const saveLabel = phase === "uploading"
    ? (uploadProgress >= 100 ? "服务器处理中…" : `正在上传… ${uploadProgress}%`)
    : phase === "saving" ? "正在保存资料…"
    : phase === "success" ? "保存成功"
    : phase === "error" ? "重试保存"
    : "保存封面";

  return (
    <div className="cover-editor" role="dialog" aria-modal="true" aria-label="编辑个人封面">
      <div className="cover-editor-head">
        <button type="button" onClick={handleCancel} aria-label="取消"><X size={19} /></button>
        <strong>{fullView ? "完整封面" : "调整封面"}</strong>
        <div>
          <button type="button" onClick={() => setFullView((value) => !value)} aria-label={fullView ? "返回取景" : "查看完整封面"}>
            {fullView ? <ImageIcon size={17} /> : <Maximize2 size={17} />}
          </button>
          <button type="button" className={`cover-editor-save${phase === "success" ? " is-success" : ""}${phase === "error" ? " is-error" : ""}`} disabled={busy || !source} onClick={save}>
            {phase === "success" ? <><Check size={16} /> 保存成功</> : saveLabel}
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
      <p className="cover-editor-phase" role="status" aria-live="polite">{PHASE_TEXT[phase]}</p>
      {error && (
        <p className="cover-editor-error" role="alert">
          {failStage === "save" ? `资料保存失败：${error}。图片已上传，重试不会重复上传。` : `上传失败：${error}。取景和已填内容已保留，可直接重试。`}
        </p>
      )}
    </div>
  );
}
