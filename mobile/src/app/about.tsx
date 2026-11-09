import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Image, Linking, Platform, Pressable, Text, View } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import appLogo from "../../assets/icon.png";
import { Notice, PageFrame } from "../components/MobileUi";
import { getDb } from "../lib/mobile-api";
import { useTheme } from "../lib/theme";
import { clearTransientCache, getTransientCacheStats, type TransientCacheStats } from "../lib/local-store";
import { getNativeNotificationPermission, requestNativeNotificationPermission } from "../lib/native-notifications";

const WEB_URL = "https://moonclean.shop";
const GITHUB_URL = "https://github.com/sunyu1590-create/fanka";
const CLEARABLE_CACHE_PREFIX = "heika:native-cache:v1:feed:";

export default function AboutScreen() {
  const { colors, isDark } = useTheme();
  const [permission, setPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const [cacheStats, setCacheStats] = useState<TransientCacheStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const version = Constants.nativeAppVersion || Constants.expoConfig?.version || "未知";
  const build = Constants.nativeBuildVersion || Constants.platform?.android?.versionCode || "—";

  const refreshStatus = useCallback(async () => {
    try {
      const [nextPermission, nextCache] = await Promise.all([getNativeNotificationPermission(), getTransientCacheStats()]);
      setPermission(nextPermission); setCacheStats(nextCache);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "页面状态读取失败"); }
  }, []);
  useEffect(() => { void refreshStatus(); const sub = AppState.addEventListener("change", (state) => { if (state === "active") void refreshStatus(); }); return () => sub.remove(); }, [refreshStatus]);

  const openExternal = async (value: string) => {
    setError(""); setNotice("");
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || !url.hostname) throw new Error("链接无效");
      await Linking.openURL(url.href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法打开链接，请稍后重试"); }
  };

  const handleNotification = async () => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const current = await getNativeNotificationPermission();
      if (!current.granted || !current.canAskAgain) {
        if (!current.granted && current.canAskAgain) {
          const result = await requestNativeNotificationPermission();
          setPermission({ granted: result.granted, canAskAgain: result.canAskAgain });
          if (result.granted) { setNotice("系统通知权限已开启。"); return; }
          if (result.canAskAgain) { setNotice("未开启系统通知权限。你仍可在应用内查看通知中心。"); return; }
        }
        await openNotificationSettings();
        return;
      }
      await openNotificationSettings();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法打开通知权限设置"); }
    finally { setBusy(false); }
  };

  const clearCache = () => Alert.alert("清理临时缓存", "只清理可重新下载的公开发现内容缓存，不会删除登录凭证、消息、草稿、收藏、作品或未完成上传。", [
    { text: "取消", style: "cancel" },
    { text: "清理", style: "destructive", onPress: () => { void (async () => {
      setBusy(true); setError(""); setNotice("");
      try {
        const beforeKeys = await AsyncStorage.getAllKeys();
        const protectedKeysBefore = beforeKeys.filter((key) => !key.startsWith(CLEARABLE_CACHE_PREFIX)).sort();
        const beforeSession = (await (await getDb()).auth.getSession()).data.session?.user.id || null;
        const removed = await clearTransientCache();
        const afterSession = (await (await getDb()).auth.getSession()).data.session?.user.id || null;
        const afterKeys = await AsyncStorage.getAllKeys();
        const protectedKeysAfter = afterKeys.filter((key) => !key.startsWith(CLEARABLE_CACHE_PREFIX)).sort();
        if (beforeSession !== afterSession || protectedKeysBefore.join("\n") !== protectedKeysAfter.join("\n")) throw new Error("检测到账号或本机关键数据状态变化，缓存结果未确认，请检查后重试。");
        await refreshStatus();
        setNotice(removed.bytes ? `已清除 ${removed.entries} 项临时缓存，释放约 ${formatBytes(removed.bytes)}。` : "没有可清理的临时缓存。");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "缓存清理失败"); }
      finally { setBusy(false); }
    })(); } },
  ]);

  return <PageFrame title="关于黑卡" eyebrow="ABOUT / HEIKA" contentStyle={{ paddingHorizontal: 20, paddingTop: 10, gap: 7 }}>
    <View style={{ alignItems: "center", paddingTop: 5, paddingBottom: 16, borderBottomWidth: 1, borderColor: colors.line }}>
      <Image source={appLogo} alt="黑卡品牌 Logo" accessibilityLabel="黑卡品牌 Logo" resizeMode="contain" style={{ width: 68, height: 68, backgroundColor: colors.surface, borderRadius: 16 }} />
      <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "700", marginTop: 8 }}>黑卡 HEIKA</Text>
      <Text style={{ color: colors.subtle, fontSize: 10, marginTop: 4 }}>Android {version} · Build {build}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 9 }}>每一次翻开，都是一次新的发现。</Text>
    </View>

    <GroupTitle title="探索黑卡" colors={colors} />
    <FeatureRow icon="↗" title="访问网页版" subtitle="在系统浏览器中打开 moonclean.shop" colors={colors} onPress={() => void openExternal(WEB_URL)} />
    <FeatureRow icon="⌘" title="GitHub 项目" subtitle="查看黑卡公开项目与代码" colors={colors} onPress={() => void openExternal(GITHUB_URL)} />
    <GroupTitle title="应用管理" colors={colors} />
    <FeatureRow icon="◉" title="通知与权限" subtitle={permission === null ? "正在读取系统权限…" : permission.granted ? "Android 系统通知已开启" : "Android 系统通知未开启"} accessory={permission === null ? "…" : permission.granted ? "已开启" : "去设置"} colors={colors} onPress={() => void handleNotification()} />
    <FeatureRow icon="⌫" title="清理缓存" subtitle={cacheStats ? `${cacheStats.entries} 项公开内容 · 约 ${formatBytes(cacheStats.bytes)}` : "正在统计临时缓存…"} accessory="清理" colors={colors} disabled={busy || !cacheStats || cacheStats.entries === 0} onPress={clearCache} />
    <GroupTitle title="关于我们" colors={colors} />
    <FeatureRow icon="✳" title="关于开发者" subtitle="黑卡由独立开发者持续创作与维护" colors={colors} onPress={() => router.push("/developer")} />
    <FeatureRow icon="✉" title="意见反馈" subtitle="把遇到的问题或建议告诉我们" colors={colors} onPress={() => router.push("/feedback")} />

    <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
    <View style={{ alignItems: "center", paddingTop: 7, paddingBottom: 2 }}>
      <Text style={{ color: colors.subtle, fontSize: 10 }}>由独立开发者创作与维护</Text>
      <Text style={{ color: colors.subtle, fontSize: 10, marginTop: 4 }}>Version {version} · Build {build}</Text>
      <Text style={{ color: colors.subtle, fontSize: 10, marginTop: 4 }}>© HEIKA</Text>
      <Text style={{ color: colors.subtle, fontSize: 9, lineHeight: 14, textAlign: "center", marginTop: 8 }}>仅统计并清理公开发现内容缓存。登录、消息、草稿、收藏和作品数据保留；Android 系统图片缓存由系统管理。</Text>
    </View>
    {busy ? <ActivityIndicator color={isDark ? colors.gold : colors.action} /> : null}
  </PageFrame>;
}

async function openNotificationSettings() {
  if (Platform.OS === "android") {
    try {
      await Linking.sendIntent("android.settings.APP_NOTIFICATION_SETTINGS", [
        { key: "android.provider.extra.APP_PACKAGE", value: Constants.expoConfig?.android?.package || "com.heika.community" },
      ]);
      return;
    } catch { /* Fall back to the app's system settings page on older Android versions. */ }
  }
  await Linking.openSettings();
}

function GroupTitle({ title, colors }: { title: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <Text style={{ color: colors.subtle, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginTop: 7 }}>{title}</Text>;
}

function FeatureRow({ icon, title, subtitle, accessory = "›", colors, onPress, disabled = false }: { icon: string; title: string; subtitle: string; accessory?: string; colors: ReturnType<typeof useTheme>["colors"]; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8, borderBottomWidth: 0.5, borderColor: colors.line, opacity: disabled ? 0.55 : 1 }}>
    <View style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: colors.actionSoft }}><Text style={{ color: colors.gold, fontSize: 17, fontWeight: "600" }}>{icon}</Text></View>
    <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }}>{subtitle}</Text></View>
    <Text style={{ color: colors.subtle, fontSize: 11 }}>{accessory}</Text>
  </Pressable>;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
