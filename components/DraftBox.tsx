"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckSquare, FileText, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { clearDrafts, deleteDraft, getDraftFile, listDrafts, type LocalDraft } from "@/lib/local-drafts";

function formatTime(value: number) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("zh-CN", sameYear ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function DraftBox({
  open, owner, onClose, onNew, onResume, onNotice,
}: {
  open: boolean;
  owner: string;
  onClose: () => void;
  onNew: () => void;
  onResume: (draft: LocalDraft) => void;
  onNotice: (message: string) => void;
}) {
  const [items, setItems] = useState<LocalDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const urls = useRef<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listDrafts(owner);
      setItems(list);
      // 缩略图：优先本地文件，其次历史外链。
      for (const draft of list.slice(0, 30)) {
        const image = draft.images[0];
        if (!image) continue;
        if (image.fileId) {
          const blob = await getDraftFile(draft.id, image.fileId);
          if (blob) {
            const url = URL.createObjectURL(blob);
            urls.current.push(url);
            setThumbs((current) => ({ ...current, [draft.id]: url }));
            continue;
          }
        }
        if (image.externalUrl) setThumbs((current) => ({ ...current, [draft.id]: image.externalUrl as string }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "草稿箱读取失败");
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => {
    if (!open) return;
    setSelecting(false);
    setSelected(new Set());
    setConfirmClear(false);
    void load();
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
      setThumbs({});
    };
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const removeOne = async (draft: LocalDraft) => {
    try {
      await deleteDraft(draft.id);
      setItems((current) => current.filter((item) => item.id !== draft.id));
      onNotice("草稿已删除");
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const removeSelected = async () => {
    if (!selected.size) return;
    try {
      for (const id of selected) await deleteDraft(id);
      setItems((current) => current.filter((item) => !selected.has(item.id)));
      setSelected(new Set());
      setSelecting(false);
      onNotice("已删除所选草稿");
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const removeAll = async () => {
    try {
      await clearDrafts(owner);
      setItems([]);
      setConfirmClear(false);
      onNotice("草稿已清空");
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "清空失败");
    }
  };

  const totalFiles = useMemo(() => items.reduce((sum, draft) => sum + draft.images.length, 0), [items]);

  if (!open) return null;

  return (
    <div className="draft-box" role="dialog" aria-modal="true" aria-label="草稿箱">
      <header className="draft-box-head">
        <button type="button" onClick={onClose} aria-label="返回"><ArrowLeft size={20} /></button>
        <strong>草稿箱</strong>
        {items.length > 0 ? (
          <button type="button" className="draft-box-select" onClick={() => { setSelecting((value) => !value); setSelected(new Set()); }}>
            {selecting ? "完成" : "选择"}
          </button>
        ) : <span className="draft-box-head-space" />}
      </header>

      <p className="draft-box-note">草稿只保存在当前设备与浏览器，不会上传云端。</p>

      <div className="draft-box-body">
        {loading ? <div className="draft-box-empty">正在读取本机草稿…</div> : error ? (
          <div className="draft-box-empty"><strong>读取失败</strong><span>{error}</span><button type="button" onClick={() => void load()}>重试</button></div>
        ) : items.length === 0 ? (
          <div className="draft-box-empty">
            <FileText size={24} />
            <strong>还没有草稿</strong>
            <span>发布页会自动把没发完的内容存到这里，只留在本机。</span>
            <button type="button" onClick={onNew}><Plus size={15} /> 新建一篇</button>
          </div>
        ) : (
          <>
            <ul className="draft-list">
              {items.map((draft) => (
                <li key={draft.id} className={selected.has(draft.id) ? "is-selected" : ""}>
                  <button
                    type="button"
                    className="draft-item"
                    onClick={() => selecting ? toggle(draft.id) : onResume(draft)}
                  >
                    {selecting && <span className={`draft-check${selected.has(draft.id) ? " is-on" : ""}`}>{selected.has(draft.id) && <CheckSquare size={15} />}</span>}
                    <span className="draft-thumb">
                      {thumbs[draft.id] ? <img src={thumbs[draft.id]} alt="" loading="lazy" /> : <span className="draft-thumb-placeholder"><FileText size={16} /></span>}
                    </span>
                    <span className="draft-item-copy">
                      <span className="draft-item-title">{draft.title.trim() || "未命名草稿"}</span>
                      <span className="draft-item-excerpt">{draft.body.trim().slice(0, 60) || "还没有正文"}</span>
                      <span className="draft-item-meta">
                        <em className={draft.channel === "ai" ? "is-ai" : ""}>{draft.channel === "ai" ? "AI 内容" : "精选内容"}</em>
                        <small>{formatTime(draft.updatedAt)}</small>
                        {draft.images.length > 0 && <small><ImageIcon size={11} /> {draft.images.length}</small>}
                        {draft.attachments.length > 0 && <small>附件 {draft.attachments.length}</small>}
                      </span>
                    </span>
                  </button>
                  {!selecting && <button type="button" className="draft-item-delete" aria-label="删除草稿" onClick={() => void removeOne(draft)}><Trash2 size={15} /></button>}
                </li>
              ))}
            </ul>
            <p className="draft-list-summary">{items.length} 篇草稿 · {totalFiles} 个媒体文件</p>
          </>
        )}
      </div>

      <footer className="draft-box-foot">
        {selecting ? (
          <>
            <button type="button" className="is-danger" disabled={!selected.size} onClick={() => void removeSelected()}><Trash2 size={15} /> 删除所选（{selected.size}）</button>
            <button type="button" onClick={() => { setSelecting(false); setSelected(new Set()); }}>取消</button>
          </>
        ) : (
          <>
            <button type="button" className="is-primary" onClick={onNew}><Plus size={15} /> 新建作品</button>
            {items.length > 0 && <button type="button" className="is-danger" onClick={() => setConfirmClear(true)}>清空全部</button>}
          </>
        )}
      </footer>

      {confirmClear && (
        <div className="draft-confirm" role="dialog" aria-modal="true" aria-label="确认清空草稿">
          <div>
            <strong>清空全部草稿？</strong>
            <p>这 {items.length} 篇草稿与其中的本地图片、附件都会被删除，无法恢复。</p>
            <div>
              <button type="button" onClick={() => setConfirmClear(false)}>取消</button>
              <button type="button" className="is-danger" onClick={() => void removeAll()}>清空</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
