"use client";

import { useEffect, useState } from "react";
import { cloudRequest } from "@/lib/cloud";
import {
  getNativeNotificationStatus,
  hasNativeBridge,
  openNativeNotificationSettings,
  requestNativeNotificationPermission,
} from "@/lib/native-bridge";

export default function NotificationSettings({ accountId, messagesEnabled, onMessagesChange, onNotice }: { accountId: string | null; messagesEnabled: boolean; onMessagesChange: () => void; onNotice: (message: string) => void }) {
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [nativeApp, setNativeApp] = useState(false);
  const [systemEnabled, setSystemEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const isNative = hasNativeBridge();
      if (active) setNativeApp(isNative);
      if (isNative) {
        const status = await getNativeNotificationStatus().catch(() => null);
        if (active && status) {
          setPermission(status.permission || (status.granted ? "granted" : "default"));
          setSystemEnabled(status.enabled);
        }
      } else if (active) {
        setPermission("Notification" in window ? Notification.permission : "unsupported");
        setSystemEnabled(true);
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
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
    if (nativeApp) {
      try {
        const result = await requestNativeNotificationPermission();
        if (!result) throw new Error("Android 通知权限暂不可用");
        setPermission(result.permission || (result.granted ? "granted" : "denied"));
        setSystemEnabled(result.enabled);
        if (result.granted && result.enabled) onNotice("系统通知权限已开启；站内提醒可正常使用");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "无法请求 Android 通知权限");
      }
      return;
    }
    if (permission === "unsupported") return onNotice("此浏览器不支持通知");
    try {
      const next = await Notification.requestPermission();
      setPermission(next);
      if (next === "granted") onNotice("已保存至此设备");
    } catch { setError("无法请求浏览器通知权限"); }
  };

  const openSystemSettings = async () => {
    if (nativeApp) {
      if (!await openNativeNotificationSettings()) setError("无法打开 Android 通知设置");
      return;
    }
    onNotice("请在浏览器的网站权限中管理通知");
  };

  return <div className="notification-settings">
    <div className="settings-module"><div className="settings-module-heading"><strong>提醒方式</strong></div>
      <div className="switch-row"><span><strong>私信消息</strong><small>此设备在页面保持连接期间提醒；浏览器关闭后的后台推送暂未开放。</small></span><button type="button" role="switch" aria-checked={messagesEnabled} aria-label="私信消息" className={`toggle-switch ${messagesEnabled ? "on" : ""}`} onClick={onMessagesChange}><i/></button></div>
      <div className="switch-row"><span><strong>评论与回复</strong><small>{accountId ? "控制通知中心中新评论与回复的站内提醒" : "登录后可同步和管理此项偏好"}</small></span>{accountId ? <button type="button" role="switch" aria-checked={commentsEnabled} aria-label="评论与回复" disabled={loading || saving} className={`toggle-switch ${commentsEnabled ? "on" : ""}`} onClick={() => void saveComments()}><i/></button> : <small>登录后设置</small>}</div>
      <div className="switch-row notification-unavailable"><span><strong>每日探索提醒</strong><small>该功能正在完善中</small></span><small>未开放</small></div>
    </div>
    <div className="settings-module notification-permission-row"><div className="settings-module-heading"><strong>通知权限</strong><small>{permission === "granted" ? "已允许" : permission === "denied" ? "已拒绝" : permission === "unsupported" ? "浏览器不支持" : "尚未授权"}</small></div>
      {permission === "denied" || (nativeApp && permission === "granted" && !systemEnabled)
        ? <><p className="settings-note">{nativeApp ? "Android 系统通知当前未允许，请在系统设置中开启。" : "请在浏览器的网站权限中允许通知，再回来使用私信提醒。"}</p><button type="button" className="secondary-button" onClick={() => void openSystemSettings()}>{nativeApp ? "打开系统通知设置" : "查看浏览器设置"}</button></>
        : permission === "granted" && systemEnabled
          ? <p className="settings-note">系统权限已允许；站内提醒仍受上方黑卡消息开关控制。后台推送服务尚未接通。</p>
          : <button type="button" className="secondary-button" disabled={permission === "unsupported"} onClick={() => void requestPermission()}>{nativeApp ? "申请系统通知权限" : "允许此设备通知"}</button>}
    </div>
    {error && <p className="settings-error" role="alert">{error}</p>}
  </div>;
}
