"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Palette, RefreshCw, X } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

type DecorTheme = {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  kind: "bundle" | "bottom" | "card";
  author_id: string | null;
  author_name: string | null;
  status: "pending" | "approved" | "rejected" | "delisted";
  version: number;
  tags: string[];
  config: unknown;
  review_note: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

const KIND_LABEL: Record<string, string> = { bundle: "整套", bottom: "底栏", card: "卡片" };
const STATUS_LABEL: Record<string, string> = { pending: "待审核", approved: "已通过", rejected: "已驳回", delisted: "已下架" };
const FILTERS = [["pending", "待审核"], ["approved", "已通过"], ["rejected", "已驳回"], ["delisted", "已下架"], ["all", "全部"]] as const;

/** 用创作者提交的真实配色画缩略图，避免审核时只看标题做判断。 */
function ThemeSwatch({ config }: { config: unknown }) {
  const cfg = (config || {}) as { bottomBar?: { dark?: { bg?: string; activeIcon?: string } }; card?: { dark?: { backBg?: string; accent?: string } } };
  const barBg = cfg.bottomBar?.dark?.bg || "#0B0D0F";
  const barAccent = cfg.bottomBar?.dark?.activeIcon || "#D4AF37";
  const cardBg = cfg.card?.dark?.backBg || "#15171A";
  const cardAccent = cfg.card?.dark?.accent || barAccent;
  return (
    <span className="admin-decor-swatch" aria-hidden="true">
      <i style={{ background: cardBg, borderColor: `${cardAccent}66` }} />
      <i style={{ background: barBg, borderColor: `${barAccent}66` }} />
    </span>
  );
}

export default function AdminDecorReview() {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<DecorTheme[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const result = await cloudRequest(`/api/v1/admin/decor-themes?status=${status}`) as { items: DecorTheme[] };
      setItems(result.items || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "装扮队列加载失败");
    } finally { setBusy(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const act = async (theme: DecorTheme, action: "approve" | "reject" | "delist") => {
    const note = notes[theme.id]?.trim() || "";
    if (action === "reject" && note.length < 3) { setError("驳回时必须填写至少 3 个字的原因，用户会看到这句话"); return; }
    setSaving(theme.id); setError(""); setNotice("");
    try {
      await cloudRequest("/api/v1/admin/decor-themes", { id: theme.id, action, note });
      setNotice(action === "approve" ? "已通过，装扮立即出现在创意工坊" : action === "reject" ? "已驳回，作者可在我的投稿看到原因" : "已下架，已应用的用户不受影响");
      setNotes((current) => ({ ...current, [theme.id]: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally { setSaving(null); }
  };

  return (
    <section className="admin-appeals">
      <div className="admin-ai-workspace-head">
        <div>
          <h2>装扮审核</h2>
          <p>创意工坊的底栏、卡片与整套装扮投稿。通过后立即发布，驳回需写明原因。</p>
        </div>
        <button className="soft-button" disabled={busy} onClick={() => void load()}><RefreshCw size={14} />刷新</button>
      </div>
      <div className="moderation-filters" role="group" aria-label="装扮审核状态">
        {FILTERS.map(([value, label]) => (
          <button key={value} className={status === value ? "selected" : ""} onClick={() => setStatus(value)}>{label}</button>
        ))}
      </div>
      {error && <p className="moderation-feedback error" role="alert">{error}</p>}
      {notice && <p className="moderation-feedback" role="status">{notice}</p>}
      {busy && !items.length ? <p className="moderation-empty">正在加载装扮投稿…</p> : items.length ? (
        <div className="moderation-list">
          {items.map((theme) => {
            const pending = theme.status === "pending";
            return (
              <article className="moderation-item" key={theme.id}>
                <div className="moderation-item-heading">
                  <strong><Palette size={15} /> {KIND_LABEL[theme.kind] || theme.kind} · {STATUS_LABEL[theme.status] || theme.status}</strong>
                  <time>{new Date(theme.updated_at || theme.created_at).toLocaleString("zh-CN")}</time>
                </div>
                <div className="admin-decor-head">
                  <ThemeSwatch config={theme.config} />
                  <div>
                    <strong className="moderation-submission-title">{theme.title}</strong>
                    <p className="moderation-author">
                      作者：{theme.author_name || (theme.author_id ? theme.author_id.slice(0, 8) : "未知")}
                      {theme.version > 1 ? ` · 第 ${theme.version} 版` : ""}
                      {theme.tags?.length ? ` · ${theme.tags.join(" / ")}` : ""}
                    </p>
                  </div>
                </div>
                {theme.description && <p className="admin-appeal-reason">{theme.description}</p>}
                {theme.review_note && <p className="moderation-history"><strong>审核记录</strong> {theme.review_note}</p>}
                {pending ? (
                  <>
                    <label className="moderation-note">
                      审核说明
                      <textarea
                        value={notes[theme.id] || ""}
                        maxLength={300}
                        onChange={(event) => setNotes((current) => ({ ...current, [theme.id]: event.target.value }))}
                        placeholder="通过可留空；驳回必须说明原因"
                      />
                    </label>
                    <div className="moderation-actions">
                      <button disabled={saving === theme.id} onClick={() => void act(theme, "approve")}><Check size={15} />通过并发布</button>
                      <button disabled={saving === theme.id} onClick={() => void act(theme, "reject")}><X size={15} />驳回</button>
                    </div>
                  </>
                ) : theme.status === "approved" ? (
                  <div className="moderation-actions">
                    <button disabled={saving === theme.id} onClick={() => void act(theme, "delist")}><X size={15} />下架</button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : <p className="moderation-empty">当前没有{status === "all" ? "" : STATUS_LABEL[status] || ""}装扮投稿。</p>}
    </section>
  );
}
