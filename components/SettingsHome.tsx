"use client";

import { memo } from "react";
import {
  BadgeCheck, Bell, BookOpen, ChevronRight, Database, FileText, Hash, Inbox,
  Info, LayoutGrid, Megaphone, MessageSquare, Moon, PanelBottom, PenLine,
  Shield, ShieldCheck, Sparkles, Type, UserRound, UserSquare,
} from "lucide-react";
import { APP_VERSION } from "@/lib/version";

export type SettingsDetail = "theme" | "font" | "bottomNav" | "discoverLayout" | "profileLayout" | "homeMode" | "reading" | "detailTransition" | "notifications" | "profile" | "interests" | "security" | "membership" | "progression" | "creator" | "cache" | "feedback" | "announcement" | "certification";
type Row = { label: string; value?: string; icon: typeof Moon; action: () => void };
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
  const groups: { title: string; rows: Row[] }[] = [
    { title: "外观与显示", rows: [
      { label: "主题外观", value: ({ dark: "深色", light: "浅色", system: "跟随系统" } as const)[theme], icon: Moon, action: () => onOpenDetail("theme") },
      { label: "字体设置", value: fontChoice === "oppo" ? "OPPO Sans" : "系统字体", icon: Type, action: () => onOpenDetail("font") },
      { label: "底部导航", value: bottomNavStyle === "glass" ? "悬浮" : "固定", icon: PanelBottom, action: () => onOpenDetail("bottomNav") },
    ] },
    { title: "浏览与阅读", rows: [
      { label: "首页浏览方式", value: homeMode === "waterfall" ? "瀑布流" : "黑卡模式", icon: LayoutGrid, action: () => onOpenDetail("homeMode") },
      { label: "阅读模式", value: ({ standard: "标准", focus: "专注", night: "夜间" } as const)[readingMode], icon: BookOpen, action: () => onOpenDetail("reading") },
      { label: "详情过渡效果", value: ({ "image-zoom": "连续展开", "blur-rise": "柔和上浮", "ghost-handoff": "留影衔接" } as const)[detailTransition], icon: Sparkles, action: () => onOpenDetail("detailTransition") },
      { label: "发现页布局", value: discoverLayout === "waterfall" ? "瀑布流" : "单列阅读", icon: LayoutGrid, action: () => onOpenDetail("discoverLayout") },
      { label: "他人主页布局", value: profileLayout === "masonry" ? "大图瀑布流" : "列表", icon: UserSquare, action: () => onOpenDetail("profileLayout") },
    ] },
    { title: "消息与通知", rows: [
      { label: "通知与提醒", value: messagesEnabled ? "已开启" : "查看设置", icon: Bell, action: () => onOpenDetail("notifications") },
    ] },
    { title: "账号与内容", rows: [
      { label: "个人资料", icon: UserRound, action: () => onOpenDetail("profile") },
      { label: "兑换认证码", value: "认证标识", icon: BadgeCheck, action: () => onOpenDetail("certification") },
      { label: "兴趣与话题", icon: Hash, action: () => onOpenDetail("interests") },
      { label: "我的作品与草稿", icon: FileText, action: onOpenContent },
      { label: "隐私与安全", icon: Shield, action: () => onOpenDetail("security") },
      { label: "创作者中心", icon: PenLine, action: onOpenCreator },
    ] },
    { title: "应用与支持", rows: [
      { label: "缓存管理", icon: Database, action: () => onOpenDetail("cache") },
      { label: "意见反馈", icon: MessageSquare, action: () => onOpenDetail("feedback") },
      { label: "关于黑卡", value: `版本 ${APP_VERSION}`, icon: Info, action: onOpenAbout },
    ] },
  ];
  if (isStaff) groups.push({ title: "管理员专属", rows: [
    { label: "公告管理", value: "启动弹窗", icon: Megaphone, action: () => onOpenDetail("announcement") },
    { label: "管理后台", icon: ShieldCheck, action: onOpenModeration },
    { label: "反馈管理", icon: Inbox, action: onOpenFeedbackAdmin },
  ] });

  return <section className="page settings-page settings-home-page">
    <button className="back settings-back" type="button" onClick={onBack}><span aria-hidden="true">‹</span> 我的</button>
    <div className="settings-page-heading"><h1>设置</h1></div>
    <div className="settings-content-layout">
      <nav className="settings-desktop-nav" aria-label="设置分类">{groups.map((group, index) => <a key={group.title} href={`#settings-group-${index}`}>{group.title}</a>)}</nav>
      <div className="settings-groups">
      {groups.map((group, index) => <section className="settings-group" id={`settings-group-${index}`} key={group.title}>
        <h2>{group.title}</h2>
        <div className="settings-list">
          {group.rows.map((row) => {
            const Icon = row.icon;
            return <button type="button" key={row.label} onClick={row.action}>
              <span className="settings-row-icon" aria-hidden="true"><Icon size={16} /></span>
              <span>{row.label}</span>{row.value && <small>{row.value}</small>}<ChevronRight size={16} aria-hidden="true" />
            </button>;
          })}
        </div>
      </section>)}
      </div>
    </div>
    {accountId && <p className="fineprint settings-local-note">外观和阅读偏好保存在此设备；部分账号偏好会同步至账号。</p>}
  </section>;
}

export default memo(SettingsHome);
