import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Action, Notice, PageFrame } from "../components/MobileUi";
import { NativeImage } from "../components/NativeImage";
import { api, useMobileSession } from "../lib/mobile-api";
import { writeCache } from "../lib/local-store";
import { useTheme } from "../lib/theme";

type Profile = { id: string; nickname: string | null; bio: string | null; avatar_url: string | null; show_bookmarks: boolean };
type DetailName = "gender" | "mbti" | "birthday" | "hobbies";
type Detail = { attribute: DetailName; value: string; is_public: boolean };
type ProfileResponse = { profile: Profile; details: Detail[] };
const detailNames: DetailName[] = ["gender", "mbti", "birthday", "hobbies"];

export default function ProfileEditScreen() {
  const { colors } = useTheme();
  const { session } = useMobileSession();
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [values, setValues] = useState<Record<DetailName, string>>({ gender: "", mbti: "", birthday: "", hobbies: "" });
  const [visibility, setVisibility] = useState<Record<DetailName, boolean>>({ gender: false, mbti: false, birthday: false, hobbies: false });
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    if (!session) { setLoading(false); return; }
    void api<ProfileResponse>("/api/v1/me", session).then((data) => {
      if (!active) return;
      setNickname(data.profile.nickname || ""); setBio(data.profile.bio || ""); setAvatarUrl(data.profile.avatar_url); setShowBookmarks(data.profile.show_bookmarks);
      const nextValues: Record<DetailName, string> = { gender: "", mbti: "", birthday: "", hobbies: "" };
      const nextVisibility: Record<DetailName, boolean> = { gender: false, mbti: false, birthday: false, hobbies: false };
      for (const item of data.details || []) {
        if (!detailNames.includes(item.attribute)) continue;
        let value = item.value || "";
        if (item.attribute === "hobbies") { try { value = (JSON.parse(value) as string[]).join("、"); } catch { value = ""; } }
        nextValues[item.attribute] = value; nextVisibility[item.attribute] = Boolean(item.is_public);
      }
      setValues(nextValues); setVisibility(nextVisibility);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "个人资料加载失败。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  const chooseAvatar = async () => {
    if (!session || busy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError("需要允许 HEIKA 访问相册，才能更换头像。"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const compressed = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 900, height: 900 } }], { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (!compressed.base64 || Math.ceil(compressed.base64.length * 3 / 4) > 2 * 1024 * 1024) throw new Error("头像压缩后仍超过 2 MB，请换一张图片。");
      const form = new FormData();
      form.append("file", { uri: compressed.uri, name: "avatar.jpg", type: "image/jpeg" } as unknown as Blob);
      const updated = await api<Profile>("/api/v1/me/avatar", session, { method: "POST", body: form });
      setAvatarUrl(updated.avatar_url); void writeCache(`my-profile:${session.user.id}`, updated); setNotice("头像已更新。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "头像更新失败，请重试。"); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!session || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const details: Detail[] = detailNames.map((attribute) => ({
        attribute,
        value: attribute === "hobbies" ? JSON.stringify([...new Set(values.hobbies.split(/[、,，]/).map((item) => item.trim()).filter(Boolean))].slice(0, 8)) : values[attribute].trim(),
        is_public: visibility[attribute],
      }));
      const result = await api<Profile>("/api/v1/me", session, { method: "PATCH", body: JSON.stringify({ nickname: nickname.trim(), bio: bio.trim(), show_bookmarks: showBookmarks, details }) });
      const next = { ...result, avatar_url: avatarUrl };
      void writeCache(`my-profile:${session.user.id}`, next); setNotice("个人资料已保存并同步。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请检查资料后重试。"); }
    finally { setBusy(false); }
  };

  if (!session) return <PageFrame title="编辑个人资料"><Text style={{ color: colors.muted, fontSize: 13 }}>登录后可以编辑个人资料。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></PageFrame>;
  return <PageFrame title="个人资料" eyebrow="PROFILE / EDIT">
    {loading ? <ActivityIndicator color={colors.action} /> : <>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>每项资料都可以单独设置是否公开。关闭后仅自己可见。</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line }}>
        <View style={{ width: 62, height: 62, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, overflow: "hidden" }}>{avatarUrl ? <NativeImage uri={avatarUrl} label="个人头像" style={{ width: 62, height: 62 }} /> : <Text style={{ color: colors.action, fontSize: 20, fontWeight: "700" }}>{(nickname || "探").slice(0, 1)}</Text>}</View>
        <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: "700" }}>头像</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 3 }}>JPEG、PNG、WebP，最大 2 MB</Text></View>
        <Pressable accessibilityRole="button" onPress={() => void chooseAvatar()} disabled={busy} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 10 }}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>{busy ? "处理中…" : "更换"}</Text></Pressable>
      </View>
      <Field title="昵称" value={nickname} onChangeText={setNickname} maxLength={24} placeholder="请输入昵称" colors={colors} />
      <Field title="简介" value={bio} onChangeText={setBio} maxLength={80} placeholder="介绍一下自己" multiline colors={colors} />
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700", marginTop: 9 }}>个人特征</Text>
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: -5 }}>每项都可选择是否显示在公开主页。</Text>
      <View style={{ gap: 6 }}><Text style={{ color: colors.ink, fontSize: 12, fontWeight: "700" }}>性别</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{[["", "暂不填写"], ["female", "女"], ["male", "男"], ["nonbinary", "非二元"], ["undisclosed", "不愿透露"]].map(([value, label]) => <Pressable key={value || "empty"} accessibilityRole="button" accessibilityState={{ selected: values.gender === value }} onPress={() => setValues((current) => ({ ...current, gender: value }))} style={{ minHeight: 34, paddingHorizontal: 10, justifyContent: "center", borderWidth: 1, borderColor: values.gender === value ? colors.action : colors.line, backgroundColor: values.gender === value ? colors.actionSoft : colors.surface }}><Text style={{ color: values.gender === value ? colors.action : colors.muted, fontSize: 11 }}>{label}</Text></Pressable>)}</View></View>
      <Field title="MBTI" value={values.mbti} onChangeText={(value) => setValues((current) => ({ ...current, mbti: value.toUpperCase() }))} maxLength={4} placeholder="例如 INFP" colors={colors} />
      <Field title="生日" value={values.birthday} onChangeText={(value) => setValues((current) => ({ ...current, birthday: value }))} maxLength={10} placeholder="YYYY-MM-DD" colors={colors} />
      <Field title="爱好" value={values.hobbies} onChangeText={(value) => setValues((current) => ({ ...current, hobbies: value }))} maxLength={180} placeholder="用顿号分隔，最多 8 项" colors={colors} />
      {detailNames.map((attribute) => <PrivacySwitch key={attribute} label={`公开${attributeLabel(attribute)}`} value={visibility[attribute]} onValueChange={(value) => setVisibility((current) => ({ ...current, [attribute]: value }))} colors={colors} />)}
      <PrivacySwitch label="公开我的收藏" value={showBookmarks} onValueChange={setShowBookmarks} colors={colors} />
      <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
      <Action title={busy ? "保存中…" : "保存资料"} disabled={busy} onPress={() => void save()} />
    </>}
  </PageFrame>;
}

function Field({ title, value, onChangeText, placeholder, maxLength, multiline = false, colors }: { title: string; value: string; onChangeText: (value: string) => void; placeholder: string; maxLength?: number; multiline?: boolean; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={{ gap: 6 }}><Text style={{ color: colors.ink, fontSize: 12, fontWeight: "700" }}>{title}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.subtle} maxLength={maxLength} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} style={{ minHeight: multiline ? 86 : 45, paddingHorizontal: 12, paddingVertical: multiline ? 10 : 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontSize: 13 }} /></View>;
}
function PrivacySwitch({ label, value, onValueChange, colors }: { label: string; value: boolean; onValueChange: (value: boolean) => void; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: colors.line }}><View><Text style={{ color: colors.ink, fontSize: 12, fontWeight: "600" }}>{label}</Text><Text style={{ color: colors.subtle, fontSize: 10, marginTop: 2 }}>{value ? "公开可见" : "仅自己可见"}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.line, true: colors.action }} thumbColor={colors.surface} /></View>;
}
function attributeLabel(value: DetailName) { return ({ gender: "性别", mbti: "MBTI", birthday: "生日", hobbies: "爱好" } as const)[value]; }
