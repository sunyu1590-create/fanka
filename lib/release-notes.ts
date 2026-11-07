export type ReleaseCategory = "新功能" | "体验优化" | "问题修复";
export type ReleaseNote = { category: ReleaseCategory; text: string };
export type Release = { version: string; date?: string; notes: ReleaseNote[] };
import { HISTORICAL_RELEASES } from "./release-history";

// Historical entries are imported from the previous About page; new releases
// are added here so the UI and version metadata stay centralized.
export const RELEASES: Release[] = [
  {
    version: "2.38.5",
    date: "2026.11.07",
    notes: [
      { category: "问题修复", text: "修复社区作品云端草稿误将 UUID 当作草稿编号，导致加载本地草稿以及发布时报编号无效的问题。" },
      { category: "问题修复", text: "发布和草稿保存按数值内容编号更新，并限定在社区频道，避免与 AI 内容草稿互相覆盖。" },
    ],
  },
  {
    version: "2.38.4",
    date: "2026.11.07",
    notes: [
      { category: "体验优化", text: "翻卡彩蛋保留，彩带粒子由 112 调整为 96，降低网页端动画开销。" },
      { category: "体验优化", text: "详情页默认使用轻柔模糊上浮；未手动选择的旧默认迁移为新默认，其他显式偏好保留。" },
      { category: "体验优化", text: "默认底栏改为悬浮玻璃样式，同时保留用户明确选择的固定底栏。" },
      { category: "问题修复", text: "随应用提供 OPPO Sans 4.0 字体及版权许可说明，移除设置中字体文件缺失的提示。" },
    ],
  },
  {
    version: "2.38.3",
    date: "2026.11.07",
    notes: [
      { category: "问题修复", text: "注册确认、确认邮件重发和密码找回链接改用 HEIKA 自有域名 moonclean.shop 返回。" },
    ],
  },
  {
    version: "2.38.2",
    date: "2026.11.07",
    notes: [
      { category: "问题修复", text: "注册确认、确认邮件重发和密码找回链接固定返回 HEIKA 生产站点，避免手机打开 localhost 导致连接失败。" },
    ],
  },
  {
    version: "2.38.1",
    date: "2026.11.06",
    notes: [
      { category: "体验优化", text: "详情页评论改为头像、正文和点赞三列，统一作者信息、评论正文及时间回复操作的排版。" },
      { category: "体验优化", text: "二级回复采用扁平回复关系，默认收起多余内容，并保留点赞、回复、复制和权限操作。" },
      { category: "问题修复", text: "修复窄屏评论竖排、长昵称挤压、操作重叠及回复错位；评论菜单展开不再被滚动容器裁切。" },
      { category: "体验优化", text: "评论输入默认紧凑单行，编辑时展开；详情评分调整为一行并继续沿用原有评分同步。" },
    ],
  },
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
