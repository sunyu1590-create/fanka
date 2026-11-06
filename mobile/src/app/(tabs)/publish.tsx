import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { useTheme } from "../../lib/theme";
import { API_BASE, api, makeUuid, useMobileSession } from "../../lib/mobile-api";
import { clearDraft, readDraft, writeDraft, type LocalDraft } from "../../lib/local-store";
import { NativeImage } from "../../components/NativeImage";
import { Action, Notice } from "../../components/MobileUi";

type Category = { id: number; name: string; is_featured?: boolean };
type Topic = { id: number; name: string; postCount?: number };
type MediaItem = { uri: string; id: string; type: string; name: string; path?: string };
type SavedDraft = { id: number; cloudId: string };
type EditablePost = {
  id: string; client_id: number; title: string; body: string; status: string; updated_at?: string;
  image_url?: string | null; interest_tags?: { name?: string | null } | null;
  post_topics?: Array<{ interest_tags?: { name?: string | null } | null }>;
  post_media?: Array<{ storage_path: string; sort_order: number }>;
  images?: string[];
};

async function compressForUpload(uri: string) {
  const variants = [
    { width: 1800, compress: 0.82 },
    { width: 1500, compress: 0.70 },
    { width: 1200, compress: 0.58 },
  ];
  for (const variant of variants) {
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: variant.width } }], { compress: variant.compress, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (!result.base64) throw new Error("图片压缩结果校验失败，请重新选择图片。");
    const estimatedBytes = Math.ceil(result.base64.length * 3 / 4);
    if (estimatedBytes <= 4 * 1024 * 1024) return result.uri;
  }
  throw new Error("图片压缩后仍超过 4 MB，请换一张图片。");
}

