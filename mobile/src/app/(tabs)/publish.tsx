import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { useTheme } from "../../lib/theme";
import { API_BASE, api, makeUuid, useMobileSession } from "../../lib/mobile-api";
import { clearDraft, readDraft, writeDraft, type LocalDraft } from "../../lib/local-store";
import { NativeImage } from "../../components/NativeImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeMarkdown } from "../../components/NativeMarkdown";
import { ComposerSheet } from "../../components/ComposerSheet";
import { Action, Notice } from "../../components/MobileUi";
import { MotionPressable as Pressable } from "../../components/MotionPressable";

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
  const insets = useSafeAreaInsets();
  const [panel,setPanel] = useState<"topics" | "settings" | "preview" | null>(null);
  const [selectedImage,setSelectedImage] = useState<string | null>(null);
  const [bodyHeight,setBodyHeight] = useState(190);
  const [titleHeight,setTitleHeight] = useState(40);
  const [coverImageId,setCoverImageId] = useState<string | null>(null);
  const [dragImageId,setDragImageId] = useState<string | null>(null);
  const mediaGridRef=useRef<React.ComponentRef<typeof View>>(null);
  const mediaGridBounds=useRef({x:0,y:0,width:1});
  const dragRef=useRef<string|null>(null);
  const [uploadingImageId,setUploadingImageId]=useState<string|null>(null);
  const [failedImageId,setFailedImageId]=useState<string|null>(null);
  const [localStatus,setLocalStatus] = useState("自动保存至此设备");
  const localQueue = useRef<Promise<void>>(Promise.resolve());
  const flushLocal = useRef<() => Promise<void>>(async()=>{});
  const submitLock = useRef(false);
  const [bodyFocused,setBodyFocused]=useState(false);
  const bodyInput=useRef<React.ComponentRef<typeof TextInput>>(null);
  const bodySelection=useRef({start:0,end:0});
  const keyboardVisible=useRef(false);
  useEffect(()=>{const show=Keyboard.addListener("keyboardDidShow",()=>{keyboardVisible.current=true;});const hide=Keyboard.addListener("keyboardDidHide",()=>{keyboardVisible.current=false;setBodyFocused(false);});return()=>{show.remove();hide.remove();};},[]);

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
    setLoading(true);setRestored(false);setTitle("");setBody("");setImages([]);setCloudDraft(null);setSelectedTopics([]);setCoverUrl(null);setEditStatus(null);setCoverImageId(null);
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
          setCoverImageId(localIsNewer && local ? local.coverImageId || null : null);
          setCloudDraft({ id: post.client_id, cloudId: post.id });
          setEditStatus(post.status);
        } catch (cause) {
          if (active) setError(cause instanceof Error ? cause.message : "这篇作品暂时无法编辑。");
        }
      } else {
        const draft = await readDraft(session?.user.id || "guest");
        if (!active) return;
        if (draft) { setCoverImageId(draft.coverImageId || null); setTitle(draft.title); setBody(draft.body); setCategory(draft.tag); setSelectedTopics(draft.topics || []); setImages(draft.media || (draft.imageUris || []).map((uri) => ({ uri, id: makeUuid(), type: "image/jpeg", name: `${Date.now()}.jpg` }))); }
      }
      if (active) setRestored(true);
    })().catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : "发布页面加载失败。"); setRestored(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // Only identity changes reload a draft; token refreshes must not reset typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, session?.user.id]);

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
    if (!restored || submitLock.current) return;
    const persist = async () => {
      const local: LocalDraft = {title,body,tag:category,topics:selectedTopics,imageUris:images.map(item=>item.uri),media:images,coverImageId:coverImageId || undefined,updatedAt:Date.now()};
      if(!title && !body && !images.length) return;
      setLocalStatus("正在保存至此设备…");
      localQueue.current = localQueue.current.catch(()=>{}).then(()=>writeDraft(session?.user.id || "guest",local,editId));
      try { await localQueue.current; setLocalStatus("已保存至此设备"); } catch { setLocalStatus("本机保存失败，请重试"); throw new Error("本机草稿保存失败"); }
    };
    flushLocal.current=persist;
    savingRef.current=setTimeout(()=>{void persist().catch(()=>{});},380);
    return()=>{if(savingRef.current)clearTimeout(savingRef.current);};
  },[body,category,coverImageId,editId,images,restored,selectedTopics,session,title]);
  const leaveEditor = async () => { try {await flushLocal.current();router.replace("/me" as never);}catch{setError("本机草稿未保存，请先重试。");} };
  const leaveRef=useRef(leaveEditor); leaveRef.current=leaveEditor;
  useFocusEffect(useCallback(()=>{
    const listener=BackHandler.addEventListener("hardwareBackPress",()=>{if(keyboardVisible.current){Keyboard.dismiss();return true;}if(!submitLock.current)void leaveRef.current();return true;});
    return ()=>{listener.remove();if(!submitLock.current)void flushLocal.current().catch(()=>{});};
  },[]));
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

  const replaceImage = async (id:string) => {
    if(busy)return;
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted){setError("需要允许访问相册才能替换图片。");return;}
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsMultipleSelection:false,quality:1});
    if(result.canceled)return;
    setBusy(true);
    try { const uri=await compressForUpload(result.assets[0].uri),nextId=makeUuid();setImages(current=>current.map(item=>item.id===id?{uri,id:nextId,type:"image/jpeg",name:`${nextId}.jpg`}:item));if(coverImageId===id)setCoverImageId(nextId);setSelectedImage(nextId); }catch(cause){setError(cause instanceof Error?cause.message:"图片替换失败。");}finally{setBusy(false);}
  };
  const formatBody = (before:string,after="") => {
    const {start,end}=bodySelection.current,next=body.slice(0,start)+before+body.slice(start,end)+after+body.slice(end);
    if(next.length>5000)return;setBody(next);
    requestAnimationFrame(()=>{bodyInput.current?.focus();bodyInput.current?.setNativeProps({selection:{start:start+before.length,end:end+before.length}});});
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
    const ordered = coverImageId ? [...images.filter(image=>image.id===coverImageId),...images.filter(image=>image.id!==coverImageId)] : images;
    for (let index = 0; index < ordered.length; index += 1) {
      const media = ordered[index];
      if (media.path) { paths.push(media.path); continue; }
      const form = new FormData();
      form.append("file", { uri: media.uri, name: media.name, type: media.type } as unknown as Blob);
      form.append("post_id", draft.cloudId);
      form.append("upload_id", media.id);
      form.append("sort_order", String(index));
      setUploadingImageId(media.id); setFailedImageId(null);
      let uploaded: { path:string };
      try { uploaded = await api<{path:string}>("/api/v1/media",session,{method:"POST",body:form}); } catch(error) {setFailedImageId(media.id);throw error;} finally {setUploadingImageId(null);}
      if (!uploaded.path) throw new Error("有图片没有上传完成，请重新尝试。");
      paths.push(uploaded.path);
      setImages((current) => current.map((item) => item.id === media.id ? { ...item, path: uploaded.path } : item));
    }
    return paths;
  };

  const saveDraft = async () => {
    if(submitLock.current)return;
    if (editId && !cloudDraft) { setError("作品尚未加载完成，请返回个人页面刷新后重试。"); return; }
    submitLock.current=true;
    setBusy(true); setError(""); setNotice("");
    try {
      const draft = await saveCloudDraft(cloudDraft || undefined);
      const mediaPaths = await uploadImages(draft);
      await saveCloudDraft(draft, mediaPaths);
      setNotice(editStatus === "pending_review" ? "修改已保存，作品仍处于审核中。" : "草稿和图片已保存到云端，网页端和安卓端都可以继续编辑。");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "草稿保存失败；本地草稿仍保留。"); }
    finally { submitLock.current=false;setBusy(false); }
  };

  const publish = async () => {
    if (submitLock.current) return;
    if (!session) { router.push("/account"); return; }
    if (editId && !cloudDraft) { setError("作品尚未加载完成，请返回个人页面刷新后重试。"); return; }
    if (!title.trim() || !body.trim()) { setError("请先填写标题和正文，再提交作品。"); return; }
    if (title.trim().length > 80 || body.trim().length > 5000) { setError("标题最多 80 字，正文最多 5000 字。"); return; }
    if (selectedTopics.length > 5) { setError("话题最多选择 5 个。"); return; }
    submitLock.current=true;
    if(savingRef.current) clearTimeout(savingRef.current);
    setBusy(true); setError(""); setNotice("");
    try {
      await localQueue.current.catch(()=>{});
      const draft = cloudDraft || await saveCloudDraft();
      const mediaPaths = await uploadImages(draft);
      await api("/api/v1/library-state", session, { method: "POST", body: JSON.stringify({ action: "publish", id: draft.id, title: title.trim(), body: body.trim(), tag: category, topics: selectedTopics, mediaPaths, ...(coverUrl ? { coverUrl } : {}) }) });
      await clearDraft(session.user.id, editId);
      flushLocal.current=async()=>{};
      if (editId) {
        Alert.alert("提交成功", "作品修改已提交审核，审核通过后会更新公开内容。", [{ text: "确定", onPress: () => router.replace("/me" as never) }]);
        return;
      }
      setTitle(""); setBody(""); setImages([]); setCoverImageId(null); setCoverUrl(null); setSelectedTopics([]); setCloudDraft(null);
      setNotice("作品已提交审核，通过后会在发现页公开展示。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "发布没有完成；草稿和已上传图片会保留，稍后可重试。"); }
    finally { submitLock.current=false; setBusy(false); }
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

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView scrollEnabled={!dragImageId} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top, paddingBottom: 24 }}>
      <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",minHeight:48}}><Pressable accessibilityLabel="返回并保存草稿" onPress={()=>void leaveEditor()} style={{minWidth:44,minHeight:44,justifyContent:"center"}}><Text style={{color:colors.ink}}>←</Text></Pressable><Text style={{color:colors.ink,fontSize:15,fontWeight:"600"}}>创作内容</Text><Pressable onPress={()=>setPanel("preview")} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.action}}>预览</Text></Pressable></View>
      <Text style={{color:colors.muted,fontSize:12,marginTop:8}}>社区作品</Text>
      {editStatus === "pending_review" ? <Text style={{ color: colors.gold, fontSize: 11, marginTop: 8 }}>当前状态：审核中</Text> : null}
      {!session ? <View style={{ marginTop: 20, padding: 14, backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.gold }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: "700" }}>登录后可以同步草稿和发布内容</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></View> : null}
      <Animated.View entering={FadeInDown.duration(220)} style={{ marginTop: 24, gap: 8 }}>
        <Text style={label(colors)}>标题</Text>
        <TextInput value={title} onFocus={()=>setBodyFocused(false)} onChangeText={value=>setTitle(value.replace(/\n/g,""))} scrollEnabled={false} onContentSizeChange={event=>setTitleHeight(Math.max(40,event.nativeEvent.contentSize.height))} maxLength={80} placeholder="给你的发现一个标题" placeholderTextColor={colors.subtle} multiline style={[input(colors),{height:titleHeight,fontSize:24,lineHeight:32,fontWeight:"600",paddingHorizontal:0}]} returnKeyType="next" />
        <Text style={{ color: colors.subtle, fontSize: 10, textAlign: "right" }}>{title.length}/80</Text>
      </Animated.View>
      <View style={{ marginTop: 8 }}><Text style={label(colors)}>正文</Text><TextInput ref={bodyInput} onFocus={()=>setBodyFocused(true)} onSelectionChange={event=>{bodySelection.current=event.nativeEvent.selection;}} value={body} onChangeText={setBody} maxLength={5000} multiline textAlignVertical="top" placeholder="写下你的观察、经验或想法" placeholderTextColor={colors.subtle} scrollEnabled={false} onContentSizeChange={event=>setBodyHeight(Math.max(190,event.nativeEvent.contentSize.height))} style={[input(colors), {height:bodyHeight,paddingHorizontal:0,paddingTop:13,lineHeight:26,fontSize:16}]} /><Text style={{ color: colors.subtle, fontSize: 10, textAlign: "right", marginTop: 4 }}>{body.length}/5000</Text></View>
      {bodyFocused&&<View accessibilityRole="toolbar" style={{flexDirection:"row",gap:6,marginTop:8}}>{[["粗体","**","**"],["标题","\n## ",""],["引用","\n> ",""],["列表","\n- ",""],["链接","[","](https://)"]].map(([text,before,after])=><Pressable key={text} onPress={()=>formatBody(before,after)} style={{minHeight:36,paddingHorizontal:10,justifyContent:"center",backgroundColor:colors.surface,borderRadius:8}}><Text style={{color:colors.ink,fontSize:12}}>{text}</Text></Pressable>)}</View>}
      <View style={{ marginTop: 17, paddingTop: 15, borderTopWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={label(colors)}>图片</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{images.length}/9　单张不超过 4 MB</Text></View>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>点击图片预览与管理，首张图片作为封面。</Text>
        {images.length ? <View ref={mediaGridRef} onTouchMove={event=>{if(!dragRef.current)return;const {x,y,width}=mediaGridBounds.current,cell=width*.315;const col=Math.min(2,Math.max(0,Math.floor((event.nativeEvent.pageX-x)/(cell+8)))),row=Math.max(0,Math.floor((event.nativeEvent.pageY-y)/(cell/.86+8)));const to=Math.min(images.length-1,row*3+col),from=images.findIndex(item=>item.id===dragRef.current);if(from>=0&&from!==to)setImages(current=>{const next=[...current];const start=next.findIndex(item=>item.id===dragRef.current);if(start<0)return current;const [image]=next.splice(start,1);next.splice(to,0,image);return next;});}} onTouchEnd={()=>{dragRef.current=null;setDragImageId(null);}} onTouchCancel={()=>{dragRef.current=null;setDragImageId(null);}} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 11 }}>
          {images.map((image, index) => <Animated.View key={image.id} layout={LinearTransition.duration(180)} style={{ width: "31.5%", aspectRatio: 0.86, position: "relative" }}>
            <NativeImage uri={image.uri} label={`第 ${index + 1} 张图片`} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
            <Pressable accessibilityLabel={`管理第 ${index+1} 张图片`} onLongPress={()=>{if(busy)return;mediaGridRef.current?.measureInWindow((x,y,width)=>{mediaGridBounds.current={x,y,width};dragRef.current=image.id;setDragImageId(image.id);});}} onPress={()=>{if(!dragRef.current)setSelectedImage(image.id);}} style={{position:"absolute",inset:0,borderWidth:dragImageId===image.id?2:0,borderColor:colors.gold}}/>{image.id === (coverImageId || images[0]?.id) && !coverUrl && <Text style={{position:"absolute",left:6,top:6,color:"#fff",backgroundColor:"#141619bb",fontSize:10,padding:4}}>封面</Text>}{uploadingImageId===image.id&&<ActivityIndicator color={colors.gold} style={{position:"absolute",bottom:8,right:8}}/>}{failedImageId===image.id&&<Text style={{position:"absolute",bottom:5,left:5,color:colors.danger,fontSize:10}}>上传失败</Text>}

          </Animated.View>)}
        </View> : null}
        <Pressable accessibilityRole="button" onPress={() => void chooseImages()} disabled={busy} style={{ minHeight: 44, marginTop: 10, borderWidth: 1, borderRadius: 10, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, opacity: busy ? 0.6 : 1 }}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>{busy ? "正在准备…" : "＋　添加图片"}</Text></Pressable>
      </View>
      <Pressable onPress={()=>setPanel("topics")} style={{minHeight:52,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderTopWidth:1,borderColor:colors.line,marginTop:20}}><Text style={{color:colors.ink,fontSize:13}}># 话题</Text><Text numberOfLines={1} style={{color:colors.muted,fontSize:12,maxWidth:"70%"}}>{selectedTopics.length?selectedTopics.map(item=>`#${item}`).join(" "):"添加话题"}　›</Text></Pressable>
      <Pressable onPress={()=>setPanel("settings")} style={{minHeight:52,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderTopWidth:1,borderColor:colors.line}}><Text style={{color:colors.ink,fontSize:13}}>更多发布设置</Text><Text style={{color:colors.muted,fontSize:12}}>{category}　›</Text></Pressable>
      <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
    </ScrollView>
    <View style={{flexDirection:"row",alignItems:"center",gap:16,paddingHorizontal:20,paddingTop:10,paddingBottom:Math.max(insets.bottom,10),borderTopWidth:1,borderColor:colors.line}}><Pressable style={{flex:1}} onPress={()=>void flushLocal.current().catch(()=>{})}><Text style={{color:colors.muted,fontSize:11}}>{localStatus}</Text><Text style={{color:colors.subtle,fontSize:10,marginTop:4}}>提交后进入人工审核</Text></Pressable><Pressable onPress={()=>void publish()} disabled={busy||loading} style={{minHeight:46,paddingHorizontal:20,justifyContent:"center",borderRadius:10,backgroundColor:colors.gold,opacity:(busy||loading)?0.5:1}}><Text style={{color:"#171714",fontSize:13,fontWeight:"700"}}>{busy?"正在提交…":"发布内容"}</Text></Pressable></View>
    {panel && <ComposerSheet title={panel==="topics"?"选择话题":panel==="settings"?"更多发布设置":"内容预览"} onClose={()=>setPanel(null)}>{panel==="topics"?<>      <View style={{ marginTop: 8, paddingTop: 15, borderTopWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}><Text style={label(colors)}>话题</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{selectedTopics.length}/5</Text></View>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>选择现有话题，帮助感兴趣的人找到内容。</Text>
        <TextInput value={topicQuery} onChangeText={setTopicQuery} placeholder="搜索话题" placeholderTextColor={colors.subtle} style={[input(colors), { marginTop: 10 }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, flexWrap: "wrap", paddingVertical: 9 }}>
          {topics.map((topic) => <Pressable key={topic.id} onPress={() => toggleTopic(topic.name)} style={[chip(colors), selectedTopics.includes(topic.name) && { backgroundColor: colors.actionSoft, borderColor: colors.action }]}><Text style={{ color: selectedTopics.includes(topic.name) ? colors.action : colors.muted, fontSize: 11 }}>#{topic.name}</Text></Pressable>)}
        </ScrollView>
        {topicQuery.trim().replace(/^#+/, "").length >= 2 && !topics.some((topic) => topic.name === topicQuery.trim().replace(/^#+/, "")) ? <Pressable accessibilityRole="button" onPress={() => void createTopic()} disabled={!session || busy} style={{ minHeight: 38, justifyContent: "center", borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>＋　创建话题「{topicQuery.trim().replace(/^#+/, "") }」</Text></Pressable> : null}
      </View>
</>:panel==="settings"?<>      <View style={{ marginTop: 15 }}><Text style={label(colors)}>分类</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
        {categories.map((item) => <Pressable key={item.id} onPress={() => setCategory(item.name)} style={[chip(colors), category === item.name && { backgroundColor: colors.actionSoft, borderColor: colors.action }]}><Text style={{ color: category === item.name ? colors.action : colors.muted, fontSize: 11, fontWeight: category === item.name ? "700" : "500" }}>{item.name}</Text></Pressable>)}
        {!categories.length ? <Text style={{ color: colors.muted, fontSize: 11, paddingVertical: 8 }}>分类正在加载…</Text> : null}
      </ScrollView></View>
<Action title="AI 创作工作台" subtle onPress={()=>{setPanel(null);router.push("/ai-workbench");}}/><Action title="保存草稿至账号" disabled={busy||!session||loading} onPress={()=>void saveDraft()}/></>:<View><Text style={{color:colors.muted,fontSize:12}}>{category} · {selectedTopics.map(item=>`#${item}`).join(" ")}</Text><Text style={{color:colors.ink,fontSize:24,lineHeight:32,fontWeight:"600",marginVertical:16}}>{title}</Text>{coverUrl&&<NativeImage uri={coverUrl} style={{width:"100%",height:250,marginBottom:12}} resizeMode="contain" label="封面"/>}{(coverImageId?[...images.filter(item=>item.id===coverImageId),...images.filter(item=>item.id!==coverImageId)]:images).map(image=><NativeImage key={image.id} uri={image.uri} style={{width:"100%",height:250,marginBottom:12}} resizeMode="contain" label="预览图片"/>)}<NativeMarkdown source={body}/></View>}</ComposerSheet>}
    {selectedImage && <ComposerSheet title="图片管理" onClose={()=>setSelectedImage(null)}>{(()=>{const index=images.findIndex(item=>item.id===selectedImage),image=images[index];return image?<View><NativeImage uri={image.uri} label="图片预览" style={{width:"100%",height:320}} resizeMode="contain"/><Action title={image.id === (coverImageId || images[0]?.id) && !coverUrl?"当前封面":"设为封面"} onPress={()=>{setCoverImageId(image.id);setCoverUrl(null);}}/><View style={{flexDirection:"row",gap:12}}><Action title="前移" subtle disabled={!index} onPress={()=>moveImage(index,-1)}/><Action title="后移" subtle disabled={index===images.length-1} onPress={()=>moveImage(index,1)}/><Action title="替换" subtle disabled={busy} onPress={()=>void replaceImage(image.id)}/><Action title="删除" subtle disabled={busy} onPress={()=>{setImages(current=>current.filter(item=>item.id!==image.id));if(coverImageId===image.id)setCoverImageId(null);setSelectedImage(null);}}/>{failedImageId===image.id&&<Action title="重试上传" disabled={busy} onPress={()=>void saveDraft()}/>}</View></View>:null;})()}</ComposerSheet>}
  </KeyboardAvoidingView>;
}

const label = (colors: ReturnType<typeof useTheme>["colors"]) => ({ color: colors.ink, fontSize: 12, fontWeight: "700" as const });
const input = (colors: ReturnType<typeof useTheme>["colors"]) => ({ minHeight: 46, paddingHorizontal: 12, backgroundColor: "transparent", borderWidth: 0, borderRadius: 10, color: colors.ink, fontSize: 15 });
const chip = (colors: ReturnType<typeof useTheme>["colors"]) => ({ minHeight: 34, paddingHorizontal: 12, justifyContent: "center" as const, borderWidth: 1, borderRadius: 8, borderColor: colors.line, backgroundColor: colors.surface });
