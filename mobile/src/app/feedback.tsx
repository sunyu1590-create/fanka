import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Action, Notice, PageFrame } from "../components/MobileUi";
import { api, useMobileSession } from "../lib/mobile-api";
import { useTheme } from "../lib/theme";

const types = [{ id: "suggestion", label: "功能建议" }, { id: "problem", label: "使用问题" }, { id: "other", label: "其他反馈" }];

export default function FeedbackScreen() {
  const { colors, isDark } = useTheme();
  const { session } = useMobileSession();
  const [category, setCategory] = useState("suggestion");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submit = async () => {
    if (!session) { router.push("/account"); return; }
    if (message.trim().length < 10) { setError("请至少填写 10 个字，方便我们了解情况。"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.append("category", category); form.append("message", message.trim()); form.append("website", "");
      await api("/api/v1/feedback", session, { method: "POST", body: form });
      setMessage(""); setNotice("反馈已提交，感谢你的建议。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "反馈提交失败，请稍后重试。"); }
    finally { setBusy(false); }
  };

  return <PageFrame title="意见反馈" eyebrow="FEEDBACK / HEIKA">
    {!session ? <><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>登录后可以提交反馈，内容会关联当前账号并由授权的管理人员查看。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></> : <>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>反馈分类</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>{types.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: category === item.id }} onPress={() => setCategory(item.id)} style={{ flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", backgroundColor: category === item.id ? colors.actionSoft : colors.surface, borderBottomWidth: 2, borderColor: category === item.id ? colors.action : colors.line }}><Text style={{ color: category === item.id ? colors.action : colors.muted, fontSize: 11, fontWeight: category === item.id ? "700" : "500" }}>{item.label}</Text></Pressable>)}</View>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600", marginTop: 8 }}>反馈内容</Text>
      <TextInput value={message} onChangeText={setMessage} maxLength={3000} multiline textAlignVertical="top" placeholder="请描述你遇到的情况或建议（10–3000 字）" placeholderTextColor={colors.subtle} style={{ minHeight: 180, padding: 13, color: colors.ink, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, fontSize: 13, lineHeight: 20 }} />
      <Text style={{ color: colors.subtle, fontSize: 10, textAlign: "right" }}>{message.length}/3000</Text>
      <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
      <Pressable accessibilityRole="button" disabled={busy || message.trim().length < 10} onPress={() => void submit()} style={{ minHeight: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.action, opacity: busy || message.trim().length < 10 ? 0.55 : 1 }}>
        {busy ? <ActivityIndicator color={isDark ? colors.bg : "#fff"} /> : <Text style={{ color: isDark ? colors.bg : "#fff", fontSize: 13, fontWeight: "700" }}>提交反馈</Text>}
      </Pressable>
      <Text style={{ color: colors.subtle, fontSize: 10, lineHeight: 16 }}>反馈使用黑卡现有反馈系统，不会创建重复记录入口。</Text>
    </>}
  </PageFrame>;
}
