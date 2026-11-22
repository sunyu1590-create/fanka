"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { BadgeCheck, Check, ChevronDown, ImagePlus, Image as ImageIcon, Trash2, UserRound } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import { cloudRequest } from "@/lib/cloud";
import { tags } from "@/lib/content";
import AnimatedNotice from "./AnimatedNotice";
import ChoiceSelect from "./ChoiceSelect";
import { confirmInApp } from "@/lib/in-app-dialog";
import AvatarCropper from "./AvatarCropper";
import CoverEditor, { type CoverMeta } from "./CoverEditor";

export type ProfileDetails = {
  gender: string;
  mbti: string;
  birthday: string;
  hobbies: string[];
  visibility: { gender: boolean; mbti: boolean; birthday: boolean; hobbies: boolean };
};
type ProfileBadge = { id: string; label: string; description: string; color: string; awardedAt?: string };

const emptyDetails: ProfileDetails = {
  gender: "", mbti: "", birthday: "", hobbies: [],
  visibility: { gender: false, mbti: false, birthday: false, hobbies: false },
};
const mbtiOptions = ["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP", "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"];
const detailLabels: Record<keyof ProfileDetails["visibility"], string> = { gender: "性别", mbti: "MBTI", birthday: "生日", hobbies: "爱好" };
const genderLabels: Record<string, string> = { female: "女", male: "男", nonbinary: "非二元", undisclosed: "不愿透露" };

function Avatar({ src, label, className = "" }: { src?: string; label: string; className?: string }) {
  return <span className={`account-avatar-preview ${className}`}>
    <UserRound size={22} aria-hidden="true" />
    {src && <img src={src} alt={label} onError={(event) => { event.currentTarget.hidden = true; }} />}
  </span>;
}

