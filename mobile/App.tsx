import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, View } from 'react-native';

const API = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://moonclean.shop';
type Post = { id:number; cloudId:string; title:string; body:string; tag:string; image?:string; images?:string[]; author:string; date:string; likeCount?:number; channel?:string; };
type Comment = { id:string; author_id:string; parent_id:string|null; body:string; created_at:string };
type Screen = 'discover'|'mine'|'detail'|'publish';
const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16)});
let dbPromise: Promise<SupabaseClient> | undefined;
async function db() {
  if (!dbPromise) dbPromise = (async () => {
    const response = await fetch(`${API}/api/client-config`);
    const config = await response.json();
    if (!response.ok || !config.url || !config.key) throw new Error('账号服务暂不可用');
    return createClient(config.url, config.key, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
  })();
  return dbPromise;
}
async function api(path:string, session?:string, init:RequestInit={}) {
  const headers = new Headers(init.headers);
  if (session) headers.set('Authorization', `Bearer ${session}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type','application/json');
  const res = await fetch(`${API}${path}`, {...init, headers});
  const payload = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(payload.error || '请求失败，请稍后重试');
  return payload.data;
}
const C = { bg:'#F6F5F1', paper:'#FFFFFF', ink:'#202421', muted:'#7E8583', line:'#E5E6E1', green:'#49665F', gold:'#C5A84A', pale:'#EAEDE8' };

export default function App() {
  const [screen,setScreen] = useState<Screen>('discover');
  const [posts,setPosts] = useState<Post[]>([]);
  const [selected,setSelected] = useState<Post|null>(null);
  const [comments,setComments] = useState<Comment[]>([]);
  const [page,setPage] = useState(1);
  const [hasMore,setHasMore] = useState(true);
  const [session,setSession] = useState<any>(null);
  const [profile,setProfile] = useState<any>(null);
  const [ownPosts,setOwnPosts] = useState<Post[]>([]);
  const [savedPosts,setSavedPosts] = useState<Post[]>([]);
  const [savedIds,setSavedIds] = useState<number[]>([]);
  const [likedIds,setLikedIds] = useState<number[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [authOpen,setAuthOpen] = useState(false);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [authMode,setAuthMode] = useState<'login'|'signup'>('login');
  const [title,setTitle] = useState('');
  const [body,setBody] = useState('');
  const [tag,setTag] = useState('生活');
  const [image,setImage] = useState<{uri:string;type:string;name:string}|null>(null);
  const [commentDraft,setCommentDraft] = useState('');

  const loadFeed = useCallback(async (next=1, append=false) => {
    setBusy(true); setError('');
    try {
      const result = await api(`/api/v1/posts?page=${next}&limit=12`);
      const items:Post[] = result.items || [];
      setPosts(current => append ? [...current,...items] : items);
      setPage(next); setHasMore(items.length === 12 && (result.total || 0) > next*12);
    } catch(e:any) { setError(e.message || '内容加载失败'); }
    finally { setBusy(false); }
  },[]);
  const loadMe = useCallback(async (token:string) => {
    try { const data=await api('/api/v1/library-state',token); setProfile(data.profile); setOwnPosts(data.own||[]); const ids=(data.bookmarks||[]).map((row:any)=>row.posts?.client_id).filter(Boolean); setSavedIds(ids); setLikedIds((data.interactions||[]).filter((row:any)=>row.liked).map((row:any)=>row.posts?.client_id).filter(Boolean)); } catch { setProfile(null); }
  },[]);
  useEffect(()=>{setSavedPosts(posts.filter(post=>savedIds.includes(post.id)));},[posts,savedIds]);
  useEffect(()=>{
    void loadFeed();
    let sub:{unsubscribe:()=>void}|undefined;
    db().then(client=>{
      client.auth.getSession().then(({data})=>{setSession(data.session); if(data.session) void loadMe(data.session.access_token);});
      const listener=client.auth.onAuthStateChange((_event,current)=>{setSession(current); if(current) void loadMe(current.access_token); else setProfile(null);});
      sub=listener.data.subscription;
    }).catch(e=>setError(e.message));
    return ()=>sub?.unsubscribe();
  },[loadFeed,loadMe]);

  const openPost = async (post:Post) => {
    setSelected(post); setScreen('detail'); setComments([]);
    try {
      const [detail, rows] = await Promise.all([
        api(`/api/v1/posts/${post.cloudId}`),
        api(`/api/v1/posts/${post.cloudId}/comments?sort=new`)
      ]);
      if(detail) setSelected(current=>current?.cloudId===post.cloudId ? {...current,body:detail.body||current.body} : current);
      setComments(rows||[]);
    } catch(e:any) { setError(e.message); }
  };
  const requireLogin = () => { if(!session){setAuthOpen(true);return false;} return true; };
  const toggleLike = async (post:Post) => {
    if(!requireLogin()) return;
    const value=!likedIds.includes(post.id);
    setLikedIds(current=>value?[...current,post.id]:current.filter(id=>id!==post.id));
    setPosts(current=>current.map(item=>item.id===post.id?{...item,likeCount:Math.max(0,(item.likeCount||0)+(value?1:-1))}:item));
    try { await api('/api/v1/library-state',session.access_token,{method:'POST',body:JSON.stringify({action:'like',id:post.id,value})}); }
    catch(e:any){setLikedIds(current=>value?current.filter(id=>id!==post.id):[...current,post.id]);setPosts(current=>current.map(item=>item.id===post.id?{...item,likeCount:Math.max(0,(item.likeCount||0)+(value?-1:1))}:item));Alert.alert('操作未完成',e.message);}
  };
  const submitComment = async () => {
    if(!selected || !commentDraft.trim()) return;
    if(!requireLogin()) return;
    try { const row=await api(`/api/v1/posts/${selected.cloudId}/comments`,session.access_token,{method:'POST',body:JSON.stringify({body:commentDraft.trim()})}); setComments(current=>[row,...current]); setCommentDraft(''); }
    catch(e:any){Alert.alert('评论未发送',e.message);}
  };
  const chooseImage = async () => {
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted){Alert.alert('需要相册权限','请允许 HEIKA 读取你选择的图片。');return;}
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.85});
    if(result.canceled || !result.assets[0]) return;
    const compressed=await ImageManipulator.manipulateAsync(result.assets[0].uri,[{resize:{width:1800}}],{compress:0.82,format:ImageManipulator.SaveFormat.JPEG});
    setImage({uri:compressed.uri,type:'image/jpeg',name:`${Date.now()}.jpg`});
  };
  const submitPost = async () => {
    if(!requireLogin()) return;
    if(!title.trim() || !body.trim()){Alert.alert('内容还没写完','请填写标题和正文。');return;}
    setBusy(true);
    try {
      const draft=await api('/api/v1/library-state',session.access_token,{method:'POST',body:JSON.stringify({action:'draft',title:title.trim(),body:body.trim(),tag,topics:[tag]})});
      const paths:string[]=[];
      if(image){
        const form=new FormData();
        form.append('file',{uri:image.uri,name:image.name,type:image.type} as any);
        form.append('post_id',draft.cloudId); form.append('upload_id',uuid()); form.append('sort_order','0');
        const uploaded=await api('/api/v1/media',session.access_token,{method:'POST',body:form});
        paths.push(uploaded.path);
      }
      await api('/api/v1/library-state',session.access_token,{method:'POST',body:JSON.stringify({action:'publish',id:draft.id,title:title.trim(),body:body.trim(),tag,topics:[tag],mediaPaths:paths})});
      setTitle('');setBody('');setImage(null);setScreen('discover');Alert.alert('已提交','作品已进入人工审核，通过后会公开展示。');void loadFeed();
    } catch(e:any){Alert.alert('发布失败',e.message||'请稍后重试。');}
    finally{setBusy(false);}
  };
  const signIn = async () => {
    if(!email.trim() || !password){Alert.alert('请填写账号','输入邮箱和密码后继续。');return;}
    setBusy(true);
    try {const client=await db();const result=authMode==='login'?await client.auth.signInWithPassword({email:email.trim(),password}):await client.auth.signUp({email:email.trim(),password});if(result.error)throw result.error;if(!result.data.session&&authMode==='signup')Alert.alert('注册申请已提交','如果当前账号设置要求邮箱确认，请先完成确认后登录。');else setAuthOpen(false);}
    catch(e:any){Alert.alert(authMode==='login'?'登录失败':'注册失败',e.message||'请检查信息后重试。');}
    finally{setBusy(false);}
  };
  const signOut=async()=>{const client=await db();await client.auth.signOut();setSession(null);setProfile(null);};
  const heading = screen==='discover'?'发现':screen==='mine'?'我的':screen==='publish'?'发布':'内容';

  return <SafeAreaView style={s.safe}><StatusBar style="dark"/><View style={s.topbar}><View><Text style={s.brand}>◇ 黑卡 <Text style={s.brandLatin}>HEIKA</Text></Text><Text style={s.kicker}>{heading.toUpperCase()} / HEIKA</Text></View><Pressable style={s.loginChip} onPress={()=>session?setAuthOpen(true):setAuthOpen(true)}><Text style={s.loginText}>{session?(profile?.nickname||'已登录'):'登录 / 注册'}</Text></Pressable></View>
    {screen==='discover' && <FlatList data={posts} keyExtractor={p=>p.cloudId||String(p.id)} contentContainerStyle={s.feed} refreshing={busy} onRefresh={()=>void loadFeed()} onEndReached={()=>{if(hasMore&&!busy)void loadFeed(page+1,true)}} onEndReachedThreshold={0.45} ListHeaderComponent={<View style={s.intro}><Text style={s.title}>值得停留的内容</Text><Text style={s.subtitle}>从感兴趣的方向出发，发现每天精选的灵感。</Text></View>} ListEmptyComponent={busy?<ActivityIndicator color={C.green}/>:<Text style={s.empty}>{error||'暂时没有内容'}</Text>} renderItem={({item,index})=><Pressable style={[s.card,index%3===0&&s.cardWide]} onPress={()=>void openPost(item)}>{item.image?<Image source={{uri:item.image}} style={s.cover} resizeMode="cover"/>:<View style={[s.cover,s.coverBlank]}><Text style={s.coverMark}>HEIKA</Text></View>}<View style={s.cardInfo}><Text style={s.tag}>#{item.tag||'精选'}</Text><Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text><Text style={s.cardBody} numberOfLines={2}>{item.body}</Text><View style={s.cardFooter}><Text style={s.author}>{item.author||'黑卡探索者'}</Text><Pressable onPress={(e:any)=>{e.stopPropagation?.();void toggleLike(item)}}><Text style={s.like}>{likedIds.includes(item.id)?'♥':'♡'} {item.likeCount||0}</Text></Pressable></View></View></Pressable>} ListFooterComponent={busy?<ActivityIndicator style={{margin:20}} color={C.green}/>:undefined}/>}
    {screen==='detail' && selected && <ScrollView style={s.page} contentContainerStyle={s.detail}>{selected.image?<Image source={{uri:selected.image}} style={s.detailCover} resizeMode="cover"/>:<View style={[s.detailCover,s.coverBlank]}/>}<Text style={s.tag}>#{selected.tag}</Text><Text style={s.title}>{selected.title}</Text><Text style={s.meta}>{selected.author} · {selected.date}</Text><Text style={s.detailBody}>{selected.body}</Text><View style={s.actionRow}><Pressable style={s.softButton} onPress={()=>void toggleLike(selected)}><Text style={s.softButtonText}>{likedIds.includes(selected.id)?'♥':'♡'}　赞 {selected.likeCount||0}</Text></Pressable><Pressable style={s.softButton} onPress={()=>{if(requireLogin())void (async()=>{try{await api('/api/v1/library-state',session.access_token,{method:'POST',body:JSON.stringify({action:'bookmark',id:selected.id,value:true})});setSavedPosts(current=>current.some(item=>item.id===selected.id)?current:[selected,...current]);Alert.alert('已收藏','已保存到我的收藏。')}catch(e:any){Alert.alert('收藏失败',e.message)}})()}}><Text style={s.softButtonText}>＋　收藏</Text></Pressable></View><View style={s.sectionHead}><Text style={s.sectionTitle}>评论</Text><Text style={s.meta}>{comments.length} 条</Text></View><View style={s.commentInput}><TextInput value={commentDraft} onChangeText={setCommentDraft} placeholder="写下你的想法…" placeholderTextColor={C.muted} style={s.input}/><Pressable onPress={()=>void submitComment()}><Text style={s.send}>发送</Text></Pressable></View>{comments.map(c=><View key={c.id} style={s.comment}><View style={s.avatar}><Text style={s.avatarText}>探</Text></View><View style={{flex:1}}><Text style={s.meta}>{c.author_id===session?.user?.id?'我':'探索者'} · {new Date(c.created_at).toLocaleDateString('zh-CN')}</Text><Text style={s.commentText}>{c.body}</Text></View></View>)}</ScrollView>}
    {screen==='mine' && <ScrollView contentContainerStyle={s.page}><Text style={s.title}>我的</Text><View style={s.profile}><View style={s.avatarLarge}><Text style={s.avatarText}>{(profile?.nickname||'探').slice(0,1)}</Text></View><View style={{flex:1}}><Text style={s.sectionTitle}>{profile?.nickname||'探索者'}</Text><Text style={s.meta}>{profile?.bio||'收藏那些值得再读的瞬间'}</Text></View><Pressable onPress={()=>session?void signOut():setAuthOpen(true)}><Text style={s.send}>{session?'退出':'登录'}</Text></Pressable></View><View style={s.stats}><View><Text style={s.statNum}>HEIKA</Text><Text style={s.meta}>探索与发现</Text></View><View><Text style={s.statNum}>—</Text><Text style={s.meta}>我的收藏</Text></View><View><Text style={s.statNum}>—</Text><Text style={s.meta}>我的作品</Text></View></View><Text style={s.sectionTitle}>我的收藏 · {savedPosts.length}</Text>{savedPosts.slice(0,5).map(item=><Pressable key={item.cloudId} style={s.listRow} onPress={()=>void openPost(item)}><Text style={s.body} numberOfLines={1}>{item.title}</Text><Text style={s.meta}>›</Text></Pressable>)}<Text style={[s.sectionTitle,{marginTop:24}]}>我的作品 · {ownPosts.length}</Text>{ownPosts.slice(0,5).map(item=><View key={item.cloudId} style={s.listRow}><Text style={s.body} numberOfLines={1}>{item.title||'未命名草稿'}</Text><Text style={s.meta}>{item.date}</Text></View>)}<Text style={[s.sectionTitle,{marginTop:24}]}>账号与安全</Text><Pressable style={s.listRow} onPress={()=>setAuthOpen(true)}><Text style={s.body}>登录与账号管理</Text><Text style={s.meta}>›</Text></Pressable><Text style={s.note}>安卓原生客户端第一阶段预览版</Text></ScrollView>}
    {screen==='publish' && <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={s.page}><ScrollView contentContainerStyle={s.publish}><Text style={s.title}>分享一篇内容</Text><Text style={s.subtitle}>发布后进入人工审核，通过后公开展示。</Text><TextInput value={title} onChangeText={setTitle} style={s.field} placeholder="标题" placeholderTextColor={C.muted} maxLength={80}/><TextInput value={body} onChangeText={setBody} style={[s.field,s.multiline]} placeholder="写下你的观察、经验或想法" placeholderTextColor={C.muted} multiline textAlignVertical="top" maxLength={5000}/><Pressable style={s.imagePicker} onPress={()=>void chooseImage()}>{image?<Image source={{uri:image.uri}} style={s.previewImage}/>:<Text style={s.softButtonText}>＋　添加图片（自动压缩）</Text>}</Pressable><View style={s.tagRow}>{['生活','摄影','设计','科技','游戏'].map(t=><Pressable key={t} style={[s.tagPill,tag===t&&s.tagPillSelected]} onPress={()=>setTag(t)}><Text style={s.tag}>{t}</Text></Pressable>)}</View><Pressable style={s.primary} disabled={busy} onPress={()=>void submitPost()}><Text style={s.primaryText}>{busy?'正在提交…':'提交作品'}</Text></Pressable></ScrollView></KeyboardAvoidingView>}
    <View style={s.tabbar}>{(['discover','publish','mine'] as Screen[]).map((item,i)=><Pressable key={item} style={[s.tab,item===screen&&s.tabActive]} onPress={()=>item==='publish'&&!session?(setAuthOpen(true),setScreen('publish')):setScreen(item)}><Text style={[s.tabIcon,item===screen&&s.tabIconActive]}>{i===0?'◉':i===1?'＋':'○'}</Text><Text style={[s.tabLabel,item===screen&&s.tabLabelActive]}>{item==='discover'?'发现':item==='publish'?'发布':'我的'}</Text></Pressable>)}</View>
    {screen==='detail'&&<Pressable style={s.backButton} onPress={()=>setScreen('discover')}><Text style={s.backText}>‹　返回发现</Text></Pressable>}
    {authOpen&&<View style={s.overlay}><Pressable style={s.scrim} onPress={()=>setAuthOpen(false)}/><View style={s.authSheet}><Text style={s.kicker}>ACCOUNT / HEIKA</Text><Text style={s.title}>{session?'账号状态':authMode==='login'?'欢迎回来':'创建账号'}</Text>{session?<><Text style={s.subtitle}>{profile?.nickname||session.user?.email}</Text><Pressable style={s.primary} onPress={()=>void signOut()}><Text style={s.primaryText}>退出登录</Text></Pressable></>:<><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={s.field} placeholder="邮箱"/><TextInput value={password} onChangeText={setPassword} secureTextEntry style={s.field} placeholder="密码"/><Pressable style={s.primary} disabled={busy} onPress={()=>void signIn()}><Text style={s.primaryText}>{busy?'请稍候…':authMode==='login'?'登录':'注册'}</Text></Pressable><Pressable onPress={()=>setAuthMode(authMode==='login'?'signup':'login')}><Text style={s.switch}>{authMode==='login'?'没有账号？创建账号':'已有账号？返回登录'}</Text></Pressable></>}</View></View>}
  </SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:C.bg,paddingTop:Platform.OS==='android'?RNStatusBar.currentHeight:0},topbar:{height:74,paddingHorizontal:20,borderBottomWidth:1,borderBottomColor:C.line,backgroundColor:C.paper,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{fontSize:21,fontWeight:'800',letterSpacing:1,color:C.ink},brandLatin:{fontSize:10,fontWeight:'500',letterSpacing:2,color:C.muted},kicker:{fontSize:9,fontWeight:'700',letterSpacing:1.8,color:C.green,marginTop:3},loginChip:{borderWidth:1,borderColor:C.line,paddingHorizontal:12,paddingVertical:8,borderRadius:18},loginText:{fontSize:11,color:C.muted},feed:{padding:16,paddingBottom:110},intro:{paddingVertical:18,marginBottom:4},title:{fontSize:28,fontWeight:'700',letterSpacing:-.4,color:C.ink},subtitle:{fontSize:13,color:C.muted,lineHeight:20,marginTop:8},card:{backgroundColor:C.paper,marginBottom:14,borderRadius:16,overflow:'hidden',borderWidth:1,borderColor:'#ECECE7'},cardWide:{},cover:{width:'100%',height:210,backgroundColor:C.pale},coverBlank:{backgroundColor:'#E8E8E2',alignItems:'center',justifyContent:'center'},coverMark:{fontSize:12,letterSpacing:4,color:'#A4AAA3'},cardInfo:{paddingHorizontal:15,paddingVertical:13},tag:{fontSize:11,color:C.green,fontWeight:'600'},cardTitle:{fontSize:17,fontWeight:'700',color:C.ink,lineHeight:23,marginTop:7},cardBody:{fontSize:12,color:C.muted,lineHeight:18,marginTop:5},cardFooter:{flexDirection:'row',justifyContent:'space-between',marginTop:12},author:{fontSize:11,color:C.muted},like:{fontSize:12,color:C.green},empty:{textAlign:'center',color:C.muted,marginTop:40},tabbar:{position:'absolute',left:12,right:12,bottom:Platform.OS==='android'?12:8,height:70,backgroundColor:'rgba(255,255,255,0.96)',borderRadius:22,borderWidth:1,borderColor:'#E9E9E4',flexDirection:'row',justifyContent:'space-around',alignItems:'center',elevation:8},tab:{width:'30%',height:58,alignItems:'center',justifyContent:'center'},tabActive:{},tabIcon:{fontSize:23,color:'#8E9692',lineHeight:26},tabIconActive:{color:C.gold},tabLabel:{fontSize:10,color:C.muted,marginTop:2},tabLabelActive:{color:C.ink,fontWeight:'700'},page:{flex:1,padding:20},detail:{paddingBottom:130},detailCover:{width:'100%',height:300,marginBottom:18,backgroundColor:C.pale},meta:{fontSize:11,color:C.muted,marginTop:7},detailBody:{fontSize:16,lineHeight:27,color:C.ink,marginTop:24},actionRow:{flexDirection:'row',gap:10,marginTop:25},softButton:{paddingHorizontal:16,paddingVertical:11,backgroundColor:C.paper,borderWidth:1,borderColor:C.line,borderRadius:18},softButtonText:{fontSize:13,color:C.ink,fontWeight:'600'},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:35,marginBottom:12},sectionTitle:{fontSize:17,fontWeight:'700',color:C.ink},commentInput:{flexDirection:'row',alignItems:'center',padding:10,backgroundColor:C.paper,borderRadius:14,borderWidth:1,borderColor:C.line},input:{flex:1,minHeight:38,color:C.ink},send:{fontSize:13,fontWeight:'700',color:C.green,paddingHorizontal:8},comment:{flexDirection:'row',gap:10,paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.line},avatar:{width:34,height:34,borderRadius:17,backgroundColor:C.pale,alignItems:'center',justifyContent:'center'},avatarLarge:{width:56,height:56,borderRadius:28,backgroundColor:C.green,alignItems:'center',justifyContent:'center'},avatarText:{fontSize:14,color:C.green,fontWeight:'700'},commentText:{fontSize:14,color:C.ink,lineHeight:21,marginTop:6},profile:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:22,borderBottomWidth:1,borderBottomColor:C.line,marginBottom:20},stats:{flexDirection:'row',justifyContent:'space-around',paddingVertical:22,borderBottomWidth:1,borderBottomColor:C.line,marginBottom:24},statNum:{fontSize:18,fontWeight:'700',color:C.ink,textAlign:'center'},listRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:17,borderBottomWidth:1,borderBottomColor:C.line},body:{fontSize:14,color:C.ink},note:{fontSize:11,color:C.muted,marginTop:20},publish:{paddingBottom:120},field:{marginTop:16,paddingHorizontal:14,paddingVertical:13,backgroundColor:C.paper,borderRadius:13,borderWidth:1,borderColor:C.line,color:C.ink,fontSize:14},multiline:{height:180,paddingTop:14},imagePicker:{minHeight:110,marginTop:16,borderRadius:14,borderWidth:1,borderColor:C.line,backgroundColor:C.paper,alignItems:'center',justifyContent:'center',overflow:'hidden'},previewImage:{width:'100%',height:200},tagRow:{flexDirection:'row',gap:8,flexWrap:'wrap',marginTop:16},tagPill:{paddingHorizontal:12,paddingVertical:8,borderRadius:18,borderWidth:1,borderColor:C.line,backgroundColor:C.paper},tagPillSelected:{backgroundColor:'#E6EBE7',borderColor:C.green},primary:{height:50,backgroundColor:C.green,borderRadius:16,alignItems:'center',justifyContent:'center',marginTop:22},primaryText:{fontSize:14,fontWeight:'700',color:'#fff'},backButton:{position:'absolute',top:84,left:18,padding:10,backgroundColor:C.paper,borderRadius:18},backText:{color:C.ink,fontSize:13},overlay:{...StyleSheet.absoluteFill,justifyContent:'flex-end'},scrim:{...StyleSheet.absoluteFill,backgroundColor:'rgba(18,24,22,0.5)'},authSheet:{padding:24,paddingBottom:38,backgroundColor:C.bg,borderTopLeftRadius:26,borderTopRightRadius:26},switch:{textAlign:'center',color:C.green,marginTop:18,fontSize:13}});
