"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Eye, ImagePlus, LockKeyhole, UserRound } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import { cloudRequest } from "@/lib/cloud";
import { tags } from "@/lib/content";
import AnimatedNotice from "./AnimatedNotice";
import ChoiceSelect from "./ChoiceSelect";

export type ProfileDetails = {
  gender: string;
  mbti: string;
  birthday: string;
  hobbies: string[];
  visibility: { gender: boolean; mbti: boolean; birthday: boolean; hobbies: boolean };
};

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

export default function AccountProfile({
  name,
  bio,
  avatar,
  details = emptyDetails,
  onSave,
  onClose,
  mode = "modal",
}: {
  name: string;
  bio: string;
  avatar?: string;
  details?: ProfileDetails;
  onSave: (name: string, bio: string, avatar: string | undefined, details: ProfileDetails) => void;
  onClose: () => void;
  mode?: "page" | "modal";
}) {
  const [nickname, setNickname] = useState(name),
    [description, setDescription] = useState(bio),
    [profileDetails, setProfileDetails] = useState<ProfileDetails>(details),
    [hobbyInput, setHobbyInput] = useState(""),
    [file, setFile] = useState<File>(),
    [filePreview, setFilePreview] = useState<string>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) { setFilePreview(undefined); return; }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const visibleFacts = useMemo(() => {
    const facts = [];
    if (profileDetails.visibility.gender && profileDetails.gender) facts.push({ label: "性别", value: genderLabels[profileDetails.gender] || profileDetails.gender });
    if (profileDetails.visibility.mbti && profileDetails.mbti) facts.push({ label: "MBTI", value: profileDetails.mbti });
    if (profileDetails.visibility.birthday && profileDetails.birthday) facts.push({ label: "生日", value: profileDetails.birthday });
    if (profileDetails.visibility.hobbies && profileDetails.hobbies.length) facts.push({ label: "爱好", value: profileDetails.hobbies.join("、") });
    return facts;
  }, [profileDetails]);

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
    if (!nickname.trim() || nickname.trim().length > 24 || description.length > 80 || profileDetails.hobbies.length > 8) {
      setError("昵称为 1–24 字，简介不超过 80 字");
      return;
    }
    setBusy(true);
    try {
      const db = await browserDb();
      const { data: { user } } = await db.auth.getUser();
      let url = avatar;
      if (user) {
        if (file) {
          const path = `${user.id}/${crypto.randomUUID()}`;
          const { error } = await db.storage.from("heika-avatars").upload(path, file, { contentType: file.type });
          if (error) throw error;
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
        setError("登录后可上传头像");
        return;
      }
      onSave(nickname.trim(), description.trim(), url, profileDetails);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return <div className={`account-profile-form ${mode}`}>
    {mode === "modal" && <>
      <div className="eyebrow">PROFILE / EDIT</div>
      <h2>编辑个人资料</h2>
      <p>更新你希望其他探索者看到的信息。</p>
    </>}

    {mode === "page" && <aside className="profile-live-preview" aria-label="公开主页实时预览">
      <div className="profile-live-preview-heading"><span className="eyebrow">PUBLIC PROFILE</span><span><Eye size={14}/> 实时预览</span></div>
      <div className="profile-live-preview-identity">
        <Avatar src={filePreview || avatar} label="公开头像预览" className="is-large" />
        <div><strong>{nickname.trim() || "探索者"}</strong><p>{description.trim() || "还没有填写简介。"}</p></div>
      </div>
      {visibleFacts.length > 0 ? <div className="profile-live-preview-facts">{visibleFacts.map((fact) => <span key={fact.label}><small>{fact.label}</small><strong>{fact.value}</strong></span>)}</div> : <div className="profile-live-preview-private"><LockKeyhole size={14}/> 目前仅公开昵称与简介</div>}
      <div className="profile-live-preview-foot"><span><Eye size={14}/> 仅显示已开启公开的资料</span><span>预览</span></div>
    </aside>}

    <section className="account-profile-section account-profile-basics" aria-labelledby="account-profile-basics-title">
      <div className="account-profile-section-heading"><span className="account-profile-section-index">01</span><div><h3 id="account-profile-basics-title">基础资料</h3><p>完善头像、昵称和简介，让主页更有辨识度。</p></div></div>
      <label className="account-avatar-field">
        <span className="account-field-label">头像</span>
        <span className="account-avatar-control">
          <Avatar src={filePreview || avatar} label="头像预览" />
          <span className="account-avatar-prompt"><strong>{file ? file.name : "更换头像"}</strong><small>JPEG、PNG 或 WebP，最大 2MB</small></span>
          <ImagePlus size={18}/>
        </span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
          const selected = event.target.files?.[0];
          if (!selected) return;
          if (selected.size > 2097152 || !["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
            setError("请选择 2MB 以内的 JPEG、PNG 或 WebP");
            event.target.value = "";
            return;
          }
          setError(""); setFile(selected);
        }}/>
      </label>
      <label className="account-profile-field">昵称<input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} placeholder="设置公开昵称" /><small className="account-character-count">{nickname.length}/24</small></label>
      <label className="account-profile-field">简介<textarea value={description} maxLength={80} rows={3} onChange={(event) => setDescription(event.target.value)} placeholder="介绍一下自己" /><small className="account-character-count">{description.length}/80</small></label>
    </section>

    <section className="profile-detail-fields account-profile-section" aria-labelledby="profile-detail-title">
      <div className="account-profile-section-heading"><span className="account-profile-section-index">02</span><div><h3 id="profile-detail-title">个人信息与展示范围</h3><p>可选填写；每项是否展示都由你决定。</p></div></div>
      <div className="profile-facts-editor-grid">
        <label className="account-profile-field"><span>性别</span><ChoiceSelect label="性别" value={profileDetails.gender} options={[{value:"",label:"暂不填写"},{value:"female",label:"女"},{value:"male",label:"男"},{value:"nonbinary",label:"非二元"},{value:"undisclosed",label:"不愿透露"}]} onChange={(gender) => setProfileDetails((value) => ({ ...value, gender }))}/></label>
        <label className="account-profile-field"><span>MBTI</span><ChoiceSelect label="MBTI" value={profileDetails.mbti} options={[{value:"",label:"暂不填写"},...mbtiOptions.map((type) => ({value:type,label:type}))]} onChange={(mbti) => setProfileDetails((value) => ({ ...value, mbti }))}/></label>
        <label className="account-profile-field profile-birthday-field">生日<input type="date" value={profileDetails.birthday} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setProfileDetails((value) => ({ ...value, birthday: event.target.value }))} /><small>只在开启公开后显示</small></label>
      </div>
      <fieldset className="account-profile-field profile-hobby-field"><legend>我的兴趣 <small>最多 8 项，可自行添加</small></legend><div className="profile-hobby-entry"><input value={hobbyInput} maxLength={20} placeholder="输入兴趣后添加" onChange={(event) => setHobbyInput(event.target.value)} onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); addHobby(); }} /><button type="button" disabled={!hobbyInput.trim() || profileDetails.hobbies.length >= 8} onClick={addHobby}>添加</button></div><div className="profile-hobby-options">{profileDetails.hobbies.map((tag) => <button type="button" key={tag} aria-label={`移除爱好 ${tag}`} className="selected" onClick={() => setProfileDetails((value) => ({ ...value, hobbies: value.hobbies.filter((item) => item !== tag) }))}>{tag} <span aria-hidden="true">×</span></button>)}</div><div className="profile-hobby-suggestions"><small>常见方向</small>{tags.slice(0, 5).map((tag) => <button type="button" key={tag} disabled={profileDetails.hobbies.includes(tag) || profileDetails.hobbies.length >= 8} onClick={() => setProfileDetails((value) => ({ ...value, hobbies: [...value.hobbies, tag] }))}>{tag}</button>)}</div></fieldset>
    </section>

    <section className="profile-visibility-settings account-profile-section" aria-labelledby="profile-visibility-title">
      <div className="account-profile-section-heading"><span className="account-profile-section-index">03</span><div><h3 id="profile-visibility-title">公开范围</h3><p>关闭后，该项只会保留在你的账号中。</p></div></div>
      <div className="profile-visibility-list" aria-label="资料公开设置">{(Object.keys(detailLabels) as (keyof ProfileDetails["visibility"])[]).map((key) => <label className="profile-visibility-row" key={key}><span><strong>{detailLabels[key]}</strong><small>{profileDetails.visibility[key] ? "已展示在公开主页" : "仅自己可见"}</small></span><span className="profile-visibility-control"><input type="checkbox" checked={profileDetails.visibility[key]} aria-label={`公开${detailLabels[key]}`} onChange={(event) => { const isVisible = event.target.checked; if (isVisible && !window.confirm("公开展示" + detailLabels[key] + "？")) { event.currentTarget.checked = false; return; } setProfileDetails((value) => ({ ...value, visibility: { ...value.visibility, [key]: isVisible } })); }} /></span></label>)}</div>
    </section>

    <AnimatedNotice message={error}/>
    <div className="account-profile-actions">
      <span className="account-profile-save-status">{busy ? "正在安全保存资料…" : "修改仅在点击保存后生效"}</span>
      <button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : <><Check size={16}/> 保存资料</>}</button>
      {mode === "modal" && <button className="soft-button" disabled={busy} onClick={onClose}>取消</button>}
    </div>
  </div>;
}
