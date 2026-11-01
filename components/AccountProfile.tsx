"use client";
import { useEffect, useState } from "react";
import { ImagePlus, UserRound } from "lucide-react";
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
    {mode === "modal" && <><h2>编辑公开资料</h2><p>昵称、简介和头像将显示在你的公开主页。</p></>}
    <label className="account-avatar-field">
      <span className="account-field-label">头像</span>
      <span className="account-avatar-control">
        <span className="account-avatar-preview">{filePreview || avatar ? <img src={filePreview || avatar} alt="头像预览" /> : <UserRound size={24}/>}</span>
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
    <label className="account-profile-field">昵称<input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} placeholder="设置公开昵称" /></label>
    <label className="account-profile-field">简介<textarea value={description} maxLength={80} rows={3} onChange={(event) => setDescription(event.target.value)} placeholder="介绍一下自己" /><small className="account-character-count">{description.length}/80</small></label>
    <section className="profile-detail-fields" aria-labelledby="profile-detail-title">
      <div className="profile-detail-heading"><div><h3 id="profile-detail-title">个人特征</h3><p>每项都可选择是否展示在公开主页。</p></div></div>
      <div className="account-profile-field"><span>性别</span><ChoiceSelect label="性别" value={profileDetails.gender} options={[{value:"",label:"暂不填写"},{value:"female",label:"女"},{value:"male",label:"男"},{value:"nonbinary",label:"非二元"},{value:"undisclosed",label:"不愿透露"}]} onChange={(gender) => setProfileDetails((value) => ({ ...value, gender }))}/></div>
      <div className="account-profile-field"><span>MBTI</span><ChoiceSelect label="MBTI" value={profileDetails.mbti} options={[{value:"",label:"暂不填写"},...mbtiOptions.map((type) => ({value:type,label:type}))]} onChange={(mbti) => setProfileDetails((value) => ({ ...value, mbti }))}/></div>
      <label className="account-profile-field">生日<input type="date" value={profileDetails.birthday} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setProfileDetails((value) => ({ ...value, birthday: event.target.value }))} /></label>
      <fieldset className="account-profile-field profile-hobby-field"><legend>爱好 <small>最多 8 项，可自定义</small></legend><div className="profile-hobby-entry"><input value={hobbyInput} maxLength={20} placeholder="输入爱好后添加" onChange={(event) => setHobbyInput(event.target.value)} onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); const hobby = hobbyInput.trim(); if (!hobby) return; if (profileDetails.hobbies.includes(hobby)) { setHobbyInput(""); return; } if (profileDetails.hobbies.length >= 8) { setError("爱好最多选择 8 项"); return; } setProfileDetails((value) => ({ ...value, hobbies: [...value.hobbies, hobby] })); setHobbyInput(""); setError(""); }} /><button type="button" disabled={!hobbyInput.trim() || profileDetails.hobbies.length >= 8} onClick={() => { const hobby = hobbyInput.trim(); if (!hobby) return; if (!profileDetails.hobbies.includes(hobby) && profileDetails.hobbies.length < 8) setProfileDetails((value) => ({ ...value, hobbies: [...value.hobbies, hobby] })); setHobbyInput(""); setError(""); }}>添加</button></div><div className="profile-hobby-options">{profileDetails.hobbies.map((tag) => <button type="button" key={tag} aria-label={`移除爱好 ${tag}`} className="selected" onClick={() => setProfileDetails((value) => ({ ...value, hobbies: value.hobbies.filter((item) => item !== tag) }))}>{tag} ×</button>)}</div><div className="profile-hobby-suggestions"><small>常见方向</small>{tags.slice(0, 5).map((tag) => <button type="button" key={tag} disabled={profileDetails.hobbies.includes(tag) || profileDetails.hobbies.length >= 8} onClick={() => setProfileDetails((value) => ({ ...value, hobbies: [...value.hobbies, tag] }))}>{tag}</button>)}</div></fieldset>
      <div className="profile-visibility-list" aria-label="资料公开设置">{(Object.keys(detailLabels) as (keyof ProfileDetails["visibility"])[]).map((key) => <label className="profile-visibility-row" key={key}><span><strong>公开{detailLabels[key]}</strong><small>{key === "birthday" ? "生日默认仅自己可见" : "关闭后仅自己可见"}</small></span><input type="checkbox" checked={profileDetails.visibility[key]} onChange={(event) => setProfileDetails((value) => ({ ...value, visibility: { ...value.visibility, [key]: event.target.checked } }))} /></label>)}</div>
    </section>
    <AnimatedNotice message={error}/>
    <div className="account-profile-actions">
      <button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存资料"}</button>
      {mode === "modal" && <button className="soft-button" disabled={busy} onClick={onClose}>取消</button>}
    </div>
  </div>;
}
