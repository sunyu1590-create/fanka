import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Action, Notice, PageFrame } from "../components/MobileUi";
import { api, getDb, useMobileSession } from "../lib/mobile-api";
import { useTheme } from "../lib/theme";

type ViewMode = "login" | "signup" | "confirm" | "forgot" | "verify" | "reset" | "recovery";
const cooldownKey = (email: string, mode: "signup" | "recovery") => `heika:auth-resend:${mode}:${email.trim().toLowerCase()}`;

export default function AccountScreen() {
  const { colors } = useTheme();
  const { session, loading } = useMobileSession();
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [purpose, setPurpose] = useState<"signup" | "recovery">("recovery");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (view !== "verify" && view !== "confirm") { setCooldown(0); return; }
    let active = true;
    const key = cooldownKey(email, purpose);
    void AsyncStorage.getItem(key).then((value) => {
      if (!active || !value) return;
      const seconds = Math.max(0, Math.ceil((Number(value) - Date.now()) / 1000));
      if (Number.isFinite(seconds)) setCooldown(seconds);
    }).catch(() => undefined);
    const timer = setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => { active = false; clearInterval(timer); };
  }, [email, purpose, view]);

  const sendOtp = async (resend = false) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError("请先输入有效的邮箱地址。"); return; }
    if (cooldown > 0) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const client = await getDb();
      const result = purpose === "signup"
        ? await client.auth.resend({ type: "signup", email: normalizedEmail })
        : await client.auth.signInWithOtp({ email: normalizedEmail, options: { shouldCreateUser: false } });
      if (result.error) throw result.error;
      const until = Date.now() + 60_000;
      await AsyncStorage.setItem(cooldownKey(normalizedEmail, purpose), String(until));
      setCooldown(60); setView(purpose === "signup" ? "confirm" : "verify");
      setNotice(purpose === "signup" ? "确认邮件已发送，请查收邮箱并输入验证码。" : "如果该邮箱已注册，验证码已发送至邮箱。输入验证码后即可设置新密码。");
      if (!resend) setCode("");
    } catch (cause) { setError(translateError(cause)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const client = await getDb();
      const normalizedEmail = email.trim().toLowerCase();
      if (view === "login") {
        if (!normalizedEmail || !password) throw new Error("请输入邮箱和密码。");
        const { error: authError } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
        if (authError) throw authError;
        if (router.canGoBack()) router.back();
        else router.replace("/home");
      } else if (view === "signup") {
        if (nickname.trim().length < 2 || nickname.trim().length > 24) throw new Error("昵称请填写 2–24 个字。");
        if (password.length < 8) throw new Error("密码至少需要 8 位。");
        if (password !== confirmPassword) throw new Error("两次输入的密码不一致。");
        const { data, error: authError } = await client.auth.signUp({ email: normalizedEmail, password, options: { data: { nickname: nickname.trim() } } });
        if (authError) throw authError;
        if (data.session) { setNotice("账号已创建，欢迎来到黑卡。"); setView("login"); setPassword(""); setConfirmPassword(""); }
        else { setPurpose("signup"); setView("confirm"); setNotice("确认邮件已发送。输入邮件验证码完成注册；也可以在邮件中点击确认链接。"); }
      } else if (view === "forgot") {
        await sendOtp();
      } else if (view === "verify" || view === "confirm") {
        if (code.trim().length < 6) throw new Error("请输入邮件中的验证码。");
        const { error: verifyError } = await client.auth.verifyOtp({ email: normalizedEmail, token: code.trim(), type: purpose === "signup" ? "signup" : "email" });
        if (verifyError) throw verifyError;
        if (purpose === "signup") { setView("login"); setPassword(""); setConfirmPassword(""); setNotice("邮箱验证完成，账号已激活。请登录继续。"); await client.auth.signOut(); }
        else setView("reset");
      } else if (view === "reset") {
        if (password.length < 8) throw new Error("新密码至少需要 8 位。");
        if (password !== confirmPassword) throw new Error("两次输入的密码不一致。");
        const { error: updateError } = await client.auth.updateUser({ password });
        if (updateError) throw updateError;
        await client.auth.signOut();
        setPassword(""); setConfirmPassword(""); setCode(""); setView("login"); setNotice("密码已更新，请使用新密码登录。");
      } else if (view === "recovery") {
        if (password.length < 8) throw new Error("新密码至少需要 8 位。");
        if (password !== confirmPassword) throw new Error("两次输入的密码不一致。");
        await api("/api/v1/auth/recover", null, { method: "POST", body: JSON.stringify({ email: normalizedEmail, code: recoveryCode.trim(), password }) });
        setPassword(""); setConfirmPassword(""); setRecoveryCode(""); setView("login"); setNotice("密码已更新，请使用新密码登录。");
      }
    } catch (cause) { setError(translateError(cause)); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    setBusy(true); setError("");
    try { const client = await getDb(); const { error: signOutError } = await client.auth.signOut(); if (signOutError) throw signOutError; setNotice("已安全退出登录。"); }
    catch (cause) { setError(translateError(cause)); }
    finally { setBusy(false); }
  };

  if (loading) return <PageFrame title="账号与登录" eyebrow="HEIKA / ACCOUNT"><ActivityIndicator color={colors.action} /></PageFrame>;
  return <PageFrame title="账号与登录" eyebrow="HEIKA / ACCOUNT">
    {session ? <>
      <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>账号已登录</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>{session.user.email || "已连接账号"}</Text></View>
      <Action title={busy ? "请稍候…" : "退出登录"} disabled={busy} onPress={() => void signOut()} />
      <Action title="管理备用恢复码" subtle onPress={() => router.push("/recovery-codes")} />
      <Action title="返回黑卡" subtle onPress={() => router.canGoBack() ? router.back() : router.replace("/home")} />
    </> : <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "700", marginBottom: 5 }}>{viewTitle(view)}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginBottom: 14 }}>{viewDescription(view)}</Text>
      {(view !== "reset" && view !== "confirm") ? <Input label="邮箱" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="name@example.com" colors={colors} /> : null}
      {view === "signup" ? <Input label="昵称" value={nickname} onChangeText={setNickname} maxLength={24} autoComplete="nickname" placeholder="2–24 个字" colors={colors} /> : null}
      {(view === "login" || view === "signup" || view === "reset" || view === "recovery") ? <Input label={view === "reset" || view === "recovery" ? "新密码" : "密码"} value={password} onChangeText={setPassword} secureTextEntry autoComplete={view === "login" ? "current-password" : "new-password"} placeholder="至少 8 位" colors={colors} /> : null}
      {(view === "signup" || view === "reset" || view === "recovery") ? <Input label="确认密码" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" placeholder="再输入一次密码" colors={colors} /> : null}
      {view === "verify" || view === "confirm" ? <Input label="邮箱验证码" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 8))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={8} placeholder="输入邮件中的 6 位验证码" colors={colors} /> : null}
      {view === "recovery" ? <Input label="备用恢复码" value={recoveryCode} onChangeText={setRecoveryCode} autoCapitalize="characters" maxLength={64} placeholder="输入一枚未使用的恢复码" colors={colors} /> : null}
      <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
      {view === "forgot" ? <Action title={cooldown ? `${cooldown} 秒后可重发` : busy ? "正在发送…" : "发送邮箱验证码"} disabled={busy || cooldown > 0} onPress={() => void sendOtp()} /> : <Action title={busy ? "请稍候…" : primaryTitle(view)} disabled={busy} onPress={() => void submit()} />}
      {view === "verify" || view === "confirm" ? <Pressable disabled={busy || cooldown > 0} onPress={() => void sendOtp(true)} style={{ minHeight: 42, alignItems: "center", justifyContent: "center" }}><Text style={{ color: cooldown ? colors.subtle : colors.action, fontSize: 12, fontWeight: "700" }}>{busy ? "正在发送…" : cooldown ? `${cooldown} 秒后可重新发送` : "重新发送验证码"}</Text></Pressable> : null}
      {view === "login" ? <><SwitchLink title="忘记密码？使用邮箱验证码" onPress={() => { setView("forgot"); setPurpose("recovery"); setNotice(""); setError(""); }} colors={colors} /><SwitchLink title="使用备用恢复码重置" onPress={() => { setView("recovery"); setPurpose("recovery"); setNotice(""); setError(""); }} colors={colors} /><SwitchLink title="创建新账号" onPress={() => { setView("signup"); setPurpose("signup"); setNotice(""); setError(""); }} colors={colors} /></> : null}
      {view === "signup" ? <SwitchLink title="已有账号，返回登录" onPress={() => { setView("login"); setNotice(""); setError(""); }} colors={colors} /> : null}
      {(view === "forgot" || view === "verify" || view === "confirm") ? <><SwitchLink title={view === "forgot" ? "改用备用恢复码" : "使用备用恢复码"} onPress={() => { setView("recovery"); setNotice(""); setError(""); }} colors={colors} /><SwitchLink title="返回登录" onPress={() => { setView("login"); setNotice(""); setError(""); }} colors={colors} /></> : null}
      {view === "reset" || view === "recovery" ? <SwitchLink title="返回登录" onPress={() => { setView("login"); setNotice(""); setError(""); }} colors={colors} /> : null}
    </KeyboardAvoidingView>}
  </PageFrame>;
}

