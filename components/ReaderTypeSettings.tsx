"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";

export type ReaderTypePrefs = {
  titleScale: number;
  bodyScale: number;
  progress: boolean;
};

export const READER_TYPE_KEY = "heika:reader-type";
export const DEFAULT_READER_TYPE: ReaderTypePrefs = { titleScale: 1, bodyScale: 1, progress: false };
export const BODY_RANGE = { min: 0.85, max: 1.35, step: 0.01 };
export const TITLE_RANGE = { min: 0.85, max: 1.3, step: 0.01 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeReaderType(value: unknown): ReaderTypePrefs {
  if (!value || typeof value !== "object") return DEFAULT_READER_TYPE;
  const raw = value as Partial<ReaderTypePrefs>;
  const body = Number(raw.bodyScale);
  const title = Number(raw.titleScale);
  return {
    titleScale: Number.isFinite(title) ? clamp(title, TITLE_RANGE.min, TITLE_RANGE.max) : 1,
    bodyScale: Number.isFinite(body) ? clamp(body, BODY_RANGE.min, BODY_RANGE.max) : 1,
    // 默认关闭：没有明确开启过就不渲染进度线。
    progress: raw.progress === true,
  };
}

export function useReaderTypePrefs() {
  const [prefs, setPrefs] = useState<ReaderTypePrefs>(DEFAULT_READER_TYPE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(READER_TYPE_KEY);
      if (stored) setPrefs(normalizeReaderType(JSON.parse(stored)));
    } catch {
      // 本地存储损坏时回退默认值，不影响正文渲染。
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(READER_TYPE_KEY, JSON.stringify(prefs));
    } catch {
      // 隐私模式下写入失败时保留本次会话内的设置。
    }
  }, [prefs, ready]);

  const update = useCallback((patch: Partial<ReaderTypePrefs>) => {
    setPrefs((current) => normalizeReaderType({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => setPrefs({ ...DEFAULT_READER_TYPE }), []);

  /** CSS 变量只作用于正文容器，章节标题随正文字号联动，作品标题独立调节。 */
  const style = useMemo(() => ({
    "--rd-body-scale": prefs.bodyScale,
    "--rd-title-scale": prefs.titleScale,
  }) as CSSProperties, [prefs.bodyScale, prefs.titleScale]);

  return { prefs, update, reset, style, ready };
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function ReaderTypeControls({ prefs, onChange, onReset }: {
  prefs: ReaderTypePrefs;
  onChange: (patch: Partial<ReaderTypePrefs>) => void;
  onReset: () => void;
}) {
  const isDefault = prefs.bodyScale === 1 && prefs.titleScale === 1 && !prefs.progress;
  return (
    <div className="reader-type-controls">
      <div className="reader-type-head">
        <strong>文字大小</strong>
        <button type="button" className="reader-type-reset" onClick={onReset} disabled={isDefault}>
          <RotateCcw size={13} aria-hidden="true" />恢复默认
        </button>
      </div>

      <label className="reader-type-row">
        <span>正文</span>
        <input
          type="range"
          min={BODY_RANGE.min}
          max={BODY_RANGE.max}
          step={BODY_RANGE.step}
          value={prefs.bodyScale}
          aria-label="正文字号"
          onChange={(event) => onChange({ bodyScale: Number(event.target.value) })}
        />
        <output>{percent(prefs.bodyScale)}</output>
      </label>
      <label className="reader-type-row">
        <span>标题</span>
        <input
          type="range"
          min={TITLE_RANGE.min}
          max={TITLE_RANGE.max}
          step={TITLE_RANGE.step}
          value={prefs.titleScale}
          aria-label="标题字号"
          onChange={(event) => onChange({ titleScale: Number(event.target.value) })}
        />
        <output>{percent(prefs.titleScale)}</output>
      </label>

      <div className="reader-type-preview" aria-hidden="true" style={{ "--rd-body-scale": prefs.bodyScale, "--rd-title-scale": prefs.titleScale } as CSSProperties}>
        <b className="reader-type-preview-title">HEIKA 阅读预览</b>
        <span className="reader-type-preview-body">正文会按你的选择实时缩放，章节标题与行高一起变化。</span>
      </div>

      <label className="reader-type-switch">
        <span>
          <strong>显示阅读进度条</strong>
          <small>关闭后不占用顶栏下方空间</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={prefs.progress}
          onChange={(event) => onChange({ progress: event.target.checked })}
        />
        <i aria-hidden="true" />
      </label>
    </div>
  );
}
