"use client";

import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { APP_VERSION } from "@/lib/version";

export type SettingsDetail = "theme" | "font" | "bottomNav" | "discoverLayout" | "profileLayout" | "homeMode" | "reading" | "detailTransition" | "notifications" | "profile" | "interests" | "security" | "membership" | "progression" | "creator" | "cache" | "feedback";
type Props = {
  theme: "dark" | "light" | "system";
  fontChoice: "oppo" | "system";
  bottomNavStyle: "glass" | "fixed";
  homeMode: "waterfall" | "blackcard";
  readingMode: "standard" | "focus" | "night";
  detailTransition: "image-zoom" | "blur-rise" | "ghost-handoff";
  discoverLayout: "waterfall" | "single";
  profileLayout: "masonry" | "list";
  messagesEnabled: boolean;
  accountId: string | null;
  isStaff: boolean;
  onOpenDetail: (detail: SettingsDetail) => void;
  onOpenAbout: () => void;
  onOpenContent: () => void;
  onOpenCreator: () => void;
  onOpenFeedbackAdmin: () => void;
  onOpenModeration: () => void;
  onBack: () => void;
};

function SettingsHome({ theme, fontChoice, bottomNavStyle, homeMode, readingMode, detailTransition, discoverLayout, profileLayout, messagesEnabled, accountId, isStaff, onOpenDetail, onOpenAbout, onOpenContent, onOpenCreator, onOpenFeedbackAdmin, onOpenModeration, onBack }: Props) {
  const groups: { title: string; rows: { label: string; value?: string; action: () => void }[] }[] = [
    { title: "外观与显示", rows: [
      { label: "主题外观", value: ({ dark: "深色", light: "浅色", system: "跟随系统" } as const)[theme], action: () => onOpenDetail("theme") },
      { label: "字体设置", value: fontChoice === "oppo" ? "OPPO Sans 4.0 · 设备回退" : "系统字体", action: () => onOpenDetail("font") },
      { label: "底部导航", value: bottomNavStyle === "glass" ? "悬浮玻璃" : "固定底栏", action: () => onOpenDetail("bottomNav") },
    ] },
    { title: "浏览与阅读", rows: [
      { label: "首页浏览方式", value: homeMode === "waterfall" ? "瀑布流" : "黑卡模式", action: () => onOpenDetail("homeMode") },
      { label: "阅读模式", value: ({ standard: "标准", focus: "专注", night: "夜间" } as const)[readingMode], action: () => onOpenDetail("reading") },
      { label: "详情过渡效果", value: ({ "image-zoom": "连续展开", "blur-rise": "柔和上浮", "ghost-handoff": "留影衔接" } as const)[detailTransition], action: () => onOpenDetail("detailTransition") },
      { label: "发现页布局", value: discoverLayout === "waterfall" ? "瀑布流" : "单列阅读", action: () => onOpenDetail("discoverLayout") },
      { label: "他人主页布局", value: profileLayout === "masonry" ? "大图瀑布流" : "列表", action: () => onOpenDetail("profileLayout") },
    ] },
    { title: "消息与通知", rows: [
      { label: "通知与提醒", value: messagesEnabled ? "私信提醒已开启" : "查看提醒设置", action: () => onOpenDetail("notifications") },
    ] },
    { title: "账号与内容", rows: [
      { label: "个人资料", action: () => onOpenDetail("profile") },
      { label: "兴趣与话题", value: "我的兴趣 · 关注的话题", action: () => onOpenDetail("interests") },
      { label: "我的作品与草稿", action: onOpenContent },
      { label: "隐私与安全", value: "作品可见范围", action: () => onOpenDetail("security") },
      { label: "创作者中心", action: onOpenCreator },
    ] },
    { title: "应用与支持", rows: [
      { label: "缓存管理", action: () => onOpenDetail("cache") },
      { label: "意见反馈", action: () => onOpenDetail("feedback") },
      { label: "关于黑卡", value: `版本 ${APP_VERSION}`, action: onOpenAbout },
      ...(isStaff ? [{ label: "管理后台", action: onOpenModeration }] : []),
      ...(isStaff ? [{ label: "反馈管理", action: onOpenFeedbackAdmin }] : []),
    ] },
  ];

  return <section className="page settings-page settings-home-page">
    <button className="back settings-back" type="button" onClick={onBack}><span aria-hidden="true">‹</span> 我的</button>
    <div className="settings-page-heading"><div className="eyebrow">HEIKA / PREFERENCES</div><h1>设置<span className="red-dot">.</span></h1></div>
    <div className="settings-content-layout">
      <nav className="settings-desktop-nav" aria-label="设置分类">{groups.map((group, index) => <a key={group.title} href={`#settings-group-${index}`}>{group.title}</a>)}</nav>
      <div className="settings-groups">
      {groups.map((group, index) => <section className="settings-group" id={`settings-group-${index}`} key={group.title}>
        <h2>{group.title}</h2>
        <div className="settings-list">
          {group.rows.map((row) => <button type="button" key={row.label} onClick={row.action}>
            <span>{row.label}</span>{row.value && <small>{row.value}</small>}<ChevronRight size={16} aria-hidden="true" />
          </button>)}
        </div>
      </section>)}
      </div>
    </div>
    {accountId && <p className="fineprint settings-local-note">外观和阅读偏好保存在此设备；部分账号偏好会同步至账号。</p>}
  </section>;
}

export default memo(SettingsHome);
