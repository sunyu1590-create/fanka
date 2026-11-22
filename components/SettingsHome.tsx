"use client";

import { memo, useMemo, useRef, useState } from "react";
import {
  BadgeCheck, Bell, BookOpen, ChevronRight, Database, FileText, Hash, Inbox,
  Info, Layers, LayoutGrid, Megaphone, MessageSquare, Moon, Palette, PenLine, Save, Search,
  Shield, ShieldCheck, Sparkles, Type, UserRound, UserSquare,
} from "lucide-react";
import { APP_VERSION } from "@/lib/version";

export type SettingsDetail = "theme" | "font" | "discoverLayout" | "profileLayout" | "homeMode" | "reading" | "detailTransition" | "notifications" | "profile" | "interests" | "security" | "membership" | "progression" | "creator" | "cache" | "feedback" | "announcement" | "certification";
type Row = { label: string; value?: string; icon: typeof Moon; action: () => void };
type Group = { title?: string; rows: Row[] };
type Props = {
  theme: "dark" | "light" | "system";
  fontChoice: "oppo" | "system";
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
type Center = { id: CenterId; title: string; icon: typeof Moon; groups: Group[] };

/**
 * 设置中心三级结构：
 * 一级 设置中心（本页默认视图）→ 二级 功能中心 → 三级 具体设置（由 onOpenDetail 打开）。
 * 二级页内按功能关系分组（需求十）：外观与文字 / 个性装扮 / 浏览与阅读 / 动效，
 * 每组独立轻量容器 + 简短标题，组间留白，不再共用一个贯穿全页的大容器。
 * 当前值放右侧；文案只保留真实当前值与本地保存提示，不重复解释功能。
 */
function SettingsHome({ theme, fontChoice, homeMode, readingMode, detailTransition, discoverLayout, profileLayout, messagesEnabled, accountId, isStaff, onOpenDetail, onOpenDecor, onOpenDrafts, onOpenAbout, onOpenContent, onOpenCreator, onOpenFeedbackAdmin, onOpenModeration, onBack }: Props) {
  const [center, setCenter] = useState<CenterId | null>(null);
  const [query, setQuery] = useState("");
  const listScroll = useRef(0);

  const centers: Center[] = useMemo(() => {
    const list: Center[] = [
      {
        id: "appearance", title: "外观与装扮", icon: Moon, groups: [
          {
            title: "外观与文字", rows: [
              { label: "主题外观", value: ({ dark: "深色", light: "浅色", system: "跟随系统" } as const)[theme], icon: Moon, action: () => onOpenDetail("theme") },
              { label: "字体设置", value: fontChoice === "oppo" ? "OPPO Sans" : "系统字体", icon: Type, action: () => onOpenDetail("font") },
            ],
          },
          {
            title: "个性装扮", rows: [
              { label: "底栏装扮", icon: Palette, action: () => onOpenDecor("bottom") },
              { label: "卡片装扮", icon: Layers, action: () => onOpenDecor("card") },
              { label: "创意工坊", icon: Sparkles, action: () => onOpenDecor("official") },
            ],
          },
          {
            title: "浏览与阅读", rows: [
              { label: "首页浏览方式", value: homeMode === "waterfall" ? "瀑布流" : "黑卡模式", icon: LayoutGrid, action: () => onOpenDetail("homeMode") },
              { label: "发现页布局", value: discoverLayout === "waterfall" ? "瀑布流" : "单列阅读", icon: LayoutGrid, action: () => onOpenDetail("discoverLayout") },
              { label: "阅读模式", value: ({ standard: "标准", focus: "专注", night: "夜间" } as const)[readingMode], icon: BookOpen, action: () => onOpenDetail("reading") },
              { label: "他人主页布局", value: profileLayout === "masonry" ? "大图瀑布流" : "列表", icon: UserSquare, action: () => onOpenDetail("profileLayout") },
            ],
          },
          {
            title: "动效", rows: [
              { label: "详情过渡效果", value: ({ "image-zoom": "连续展开", "blur-rise": "柔和上浮", "ghost-handoff": "留影衔接" } as const)[detailTransition], icon: Sparkles, action: () => onOpenDetail("detailTransition") },
            ],
          },
        ],
      },
      {
        id: "notify", title: "通知与消息", icon: Bell, groups: [
          {
            rows: [
              { label: "通知设置", value: messagesEnabled ? "已开启" : "已关闭", icon: Bell, action: () => onOpenDetail("notifications") },
              { label: "消息偏好", icon: MessageSquare, action: () => onOpenDetail("notifications") },
            ],
          },
        ],
      },
      {
        id: "account", title: "账号与内容", icon: UserRound, groups: [
          {
            title: "账号", rows: [
              { label: "个人资料", icon: UserRound, action: () => onOpenDetail("profile") },
              { label: "隐私与安全", icon: Shield, action: () => onOpenDetail("security") },
              { label: "兴趣与话题", icon: Hash, action: () => onOpenDetail("interests") },
            ],
          },
          {
            title: "作品与创作", rows: [
              { label: "我的作品与草稿", icon: FileText, action: onOpenContent },
              { label: "本地草稿箱", value: "只保存在此设备", icon: Save, action: onOpenDrafts },
              { label: "创作者中心", icon: PenLine, action: onOpenCreator },
            ],
          },
          {
            title: "会员与认证", rows: [
              { label: "会员与成长", icon: Sparkles, action: () => onOpenDetail("membership") },
              { label: "兑换认证码", icon: BadgeCheck, action: () => onOpenDetail("certification") },
            ],
          },
        ],
      },
      {
        id: "support", title: "应用与支持", icon: Info, groups: [
          {
            rows: [
              { label: "缓存与存储", icon: Database, action: () => onOpenDetail("cache") },
              { label: "意见反馈", icon: MessageSquare, action: () => onOpenDetail("feedback") },
              { label: "关于黑卡", value: `版本 ${APP_VERSION}`, icon: Info, action: onOpenAbout },
            ],
          },
        ],
      },
    ];
    if (isStaff) list.push({
      id: "admin", title: "管理员专区", icon: ShieldCheck, groups: [
        {
          rows: [
            { label: "管理后台", icon: ShieldCheck, action: onOpenModeration },
            { label: "公告管理", icon: Megaphone, action: () => onOpenDetail("announcement") },
            { label: "反馈管理", icon: Inbox, action: onOpenFeedbackAdmin },
          ],
        },
      ],
    });
    return list;
  }, [theme, fontChoice, homeMode, discoverLayout, detailTransition, readingMode, profileLayout, messagesEnabled, isStaff, onOpenDetail, onOpenAbout, onOpenContent, onOpenCreator, onOpenFeedbackAdmin, onOpenModeration]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return centers.flatMap((item) => item.groups.flatMap((group) => group.rows.filter((row) => row.label.toLowerCase().includes(term)).map((row) => ({ ...row, center: item.title }))));
  }, [centers, query]);

  const active = centers.find((item) => item.id === center) || null;

  return <section className="page settings-page settings-home-page">
    <button className="back settings-back" type="button" onClick={center ? () => { setCenter(null); setQuery(""); requestAnimationFrame(() => window.scrollTo({ top: listScroll.current, behavior: "instant" })); } : onBack}><span aria-hidden="true">‹</span> {center ? "设置" : "我的"}</button>
    <div className="settings-page-heading"><h1>{active ? active.title : "设置"}</h1></div>

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
          return <button type="button" className="settings-center-card" key={item.id} onClick={() => { listScroll.current = window.scrollY; setCenter(item.id); }}>
            <span className="settings-center-icon" aria-hidden="true"><Icon size={19}/></span>
            <span className="settings-center-copy"><strong>{item.title}</strong></span>
            {item.id === "account" && <em className="settings-center-state">{accountId ? "已登录" : "未登录"}</em>}
            <ChevronRight size={17} aria-hidden="true"/>
          </button>;
        })}
      </div>}
    </>}

    {active && <div className="settings-center-groups">
      {active.groups.map((group, index) => (
        <section className="settings-group-block" key={group.title ?? index}>
          {group.title && <h2 className="settings-group-title">{group.title}</h2>}
          <div className="settings-list settings-group">
            {group.rows.map((row) => {
              const Icon = row.icon;
              return <button type="button" key={row.label} onClick={row.action}>
                <span className="settings-row-icon" aria-hidden="true"><Icon size={16}/></span>
                <span>{row.label}</span>{row.value && <small>{row.value}</small>}<ChevronRight size={16} aria-hidden="true"/>
              </button>;
            })}
          </div>
        </section>
      ))}
    </div>}

    {accountId && <p className="fineprint settings-local-note">外观和阅读偏好保存在此设备；部分账号偏好会同步至账号。</p>}
  </section>;
}

export default memo(SettingsHome);
