"use client";

import { memo, useMemo, useState } from "react";
import {
  BadgeCheck, Bell, BookOpen, ChevronRight, Database, FileText, Hash, Inbox,
  Info, Layers, LayoutGrid, Megaphone, MessageSquare, Moon, Palette, PanelBottom, PenLine, Save, Search,
  Shield, ShieldCheck, Sparkles, Type, UserRound, UserSquare,
} from "lucide-react";
import { APP_VERSION } from "@/lib/version";

export type SettingsDetail = "theme" | "font" | "bottomNav" | "discoverLayout" | "profileLayout" | "homeMode" | "reading" | "detailTransition" | "notifications" | "profile" | "interests" | "security" | "membership" | "progression" | "creator" | "cache" | "feedback" | "announcement" | "certification";
type Row = { label: string; value?: string; icon: typeof Moon; action: () => void };
type Props = {
  theme: "dark" | "light" | "system";
  fontChoice: "oppo" | "system";
  bottomNavStyle?: "glass" | "fixed";
  homeMode: "waterfall" | "blackcard";
  readingMode: "standard" | "focus" | "night";
  detailTransition: "image-zoom" | "blur-rise" | "ghost-handoff";
  discoverLayout: "waterfall" | "single";
  profileLayout: "masonry" | "list";
  messagesEnabled: boolean;
  accountId: string | null;
  isStaff: boolean;
  onOpenDetail: (detail: SettingsDetail) => void;
  onOpenDecor: (target: "bottom" | "card" | "official") => void;
  onOpenDrafts: () => void;
  onOpenAbout: () => void;
  onOpenContent: () => void;
  onOpenCreator: () => void;
  onOpenFeedbackAdmin: () => void;
  onOpenModeration: () => void;
  onBack: () => void;
};

type CenterId = "appearance" | "notify" | "account" | "support" | "admin";
type Center = { id: CenterId; title: string; description: string; icon: typeof Moon; rows: Row[] };

/**
 * 设置中心三级结构：
 * 一级 设置中心（本页默认视图）→ 二级 功能中心（外观与阅读 / 通知与消息 / 账号与内容 / 应用与支持）
 * → 三级 具体设置（主题、字体、字号、布局、阅读模式、通知开关等，由 onOpenDetail 打开）。
 * 个人账号入口直达三级，避免为层级而多点一次。最多三级，不产生第四级页面。
 */
