import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated as RNAnimated, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { useTheme } from "../lib/theme";

export type CategoryOption = { id: string; name: string; description?: string };
type Props = {
  visible: boolean;
  title?: string;
  description?: string;
  options: CategoryOption[];
  selectedIds: string[];
  mode?: "single" | "multiple";
  minSelections?: number;
  maxSelections?: number;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onDismiss: () => void;
  onConfirm: (ids: string[]) => void | Promise<void>;
};

export function CategoryPickerSheet({ visible, title = "选择分类", description = "按兴趣筛选内容", options, selectedIds, mode = "single", minSelections = 0, maxSelections, loading = false, error = "", onRetry, onDismiss, onConfirm }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new RNAnimated.Value(0)).current;
  const hasOpened = useRef(visible);
  const [draft, setDraft] = useState(selectedIds);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const savingRef = useRef(false);
  const selectedIdsKey = JSON.stringify(selectedIds);
  const committedIds = useMemo(() => JSON.parse(selectedIdsKey) as string[], [selectedIdsKey]);
  useEffect(() => {
    if (visible) {
      hasOpened.current = true;
      setMounted(true);
      progress.stopAnimation();
      if (reduceMotion) progress.setValue(1);
      else {
        progress.setValue(0);
        const frame = requestAnimationFrame(() => RNAnimated.timing(progress, { toValue: 1, duration: 240, useNativeDriver: true }).start());
        return () => { cancelAnimationFrame(frame); progress.stopAnimation(); };
      }
      return;
    }
    if (!hasOpened.current) return;
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(0); setMounted(false); hasOpened.current = false;
      return;
    }
    const animation = RNAnimated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) { setMounted(false); hasOpened.current = false; } });
    return () => animation.stop();
  }, [visible, reduceMotion, progress]);
  useEffect(() => { if (visible) { setDraft(committedIds); setSaving(false); setSubmitError(""); savingRef.current = false; } }, [committedIds, visible]);
  const toggle = (id: string) => {
    if (savingRef.current) return;
    if (mode === "single") { setDraft([id]); return; }
    setDraft((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : maxSelections && current.length >= maxSelections ? current : [...current, id]);
  };
  const dismiss = () => { if (!savingRef.current) onDismiss(); };
  const finish = async () => {
    if (savingRef.current || draft.length < minSelections || (maxSelections && draft.length > maxSelections)) return;
    savingRef.current = true;
    setSaving(true);
    setSubmitError("");
    try { await onConfirm(draft); onDismiss(); }
    catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "保存失败，请重试。"); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const blurMethod = Platform.OS === "android" && Number(Platform.Version) >= 31 ? "dimezisBlurViewSdk31Plus" : "none";
  const surface = isDark ? "rgba(27,30,34,0.91)" : "rgba(250,249,246,0.92)";
  const countLabel = mode === "multiple" ? `完成 · 已选择 ${draft.length} 项` : "完成";
  const validCount = draft.length >= minSelections && (!maxSelections || draft.length <= maxSelections);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  return <Modal transparent visible={mounted} animationType="none" statusBarTranslucent onRequestClose={dismiss}>
    <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <RNAnimated.View pointerEvents={visible ? "auto" : "none"} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.48)", opacity: progress }}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭分类选择" onPress={dismiss} disabled={saving} style={{ flex: 1 }} />
      </RNAnimated.View>
      <RNAnimated.View style={{ maxHeight: height * 0.78, width: "100%", overflow: "hidden", borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: surface, borderColor: colors.line, borderWidth: 0.5, transform: [{ translateY }] }}>
        <BlurView intensity={isDark ? 34 : 26} tint={isDark ? "dark" : "light"} blurMethod={blurMethod} pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10, backgroundColor: surface }}>
          <View style={{ width: 34, height: 4, borderRadius: 3, backgroundColor: colors.subtle, opacity: 0.55, alignSelf: "center", marginBottom: 14 }} />
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: 32 }}>
            <Text style={{ flex: 1, color: colors.ink, fontSize: 18, fontWeight: "700" }}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭" hitSlop={10} disabled={saving} onPress={dismiss} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.muted, fontSize: 23, lineHeight: 25 }}>×</Text></Pressable>
          </View>
          {description ? <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{description}</Text> : null}
        </View>
        {loading ? <View style={{ minHeight: 116, alignItems: "center", justifyContent: "center", gap: 9 }}><ActivityIndicator color={colors.action} /><Text style={{ color: colors.muted, fontSize: 12 }}>正在加载分类…</Text></View> : error ? <View style={{ minHeight: 116, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24 }}><Text style={{ color: colors.danger, fontSize: 12, textAlign: "center" }}>{error}</Text>{onRetry ? <Pressable onPress={onRetry}><Text style={{ color: colors.action, fontWeight: "700" }}>重新加载</Text></Pressable> : null}</View> : options.length ? <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
          {options.map((option) => {
            const selected = draft.includes(option.id);
            return <Animated.View key={option.id} layout={reduceMotion ? undefined : LinearTransition.duration(160)}>
              <Pressable accessibilityRole={mode === "multiple" ? "checkbox" : "radio"} accessibilityState={{ checked: selected, selected }} disabled={saving} onPress={() => toggle(option.id)} style={{ minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, marginHorizontal: -10, borderBottomWidth: 0.5, borderBottomColor: colors.line, backgroundColor: selected ? `${colors.gold}12` : "transparent" }}>
                <View style={{ flex: 1 }}><Text numberOfLines={2} style={{ color: selected ? colors.ink : colors.muted, fontSize: 14, fontWeight: selected ? "600" : "500" }}>{option.name}</Text>{option.description ? <Text numberOfLines={1} style={{ color: colors.subtle, fontSize: 10, marginTop: 2 }}>{option.description}</Text> : null}</View>
                <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.gold : "transparent", borderWidth: selected ? 0 : 1, borderColor: colors.line }}>
                  {selected ? <Animated.Text entering={reduceMotion ? undefined : FadeIn.duration(150)} exiting={reduceMotion ? undefined : FadeOut.duration(140)} style={{ color: isDark ? "#17191b" : colors.ink, fontSize: 14, fontWeight: "800" }}>✓</Animated.Text> : null}
                </View>
              </Pressable>
            </Animated.View>;
          })}
        </ScrollView> : <View style={{ minHeight: 100, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.muted, fontSize: 12 }}>暂时没有可选分类</Text></View>}
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) + 8, backgroundColor: surface, borderTopWidth: 0.5, borderTopColor: colors.line }}>
          {mode === "multiple" && draft.length < minSelections ? <Text style={{ color: colors.subtle, fontSize: 10, marginBottom: 7 }}>至少选择 {minSelections} 项</Text> : null}
          {mode === "multiple" && maxSelections && draft.length >= maxSelections ? <Text style={{ color: colors.subtle, fontSize: 10, marginBottom: 7 }}>最多选择 {maxSelections} 项</Text> : null}
          {submitError ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 11, marginBottom: 8 }}>{submitError}</Text> : null}
          <Pressable accessibilityRole="button" disabled={!validCount || !options.length || loading || saving || Boolean(error)} onPress={() => void finish()} style={{ minHeight: 46, alignItems: "center", justifyContent: "center", backgroundColor: validCount ? colors.action : colors.raised, opacity: saving ? 0.7 : 1 }}>
            {saving ? <ActivityIndicator color={isDark ? colors.bg : "#fff"} /> : <Text style={{ color: validCount ? (isDark ? colors.bg : "#fff") : colors.muted, fontSize: 13, fontWeight: "700" }}>{countLabel}</Text>}
          </Pressable>
        </View>
      </RNAnimated.View>
    </View>
  </Modal>;
}
