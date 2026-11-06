import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Action, Notice, PageFrame } from "../components/MobileUi";
import { api, useMobileSession } from "../lib/mobile-api";
import { useTheme, type ThemeMode } from "../lib/theme";

type NotificationSettings = { commentsEnabled: boolean };
const modes: Array<{ key: ThemeMode; label: string }> = [{ key: "system", label: "跟随系统" }, { key: "light", label: "浅色" }, { key: "dark", label: "深色" }];

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { session } = useMobileSession();
  const [notifications, setNotifications] = useState<NotificationSettings>({ commentsEnabled: true });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!session) return;
    let active = true; setLoading(true);
    void api<NotificationSettings>("/api/v1/settings/notifications", session)
      .then((data) => { if (active) setNotifications(data || { commentsEnabled: true }); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "通知设置暂时无法加载。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  const saveComments = async (value: boolean) => {
    if (!session || busy) { setNotifications((current) => ({ ...current, commentsEnabled: value })); return; }
    const previous = notifications;
    setNotifications({ commentsEnabled: value }); setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/v1/settings/notifications", session, { method: "POST", body: JSON.stringify({ commentsEnabled: value }) });
      setNotice("通知设置已保存。");
    } catch (cause) { setNotifications(previous); setError(cause instanceof Error ? cause.message : "通知设置保存失败。"); }
    finally { setBusy(false); }
  };

  return <PageFrame title="设置" eyebrow="SETTINGS / HEIKA">
    <Text style={{ color: colors.subtle, fontSize: 10, fontWeight: "700", letterSpacing: 1.4 }}>外观</Text>
    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: colors.line }}>{modes.map((item) => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: mode === item.key }} onPress={() => setMode(item.key)} style={{ flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderColor: mode === item.key ? colors.action : "transparent" }}><Text style={{ color: mode === item.key ? colors.action : colors.muted, fontSize: 12, fontWeight: mode === item.key ? "700" : "500" }}>{item.label}</Text></Pressable>)}</View>
    <Text style={{ color: colors.subtle, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginTop: 14 }}>账号与资料</Text>
    <SettingRow title="个人资料" subtitle="昵称、头像和公开资料" onPress={() => router.push("/profile-edit")} colors={colors} />
    <SettingRow title="账号安全" subtitle="登录、修改密码和备用恢复码" onPress={() => router.push("/account")} colors={colors} />
    <SettingRow title="通知中心" subtitle="点赞、评论、回复和系统通知" onPress={() => router.push("/notifications")} colors={colors} />
    <Text style={{ color: colors.subtle, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginTop: 15 }}>创作与管理</Text>
    <SettingRow title="创作者中心" subtitle="作品表现和每周成长任务" onPress={() => router.push("/creator")} colors={colors} />
    <SettingRow title="AI 工作台" subtitle="标题、提纲、润色和话题建议" onPress={() => router.push("/ai-workbench")} colors={colors} />
    {session ? <SettingRow title="管理员控制台" subtitle="仅管理员账号可访问" onPress={() => router.push("/admin")} colors={colors} /> : null}
    <Text style={{ color: colors.subtle, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, marginTop: 15 }}>通知偏好</Text>
    <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: colors.line }}><View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>评论与回复通知</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 3 }}>服务端通知中心会记录相关动态</Text></View>{loading ? <ActivityIndicator color={colors.action} /> : <Pressable accessibilityRole="switch" accessibilityState={{ checked: notifications.commentsEnabled }} onPress={() => void saveComments(!notifications.commentsEnabled)} style={{ minWidth: 55, minHeight: 38, alignItems: "flex-end", justifyContent: "center" }}><Text style={{ color: notifications.commentsEnabled ? colors.action : colors.subtle, fontSize: 12, fontWeight: "700" }}>{notifications.commentsEnabled ? "开启" : "关闭"}</Text></Pressable>}</View>
    <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
    {session ? <Action title="退出登录" subtle onPress={() => router.push("/account")} /> : null}
    <Text style={{ color: colors.subtle, fontSize: 10, lineHeight: 16 }}>当前原生版本支持应用内通知列表。系统级推送需要配置 Android Firebase 凭据，并在构建服务中完成注册。</Text>
  </PageFrame>;
}

function SettingRow({ title, subtitle, onPress, colors }: { title: string; subtitle: string; onPress: () => void; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: colors.line }}><View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 3 }}>{subtitle}</Text></View><Text style={{ color: colors.subtle, fontSize: 18 }}>›</Text></Pressable>;
}
