"use client";

import { useEffect, useState } from "react";
import { cloudRequest } from "@/lib/cloud";

export default function NotificationSettings({ accountId, messagesEnabled, onMessagesChange, onNotice }: { accountId: string | null; messagesEnabled: boolean; onMessagesChange: () => void; onNotice: (message: string) => void }) {
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPermission("Notification" in window ? Notification.permission : "unsupported");
  }, []);
  useEffect(() => {
    if (!accountId) return;
    let active = true;
    setLoading(true); setError("");
    void cloudRequest("/api/v1/settings/notifications").then((data) => {
      if (active && data) setCommentsEnabled(data.commentsEnabled !== false);
      else if (active) setError("登录状态已失效，请重新登录");
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "读取通知设置失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId]);

  const saveComments = async () => {
    if (!accountId || saving || loading) return;
    const next = !commentsEnabled;
    setSaving(true); setError(""); setCommentsEnabled(next);
    try {
      const result = await cloudRequest("/api/v1/settings/notifications", { commentsEnabled: next }, "PATCH");
      if (!result) throw new Error("登录状态已失效，请重新登录");
      onNotice("已同步至账号");
    } catch {
      setCommentsEnabled(!next);
      setError("同步失败，请重试");
    } finally { setSaving(false); }
  };

  const requestPermission = async () => {
    if (permission === "unsupported") return onNotice("此浏览器不支持通知");
    try {
      const next = await Notification.requestPermission();
      setPermission(next);
      if (next === "granted") onNotice("已保存至此设备");
    } catch { setError("无法请求浏览器通知权限"); }
  };

  return <div className="notification-settings">
    <div className="settings-module"><div className="settings-module-heading"><strong>提醒方式</strong></div>
      <div className="switch-row"><span><strong>私信消息</strong><small>此设备在页面保持连接期间提醒；浏览器关闭后的后台推送暂未开放。</small></span><button type="button" role="switch" aria-checked={messagesEnabled} aria-label="私信消息" className={`toggle-switch ${messagesEnabled ? "on" : ""}`} onClick={onMessagesChange}><i/></button></div>
      <div className="switch-row"><span><strong>评论与回复</strong><small>{accountId ? "控制通知中心中新评论与回复的站内提醒" : "登录后可同步和管理此项偏好"}</small></span>{accountId ? <button type="button" role="switch" aria-checked={commentsEnabled} aria-label="评论与回复" disabled={loading || saving} className={`toggle-switch ${commentsEnabled ? "on" : ""}`} onClick={() => void saveComments()}><i/></button> : <small>登录后设置</small>}</div>
      <div className="switch-row notification-unavailable"><span><strong>每日探索提醒</strong><small>该功能正在完善中</small></span><small>未开放</small></div>
    </div>
    <div className="settings-module notification-permission-row"><div className="settings-module-heading"><strong>通知权限</strong><small>{permission === "granted" ? "已允许" : permission === "denied" ? "已拒绝" : permission === "unsupported" ? "浏览器不支持" : "尚未授权"}</small></div>
      {permission === "denied" ? <p className="settings-note">请在浏览器的网站权限中允许通知，再回来使用私信提醒。</p> : permission === "granted" ? <p className="settings-note">系统权限已允许；提醒仍受上方私信设置控制。</p> : <button type="button" className="secondary-button" disabled={permission === "unsupported"} onClick={() => void requestPermission()}>允许此设备通知</button>}
    </div>
    {error && <p className="settings-error" role="alert">{error}</p>}
  </div>;
}