function SettingsHome({ theme, fontChoice, bottomNavStyle, homeMode, readingMode, detailTransition, discoverLayout, profileLayout, messagesEnabled, accountId, isStaff, onOpenDetail, onOpenDecor, onOpenDrafts, onOpenAbout, onOpenContent, onOpenCreator, onOpenFeedbackAdmin, onOpenModeration, onBack }: Props) {
  const [center, setCenter] = useState<CenterId | null>(null);
  const [query, setQuery] = useState("");

  const centers: Center[] = useMemo(() => {
    const list: Center[] = [
      {
        id: "appearance", title: "外观与阅读", description: "主题、字体、布局与阅读体验", icon: Moon, rows: [
          { label: "主题外观", value: ({ dark: "深色", light: "浅色", system: "跟随系统" } as const)[theme], icon: Moon, action: () => onOpenDetail("theme") },
          { label: "字体设置", value: fontChoice === "oppo" ? "OPPO Sans" : "系统字体", icon: Type, action: () => onOpenDetail("font") },
          { label: "底部导航", value: "悬浮", icon: PanelBottom, action: () => onOpenDetail("bottomNav") },
          { label: "底栏装扮", value: "颜色、图标与预设", icon: Palette, action: () => onOpenDecor("bottom") },
          { label: "卡片装扮", value: "卡背与内容面", icon: Layers, action: () => onOpenDecor("card") },
          { label: "创意工坊", value: "官方与玩家主题", icon: Sparkles, action: () => onOpenDecor("official") },
          { label: "首页浏览方式", value: homeMode === "waterfall" ? "瀑布流" : "黑卡模式", icon: LayoutGrid, action: () => onOpenDetail("homeMode") },
          { label: "发现页布局", value: discoverLayout === "waterfall" ? "瀑布流" : "单列阅读", icon: LayoutGrid, action: () => onOpenDetail("discoverLayout") },
          { label: "详情过渡效果", value: ({ "image-zoom": "连续展开", "blur-rise": "柔和上浮", "ghost-handoff": "留影衔接" } as const)[detailTransition], icon: Sparkles, action: () => onOpenDetail("detailTransition") },
          { label: "阅读模式", value: ({ standard: "标准", focus: "专注", night: "夜间" } as const)[readingMode], icon: BookOpen, action: () => onOpenDetail("reading") },
          { label: "他人主页布局", value: profileLayout === "masonry" ? "大图瀑布流" : "列表", icon: UserSquare, action: () => onOpenDetail("profileLayout") },
        ],
      },
      {
        id: "notify", title: "通知与消息", description: "提醒、私信与消息偏好", icon: Bell, rows: [
          { label: "通知设置", value: messagesEnabled ? "已开启" : "查看设置", icon: Bell, action: () => onOpenDetail("notifications") },
          { label: "消息偏好", value: "私信与互动提醒", icon: MessageSquare, action: () => onOpenDetail("notifications") },
        ],
      },
      {
        id: "account", title: "账号与内容", description: "资料、隐私、作品与创作服务", icon: UserRound, rows: [
          { label: "个人资料", icon: UserRound, action: () => onOpenDetail("profile") },
          { label: "隐私与安全", value: "作品可见范围", icon: Shield, action: () => onOpenDetail("security") },
          { label: "我的作品与草稿", icon: FileText, action: onOpenContent },
          { label: "本地草稿箱", value: "只保存在此设备", icon: Save, action: onOpenDrafts },
          { label: "兴趣与话题", icon: Hash, action: () => onOpenDetail("interests") },
          { label: "创作者中心", icon: PenLine, action: onOpenCreator },
          { label: "兑换认证码", value: "认证标识", icon: BadgeCheck, action: () => onOpenDetail("certification") },
          { label: "会员与成长", icon: Sparkles, action: () => onOpenDetail("membership") },
        ],
      },
      {
        id: "support", title: "应用与支持", description: "缓存、反馈与版本信息", icon: Info, rows: [
          { label: "缓存与存储", icon: Database, action: () => onOpenDetail("cache") },
          { label: "意见反馈", icon: MessageSquare, action: () => onOpenDetail("feedback") },
          { label: "关于黑卡", value: `版本 ${APP_VERSION}`, icon: Info, action: onOpenAbout },
        ],
      },
    ];
    if (isStaff) list.push({
      id: "admin", title: "管理员专区", description: "公告、审核与反馈处理", icon: ShieldCheck, rows: [
        { label: "管理后台", value: "AI 审核中心", icon: ShieldCheck, action: onOpenModeration },
        { label: "公告管理", value: "启动弹窗", icon: Megaphone, action: () => onOpenDetail("announcement") },
        { label: "反馈管理", icon: Inbox, action: onOpenFeedbackAdmin },
      ],
    });
    return list;
  }, [theme, fontChoice, bottomNavStyle, homeMode, discoverLayout, detailTransition, readingMode, profileLayout, messagesEnabled, isStaff, onOpenDetail, onOpenAbout, onOpenContent, onOpenCreator, onOpenFeedbackAdmin, onOpenModeration]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return centers.flatMap((item) => item.rows.filter((row) => row.label.toLowerCase().includes(term)).map((row) => ({ ...row, center: item.title })));
  }, [centers, query]);

  const active = centers.find((item) => item.id === center) || null;

  return <section className="page settings-page settings-home-page">
    <button className="back settings-back" type="button" onClick={center ? () => { setCenter(null); setQuery(""); } : onBack}><span aria-hidden="true">‹</span> {center ? "设置" : "我的"}</button>
    <div className="settings-page-heading"><h1>{active ? active.title : "设置"}</h1>{active && <p>{active.description}</p>}</div>

    {!center && <>
      <label className="settings-search-field"><Search size={15} aria-hidden="true"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置项" aria-label="搜索设置项" maxLength={40}/></label>
      {query.trim() ? <div className="settings-list settings-search-results">
        {results.length ? results.map((row) => {
          const Icon = row.icon;
          return <button type="button" key={`${row.center}-${row.label}`} onClick={() => { row.action(); setQuery(""); }}><span className="settings-row-icon" aria-hidden="true"><Icon size={16}/></span><span>{row.label}</span><small>{row.center}</small><ChevronRight size={16} aria-hidden="true"/></button>;
        }) : <p className="settings-search-empty">没有匹配的设置项</p>}
      </div> : <div className="settings-center-list">
        {centers.map((item) => {
          const Icon = item.icon;
          return <button type="button" className="settings-center-card" key={item.id} onClick={() => setCenter(item.id)}>
            <span className="settings-center-icon" aria-hidden="true"><Icon size={19}/></span>
            <span className="settings-center-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
            {item.id === "account" && <em className="settings-center-state">{accountId ? "已登录" : "未登录"}</em>}
            <ChevronRight size={17} aria-hidden="true"/>
          </button>;
        })}
      </div>}
    </>}

    {active && <div className="settings-list settings-center-detail">
      {active.rows.map((row) => {
        const Icon = row.icon;
        return <button type="button" key={row.label} onClick={row.action}>
          <span className="settings-row-icon" aria-hidden="true"><Icon size={16}/></span>
          <span>{row.label}</span>{row.value && <small>{row.value}</small>}<ChevronRight size={16} aria-hidden="true"/>
        </button>;
      })}
    </div>}

    {accountId && <p className="fineprint settings-local-note">外观和阅读偏好保存在此设备；部分账号偏好会同步至账号。</p>}
  </section>;
}

export default memo(SettingsHome);
