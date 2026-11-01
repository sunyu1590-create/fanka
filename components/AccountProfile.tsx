"use client";
import { useEffect, useState } from "react";
import { ImagePlus, UserRound } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import AnimatedNotice from "./AnimatedNotice";

export default function AccountProfile({
  name,
  bio,
  avatar,
  onSave,
  onClose,
  mode = "modal",
}: {
  name: string;
  bio: string;
  avatar?: string;
  onSave: (name: string, bio: string, avatar?: string) => void;
  onClose: () => void;
  mode?: "page" | "modal";
}) {
  const [nickname, setNickname] = useState(name),
    [description, setDescription] = useState(bio),
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
    if (!nickname.trim() || nickname.trim().length > 24 || description.length > 80) {
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
        const { error } = await db.from("profiles").update({ nickname: nickname.trim(), bio: description.trim(), avatar_url: url || null }).eq("id", user.id);
        if (error) throw error;
      } else if (file) {
        setError("登录后可上传头像");
        return;
      }
      onSave(nickname.trim(), description.trim(), url);
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
    <AnimatedNotice message={error}/>
    <div className="account-profile-actions">
      <button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存资料"}</button>
      {mode === "page" && <button className="soft-button" disabled={busy} onClick={onClose}>取消</button>}
      {mode === "modal" && <button className="soft-button" disabled={busy} onClick={onClose}>取消</button>}
    </div>
  </div>;
}