export default function PublishScreen() {
  const { colors } = useTheme();
  const { session } = useMobileSession();
  const params = useLocalSearchParams<{ editId?: string | string[] }>();
  const editId = Array.isArray(params.editId) ? params.editId[0] : params.editId;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("生活");
  const [categories, setCategories] = useState<Category[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicQuery, setTopicQuery] = useState("");
  const [images, setImages] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cloudDraft, setCloudDraft] = useState<SavedDraft | null>(null);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const savingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const categoryData = await api<{ items: Category[] }>("/api/v1/categories?channel=community&kind=category", session).catch(() => ({ items: [] }));
      if (!active) return;
      setCategories(categoryData.items || []);
      if (categoryData.items?.length) setCategory((current) => categoryData.items.some((item) => item.name === current) ? current : categoryData.items[0].name);

      if (editId && session) {
        try {
          const [post, local] = await Promise.all([
            api<EditablePost>(`/api/v1/posts/${encodeURIComponent(editId)}`, session),
            readDraft(session.user.id, editId),
          ]);
          if (!active) return;
          if (post.status !== "draft" && post.status !== "pending_review") throw new Error("这篇作品的状态已变化，请从个人页面刷新后再打开。");
          const tag = post.interest_tags?.name || "生活";
          const topicNames = (post.post_topics || []).flatMap((item) => item.interest_tags?.name ? [item.interest_tags.name] : []);
          const media = [...(post.post_media || [])].sort((a, b) => a.sort_order - b.sort_order);
          const offset = post.image_url ? 1 : 0;
          const remoteMedia: MediaItem[] = media.map((item, index) => {
            const fileName = item.storage_path.split("/").pop() || `${index + 1}.jpg`;
            const uri = post.images?.[index + offset] || `${API_BASE}/api/v1/media?path=${encodeURIComponent(item.storage_path)}&redirect=1`;
            return { uri, id: makeUuid(), type: /\.png$/i.test(fileName) ? "image/png" : /\.webp$/i.test(fileName) ? "image/webp" : "image/jpeg", name: fileName, path: item.storage_path };
          });
          const localIsNewer = Boolean(local && Date.parse(post.updated_at || "") < local.updatedAt);
          setTitle(localIsNewer && local ? local.title : post.title);
          setBody(localIsNewer && local ? local.body : post.body);
          setCategory(localIsNewer && local ? local.tag : tag);
          setSelectedTopics(localIsNewer && local ? local.topics : topicNames);
          setImages(localIsNewer && local ? local.media || (local.imageUris || []).map((uri) => ({ uri, id: makeUuid(), type: "image/jpeg", name: `${Date.now()}.jpg` })) : remoteMedia);
          setCoverUrl(post.image_url || null);
          setCloudDraft({ id: post.client_id, cloudId: post.id });
          setEditStatus(post.status);
        } catch (cause) {
          if (active) setError(cause instanceof Error ? cause.message : "这篇作品暂时无法编辑。");
        }
      } else if (session) {
        const draft = await readDraft(session.user.id);
        if (!active) return;
        if (draft) { setTitle(draft.title); setBody(draft.body); setCategory(draft.tag); setSelectedTopics(draft.topics || []); setImages(draft.media || (draft.imageUris || []).map((uri) => ({ uri, id: makeUuid(), type: "image/jpeg", name: `${Date.now()}.jpg` }))); }
      }
      if (active) setRestored(true);
    })().catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : "发布页面加载失败。"); setRestored(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editId, session]);

  useEffect(() => {
    let active = true;
    const query = topicQuery.trim();
    const timeout = setTimeout(() => {
      const path = query ? `/api/v1/topics?q=${encodeURIComponent(query)}` : "/api/v1/topics?featured=1";
      void api<Topic[]>(path, session).then((items) => { if (active) setTopics(items || []); }).catch(() => { if (active) setTopics([]); });
    }, 180);
    return () => { active = false; clearTimeout(timeout); };
  }, [session, topicQuery]);

  useEffect(() => {
    if (!session || !restored || busy) return;
    if (savingRef.current) clearTimeout(savingRef.current);
    savingRef.current = setTimeout(() => {
      const local: LocalDraft = { title, body, tag: category, topics: selectedTopics, imageUris: images.map((item) => item.uri), media: images, updatedAt: Date.now() };
      void writeDraft(session.user.id, local, editId).catch(() => undefined);
    }, 380);
    return () => { if (savingRef.current) clearTimeout(savingRef.current); };
  }, [body, busy, category, editId, images, restored, selectedTopics, session, title]);

  const chooseImages = async () => {
    if (busy) return;
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError("需要允许 HEIKA 访问相册，才能选择发布图片。"); return; }
    const remaining = Math.max(0, 9 - images.length);
    if (!remaining) { setError("一篇内容最多添加 9 张图片。"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: remaining, quality: 1, orderedSelection: true });
    if (result.canceled) return;
    setBusy(true);
    try {
      const prepared: MediaItem[] = [];
      for (const asset of result.assets.slice(0, remaining)) {
        const compressed = await compressForUpload(asset.uri);
        prepared.push({ uri: compressed, id: makeUuid(), type: "image/jpeg", name: `${makeUuid()}.jpg` });
      }
      setImages((current) => [...current, ...prepared].slice(0, 9));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "图片处理失败，请重试。"); }
    finally { setBusy(false); }
  };

  const saveCloudDraft = async (current?: SavedDraft, mediaPaths?: string[]): Promise<SavedDraft> => {
    if (!session) throw new Error("登录后才能保存云端草稿。");
    const result = await api<{ id: number; cloudId: string }>("/api/v1/library-state", session, {
      method: "POST",
      body: JSON.stringify({ action: "draft", ...(current?.id ? { id: current.id } : {}), title: title.trim(), body: body.trim(), tag: category, topics: selectedTopics, ...(coverUrl ? { coverUrl } : {}), ...(mediaPaths ? { mediaPaths } : {}) }),
    });
    if (!result?.id || !result.cloudId) throw new Error("草稿没有保存成功，请重试。");
    setCloudDraft({ id: result.id, cloudId: result.cloudId });
    return result;
  };

  const uploadImages = async (draft: SavedDraft) => {
    const paths: string[] = [];
    for (let index = 0; index < images.length; index += 1) {
      const media = images[index];
      if (media.path) { paths.push(media.path); continue; }
      const form = new FormData();
      form.append("file", { uri: media.uri, name: media.name, type: media.type } as unknown as Blob);
      form.append("post_id", draft.cloudId);
      form.append("upload_id", media.id);
      form.append("sort_order", String(index));
      const uploaded = await api<{ path: string }>("/api/v1/media", session, { method: "POST", body: form });
      if (!uploaded.path) throw new Error("有图片没有上传完成，请重新尝试。");
      paths.push(uploaded.path);
      setImages((current) => current.map((item) => item.id === media.id ? { ...item, path: uploaded.path } : item));
    }
    return paths;
  };

  const saveDraft = async () => {
    if (editId && !cloudDraft) { setError("作品尚未加载完成，请返回个人页面刷新后重试。"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const draft = await saveCloudDraft(cloudDraft || undefined);
      const mediaPaths = await uploadImages(draft);
      await saveCloudDraft(draft, mediaPaths);
      setNotice(editStatus === "pending_review" ? "修改已保存，作品仍处于审核中。" : "草稿和图片已保存到云端，网页端和安卓端都可以继续编辑。");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "草稿保存失败；本地草稿仍保留。"); }
    finally { setBusy(false); }
  };

  const publish = async () => {
    if (!session) { router.push("/account"); return; }
    if (editId && !cloudDraft) { setError("作品尚未加载完成，请返回个人页面刷新后重试。"); return; }
    if (!title.trim() || !body.trim()) { setError("请先填写标题和正文，再提交作品。"); return; }
    if (title.trim().length > 80 || body.trim().length > 5000) { setError("标题最多 80 字，正文最多 5000 字。"); return; }
    if (selectedTopics.length > 5) { setError("话题最多选择 5 个。"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const draft = cloudDraft || await saveCloudDraft();
      const mediaPaths = await uploadImages(draft);
      await api("/api/v1/library-state", session, { method: "POST", body: JSON.stringify({ action: "publish", id: draft.id, title: title.trim(), body: body.trim(), tag: category, topics: selectedTopics, mediaPaths, ...(coverUrl ? { coverUrl } : {}) }) });
      await clearDraft(session.user.id, editId);
      if (editId) {
        Alert.alert("提交成功", "作品修改已提交审核，审核通过后会更新公开内容。", [{ text: "确定", onPress: () => router.replace("/me" as never) }]);
        return;
      }
      setTitle(""); setBody(""); setImages([]); setSelectedTopics([]); setCloudDraft(null);
      setNotice("作品已提交审核，通过后会在发现页公开展示。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "发布没有完成；草稿和已上传图片会保留，稍后可重试。"); }
    finally { setBusy(false); }
  };

  const toggleTopic = (name: string) => {
    setSelectedTopics((current) => current.includes(name) ? current.filter((item) => item !== name) : current.length >= 5 ? current : [...current, name]);
  };
  const createTopic = async () => {
    const name = topicQuery.trim().replace(/^#+/, "");
    if (!session || name.length < 2) return;
    setBusy(true); setError("");
    try {
      const topic = await api<Topic>("/api/v1/topics", session, { method: "POST", body: JSON.stringify({ name }) });
      setTopics((current) => [topic, ...current.filter((item) => item.id !== topic.id)]);
      setSelectedTopics((current) => current.includes(topic.name) || current.length >= 5 ? current : [...current, topic.name]);
      setTopicQuery(""); setNotice(`已添加话题「${topic.name}」。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "话题暂时不能添加。"); }
    finally { setBusy(false); }
  };
  const moveImage = (index: number, direction: -1 | 1) => setImages((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 125 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View><Text style={{ color: colors.subtle, fontSize: 9, fontWeight: "800", letterSpacing: 1.8 }}>{editId ? "EDIT / STORY" : "CREATE / STORY"}</Text><Text style={{ color: colors.ink, fontSize: 27, lineHeight: 34, fontWeight: "700", marginTop: 7 }}>{editId ? "编辑作品" : "分享一篇内容"}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="打开 AI 创作工作台" onPress={() => router.push("/ai-workbench")} style={{ paddingHorizontal: 12, minHeight: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>AI 工作台</Text></Pressable>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }}>{editId ? "修改内容会重新进入审核，原作品保持原样展示。" : "写下真实的观察与经验，发布后进入社区审核。"}</Text>
      {editStatus === "pending_review" ? <Text style={{ color: colors.gold, fontSize: 11, marginTop: 8 }}>当前状态：审核中</Text> : null}
      {!session ? <View style={{ marginTop: 20, padding: 14, backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.gold }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: "700" }}>登录后可以同步草稿和发布内容</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></View> : null}
      <Animated.View entering={FadeInDown.duration(220)} style={{ marginTop: 24, gap: 8 }}>
        <Text style={label(colors)}>标题</Text>
        <TextInput value={title} onChangeText={setTitle} maxLength={80} placeholder="给你的发现一个标题" placeholderTextColor={colors.subtle} style={input(colors)} returnKeyType="next" />
        <Text style={{ color: colors.subtle, fontSize: 10, textAlign: "right" }}>{title.length}/80</Text>
      </Animated.View>
      <View style={{ marginTop: 15 }}><Text style={label(colors)}>分类</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
        {categories.map((item) => <Pressable key={item.id} onPress={() => setCategory(item.name)} style={[chip(colors), category === item.name && { backgroundColor: colors.actionSoft, borderColor: colors.action }]}><Text style={{ color: category === item.name ? colors.action : colors.muted, fontSize: 11, fontWeight: category === item.name ? "700" : "500" }}>{item.name}</Text></Pressable>)}
        {!categories.length ? <Text style={{ color: colors.muted, fontSize: 11, paddingVertical: 8 }}>分类正在加载…</Text> : null}
      </ScrollView></View>
      <View style={{ marginTop: 8, paddingTop: 15, borderTopWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}><Text style={label(colors)}>话题</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{selectedTopics.length}/5</Text></View>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>选择现有话题，帮助感兴趣的人找到内容。</Text>
        <TextInput value={topicQuery} onChangeText={setTopicQuery} placeholder="搜索话题" placeholderTextColor={colors.subtle} style={[input(colors), { marginTop: 10 }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, flexWrap: "wrap", paddingVertical: 9 }}>
          {topics.map((topic) => <Pressable key={topic.id} onPress={() => toggleTopic(topic.name)} style={[chip(colors), selectedTopics.includes(topic.name) && { backgroundColor: colors.actionSoft, borderColor: colors.action }]}><Text style={{ color: selectedTopics.includes(topic.name) ? colors.action : colors.muted, fontSize: 11 }}>#{topic.name}</Text></Pressable>)}
        </ScrollView>
        {topicQuery.trim().replace(/^#+/, "").length >= 2 && !topics.some((topic) => topic.name === topicQuery.trim().replace(/^#+/, "")) ? <Pressable accessibilityRole="button" onPress={() => void createTopic()} disabled={!session || busy} style={{ minHeight: 38, justifyContent: "center", borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>＋　创建话题「{topicQuery.trim().replace(/^#+/, "") }」</Text></Pressable> : null}
      </View>
      <View style={{ marginTop: 8 }}><Text style={label(colors)}>正文</Text><TextInput value={body} onChangeText={setBody} maxLength={5000} multiline textAlignVertical="top" placeholder="写下你的观察、经验或想法" placeholderTextColor={colors.subtle} style={[input(colors), { minHeight: 190, paddingTop: 13, lineHeight: 22 }]} /><Text style={{ color: colors.subtle, fontSize: 10, textAlign: "right", marginTop: 4 }}>{body.length}/5000</Text></View>
      <View style={{ marginTop: 17, paddingTop: 15, borderTopWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={label(colors)}>图片</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{images.length}/9　单张不超过 4 MB</Text></View>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>图片会在本机压缩后上传，长按箭头可调整顺序。</Text>
        {images.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 11 }}>
          {images.map((image, index) => <Animated.View key={image.id} layout={LinearTransition.duration(180)} style={{ width: "31.5%", aspectRatio: 0.86, position: "relative" }}>
            <NativeImage uri={image.uri} label={`第 ${index + 1} 张图片`} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
            <View style={{ position: "absolute", left: 5, right: 5, bottom: 5, flexDirection: "row", justifyContent: "space-between" }}>
              <Pressable onPress={() => moveImage(index, -1)} style={imageControl(colors)}><Text style={{ color: colors.ink, fontSize: 11 }}>‹</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="删除图片" onPress={() => setImages((current) => current.filter((item) => item.id !== image.id))} style={imageControl(colors)}><Text style={{ color: colors.danger, fontSize: 12 }}>×</Text></Pressable>
              <Pressable onPress={() => moveImage(index, 1)} style={imageControl(colors)}><Text style={{ color: colors.ink, fontSize: 11 }}>›</Text></Pressable>
            </View>
          </Animated.View>)}
        </View> : null}
        <Pressable accessibilityRole="button" onPress={() => void chooseImages()} disabled={busy || !session} style={{ minHeight: 52, marginTop: 10, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, opacity: busy || !session ? 0.6 : 1 }}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>{busy ? "正在准备…" : "＋　添加图片"}</Text></Pressable>
      </View>
      <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
      <View style={{ flexDirection: "row", gap: 9, marginTop: 18 }}>
        <View style={{ flex: 1 }}><Action title={busy ? "处理中…" : editId ? "保存修改" : "保存草稿"} disabled={busy || loading || !session || Boolean(editId && !cloudDraft)} subtle onPress={() => void saveDraft()} /></View>
        <View style={{ flex: 1.5 }}><Action title={busy ? "正在提交…" : editId ? "重新提交审核" : "提交作品"} disabled={busy || loading || !session || Boolean(editId && !cloudDraft)} onPress={() => void publish()} /></View>
      </View>
      {loading ? <ActivityIndicator color={colors.action} style={{ marginTop: 10 }} /> : null}
      {cloudDraft ? <Text style={{ color: colors.subtle, fontSize: 10, textAlign: "center", marginTop: 9 }}>草稿云端同步已开启</Text> : null}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const label = (colors: ReturnType<typeof useTheme>["colors"]) => ({ color: colors.ink, fontSize: 12, fontWeight: "700" as const });
const input = (colors: ReturnType<typeof useTheme>["colors"]) => ({ minHeight: 46, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontSize: 13 });
const chip = (colors: ReturnType<typeof useTheme>["colors"]) => ({ minHeight: 34, paddingHorizontal: 12, justifyContent: "center" as const, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface });
const imageControl = (colors: ReturnType<typeof useTheme>["colors"]) => ({ width: 27, height: 27, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line });
