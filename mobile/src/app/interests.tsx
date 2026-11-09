import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router } from "expo-router";
import { Action, Notice, PageFrame } from "../components/MobileUi";
import { CategoryPickerSheet, type CategoryOption } from "../components/CategoryPickerSheet";
import { api, useMobileSession } from "../lib/mobile-api";
import { useTheme } from "../lib/theme";

type Category = { id: number; name: string; description?: string | null };
type ProfileResponse = { interests?: Array<{ tag_id: number }> };

export default function InterestsScreen() {
  const { colors } = useTheme();
  const { session } = useMobileSession();
  const [options, setOptions] = useState<CategoryOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const [categories, profile] = await Promise.all([
        api<{ items: Category[] }>("/api/v1/categories?channel=community&kind=tag", session),
        api<ProfileResponse>("/api/v1/me", session),
      ]);
      setOptions((categories.items || []).map((item) => ({ id: String(item.id), name: item.name, description: item.description || undefined })));
      setSelected((profile.interests || []).map((item) => String(item.tag_id)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "兴趣分类暂时无法加载"); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { void load(); }, [load]);

  const save = async (ids: string[]) => {
    if (!session) throw new Error("请先登录后保存兴趣");
    setError(""); setNotice("");
    await api("/api/v1/me/interests", session, { method: "PUT", body: JSON.stringify({ tag_ids: ids.map(Number) }) });
    setSelected(ids); setNotice("兴趣已保存，将用于整理每日探索内容。");
  };

  return <PageFrame title="兴趣分类" eyebrow="INTERESTS / HEIKA">
    {!session ? <View style={{ gap: 10 }}><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>登录后选择 3–8 个兴趣方向，设置会同步到你的账号。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></View> : <>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>选择 3–8 个方向，黑卡会据此整理每日探索内容。未点击完成前，修改不会保存。</Text>
      {loading ? <ActivityIndicator color={colors.action} style={{ marginTop: 14 }} /> : null}
      {!loading && options.length ? <Text style={{ color: colors.ink, fontSize: 13, marginTop: 5 }}>已选 {selected.length} 项　<Text onPress={() => setPickerOpen(true)} style={{ color: colors.action, fontWeight: "700" }}>修改选择</Text></Text> : null}
      <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
      {!loading && !error && options.length === 0 ? <Text style={{ color: colors.muted, fontSize: 12 }}>目前没有可选分类。</Text> : null}
    </>}
    <CategoryPickerSheet visible={pickerOpen && Boolean(session)} title="选择分类" description="选择 3–8 个兴趣方向" options={options} selectedIds={selected} mode="multiple" minSelections={3} maxSelections={8} loading={loading} error={error} onRetry={() => void load()} onDismiss={() => setPickerOpen(false)} onConfirm={save} />
  </PageFrame>;
}
