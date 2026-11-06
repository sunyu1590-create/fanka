import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Text, TextInput } from "react-native";
import { router } from "expo-router";
import { Action, Notice, PageFrame, palette, ui } from "../components/MobileUi";
import { getDb, useMobileSession } from "../lib/mobile-api";

export default function AccountScreen() {
  const { session, loading } = useMobileSession();
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!email.trim() || password.length < 8) { setMessage("请输入邮箱和至少 8 位密码。"); return; }
    if (signup && nickname.trim().length < 2) { setMessage("昵称至少需要 2 个字。"); return; }
    setBusy(true); setMessage("");
    try {
      const client = await getDb();
      const result = signup
        ? await client.auth.signUp({ email: email.trim(), password, options: { data: { nickname: nickname.trim() } } })
        : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (signup && !result.data.session) {
        setMessage("注册已提交，请按账号设置完成邮箱确认，再回来登录。");
        return;
      }
      Alert.alert(signup ? "账号已创建" : "登录成功", signup ? "欢迎加入黑卡。" : "账号状态已同步。", [{ text: "继续", onPress: () => router.canGoBack() ? router.back() : router.replace("/") }]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "账号操作失败，请稍后重试。");
    } finally { setBusy(false); }
  };

  const signOut = async () => {
    setBusy(true);
    try { const client = await getDb(); const { error } = await client.auth.signOut(); if (error) throw error; setMessage("已退出登录。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "退出失败。"); }
    finally { setBusy(false); }
  };

  return <PageFrame title="账号与登录" eyebrow="HEIKA / ACCOUNT">
    {loading ? <Text style={ui.muted}>正在读取账号状态…</Text> : session ? <>
      <Text style={ui.sectionTitle}>已登录</Text>
      <Text style={ui.rowSubtitle}>{session.user.email || "账号已连接"}</Text>
      <Action title={busy ? "请稍候…" : "退出登录"} disabled={busy} onPress={() => void signOut()} />
      <Action title="返回黑卡" subtle onPress={() => router.canGoBack() ? router.back() : router.replace("/")} />
    </> : <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {signup ? <TextInput value={nickname} onChangeText={setNickname} style={field} placeholder="昵称" placeholderTextColor={palette.muted} maxLength={24} /> : null}
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={field} placeholder="邮箱" placeholderTextColor={palette.muted} />
      <TextInput value={password} onChangeText={setPassword} secureTextEntry style={field} placeholder="密码（至少 8 位）" placeholderTextColor={palette.muted} />
      <Action title={busy ? "请稍候…" : signup ? "创建账号" : "登录"} disabled={busy} onPress={() => void submit()} />
      <Action title={signup ? "已有账号，返回登录" : "创建新账号"} subtle onPress={() => { setSignup((value) => !value); setMessage(""); }} />
      {!signup ? <Text style={ui.rowSubtitle}>忘记密码可在网页版账号安全页面使用邮箱验证码或恢复码。</Text> : null}
    </KeyboardAvoidingView>}
    <Notice>{message}</Notice>
  </PageFrame>;
}

const field = { minHeight: 50, paddingHorizontal: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E6E1", borderRadius: 12, color: "#202421", fontSize: 14, marginBottom: 12 } as const;
