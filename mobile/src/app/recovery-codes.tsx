import React, { useState } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Action, Notice, PageFrame } from "../components/MobileUi";
import { api, useMobileSession } from "../lib/mobile-api";
import { useTheme } from "../lib/theme";

export default function RecoveryCodesScreen() {
  const { colors } = useTheme();
  const { session } = useMobileSession();
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generate = async () => {
    if (!session || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ codes: string[] }>("/api/v1/auth/recovery-codes", session, { method: "POST", body: JSON.stringify({}) });
      if (!Array.isArray(result.codes) || result.codes.length !== 8) throw new Error("恢复码没有完整生成。请重新生成并妥善保存。");
      setCodes(result.codes); setNotice("新恢复码已生成；之前生成的恢复码已经失效。请复制并离线保存，这些码只显示这一次。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "恢复码生成失败。"); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    if (!codes.length) return;
    try { await Clipboard.setStringAsync(codes.join("\n")); setNotice("恢复码已复制。请保存到安全位置，不要发送给他人。"); }
    catch { setError("复制失败，请逐条手动保存恢复码。"); }
  };
  if (!session) return <PageFrame title="备用恢复码"><Text style={{ color: colors.muted, fontSize: 13 }}>登录后可以生成备用恢复码。</Text></PageFrame>;
  return <PageFrame title="备用恢复码" eyebrow="ACCOUNT / RECOVERY">
    <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>为账号准备备用验证方式</Text>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>每枚恢复码只能使用一次。再次生成会立即让旧码全部失效。黑卡只保存恢复码的哈希，无法再次显示已生成的明文。</Text>
    <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
    {codes.length ? <View style={{ padding: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: 9 }}>{codes.map((code, index) => <Text key={`${code}-${index}`} selectable style={{ color: colors.ink, fontSize: 14, fontWeight: "700", letterSpacing: 1.2, fontVariant: ["tabular-nums"] }}>{String(index + 1).padStart(2, "0")}　{code}</Text>)}</View> : null}
    {codes.length ? <Action title="复制全部恢复码" subtle onPress={() => void copy()} /> : null}
    <Action title={busy ? "正在生成…" : codes.length ? "重新生成（使旧码失效）" : "生成 8 枚备用恢复码"} disabled={busy} onPress={() => void generate()} />
    <View style={{ paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.subtle, fontSize: 10, lineHeight: 16 }}>建议将恢复码保存在密码管理器或离线位置。不要截图后上传到聊天或公开相册。</Text></View>
  </PageFrame>;
}