function Input({ label, value, onChangeText, colors, ...props }: { label: string; value: string; onChangeText: (value: string) => void; colors: ReturnType<typeof useTheme>["colors"] } & Omit<React.ComponentProps<typeof TextInput>, "value" | "onChangeText" | "style">) {
  return <View style={{ gap: 5, marginBottom: 12 }}><Text style={{ color: colors.ink, fontSize: 12, fontWeight: "700" }}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholderTextColor={colors.subtle} style={{ minHeight: 46, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontSize: 13 }} {...props} /></View>;
}
function SwitchLink({ title, onPress, colors }: { title: string; onPress: () => void; colors: ReturnType<typeof useTheme>["colors"] }) { return <Pressable onPress={onPress} style={{ minHeight: 38, justifyContent: "center", alignItems: "center" }}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "600" }}>{title}</Text></Pressable>; }
function viewTitle(view: ViewMode) { return ({ login: "让交流发生。", signup: "加入黑卡。", confirm: "确认邮箱。", forgot: "找回密码。", verify: "输入验证码。", reset: "设置新密码。", recovery: "使用恢复码。" } as const)[view]; }
function viewDescription(view: ViewMode) { return ({ login: "登录后同步你的收藏、卡片进度、消息和个人资料。", signup: "建立账号，保存发现并开启交流。", confirm: "输入确认邮件中的一次性验证码完成注册。", forgot: "验证码通过 Supabase 一次性验证码接口发送，60 秒后可重新发送。", verify: "输入邮箱收到的一次性验证码，以验证邮箱所有权。", reset: "邮箱验证成功，请设置新的登录密码。", recovery: "使用一枚未使用的备用恢复码验证身份并重置密码。" } as const)[view]; }
function primaryTitle(view: ViewMode) { return ({ login: "登录", signup: "创建账号", confirm: "验证邮箱", forgot: "继续", verify: "验证邮箱", reset: "更新密码", recovery: "验证恢复码并重置" } as const)[view]; }
function translateError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "操作失败，请稍后重试。";
  if (message.includes("Invalid login credentials")) return "邮箱或密码不正确。";
  if (message.includes("User already registered")) return "这个邮箱已注册，请直接登录或找回密码。";
  if (message.includes("Password should be")) return "密码至少需要 8 位。";
  if (message.includes("Token has expired") || message.includes("expired")) return "验证码已过期，请重新发送。";
  if (message.includes("Invalid token") || message.includes("invalid") && message.toLowerCase().includes("otp")) return "验证码不正确，请检查后重试。";
  if (message.includes("rate limit") || message.includes("too many requests")) return "操作过于频繁，请稍后再试。";
  return message;
}
