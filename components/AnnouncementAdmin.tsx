"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, RefreshCw } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { userMessage } from "@/lib/user-message";

type Announcement = { title: string; body: string; active: boolean; version: number; updated_at?: string };

const EMPTY: Announcement = { title: "", body: "", active: false, version: 0 };

export default function AnnouncementAdmin({ onNotice }: { onNotice: (text: string) => void }) {
  const [form, setForm] = useState<Announcement>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await cloudRequest("/api/v1/admin/announcement")) as Announcement | null;
      if (data) {
        setForm({
          title: data.title || "",
          body: data.body || "",
          active: Boolean(data.active),
          version: data.version || 0,
          updated_at: data.updated_at,
        });
      }
    } catch (err) {
      setError(userMessage(err, "公告读取失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      onNotice("公告标题和内容都要填写");
      return;
    }
    setSaving(true);
    try {
      const data = (await cloudRequest("/api/v1/admin/announcement", {
        title: form.title,
        body: form.body,
        active: form.active,
      })) as Announcement | null;
      if (data) setForm((current) => ({ ...current, ...data }));
      onNotice(form.active ? "公告已发布，用户下次打开时会看到" : "公告已关闭，不再弹出");
    } catch (err) {
      onNotice(userMessage(err, "公告保存失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="announcement-admin">
      <div className="announcement-admin-status">
        <Megaphone size={16} aria-hidden="true" />
        <span>{form.active ? "已开启 · 用户打开时弹窗" : "已关闭 · 不打扰用户"}</span>
        <small>{form.version ? `第 ${form.version} 版` : "尚未发布"}</small>
      </div>

      <label className="announcement-admin-field">
        <span>公告标题</span>
        <input
          value={form.title}
          maxLength={40}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          placeholder="例如：黑卡 2.4 版本更新"
        />
        <small>{form.title.length}/40</small>
      </label>

      <label className="announcement-admin-field">
        <span>公告内容</span>
        <textarea
          value={form.body}
          maxLength={600}
          rows={7}
          onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
          placeholder="写清楚这次要告诉用户的事，支持换行。"
        />
        <small>{form.body.length}/600</small>
      </label>

      <label className="announcement-admin-switch">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
        />
        <span>打开时弹窗提示</span>
      </label>

      <div className="announcement-admin-actions">
        <button type="button" className="primary-button" onClick={() => void save()} disabled={saving || loading}>
          {saving ? "保存中…" : "保存"}
        </button>
        <button type="button" className="soft-button" onClick={() => void load()} disabled={saving || loading}>
          <RefreshCw size={14} aria-hidden="true" />
          {loading ? "读取中…" : "重新读取"}
        </button>
      </div>

      {error && <p className="fineprint">{error}</p>}
      <p className="fineprint">保存后版本号自动加一；用户端只在版本变化时再次弹出，不会反复打扰。</p>
    </div>
  );
}