/** APP 内嵌（需求 4.2）：读取容器会话里的用户标识，只取 sub 做一致性校验。 */
function nativeBridgeUser(): string | null {
  try {
    const bridge = (window as unknown as { HeikaNative?: { session?: () => string } }).HeikaNative;
    const raw = bridge?.session?.();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access_token?: string };
    const token = parsed.access_token || "";
    const payload = token.split(".")[1] || "";
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

/** 保存/变更真实成功后通知原生刷新（无桥接时静默忽略）。 */
function notifyNativeProfile(detail: Record<string, unknown>, andClose = false) {
  try {
    const bridge = (window as unknown as { HeikaNative?: { post?: (message: string) => void } }).HeikaNative;
    if (!bridge?.post) return;
    bridge.post(JSON.stringify({ type: "profile-updated", payload: detail }));
    if (andClose) bridge.post(JSON.stringify({ type: "close" }));
  } catch {
    /* 网页独立使用时无桥接 */
  }
}

type SavePhase = "idle" | "loading" | "success" | "error";

export default function AccountProfile({
  name,
  bio,
  avatar,
  cover,
  coverMeta,
  accountId,
  details = emptyDetails,
  onSave,
  onClose,
  onNotice,
  mode = "modal",
}: {
  name: string;
  bio: string;
  avatar?: string;
  cover?: string;
  coverMeta?: CoverMeta;
  accountId?: string | null;
  details?: ProfileDetails;
  onSave: (name: string, bio: string, avatar: string | undefined, details: ProfileDetails) => void;
  onClose: () => void;
  onNotice?: (message: string) => void;
  mode?: "page" | "modal";
}) {
  const [nickname, setNickname] = useState(name),
    [description, setDescription] = useState(bio),
    [profileDetails, setProfileDetails] = useState<ProfileDetails>(details),
    [hobbyInput, setHobbyInput] = useState(""),
    [file, setFile] = useState<File>(),
    [filePreview, setFilePreview] = useState<string>(),
    [badges, setBadges] = useState<ProfileBadge[]>([]),
    [error, setError] = useState(""),
    [savePhase, setSavePhase] = useState<SavePhase>("idle"),
    [moreOpen, setMoreOpen] = useState(false),
    [cropFile, setCropFile] = useState<File | null>(null),
    [coverFile, setCoverFile] = useState<File | null>(null),
    [currentCover, setCurrentCover] = useState<string | undefined>(cover),
    [currentCoverMeta, setCurrentCoverMeta] = useState<CoverMeta | undefined>(coverMeta),
    [coverBusy, setCoverBusy] = useState(false);

  const busy = savePhase === "loading";

  useEffect(() => {
    if (!file) { setFilePreview(undefined); return; }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let alive = true;
    void browserDb().then(async (db) => {
      const { data } = await db.auth.getUser();
      if (!alive || !data.user) return;
      const result = await cloudRequest("/api/v1/me/access-codes") as { badges?: ProfileBadge[] } | null;
      if (alive) setBadges(result?.badges || []);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const addHobby = () => {
    const hobby = hobbyInput.trim();
    if (!hobby) return;
    if (profileDetails.hobbies.includes(hobby)) { setHobbyInput(""); return; }
    if (profileDetails.hobbies.length >= 8) { setError("爱好最多选择 8 项"); return; }
    setProfileDetails((value) => ({ ...value, hobbies: [...value.hobbies, hobby] }));
    setHobbyInput("");
    setError("");
  };

  const save = async () => {
    if (busy || savePhase === "success") return;
    if (!nickname.trim() || nickname.trim().length > 24 || description.length > 80 || profileDetails.hobbies.length > 8) {
      setError("昵称为 1–24 字，签名不超过 80 字");
      setSavePhase("error");
      return;
    }
    setSavePhase("loading");
    setError("");
    try {
      const db = await browserDb();
      const { data: { user } } = await db.auth.getUser();
      // 需求 4.2：APP 内嵌时校验网页登录用户与 APP 账号一致，防止串号保存。
      const bridgeUser = nativeBridgeUser();
      if (bridgeUser && user && bridgeUser !== user.id) {
        throw new Error("当前网页登录账号与 APP 账号不一致，请返回 APP 后重新进入");
      }
      let url = avatar;
      if (user) {
        if (file) {
          const path = `${user.id}/${crypto.randomUUID()}`;
          const { error: uploadError } = await db.storage.from("heika-avatars").upload(path, file, { contentType: file.type });
          if (uploadError) throw new Error("头像上传失败，请重试");
          url = db.storage.from("heika-avatars").getPublicUrl(path).data.publicUrl;
        }
        await cloudRequest("/api/v1/me", {
          nickname: nickname.trim(),
          bio: description.trim(),
          avatar_url: url || null,
          details: Object.entries(profileDetails.visibility).map(([attribute, is_public]) => ({
            attribute,
            value: attribute === "hobbies" ? profileDetails.hobbies : profileDetails[attribute as "gender" | "mbti" | "birthday"],
            is_public,
          })),
        }, "PATCH");
      } else if (file) {
        throw new Error("登录后可上传头像");
      }
      onSave(nickname.trim(), description.trim(), url, profileDetails);
      setSavePhase("success");
      // 保存真实成功后再通知原生刷新并返回（需求 4.2）。
      notifyNativeProfile({ id: accountId, nickname: nickname.trim(), bio: description.trim(), avatar: url, cover: currentCover, coverMeta: currentCoverMeta }, true);
      window.setTimeout(() => onClose(), 900);
    } catch (cause) {
      // 失败保留全部已填内容与裁剪结果，可直接重试（需求 4.1 / 五）。
      setSavePhase("error");
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    }
  };

  return <div className={`account-profile-form ${mode}`}>
    {mode === "modal" && <>
      <h2>编辑个人资料</h2>
      <p>更新你希望其他探索者看到的信息。</p>
    </>}

    {/* 01 头像与封面：两个图片入口（需求 4.1） */}
    <section className="account-profile-section account-profile-basics" aria-labelledby="account-profile-images-title">
      <div className="account-profile-section-heading"><span className="account-profile-section-index">01</span><div><h3 id="account-profile-images-title">头像与封面</h3><p>选图后进入裁剪或取景，确认前不会改动已保存的资料。</p></div></div>
      <div className="account-image-row">
        <label className="account-avatar-field">
          <span className="account-field-label">头像</span>
          <span className="account-avatar-control">
            <Avatar src={filePreview || avatar} label="头像预览" />
            <span className="account-avatar-prompt"><strong>{file ? file.name : "更换头像"}</strong><small>圆形裁剪 · JPEG、PNG 或 WebP</small></span>
            <ImagePlus size={18}/>
          </span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (!selected) return;
            if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
              setError("请选择 JPEG、PNG 或 WebP 图片");
              return;
            }
            setError("");
            // 先进入圆形裁剪，确认后才会替换当前头像。
            setCropFile(selected);
          }}/>
        </label>
        <div className="account-cover-control">
          <span className="account-field-label">封面</span>
          <div className="account-cover-line">
            <span className="account-cover-thumb" style={currentCover ? { backgroundImage: `url("${currentCover}")` } : undefined}>
              {!currentCover && <ImageIcon size={18} />}
            </span>
            <div className="account-cover-copy">
              <strong>{currentCover ? "已设置封面" : "还没有封面"}</strong>
              <small>{currentCover ? "支持拖动取景与缩放" : "未设置时使用默认品牌背景"}</small>
            </div>
            <div className="account-cover-actions">
              <label className="account-cover-upload">
                {coverBusy ? "处理中…" : currentCover ? "更换" : "设置封面"}
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={coverBusy || !accountId} onChange={(event) => {
                  const selected = event.target.files?.[0];
                  event.target.value = "";
                  if (!selected) return;
                  if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) { setError("封面只支持 JPEG、PNG 或 WebP"); return; }
                  if (selected.size > 12 * 1024 * 1024) { setError("封面图片不能超过 12 MB"); return; }
                  setError("");
                  setCoverFile(selected);
                }} />
              </label>
              {currentCover && <button type="button" disabled={coverBusy} onClick={async () => {
                if (!await confirmInApp("移除当前封面？主页会回到默认品牌背景。", { title: "移除封面", confirmLabel: "移除", danger: true })) return;
                setCoverBusy(true);
                try {
                  const { browserDb } = await import("@/lib/browser-db");
                  const db = await browserDb();
                  const { data } = await db.auth.getSession();
                  if (!data.session) throw new Error("登录后才能修改封面");
                  const response = await fetch("/api/v1/me/cover", { method: "DELETE", headers: { Authorization: `Bearer ${data.session.access_token}` } });
                  if (!response.ok) throw new Error("封面移除失败");
                  setCurrentCover(undefined);
                  setCurrentCoverMeta(undefined);
                  window.dispatchEvent(new CustomEvent("heika-profile-updated", { detail: { id: accountId, cover: "", coverMeta: undefined } }));
                  notifyNativeProfile({ id: accountId, cover: "", coverMeta: undefined });
                  onNotice?.("封面已移除");
                } catch (cause) { setError(cause instanceof Error ? cause.message : "封面移除失败"); }
                finally { setCoverBusy(false); }
              }}><Trash2 size={14} /> 移除</button>}
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* 02 昵称与签名 */}
    <section className="account-profile-section" aria-labelledby="account-profile-name-title">
      <div className="account-profile-section-heading"><span className="account-profile-section-index">02</span><div><h3 id="account-profile-name-title">昵称与签名</h3></div></div>
      <div className="account-profile-basics">
        <label className="account-profile-field">昵称<input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} placeholder="设置公开昵称" /><small className="account-character-count">{nickname.length}/24</small></label>
        <label className="account-profile-field">签名<textarea value={description} maxLength={80} rows={3} onChange={(event) => setDescription(event.target.value)} placeholder="一句话介绍自己" /><small className="account-character-count">{description.length}/80</small></label>
      </div>
    </section>

    {/* 03 更多资料：折叠区（需求 4.1） */}
    <section className="account-profile-section" aria-labelledby="account-profile-more-title">
      <button type="button" className="collapsible-panel-toggle" aria-expanded={moreOpen} aria-controls="account-profile-more-panel" onClick={() => setMoreOpen((open) => !open)}>
        <span className="account-profile-section-heading" style={{ margin: 0 } as CSSProperties}><span className="account-profile-section-index">03</span><span><h3 id="account-profile-more-title">更多资料</h3></span></span>
        <span>性别、MBTI、生日、爱好、公开范围 {moreOpen ? "收起" : "展开"} <ChevronDown size={16}/></span>
      </button>
      {moreOpen && <div id="account-profile-more-panel" className="account-profile-more-panel">
        <div className="profile-facts-editor-grid">
          <label className="account-profile-field"><span>性别</span><ChoiceSelect label="性别" value={profileDetails.gender} options={[{value:"",label:"暂不填写"},{value:"female",label:"女"},{value:"male",label:"男"},{value:"nonbinary",label:"非二元"},{value:"undisclosed",label:"不愿透露"}]} onChange={(gender) => setProfileDetails((value) => ({ ...value, gender }))}/></label>
          <label className="account-profile-field"><span>MBTI</span><ChoiceSelect label="MBTI" value={profileDetails.mbti} options={[{value:"",label:"暂不填写"},...mbtiOptions.map((type) => ({value:type,label:type}))]} onChange={(mbti) => setProfileDetails((value) => ({ ...value, mbti }))}/></label>
          <label className="account-profile-field profile-birthday-field">生日<input type="date" value={profileDetails.birthday} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setProfileDetails((value) => ({ ...value, birthday: event.target.value }))} /><small>只在开启公开后显示</small></label>
        </div>
        <fieldset className="account-profile-field profile-hobby-field"><legend>兴趣 <small>最多 8 项</small></legend><div className="profile-hobby-entry"><input value={hobbyInput} maxLength={20} placeholder="输入兴趣后添加" onChange={(event) => setHobbyInput(event.target.value)} onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); addHobby(); }} /><button type="button" disabled={!hobbyInput.trim() || profileDetails.hobbies.length >= 8} onClick={addHobby}>添加</button></div><div className="profile-hobby-options">{profileDetails.hobbies.map((tag) => <button type="button" key={tag} aria-label={`移除爱好 ${tag}`} className="selected" onClick={() => setProfileDetails((value) => ({ ...value, hobbies: value.hobbies.filter((item) => item !== tag) }))}>{tag} <span aria-hidden="true">×</span></button>)}</div><div className="profile-hobby-suggestions"><small>常见方向</small>{tags.slice(0, 5).map((tag) => <button type="button" key={tag} disabled={profileDetails.hobbies.includes(tag) || profileDetails.hobbies.length >= 8} onClick={() => setProfileDetails((value) => ({ ...value, hobbies: [...value.hobbies, tag] }))}>{tag}</button>)}</div></fieldset>

        <div className="profile-visibility-list" aria-label="资料公开设置">{(Object.keys(detailLabels) as (keyof ProfileDetails["visibility"])[]).map((key) => <label className="profile-visibility-row" key={key}><span><strong>{detailLabels[key]}</strong><small>{profileDetails.visibility[key] ? "已展示在公开主页" : "仅自己可见"}</small></span><span className="profile-visibility-control"><input type="checkbox" checked={profileDetails.visibility[key]} aria-label={`公开${detailLabels[key]}`} onChange={(event) => { const isVisible = event.target.checked; const apply = () => setProfileDetails((value) => ({ ...value, visibility: { ...value.visibility, [key]: isVisible } })); if (isVisible) void confirmInApp("公开展示" + detailLabels[key] + "？", {title:"更新个人信息展示",confirmLabel:"公开展示"}).then((confirmed) => { if (confirmed) apply(); }); else apply(); }} /></span></label>)}</div>

        <div className="account-certification-block">
          <p className="account-field-label">我的认证标识</p>
          {badges.length ? <div className="profile-badge-list">{badges.map((badge) => <span key={badge.id} title={badge.description} style={{ "--profile-badge-color": badge.color } as CSSProperties}><BadgeCheck size={13} aria-hidden="true"/>{badge.label}</span>)}</div> : <p className="account-certification-empty">暂时没有认证标识。</p>}
        </div>
      </div>}
    </section>

    {cropFile && <AvatarCropper
      file={cropFile}
      onCancel={() => setCropFile(null)}
      onConfirm={(blob, previewUrl) => {
        const cropped = new File([blob], `avatar-${Date.now()}.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type });
        setFile(cropped);
        setFilePreview(previewUrl);
        setCropFile(null);
      }}
    />}
    {coverFile && <CoverEditor
      file={coverFile}
      nickname={nickname}
      avatar={filePreview || avatar}
      onCancel={() => setCoverFile(null)}
      onSaved={(url, meta) => {
        setCurrentCover(url);
        setCurrentCoverMeta(meta);
        setCoverFile(null);
        window.dispatchEvent(new CustomEvent("heika-profile-updated", { detail: { id: accountId, cover: url, coverMeta: meta } }));
        notifyNativeProfile({ id: accountId, cover: url, coverMeta: meta });
      }}
      onNotice={(message) => onNotice?.(message)}
    />}
    <AnimatedNotice message={error}/>
    <div className="account-profile-actions">
      <span className="account-profile-save-status" role="status" aria-live="polite">
        {savePhase === "loading" ? "正在保存资料…"
          : savePhase === "success" ? "保存成功"
          : savePhase === "error" ? "保存失败，内容已保留，可重试"
          : "修改仅在点击保存后生效"}
      </span>
      <button
        className={`primary-button account-save-button${savePhase === "loading" ? " is-loading" : ""}${savePhase === "success" ? " is-success" : ""}${savePhase === "error" ? " is-error" : ""}`}
        disabled={busy || savePhase === "success"}
        onClick={() => void save()}
      >
        {savePhase === "loading" ? "保存中…" : savePhase === "success" ? <><Check size={16}/> 保存成功</> : savePhase === "error" ? "保存失败，点击重试" : <><Check size={16}/> 保存资料</>}
      </button>
      {mode === "modal" && <button className="soft-button" disabled={busy} onClick={onClose}>取消</button>}
    </div>
  </div>;
}
