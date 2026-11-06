import React, { useState } from "react";
import { ActivityIndicator, DeviceEventEmitter, Pressable, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Action, Notice, PageFrame, SectionTitle, palette, ui } from "../components/MobileUi";
import { api, useMobileSession } from "../lib/mobile-api";

type Mode = "title" | "outline" | "polish" | "topics";
const modes: { key: Mode; label: string; hint: string }[] = [
  { key: "title", label: "标题建议", hint: "生成多个简洁、自然的标题" },
  { key: "outline", label: "写作提纲", hint: "梳理开头、展开和收尾" },
  { key: "polish", label: "润色正文", hint: "保留原意和个人语气" },
  { key: "topics", label: "推荐话题", hint: "匹配适合内容的话题" },
];

export default function AiWorkbenchScreen() {
  const { session, loading: authLoading } = useMobileSession();
  const [mode, setMode] = useState<Mode>("title");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("生活");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const generate = async () => {
    if (!session) return;
    if (!title.trim() && !content.trim()) { setError("先写下标题或正文，再开始整理。"); return; }
    setBusy(true); setError(""); setNotice(""); setOutput("");
    try {
      const result = await api<{ output: string }>("/api/v1/ai/workbench", session, { method: "POST", body: JSON.stringify({ mode, title, content, category }) });
      setOutput(result.output || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI 暂时无法生成内容，请稍后重试。"); }
    finally { setBusy(false); }
  };

  const useOutput = () => {
    if (!output) return;
    DeviceEventEmitter.emit("heika-ai-result", { mode, output });
    setNotice("已带入发布页草稿。你可以继续修改后再发布。");
    router.back();
  };
  const copy = async () => {
    if (!output) return;
    await Clipboard.setStringAsync(output);
    setNotice("已复制到剪贴板。");
  };

  if (authLoading) return <PageFrame title="AI 工作台" eyebrow="CREATE / ASSIST"><ActivityIndicator color={palette.green} /></PageFrame>;
  if (!session) return <PageFrame title="AI 工作台" eyebrow="CREATE / ASSIST"><Text style={ui.muted}>登录后使用 AI 创作助手。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></PageFrame>;

  return <PageFrame title="AI 工作台" eyebrow="CREATE / ASSIST">
    <Text style={intro}>AI 帮你整理表达，内容仍由你判断、修改和发布。</Text>
    <View style={modeRow}>{modes.map((item) => <Pressable key={item.key} onPress={() => { setMode(item.key); setOutput(""); setError(""); }} style={[modeChip, mode === item.key && modeSelected]}><Text style={[modeLabel, mode === item.key && modeLabelSelected]}>{item.label}</Text></Pressable>)}</View>
    <Text style={ui.rowSubtitle}>{modes.find((item) => item.key === mode)?.hint}</Text>
    <TextInput value={title} onChangeText={setTitle} style={field} maxLength={160} placeholder="标题（可选）" placeholderTextColor={palette.muted} />
    <TextInput value={category} onChangeText={setCategory} style={field} maxLength={40} placeholder="内容分类" placeholderTextColor={palette.muted} />
    <TextInput value={content} onChangeText={setContent} style={bodyField} multiline textAlignVertical="top" maxLength={6000} placeholder="写下真实素材、观察或初稿…" placeholderTextColor={palette.muted} />
    <Action title={busy ? "正在整理…" : "生成建议"} disabled={busy} onPress={() => void generate()} />
    {busy ? <ActivityIndicator color={palette.green} style={{ marginTop: 6 }} /> : null}
    <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
    {output ? <>
      <SectionTitle>生成结果</SectionTitle>
      <View style={resultCard}><Text selectable style={resultText}>{output}</Text></View>
      <View style={buttonRow}><View style={{ flex: 1 }}><Action title="复制结果" subtle onPress={() => void copy()} /></View><View style={{ flex: 1 }}><Action title="带入发布页" onPress={useOutput} /></View></View>
    </> : null}
  </PageFrame>;
}

const intro = { color: palette.muted, fontSize: 13, lineHeight: 20 } as const;
const modeRow = { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 } as const;
const modeChip = { minHeight: 38, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, borderRadius: 18 } as const;
const modeSelected = { backgroundColor: "#E7ECE8", borderColor: palette.green } as const;
const modeLabel = { color: palette.muted, fontSize: 12 } as const;
const modeLabelSelected = { color: palette.green, fontWeight: "700" as const };
const field = { minHeight: 48, paddingHorizontal: 13, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, borderRadius: 10, color: palette.ink, fontSize: 14 } as const;
const bodyField = { minHeight: 150, padding: 13, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, borderRadius: 10, color: palette.ink, fontSize: 14, lineHeight: 21 } as const;
const resultCard = { padding: 14, backgroundColor: palette.paper, borderLeftWidth: 3, borderLeftColor: palette.green } as const;
const resultText = { color: palette.ink, fontSize: 14, lineHeight: 22 } as const;
const buttonRow = { flexDirection: "row", gap: 9 } as const;
