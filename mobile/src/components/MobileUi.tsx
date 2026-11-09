import React, { type ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useSegments } from "expo-router";
import { useTheme } from "../lib/theme";
import { MotionPressable } from "./MotionPressable";

export const palette = {
  bg: "#F6F5F1", paper: "#FFFFFF", ink: "#202421", muted: "#7E8583",
  line: "#E5E6E1", green: "#49665F", gold: "#C5A84A", soft: "#EAEDE8",
};

export function PageFrame({ title, eyebrow, back = true, children, scroll = true, refreshing, onRefresh, contentStyle }: {
  title: string; eyebrow?: string; back?: boolean; children: ReactNode; scroll?: boolean;
  refreshing?: boolean; onRefresh?: () => void; contentStyle?: ViewStyle;
}) {
  const { colors } = useTheme();
  const themed = makeUi(colors);
  const segments = useSegments();
  const inTabs = segments.includes("(tabs)");
  const content = scroll ? (
    <ScrollView contentContainerStyle={[themed.content, { paddingBottom: inTabs ? 116 : 34 }, contentStyle]} keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.action} /> : undefined}>
      {children}
    </ScrollView>
  ) : <View style={[themed.content, { flex: 1 }, contentStyle]}>{children}</View>;
  return <SafeAreaView style={themed.safe} edges={["top", "left", "right", "bottom"]}>
    <View style={themed.header}>
      {back && <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.canGoBack() ? router.back() : router.replace("/home")} hitSlop={12} style={themed.back}><Text style={themed.backText}>‹</Text></Pressable>}
      <View style={themed.headerTitle}>
        {eyebrow ? <Text style={themed.eyebrow}>{eyebrow}</Text> : null}
        <Text style={themed.title}>{title}</Text>
      </View>
    </View>
    {content}
  </SafeAreaView>;
}

export function Loading({ label = "正在加载…" }: { label?: string }) {
  const { colors } = useTheme();
  return <View style={ui.state}><ActivityIndicator color={colors.action} /><Text style={[ui.muted, { color: colors.muted }]}>{label}</Text></View>;
}

export function Notice({ children, tone = "error" }: { children?: ReactNode; tone?: "error" | "success" | "quiet" }) {
  const { colors } = useTheme();
  if (!children) return null;
  const backgroundColor = tone === "error" ? `${colors.danger}18` : tone === "success" ? colors.actionSoft : colors.raised;
  const borderColor = tone === "error" ? colors.danger : tone === "success" ? colors.action : colors.line;
  return <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutUp.duration(160)} layout={LinearTransition.duration(180)} style={[ui.notice, { backgroundColor, borderLeftColor: borderColor }]}><Text style={[ui.noticeText, { color: colors.ink }]}>{children}</Text></Animated.View>;
}

export function Action({ title, onPress, disabled = false, subtle = false }: { title: string; onPress: () => void; disabled?: boolean; subtle?: boolean }) {
  const { colors, isDark } = useTheme();
  return <MotionPressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[ui.action, { backgroundColor: subtle ? colors.surface : colors.action, borderColor: colors.line, borderWidth: subtle ? 1 : 0 }, disabled && ui.disabled]}>
    <Text style={[ui.actionText, subtle ? { color: colors.ink } : isDark ? { color: colors.bg } : null]}>{title}</Text>
  </MotionPressable>;
}

export function Row({ title, subtitle, accessory, onPress, style }: { title: string; subtitle?: string; accessory?: string; onPress?: () => void; style?: ViewStyle }) {
  const { colors } = useTheme();
  const content = <><View style={ui.rowText}><Text style={[ui.rowTitle, { color: colors.ink }]} numberOfLines={2}>{title}</Text>{subtitle ? <Text style={[ui.rowSubtitle, { color: colors.muted }]} numberOfLines={2}>{subtitle}</Text> : null}</View>{accessory ? <Text style={[ui.accessory, { color: colors.muted }]}>{accessory}</Text> : null}</>;
  return onPress ? <Pressable onPress={onPress} style={[ui.row, { borderBottomColor: colors.line }, style]}>{content}</Pressable> : <View style={[ui.row, { borderBottomColor: colors.line }, style]}>{content}</View>;
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  const { colors } = useTheme();
  return <View style={[ui.metric, { backgroundColor: colors.surface, borderBottomColor: colors.action }]}><Text style={[ui.metricValue, { color: colors.ink }]}>{value}</Text><Text style={[ui.metricLabel, { color: colors.muted }]}>{label}</Text></View>;
}

export function SectionTitle({ children, detail }: { children: ReactNode; detail?: string }) {
  const { colors } = useTheme();
  return <View style={ui.section}><Text style={[ui.sectionTitle, { color: colors.ink }]}>{children}</Text>{detail ? <Text style={[ui.sectionDetail, { color: colors.muted }]}>{detail}</Text> : null}</View>;
}

function makeUi(colors: ReturnType<typeof useTheme>["colors"]) {
  return { ...ui, safe: { ...ui.safe, backgroundColor: colors.bg }, header: { ...ui.header, backgroundColor: colors.surface, borderBottomColor: colors.line }, content: { ...ui.content } , backText: { ...ui.backText, color: colors.action }, eyebrow: { ...ui.eyebrow, color: colors.action }, title: { ...ui.title, color: colors.ink } };
}

export const ui = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, backgroundColor: palette.paper, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  back: { width: 36, height: 40, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 32, lineHeight: 36, color: palette.green },
  headerTitle: { flex: 1 },
  eyebrow: { color: palette.green, fontSize: 9, fontWeight: "700", letterSpacing: 1.4 },
  title: { color: palette.ink, fontSize: 20, fontWeight: "700", letterSpacing: -0.2 },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, gap: 12 },
  state: { minHeight: 140, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: palette.muted, fontSize: 13 },
  notice: { padding: 12, backgroundColor: "#F9E8E5", borderLeftWidth: 3, borderLeftColor: "#B15F51" },
  noticeSuccess: { backgroundColor: "#E8EFEA", borderLeftColor: palette.green },
  noticeQuiet: { backgroundColor: palette.paper, borderLeftColor: palette.line },
  noticeText: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  action: { minHeight: 46, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: palette.green, borderRadius: 10 },
  actionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  actionSubtle: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  actionSubtleText: { color: palette.ink },
  disabled: { opacity: 0.55 },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { color: palette.ink, fontSize: 14, fontWeight: "600" },
  rowSubtitle: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  accessory: { color: palette.muted, fontSize: 12 },
  metric: { flex: 1, minHeight: 74, justifyContent: "center", paddingHorizontal: 12, backgroundColor: palette.paper, borderBottomWidth: 2, borderBottomColor: palette.green },
  metricValue: { color: palette.ink, fontSize: 21, fontWeight: "700" },
  metricLabel: { color: palette.muted, fontSize: 11, marginTop: 3 },
  section: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 8, marginBottom: 2 },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "700" },
  sectionDetail: { color: palette.muted, fontSize: 11 },
});
