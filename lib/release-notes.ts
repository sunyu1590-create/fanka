export type ReleaseCategory = "新功能" | "体验优化" | "问题修复";
export type ReleaseNote = { category: ReleaseCategory; text: string };
export type Release = { version: string; date?: string; notes: ReleaseNote[] };
import { HISTORICAL_RELEASES } from "./release-history";

// Historical entries are imported from the previous About page; new releases
// are added here so the UI and version metadata stay centralized.
export const RELEASES: Release[] = [
  {
    version: "2.38.0",
    notes: [
      { category: "新功能", text: "设置中心升级为五组紧凑设置，并加入独立的品牌介绍与意见反馈。" },
      { category: "体验优化", text: "通知偏好接入站内评论提醒；关于页面和 Service Worker 统一读取应用版本。" },
      { category: "问题修复", text: "修正尚未开放的提醒被显示为已启用，以及笔记隐私设置说明不准确的问题。" },
    ],
  },
  {
    version: "2.37.0",
    date: "2026.11.05",
    notes: [
      { category: "体验优化", text: "发现与搜索改用游标分页和按需字段，首屏优先传输适配显示尺寸的 WebP 缩略图。" },
      { category: "体验优化", text: "详情页先展示已加载的缩略图，再渐进替换为高清原图；重复打开时复用短期详情缓存。" },
      { category: "体验优化", text: "收件箱用一次聚合查询加载最近消息与未读数，避免逐会话重复请求。" },
      { category: "体验优化", text: "优化推荐的时效、已读过滤与主题多样性，并保留现有卡片、翻转和页面过渡动画。" },
      { category: "新功能", text: "AI 空间入口、AI 搜索与发布体验继续沿用上一版本改进。" },
    ],
  },
  ...HISTORICAL_RELEASES,
];
