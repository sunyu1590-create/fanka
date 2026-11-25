"use client";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import AppLoginGate from "./AppLoginGate";
import HomeBannerCarousel from "./HomeBannerCarousel";
import { flushSync } from "react-dom";
import {
  Home,
  Compass,
  UserRound,
  Bookmark,
  ArrowLeft,
  Search,
  Bell,
  Plus,
  Heart,
  Star,
  RefreshCw,
  ArrowUp,
  ArrowUpRight,
  Trash2,
  PenLine,
  ChevronDown,
  ChevronRight,
  Gift,
  X,
  Check,
  ArrowRight,
  MessageSquare,
  Share2,
  ThumbsDown,
  MoreHorizontal,
  Flag,
  Sparkles,
  Wand2,
  UsersRound,
  Crown,
  ShieldCheck,
  Settings,
  GitBranch,
  CalendarDays,
  History,
  ExternalLink,
  ImagePlus,
  LayoutGrid,
  List,
  Smartphone,
  Megaphone,
  ShoppingBag,
  FileText,
  ListTree,
} from "lucide-react";
import dynamic from "next/dynamic";
import AnnouncementAdmin from "./AnnouncementAdmin";
import ProgressiveImage from "./ProgressiveImage";
import PostAISummary from "./PostAISummary";
import ChoiceSelect from "./ChoiceSelect";
import { confirmInApp, promptInApp } from "@/lib/in-app-dialog";
const Messages = dynamic(() => import("./Messages"), {
  loading: () => <div className="empty">正在加载消息…</div>,
});
const AdminModeration = dynamic(() => import("./AdminModeration"), {
  loading: () => <div className="empty">正在加载审核队列…</div>,
});
import DiscoveryPostCard from "./DiscoveryPostCard";
import SharePanel, { type SharePayload } from "./SharePanel";
const EditorialArticle = dynamic(() => import("./EditorialArticle"));
import { MarkdownContent, markdownToText } from "./MarkdownContent";
import { ReaderTypeControls, useReaderTypePrefs } from "./ReaderTypeSettings";
import { AuthorFollowButton, CommentPanel, ReaderProgress, ReaderTocAside, ReaderTocSheet, useReaderShell } from "./ReaderPanels";
import RecoveryCodesPage from "./RecoveryCodesPage";
import SeriesChapterNav from "./SeriesChapterNav";
import RelatedContent from "./RelatedContent";
import PostReadTracker from "./PostReadTracker";
import InvitationWelcomePage, { type InvitationWelcome } from "./InvitationWelcomePage";
import { FollowedTopicsSettings, TopicFollowButton, PostPoll, PrivateHighlights, RecommendationControls } from "./InteractiveDiscovery";
const AccountProfile = dynamic(() => import("./AccountProfile"), { loading: () => <div className="empty">正在加载…</div> });
import type { ProfileDetails } from "./AccountProfile";
const PublicProfile = dynamic(() => import("./PublicProfile"), { loading: () => <div className="empty">正在加载…</div> });
const MessagingPreferences = dynamic(() => import("./MessagingPreferences"), { loading: () => <div className="empty">正在加载…</div> });
const InboxBadge = dynamic(() => import("./InboxBadge"));
const DailyMissions = dynamic(() => import("./DailyMissions"), { loading: () => <div className="daily-missions-loading" aria-hidden="true" /> });
const NotificationCenter = dynamic(() => import("./NotificationCenter"), { loading: () => <div className="empty">正在加载…</div> });
const CoExplore = dynamic(() => import("./CoExplore"), { loading: () => <div className="empty">正在加载…</div> });
const SharedCollection = dynamic(() => import("./SharedCollection"), { loading: () => <div className="empty">正在加载…</div> });
const CardChainPanel = dynamic(() => import("./ExplorationFeatures").then((module) => module.CardChainPanel));
const ExplorationRecap = dynamic(() => import("./ExplorationFeatures").then((module) => module.ExplorationRecap));
import type { User } from "@supabase/supabase-js";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import { browserDb, browserDbConfig } from "@/lib/browser-db";
import { ComposerSheet, ComposerTextEditor, ComposerMediaStrip, ComposerAttachments } from "./ComposerPanels";
import { MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES, readAttachments, type PostAttachment } from "@/lib/attachments";
import { clearDraftFiles, loadDraftFiles, saveDraftFiles } from "@/lib/draft-files";
import { applyThemeMode } from "@/lib/theme";
import { validateComposerFiles } from "@/lib/composer-validation";
import { AI_CONTENT_TYPE_LABELS, describeRoute, routeByRules, type ComposerRoute } from "@/lib/composer-routing";
import { compressUploadImage } from "@/lib/image-compression";
import type { TopicSummary } from "@/lib/topics";
import { tags, dayKey, coverColor, type Post } from "@/lib/content";
import { dailyCandidates, openDailyCard } from "@/lib/daily";
import { rankRecommendations, type CommunityRating } from "@/lib/recommendations";
import { cardRarity, cardRarityLabel, cardRarityTier, EXPERIENCE_LEVELS, experienceProgress, type CardRarityTier } from "@/lib/progression";
import { REPORT_REASONS } from "@/lib/report-validation";
import { feedImageSource } from "@/lib/feed-images";
import { userMessage } from "@/lib/user-message";
import { mediaBucketForPath, isVideoMediaPath } from "@/lib/media-path";
import { mapWithConcurrency } from "@/lib/media-upload";
import { uploadManager } from "@/lib/upload-manager";
import { publishTaskManager, PUBLISH_SETTLED, type PublishTask } from "@/lib/publish-task-manager";
import { PublishFloatingWindow } from "./PublishFloatingWindow";
import NoticeBanner, { type NoticeBannerItem, type NoticeKind, type NoticeOptions } from "./NoticeBanner";
import SettingsHome, { type SettingsDetail } from "./SettingsHome";
import DecorCenter from "./DecorCenter";
import DraftBox from "./DraftBox";
import ProfileHeader from "./ProfileHeader";
import type { CoverMeta } from "./CoverEditor";
import { applyDecorToDocument, installDecorThemeSync, loadDecor, resetDecor, useDecor } from "@/lib/decor/store";
import type { DecorIcon } from "@/lib/decor/types";
import { countDrafts, getDraft, getDraftFile, migrateLegacyDrafts, saveDraft, deleteDraft, type LocalDraft } from "@/lib/local-drafts";
import AccountSwitcher from "./AccountSwitcher";
import ProfileBadgeList, { ProfileBadgeMarks, type ProfileBadge } from "./ProfileBadgeList";
import CardBackFace, { type CardContentState } from "./CardFace";
import { normalizeCachedPost, normalizeRevealedSnapshots, stableCardMediaUrl } from "@/lib/card-media";
import { cacheCoverFromUrl, clearCoverCache, coverCacheObjectUrl, readCoverCache, type CoverCacheRecord } from "@/lib/cover-cache";
import { rememberSession } from "@/lib/saved-accounts";
import MembershipCenter from "./MembershipCenter";
import CertificationSettings from "./CertificationSettings";
import { baseDailyFlipAllowance } from "@/lib/membership-plans";
const AboutHeika = dynamic(() => import("./AboutHeika"));
const CacheManager = dynamic(() => import("./CacheManager"));
const FeedbackForm = dynamic(() => import("./FeedbackForm"));
const FeedbackAdmin = dynamic(() => import("./FeedbackAdmin"));
const NotificationSettings = dynamic(() => import("./NotificationSettings"));
import SearchPage from "./SearchPage";
const AISpace = dynamic(() => import("./AISpace"), { loading: () => <div className="empty">正在加载 AI 空间…</div> });
const SeriesChannel = dynamic(() => import("./SeriesChannel"), { loading: () => <div className="empty">正在加载合集…</div> });
const CollectionView = dynamic(() => import("./CollectionView"), { loading: () => <div className="empty">正在加载合集…</div> });
const AIResourceDetails = dynamic(() => import("./AIResourceDetails"));
const DetailAside = dynamic(() => import("./DetailAside"), { ssr: false });
const PostAttachmentsPanel = dynamic(() => import("./PostAttachmentsPanel"));
const AppealCenter = dynamic(() => import("./AppealCenter"));
import type { AiContentType } from "@/lib/ai-resources";

async function fetchDailyCardIds() {
  try {
    const primary = await cloudFetch("/api/v1/deck/candidates", { cache: "no-store" });
    const primaryResult = await primary.json();
    const primaryIds = Array.isArray(primaryResult.data)
      ? primaryResult.data.map((item: { id: number | string }) => Number(item.id)).filter((id: number) => Number.isSafeInteger(id) && id > 0)
      : [];
    if (primary.ok && primaryIds.length) return primaryIds as number[];
  } catch {}

  // Keep the existing community deck usable if the mixed endpoint is unavailable
  // during rollout or the AI candidate pool has not been populated yet.
  const fallback = await cloudFetch("/api/demo/cards", { cache: "no-store" });
  const fallbackResult = await fallback.json();
  const fallbackIds = Array.isArray(fallbackResult.data)
    ? fallbackResult.data.map((item: { id: number | string }) => Number(item.id)).filter((id: number) => Number.isSafeInteger(id) && id > 0)
    : [];
  if (!fallback.ok) throw new Error("内容加载失败，请重试");
  return fallbackIds as number[];
}

function postShareUrl(post: Post) {
  const origin = typeof location === "undefined" ? "https://moonclean.shop" : location.origin;
  // 社区作品用独立详情地址，复制出去的链接刷新后仍是同一篇内容。
  return post.channel === "ai" && post.cloudId
    ? `${origin}/?aiPost=${post.id}&cloudId=${encodeURIComponent(post.cloudId)}`
    : `${origin}/p/${post.id}`;
}

const FLIP_RAIN_PARTICLES = 96;
const FLIP_RAIN_DURATION_MIN_MS = 2900;
const FLIP_RAIN_DURATION_SPREAD_MS = 900;
const FLIP_RAIN_LEAD_MS = 240;
const FLIP_RAIN_STAGGER_WINDOW_MS = 900;
const FLIP_RAIN_JITTER_MS = 90;
const FLIP_RAIN_CLEANUP_MS = FLIP_RAIN_LEAD_MS + FLIP_RAIN_STAGGER_WINDOW_MS + FLIP_RAIN_JITTER_MS + FLIP_RAIN_DURATION_MIN_MS + FLIP_RAIN_DURATION_SPREAD_MS + 180;
const RATING_COLORS = ["#ff5d78", "#ff9452", "#edbd36", "#65b95e", "#34aeb5"];
type PublicExplorationAd = { enabled: boolean; kind: "text" | "image"; title: string; body: string; image_url: string | null; post_id: string; post_client_id: number | null };
function discoverCoverRatio(postId: number) {
  const shape = Math.abs(postId) % 8;
  if (shape === 0) return "1 / 1.45";
  if (shape === 1 || shape === 2) return "1 / 1.18";
  return "4 / 5";
}

type Comment = {
  id: number;
  cloudId?: string;
  authorId?: string;
  name?: string;
  avatar?: string;
  post: number;
  body: string;
  parent?: number;
  replyToName?: string;
  time: number;
  likes: number;
  liked?: boolean;
};
type ComposerImage = {
  id: string;
  file?: File;
  path?: string;
  url: string;
  status: "ready" | "uploading" | "failed";
  sortOrder?: number;
  external?: boolean;
  /** 真实上传进度：按已发送字节计算，服务端处理阶段为 processing。 */
  progress?: number;
  uploadPhase?: "uploading" | "processing";
};
type PageTransitionHandle = { finished: Promise<unknown> };
type TopicPageResponse = { topic: TopicSummary; items: Post[]; total: number; page: number; limit: number };
type ExperienceSummary = { total: number; membershipTier: "free" | "plus" | "pro"; events: { type: "flip" | "rating" | "mission" | "daily_mission"; points: number; createdAt: string }[]; claimedLevels: number[] };
type BookmarkCollection = { id: string; name: string; created_at?: string; role?: "owner" | "collaborator"; is_public?: boolean; allow_collaboration?: boolean; share_code?: string | null; user_id?: string };
type PostSeries = { id: string; title: string; description: string; created_at?: string; postCount?: number };
type TopicEvent = { id: string; title: string; description: string; topic: string; ends_at: string; postCount: number; participantCount: number; joined: boolean };
type CreatorMission = { key: "explore_days" | "publish_post" | "curate_posts"; title: string; description: string; progress: number; target: number; claimed: boolean; points: number };
type CreatorCenter = { insights: { posts: number; views: number; likes: number; saves: number; comments: number; topPosts: { id: number; title: string; views: number; likes: number; saves: number; comments: number }[] }; weekStart: string; missions: CreatorMission[] };
type SearchPerson = { id: string; nickname: string; bio: string | null; avatar_url: string | null };
function relativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 45) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" });
}
type State = {
  avatar?: string;
  liked?: number[];
  dismissed?: number[];
  homeMode: "waterfall" | "blackcard";
  discoverLayout: "waterfall" | "single";
  dailyCount: number;
  luckyBonus: Record<string, number>;
  interests: string[];
  onboardingDone?: boolean;
  cardIds: number[];
  revealed: Record<number, Post>;
  rarityTiers: Record<number, CardRarityTier>;
  notifications: { messages: boolean; comments: boolean; daily: boolean };
  readingMode: "standard" | "focus" | "night";
  savedFrom: Record<number, "today" | "discover">;
  opened: Record<string, number[]>;
  swaps: Record<string, number>;
  deck: Record<string, number[]>;
  saved: number[];
  ratings: Record<number, number>;
  facetSlots: Record<number, number>;
  comments: Comment[];
  own: Post[];
  name: string;
  bio: string;
  profileDetails: ProfileDetails;
  cover?: string;
  coverMeta?: CoverMeta;
  viewed: number[];
};
const initial: State = {
  homeMode: "waterfall",
  discoverLayout: "waterfall",
  dailyCount: 5,
  luckyBonus: {},
  interests: [],
  onboardingDone: false,
  cardIds: [],
  revealed: {},
  rarityTiers: {},
  notifications: { messages: false, comments: false, daily: false },
  readingMode: "standard",
  savedFrom: {},
  opened: {},
  swaps: {},
  deck: {},
  saved: [],
  ratings: {},
  facetSlots: {},
  comments: [],
  own: [],
  name: "探索者",
  bio: "收藏那些值得再读的瞬间",
  profileDetails: {
    gender: "", mbti: "", birthday: "", hobbies: [],
    visibility: { gender: false, mbti: false, birthday: false, hobbies: false },
  },
  viewed: [],
};
function hydrateProfileDetails(rows: Array<{ attribute: string; value: string; is_public: boolean }> = []): ProfileDetails {
  const details: ProfileDetails = {
    gender: "", mbti: "", birthday: "", hobbies: [],
    visibility: { gender: false, mbti: false, birthday: false, hobbies: false },
  };
  for (const row of rows) {
    if (!(row.attribute in details.visibility)) continue;
    const attribute = row.attribute as keyof ProfileDetails["visibility"];
    details.visibility[attribute] = row.is_public;
    if (attribute === "hobbies") {
      try { details.hobbies = row.value ? JSON.parse(row.value) as string[] : []; }
      catch { details.hobbies = row.value ? row.value.split(", ").filter(Boolean) : []; }
    }
    else details[attribute] = row.value;
  }
  return details;
}

function drawLuckyBonus() {
  const roll = Math.random();
  if (roll < 0.001) return 10;
  if (roll < 0.016) return 5;
  if (roll < 0.066) return 3;
  if (roll < 0.166) return 2;
  return 0;
}
/** APP 内嵌模式：原生容器带 app=1 打开，网页只渲染业务内容。 */
function isAppEmbed() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("app") === "1";
}

const nav = [
  ["today", "首页", Home],
  ["discover", "发现", Compass],
  ["messages", "消息", MessageSquare],
  ["mine", "我的", UserRound],
] as const;
/**
 * 底栏自定义图标。
 *
 * 之前直接把 <img src> 在 normal / active 之间切换：只要 active 图缺失、404
 * 或加载失败，点击后图标就整块消失（normal 已缓存所以未点击时看起来正常）。
 * 现在预加载两张图，失败即回退 normal，再失败退回内置线性图标，任何情况都有图标。
 */
function BottomNavDecorIcon({ icon, active, fallback: Fallback }: { icon?: DecorIcon; active: boolean; fallback: (typeof nav)[number][2] }) {
  const normal = icon?.normal;
  const activeSrc = icon?.active;
  const [failed, setFailed] = useState<Record<string, true>>({});
  const srcs = useMemo(() => [normal, activeSrc].filter((src): src is string => Boolean(src)), [normal, activeSrc]);
  const srcKey = srcs.join("|");
  useEffect(() => {
    let cancelled = false;
    const probes = srcs.map((src) => {
      const probe = new Image();
      probe.onerror = () => {
        if (!cancelled) setFailed((prev) => (prev[src] ? prev : { ...prev, [src]: true }));
      };
      probe.src = src;
      return probe;
    });
    return () => {
      cancelled = true;
      probes.forEach((probe) => { probe.onerror = null; });
    };
  }, [srcKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const preferred = active ? activeSrc || normal : normal;
  const src = preferred && !failed[preferred] ? preferred : undefined;
  if (!src) return <Fallback size={21} strokeWidth={1.8} />;
  const size = 21 * (icon?.scale || 1);
  if (icon?.tint) {
    return <span className={`decor-nav-icon is-mask${icon.fit === "cover" ? " is-cover" : ""}`} aria-hidden="true" style={{ width: size, height: size, WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }} />;
  }
  return <img className={`decor-nav-icon${icon?.fit === "cover" ? " is-cover" : ""}`} src={src} alt="" aria-hidden="true" style={{ width: size, height: size }} onError={() => setFailed((prev) => (prev[src] ? prev : { ...prev, [src]: true }))} />;
}

const topicOptions = [
  {
    tag: "生活",
    title: "生活灵感",
    description: "在日常里发现新的感觉",
    image:
      "https://images.unsplash.com/photo-1449247709967-d4461a6a6103?auto=format&fit=crop&w=1000&q=85",
  },
  {
    tag: "摄影",
    title: "影像记录",
    description: "记录世界，也记录情绪",
    image:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=85",
  },
  {
    tag: "设计",
    title: "视觉设计",
    description: "看见形式背后的表达",
    image:
      "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1000&q=85",
  },
  {
    tag: "科技",
    title: "前沿科技",
    description: "去看见正在发生的未来",
    image:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1000&q=85",
  },
  {
    tag: "游戏",
    title: "游戏世界",
    description: "不只是玩，更是另一种体验",
    image:
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1000&q=85",
  },
  {
    tag: "情感",
    title: "情绪关系",
    description: "关于关系、心动与孤独",
    image:
      "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1000&q=85",
  },
  {
    tag: "知识",
    title: "有趣知识",
    description: "有趣、好懂、值得分享",
    image:
      "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1000&q=85",
  },
  {
    tag: "艺术",
    title: "艺术观察",
    description: "换一种方式理解世界",
    image:
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=1000&q=85",
  },
];
const blackCardFacetRows = [
  [[0, 0], [35, 0], [72, 0], [100, 0]],
  [[0, 29], [30, 35], [74, 27], [100, 33]],
  [[0, 63], [33, 58], [68, 66], [100, 60]],
  [[0, 94], [29, 89], [73, 97], [100, 91]],
  [[0, 125], [36, 120], [69, 125], [100, 125]],
] as const;
const blackCardFacets = blackCardFacetRows.slice(0, -1).flatMap((top, row) =>
  top.slice(0, -1).flatMap((a, column) => {
    const b = top[column + 1];
    const c = blackCardFacetRows[row + 1][column + 1];
    const d = blackCardFacetRows[row + 1][column];
    const pieces = (row + column) % 2 === 0
      ? [[a, b, c], [a, c, d]]
      : [[a, b, d], [b, c, d]];
    return pieces.map((piece) => piece.map(([x, y]) => `${x},${y}`).join(" "));
  }),
);
export default function Community({
  initialPostId,
  detailPath,
}: {
  /** /p/<id> 直达时带进来的作品编号 */
  initialPostId?: number;
  /** 地址里的原始片段，用于把无效地址也留在原页面提示 */
  detailPath?: string;
} = {}) {
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [themeReady, setThemeReady] = useState(false);
  // 桌面（≥1024）用独立详情页；窄屏与 APP 内嵌继续用原有详情浮层。
  const [desktopLayout, setDesktopLayout] = useState(false);
  // APP 内嵌时容器自带导航，网页详情保持浮层，不改成独立页面。
  const [appEmbed, setAppEmbed] = useState(false);
  useEffect(() => {
    const query = matchMedia("(min-width: 1024px)");
    const sync = () => setDesktopLayout(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const [discoverSettingsOpen, setDiscoverSettingsOpen] = useState(false);
  const [discoverNavCollapsed, setDiscoverNavCollapsed] = useState(false);
  const [mineCollections, setMineCollections] = useState<{ id: string; title: string; kind: string; publishedCount?: number }[]>([]);
  const [discoverSearchOpen, setDiscoverSearchOpen] = useState(false);
  const [detailTransition, setDetailTransition] = useState<"image-zoom" | "blur-rise" | "ghost-handoff">("blur-rise");
  const [detailTransitionLoaded, setDetailTransitionLoaded] = useState(false);
  const [profileLayout, setProfileLayout] = useState<"masonry" | "list">("masonry");
  const [profileLayoutLoaded, setProfileLayoutLoaded] = useState(false);
  const [fontChoice, setFontChoice] = useState<"oppo" | "system">("oppo");
  const [fontReady, setFontReady] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("heika-theme");
    if (saved === "dark" || saved === "light" || saved === "system") setTheme(saved);
    setThemeReady(true);
    const savedFont = localStorage.getItem("heika-font");
    if (savedFont === "oppo" || savedFont === "system") setFontChoice(savedFont);
    setFontReady(true);
    // 旧用户配置统一迁移到悬浮模式，清除历史标记（需求十：固定/悬浮选择项已删除）。
    localStorage.setItem("heika-bottom-nav-style", "glass");
    localStorage.removeItem("heika-bottom-nav-style-explicit");
    const savedDetailTransition = localStorage.getItem("heika-detail-transition");
    if (savedDetailTransition === "image-zoom" || savedDetailTransition === "blur-rise" || savedDetailTransition === "ghost-handoff") {
      const explicitlyChosen = localStorage.getItem("heika-detail-transition-explicit") === "1";
      const nextTransition = savedDetailTransition === "image-zoom" && !explicitlyChosen ? "blur-rise" : savedDetailTransition;
      setDetailTransition(nextTransition);
      if (nextTransition !== savedDetailTransition) localStorage.setItem("heika-detail-transition", nextTransition);
    }
    setDetailTransitionLoaded(true);
    const savedProfileLayout = localStorage.getItem("heika-public-profile-layout");
    if (savedProfileLayout === "masonry" || savedProfileLayout === "list")
      setProfileLayout(savedProfileLayout);
    setProfileLayoutLoaded(true);
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    // 统一入口：解析 system、写 data-theme / theme-color、开 260ms 颜色过渡窗口。
    applyThemeMode(theme);
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => applyThemeMode(theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, themeReady]);
  useEffect(() => {
    if (!fontReady) return;
    document.documentElement.dataset.font = fontChoice;
    localStorage.setItem("heika-font", fontChoice);
  }, [fontChoice, fontReady]);
  useEffect(() => {
    if (!detailTransitionLoaded) return;
    localStorage.setItem("heika-detail-transition", detailTransition);
  }, [detailTransition, detailTransitionLoaded]);
  useEffect(() => {
    if (!profileLayoutLoaded) return;
    localStorage.setItem("heika-public-profile-layout", profileLayout);
  }, [profileLayout, profileLayoutLoaded]);
  const flipBusy = useRef(false),
    transitionBusy = useRef(false),
    pageTransition = useRef<PageTransitionHandle | null>(null),
    pageTransitionQueue = useRef<Array<() => void>>([]),
    fallbackPageTimer = useRef<number | null>(null),
    viewerStageRef = useRef<HTMLDivElement | null>(null),
    loadMoreRef = useRef<HTMLDivElement | null>(null),
    scrollPositions = useRef<Record<string, number>>({});
  const discoverScrollPositions = useRef<Record<"community" | "ai" | "series" | "mall", number>>({ community: 0, ai: 0, series: 0, mall: 0 });
  const discoverChannelBusy = useRef(false);
  const queuedDiscoverChannel = useRef<"community" | "ai" | "series" | "mall" | null>(null);
  const discoverChannelTimer = useRef<number | null>(null);
  const switchDiscoverChannelRef = useRef<(next: "community" | "ai" | "series" | "mall") => void>(() => {});
  const sharedPostHandled = useRef<string | null>(null);
  const sharedProfileHandled = useRef<string | null>(null);
  const searchCursorRef = useRef<string | null>(null);
  const [authorProfile, setAuthorProfile] = useState<string | null>(null);
  const [publicBookmarks, setPublicBookmarks] = useState(false);
  const [publicBookmarksLoaded, setPublicBookmarksLoaded] = useState(false);
  const [bookmarkVisibilityBusy, setBookmarkVisibilityBusy] = useState(false);
  const [messagePeer, setMessagePeer] = useState<string | null>(null);
  const [chatConversationOpen, setChatConversationOpen] = useState(false);
  const [storageKey, setStorageKey] = useState("heika-demo-v1");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ownBadges, setOwnBadges] = useState<ProfileBadge[]>([]);
  const [accountTimezone, setAccountTimezone] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!accountId) { setOwnBadges([]); return () => { alive = false; }; }
    void cloudRequest("/api/v1/me/access-codes").then((result) => {
      if (alive) setOwnBadges(((result as { badges?: ProfileBadge[] } | null)?.badges || []));
    }).catch(() => { if (alive) setOwnBadges([]); });
    return () => { alive = false; };
  }, [accountId]);
  const [isStaff, setIsStaff] = useState(false);
  /** 服务端 24 小时周期的到期时间戳；用于展示剩余时间，额度判定仍以后端为准。 */
  const [cycleExpiry, setCycleExpiry] = useState<number | null>(null);
  /** 服务端周期开始时间：卡池按周期分组，跨自然日不会换池。 */
  const [cycleStart, setCycleStart] = useState<number | null>(null);
  const [, setCycleTick] = useState(0);
  useEffect(() => {
    if (!cycleExpiry) return;
    const timer = window.setInterval(() => setCycleTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [cycleExpiry]);
  /** 倒计时文案；到期后后端会在下次请求时开启新周期。 */
  const cycleLabel = (() => {
    if (!cycleExpiry) return "";
    const left = cycleExpiry - Date.now();
    if (left <= 0) return "新周期即将开始";
    const hours = Math.floor(left / 3_600_000);
    const minutes = Math.floor((left % 3_600_000) / 60_000);
    return hours > 0 ? `${hours} 小时 ${minutes} 分后刷新` : `${minutes} 分钟后刷新`;
  })();
  const [adminRole, setAdminRole] = useState<"member" | "admin" | "content_manager" | "reviewer">("member");
  const adminEntryPending = useRef(false);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const cloudHydrated = useRef(false);
  // 封面双保险：coverBlobUrlRef 是本地缓存生成的 blob 地址（跨会话失效，绝不能写进 localStorage）；
  // coverRemoteRef 是最近一次确认的云端地址，用于持久化与兜底。
  const coverBlobUrlRef = useRef<string | null>(null);
  const coverRemoteRef = useRef<string | undefined>(undefined);
  const pullStart = useRef<number | null>(null);
  const [facetIndex, setFacetIndex] = useState(0);
  const [communityRatings, setCommunityRatings] = useState<Record<number, CommunityRating>>({});
  const [experienceSummary, setExperienceSummary] = useState<ExperienceSummary>({ total: 0, membershipTier: "free", events: [], claimedLevels: [] });
  const [bookmarkCollections, setBookmarkCollections] = useState<BookmarkCollection[]>([]);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Post[]>([]);
  const [bookmarkCollectionContents, setBookmarkCollectionContents] = useState<Record<string, Post[]>>({});
  const [bookmarkMembership, setBookmarkMembership] = useState<Record<string, string | null>>({});
  const [favoriteCollection, setFavoriteCollection] = useState("all");
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [editingCollection, setEditingCollection] = useState<string | null>(null);
  const [editingCollectionName, setEditingCollectionName] = useState("");
  const [collectionInviteCode, setCollectionInviteCode] = useState("");
  const [creatorCenter, setCreatorCenter] = useState<CreatorCenter | null>(null);
  const [creatorSeries, setCreatorSeries] = useState<PostSeries[]>([]);
  const [seriesName, setSeriesName] = useState("");
  const [seriesDescription, setSeriesDescription] = useState("");
  const [seriesKind, setSeriesKind] = useState("serial");
  const [seriesStatus, setSeriesStatus] = useState("ongoing");
  const [seriesCover, setSeriesCover] = useState("");
  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [topicEvents, setTopicEvents] = useState<TopicEvent[]>([]);
  const [explorationAd, setExplorationAd] = useState<PublicExplorationAd | null>(null);
  const [appDownloadUrl, setAppDownloadUrl] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<{ title: string; body: string; version: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/v1/announcement", { cache: "no-store" });
        const payload = await response.json();
        const data = payload?.data;
        if (!data || typeof data.version !== "number") return;
        let seen: string | null = null;
        try { seen = localStorage.getItem("heika-announcement-version"); } catch { /* 隐私模式下忽略 */ }
        if (String(data.version) === seen) return;
        if (!cancelled) setAnnouncement({ title: String(data.title || "黑卡公告"), body: String(data.body || ""), version: data.version });
      } catch { /* 公告拉取失败不影响主流程 */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const dismissAnnouncement = () => {
    if (announcement) {
      try { localStorage.setItem("heika-announcement-version", String(announcement.version)); } catch { /* 忽略 */ }
    }
    setAnnouncement(null);
  };
  const explorationAdLoadedAt = useRef(0);
  const [settingsPersonalOpen, setSettingsPersonalOpen] = useState(false);
  const [recentPreview, setRecentPreview] = useState<{ post: Post; source: "today" | "discover" } | null>(null);
  const [creatorCenterLoading, setCreatorCenterLoading] = useState(false);
  const [rewardClaimBusyLevel, setRewardClaimBusyLevel] = useState<number | null>(null);
  const [detailImageTransition, setDetailImageTransition] = useState<{
    rect: DOMRect;
    src: string;
    sourceImage: HTMLImageElement;
  } | null>(null);
  const [luckyReward, setLuckyReward] = useState<{ postId: number; amount: number } | null>(null);
  const [ratingPulse, setRatingPulse] = useState<{ postId: number; score: number } | null>(null);
  const luckyRewardTimer = useRef<number | null>(null);
  const rarityRevealTimer = useRef<number | null>(null);
  const flipRainTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const noticeExitTimer = useRef<number | null>(null);
  const noticeRef = useRef<NoticeBannerItem | null>(null);
  const noticeQueue = useRef<NoticeBannerItem[]>([]);
  const noticeSequence = useRef(0);
  const noticeLeavingRef = useRef(false);
  const dismissNoticeRef = useRef<() => void>(() => {});
  const [flipRainId, setFlipRainId] = useState<number | null>(null);
  const [dayTick, setDayTick] = useState(0),
    [viewerId, setViewerId] = useState<number | null>(null),
    [viewerRect, setViewerRect] = useState<DOMRect | null>(null),
    [viewerPhase, setViewerPhase] = useState<"opening" | "closing" | null>(
      null,
    ),
    [viewerFlipped, setViewerFlipped] = useState(false),
    [viewerRevealPhase, setViewerRevealPhase] = useState<"rarity" | "content" | null>(null),
    [flippingId, setFlippingId] = useState<number | null>(null),
    [flipError, setFlipError] = useState<string | null>(null),
    [publicFeed, setPublicFeed] = useState<Post[]>([]),
    [feedPostIds, setFeedPostIds] = useState<number[]>([]),
    [feedError, setFeedError] = useState(""),
    [feedPage, setFeedPage] = useState(0),
    [feedTotal, setFeedTotal] = useState(0),
    [feedHasMore, setFeedHasMore] = useState(false),
    [feedLoading, setFeedLoading] = useState(false),
    [feedLoadedTag, setFeedLoadedTag] = useState<string | null>(null),
    publicFeedLoading = useRef(false),
    feedController = useRef<AbortController | null>(null),
    feedCursor = useRef<{ createdAt: string; postId: string } | null>(null),
    loadedRatingIds = useRef(new Set<number>()),
    detailPostCache = useRef(new Map<number, { post: Post; at: number }>()),
    detailSource = useRef<"today" | "discover">("today");
  const [feedLoadedSort, setFeedLoadedSort] = useState<string | null>(null);
  const [discoverColumnCount, setDiscoverColumnCount] = useState(2);
  const [favoriteSource, setFavoriteSource] = useState("全部"),
    [mineSection, setMineSection] = useState<"works" | "favorites" | "liked" | "collections">("works"),
    [settingsDetail, setSettingsDetailState] = useState<SettingsDetail | "feedbackAdmin" | null>(null),
    [settingsReturnTab, setSettingsReturnTab] = useState<"settings" | "mine">("settings"),
    [debugReturnTab, setDebugReturnTab] = useState<"settings" | "mine">("settings"),
    [selectedCalendarDate, setSelectedCalendarDate] = useState(""),
    [readingTransition, setReadingTransition] = useState<"out" | "in" | null>(
      null,
    ),
    [notificationPermission, setNotificationPermission] = useState<
      "default" | "granted" | "denied" | "unsupported"
    >("default");
  const [recentExperienceOpen, setRecentExperienceOpen] = useState(false);
  const [explorationHistoryOpen, setExplorationHistoryOpen] = useState(false);
  // 历史按天分页：先展示最近 5 天，避免一次性渲染全部记录。
  const [explorationHistoryLimit, setExplorationHistoryLimit] = useState(5);
  // 探索档案的服务端口径：本地 opened 只覆盖这台设备，换设备会全部归零。
  const [explorationServer, setExplorationServer] = useState<null | {
    lifetimeTotal: number;
    streak: number;
    windowDays: { date: string; count: number }[];
    records: { date: string; post: Post }[];
    recentRecords: { date: string; post: Post }[];
  }>(null);
  const [explorationServerLoading, setExplorationServerLoading] = useState(false);
  const [myContentReturnTab, setMyContentReturnTab] = useState<"mine" | "settings">("mine");
  const readingTimer = useRef<number[]>([]),
    scrollBeforeDetail = useRef(0),
    // 直达 /p/<id> 打开时没有自己的历史条目，关闭要走 replaceState 而不是 back()。
    detailNoHistory = useRef(false),
    ratingPulseTimer = useRef<number | null>(null);
  const ratingBusy = useRef(false);
  const [state, setState] = useState<State>(initial),
    [ready, setReady] = useState(false),
    [tab, setTabState] = useState("today"),
    [collectionId, setCollectionId] = useState<string | null>(null),
    [collectionReturnTab, setCollectionReturnTab] = useState("discover"),
    [detail, setDetail] = useState<number | null>(null),
    [detailPostOverride, setDetailPostOverride] = useState<Post | null>(null),
    [detailReady, setDetailReady] = useState(false),
    // 直达链接的状态：加载中 / 内容不可用 / 请求失败，三种都要有明确出口。
    [detailRouteState, setDetailRouteState] = useState<"loading" | "missing" | "error" | null>(
      initialPostId ? "loading" : detailPath ? "missing" : null,
    ),
    [transitionPhase, setTransitionPhase] = useState<
      "opening" | "closing" | null
    >(null),
    [justFlippedId, setJustFlippedId] = useState<number | null>(null),
    [category, setCategory] = useState("全部"),
    [discoverChannel, setDiscoverChannel] = useState<"community" | "ai" | "series" | "mall">("community"),
    [outgoingDiscoverChannel, setOutgoingDiscoverChannel] = useState<"community" | "ai" | "series" | "mall" | null>(null),
    [discoverChannelPhase, setDiscoverChannelPhase] = useState<"primed" | "running" | null>(null),
    [searchDraft, setSearchDraft] = useState(""),
    [searchTerm, setSearchTerm] = useState(""),
    [searchKind, setSearchKind] = useState<"content" | "people" | "collections">("content"),
    [searchCollections, setSearchCollections] = useState<Array<{ id: string; title: string; description: string; cover_url: string | null; kind: string; channel: string; updated_at: string }>>([]),
    [searchPeople, setSearchPeople] = useState<SearchPerson[]>([]),
    [searchPosts, setSearchPosts] = useState<Post[]>([]),
    [searchTotal, setSearchTotal] = useState(0),
    [searchHasMore, setSearchHasMore] = useState(false),
    [searchPage, setSearchPage] = useState(1),
    [searchLoading, setSearchLoading] = useState(false),
    [searchError, setSearchError] = useState(""),
    [searchRetry, setSearchRetry] = useState(0),
    [searchRecent, setSearchRecent] = useState<string[]>([]),
    [searchReturnTab, setSearchReturnTab] = useState("discover"),
    [desktopSearch, setDesktopSearch] = useState(""),
    [desktopMenuOpen, setDesktopMenuOpen] = useState(false),
    [page, setPage] = useState(12),
    [sort, setSort] = useState("精选"),
    [draft, setDraft] = useState(""),
    [reply, setReply] = useState<number | undefined>(),
    [modal, setModalState] = useState<
      | "write"
      | "profile"
      | "interests"
      | "notifications"
      | "reading"
      | "browsing"
      | "report"
      | null
    >(null),
    [pendingRecoveryCodes, setPendingRecoveryCodes] = useState<string[]>([]),
    [pendingInvitation, setPendingInvitation] = useState<InvitationWelcome | null>(null),
    [composerPanel, setComposerPanel] = useState<"topics" | "settings" | "preview" | null>(null),
    [composerMediaId, setComposerMediaId] = useState<string | null>(null),
    [draftSyncError, setDraftSyncError] = useState(""),
    [composerMediaLoadFailed,setComposerMediaLoadFailed] = useState(false),
    [draftRetry, setDraftRetry] = useState(0),
    [draftCloudSynced, setDraftCloudSynced] = useState(false),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [pollQuestion, setPollQuestion] = useState(""),
    [pollOptions, setPollOptions] = useState(["", ""]),
    [aiWorkbenchOpen, setAiWorkbenchOpen] = useState(false),
    [aiWorkbenchMode, setAiWorkbenchMode] = useState<"title" | "outline" | "polish" | "continue" | "markdown" | "topics">("outline"),
    [aiWorkbenchPrompt, setAiWorkbenchPrompt] = useState(""),
    [aiWorkbenchMessages, setAiWorkbenchMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]),
    [aiWorkbenchOutput, setAiWorkbenchOutput] = useState(""),
    [aiWorkbenchBusy, setAiWorkbenchBusy] = useState(false),
    [aiPreviousBody, setAiPreviousBody] = useState<string | null>(null),
    [aiPreviousTitle, setAiPreviousTitle] = useState<string | null>(null),
    [aiPreviousTopics, setAiPreviousTopics] = useState<string[] | null>(null),
    [aiResultApplied, setAiResultApplied] = useState(false),
    [markdownOptimizeOpen, setMarkdownOptimizeOpen] = useState(false),
    [markdownOptimizeBusy, setMarkdownOptimizeBusy] = useState(false),
    [markdownOptimizeOutput, setMarkdownOptimizeOutput] = useState(""),
    [markdownOptimizeError, setMarkdownOptimizeError] = useState(""),
    [markdownPreviousBody, setMarkdownPreviousBody] = useState<string | null>(null),
    [writeTag, setWriteTag] = useState<string>(tags[0]),
    [communityCategories, setCommunityCategories] = useState<string[]>([...tags]),
    [communityCategoryMeta, setCommunityCategoryMeta] = useState<{ name: string; is_featured?: boolean }[]>([]),
    [categoryOverflowOpen, setCategoryOverflowOpen] = useState(false),
    [aiCategories, setAiCategories] = useState<{id:number;name:string;description?:string;kind?:string;moderation_status?:string}[]>([]),
    [writeChannel, setWriteChannel] = useState<"community" | "ai">("community"),
    [writeContentType, setWriteContentType] = useState<AiContentType>("knowledge_article"),
    [composerRoute, setComposerRoute] = useState<ComposerRoute | null>(null),
    [composerRouteLocked, setComposerRouteLocked] = useState(false),
    [composerSuggestion, setComposerSuggestion] = useState<{ key: string; route: ComposerRoute | null; topics: string[]; degraded: boolean; checking: boolean } | null>(null),
    // 发布状态：编辑阶段永远不调用模型，点发布后才进入 checking。
    [composerCheckPhase, setComposerCheckPhase] = useState<"idle" | "checking" | "failed">("idle"),
    [composerTagTouched, setComposerTagTouchedState] = useState(false),
    [composerRouteReason, setComposerRouteReason] = useState(""),
    [aiResourceFields, setAiResourceFields] = useState<Record<string, string>>({}),
    [writeTopics, setWriteTopics] = useState<string[]>([]),
    [writeSeriesId, setWriteSeriesId] = useState(""),
    [topicSearch, setTopicSearch] = useState(""),
    [topicChoices, setTopicChoices] = useState<TopicSummary[]>([]),
    [creatingTopic, setCreatingTopic] = useState(false),
    [composerImages, setComposerImages] = useState<ComposerImage[]>([]),
    [taskCenterOpen, setTaskCenterOpen] = useState(false),
    [imageUploadProgress, setImageUploadProgress] = useState<{ percent: number; done: number; total: number; phase: "uploading" | "processing" | "done" } | null>(null),
    [composerAttachments, setComposerAttachments] = useState<PostAttachment[]>([]),
    [attachmentQuota, setAttachmentQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null),
    [attachmentBusy, setAttachmentBusy] = useState(false),
    [attachmentProgress, setAttachmentProgress] = useState<number | null>(null),
    [attachmentRetryFiles, setAttachmentRetryFiles] = useState<File[]>([]),
    [attachmentError, setAttachmentError] = useState(""),
    [composerValidation, setComposerValidation] = useState<"" | "title" | "body">(""),
    [uploadingImages, setUploadingImages] = useState(false),
    [coverIndex, setCoverIndex] = useState(0),
    [draftSaved, setDraftSaved] = useState(false),
    [composerEditingPublished, setComposerEditingPublished] = useState(false),
    [composerRevisionMode, setComposerRevisionMode] = useState(false),
    [draftSaving, setDraftSaving] = useState(false),
    [draftLocalState, setDraftLocalState] = useState<"idle" | "saving" | "saved" | "error">("idle"),
    [localDraftId, setLocalDraftId] = useState<string | null>(null),
    [localDraftCount, setLocalDraftCount] = useState(0),
    [draftBoxOpen, setDraftBoxOpen] = useState(false),
    [missionsOpen, setMissionsOpen] = useState(false),
    [missionSummary, setMissionSummary] = useState(""),
    [decorOpen, setDecorOpen] = useState(false),
    [decorTab, setDecorTab] = useState<"official" | "community" | "mine" | "submissions" | "studio">("official"),
    [decorKind, setDecorKind] = useState<"all" | "bottom" | "card">("all"),
    [isPublishing, setIsPublishing] = useState(false),
    /** 发布结果：留在创作页展示，不再强制跳走。 */
    [composerOutcome, setComposerOutcome] = useState<{ kind: "published" | "pending_review"; title: string; cover: string | null; imageCount: number; clientId: number | null; cloudId: string | null; at: number } | null>(null),
    /** 从浮窗/任务中心返回创作时绑定的任务，用于避免重复提交。 */
    [resumeTaskKey, setResumeTaskKey] = useState<string | null>(null),
    [composerError, setComposerError] = useState(""),
    [topicSummary, setTopicSummary] = useState<TopicSummary | null>(null),
    [topicPosts, setTopicPosts] = useState<Post[]>([]),
    [topicPage, setTopicPage] = useState(1),
    [topicTotal, setTopicTotal] = useState(0),
    [topicLoading, setTopicLoading] = useState(false),
    [topicReturnPostId, setTopicReturnPostId] = useState<number | null>(null),
    [topicReturnTab, setTopicReturnTab] = useState("discover"),
    [editing, setEditing] = useState<number | null>(null),
    [notice, setNotice] = useState<NoticeBannerItem | null>(null),
    [noticeLeaving, setNoticeLeaving] = useState(false),
    [noticeExpanded, setNoticeExpanded] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  /** 仍在进行中的发布任务（用于「返回创作」后锁定重复提交）。 */
  const [runningTaskKeys, setRunningTaskKeys] = useState<string[]>([]);
  useEffect(() => {
    const off = publishTaskManager.subscribe((list) => {
      setRunningTaskKeys(list.filter((task) => !PUBLISH_SETTLED.includes(task.status)).map((task) => task.taskKey));
    });
    return () => { off(); };
  }, []);
  const modalCloseTimer = useRef<number | null>(null);
  const presentNotice = useCallback((item: NoticeBannerItem) => {
    noticeRef.current = item;
    noticeLeavingRef.current = false;
    setNotice(item);
    setNoticeLeaving(false);
    setNoticeExpanded(false);
    noticeTimer.current = window.setTimeout(() => dismissNoticeRef.current(), item.kind === "message" ? 5000 : 3800);
  }, []);
  const dismissNotice = useCallback(() => {
    if (!noticeRef.current || noticeLeavingRef.current) return;
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    noticeLeavingRef.current = true;
    setNoticeLeaving(true);
    noticeExitTimer.current = window.setTimeout(() => {
      noticeExitTimer.current = null;
      noticeLeavingRef.current = false;
      const next = noticeQueue.current.shift() || null;
      noticeRef.current = null;
      if (next) presentNotice(next);
      else { setNotice(null); setNoticeLeaving(false); setNoticeExpanded(false); }
    }, 220);
  }, [presentNotice]);
  dismissNoticeRef.current = dismissNotice;
  const expandNotice = useCallback(() => {
    setNoticeExpanded((expanded) => !expanded);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => dismissNoticeRef.current(), 6500);
  }, []);
  const toast = useCallback((msg: string, options: NoticeOptions = {}) => {
    const body = userMessage(msg).trim();
    if (!body) return;
    const error = /(失败|错误|无效|不能|暂不可用|未保存|未能)/.test(body);
    const kind: NoticeKind = options.kind || (error ? "error" : /(点赞|赞了|赞同)/.test(body) ? "like" : /(评论|回复)/.test(body) ? "comment" : /(收藏|书签)/.test(body) ? "bookmark" : /(关注|粉丝)/.test(body) ? "follow" : /(评分|评级|星级)/.test(body) ? "rating" : /(私信|新消息|消息)/.test(body) ? "message" : /(奖励|经验|等级|会员)/.test(body) ? "reward" : /(图片|视频|作品|草稿|发布|上传)/.test(body) ? "content" : /(账号|登录|安全|密码)/.test(body) ? "account" : /(成功|已保存|已发布|已领取|完成)/.test(body) ? "success" : "general");
    const title = options.title || (!options.onActivate
      ? error ? "操作未完成" : "操作完成"
      : error ? "操作未完成" : kind === "like" ? "点赞提醒" : kind === "comment" ? "评论提醒" : kind === "bookmark" ? "收藏提醒" : kind === "follow" ? "关注动态" : kind === "rating" ? "评分提醒" : kind === "message" ? "社区动态" : kind === "reward" ? "探索进度" : kind === "content" ? "内容提醒" : kind === "account" ? "账号提醒" : kind === "success" ? "操作完成" : "HEIKA 提醒");
    const item: NoticeBannerItem = { ...options, id: ++noticeSequence.current, title, body, createdAt: Date.now(), kind };
    if ((noticeRef.current?.title === title && noticeRef.current.body === body) || noticeQueue.current.some((queued) => queued.title === title && queued.body === body)) return;
    if (!noticeRef.current) presentNotice(item);
    else if (noticeQueue.current.length < 12) noticeQueue.current.push(item);
    else if (!noticeQueue.current.some((queued) => queued.title === "更多提醒")) {
      noticeQueue.current[noticeQueue.current.length - 1] = { id: ++noticeSequence.current, title: "更多提醒", body: "还有新的提醒，请前往消息中心查看。", createdAt: Date.now(), kind: "general" };
    }
  }, [presentNotice]);
  // 注册后的恢复码是强制一步：即使新账号被引导页接管，也要先看到它。
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem("heika:pending-recovery-codes");
        const parsed = raw ? JSON.parse(raw) : null;
        setPendingRecoveryCodes(Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === "string") : []);
      } catch {
        setPendingRecoveryCodes([]);
      }
    };
    read();
    window.addEventListener("heika:recovery-codes", read);
    return () => window.removeEventListener("heika:recovery-codes", read);
  }, []);

  // 受邀注册的欢迎信排在恢复码之后、引导页之前。
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem("heika:pending-invitation");
        const parsed = raw ? JSON.parse(raw) : null;
        setPendingInvitation(parsed && typeof parsed === "object" ? (parsed as InvitationWelcome) : null);
      } catch {
        setPendingInvitation(null);
      }
    };
    read();
    window.addEventListener("heika:pending-invitation", read);
    return () => window.removeEventListener("heika:pending-invitation", read);
  }, []);

  useEffect(() => () => {
    if (modalCloseTimer.current !== null) window.clearTimeout(modalCloseTimer.current);
    if (fallbackPageTimer.current !== null) window.clearTimeout(fallbackPageTimer.current);
    document.documentElement.classList.remove("heika-page-fallback");
  }, []);
  const [messagesTabVisited, setMessagesTabVisited] = useState(false);
  const [secondaryReturnTab, setSecondaryReturnTab] = useState("discover");
  const [sharedCollectionCode, setSharedCollectionCode] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("room")) { setSecondaryReturnTab("mine"); setTabState("co-explore"); }
    else if (params.get("collection")) { setSharedCollectionCode(params.get("collection") || ""); setSecondaryReturnTab("discover"); setTabState("shared-collection"); }
    else if (params.get("series")) { setCollectionReturnTab("discover"); setCollectionId(params.get("series")); setTabState("collection"); }
    else if (params.get("chain")) { setSecondaryReturnTab("mine"); setTabState("card-chain"); }
    // APP 的「管理后台」入口用这个深链直接在应用内网页打开管理界面；
    // 未登录或无管理员权限时由管理页自身的登录引导完成手动授权。
    else if (params.get("admin")) { setTabState("moderation"); }
  }, []);
  const startPageTransition = (updatePage: () => void) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      updatePage();
      return;
    }
    const transitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => PageTransitionHandle;
    };
    if (!transitionDocument.startViewTransition) {
      document.documentElement.classList.add("heika-page-fallback");
      updatePage();
      if (fallbackPageTimer.current !== null) window.clearTimeout(fallbackPageTimer.current);
      fallbackPageTimer.current = window.setTimeout(() => {
        fallbackPageTimer.current = null;
        document.documentElement.classList.remove("heika-page-fallback");
      }, 260);
      return;
    }
    if (pageTransition.current) {
      pageTransitionQueue.current.push(updatePage);
      return;
    }
    const transition = transitionDocument.startViewTransition(() => flushSync(updatePage));
    pageTransition.current = transition;
    void transition.finished.catch(() => {}).then(() => {
      if (pageTransition.current !== transition) return;
      pageTransition.current = null;
      const next = pageTransitionQueue.current.shift();
      if (next) startPageTransition(next);
    });
  };
  const setTab = (next: string) => {
    if (next === tab) return;
    scrollPositions.current[tab] = window.scrollY;
    if (next === "messages") setMessagesTabVisited(true);
    startPageTransition(() => setTabState(next));
  };
  useLayoutEffect(() => {
    window.scrollTo({ top: scrollPositions.current[tab] || 0, behavior: "instant" });
  }, [tab]);
  const openNotifications = (returnTab = "messages") => { setSecondaryReturnTab(returnTab); setTab("notifications"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const openMineSettings = () => { scrollPositions.current.mine = window.scrollY; setSettingsPersonalOpen(false); setTab("settings"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const openExplorationCenter = () => { scrollPositions.current.mine = window.scrollY; setTab("exploration-center"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const openCoExplore = (returnTab: "mine" | "exploration-center" = "mine") => { scrollPositions.current[returnTab] = window.scrollY; setSecondaryReturnTab(returnTab); setTab("co-explore"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const openMineFeature = (feature: "monthly-recap" | "card-chain", returnTab: "mine" | "exploration-center" = "mine") => { scrollPositions.current[returnTab] = window.scrollY; setSecondaryReturnTab(returnTab); setTab(feature); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const returnToSecondaryTab = () => { const destination = secondaryReturnTab; setTab(destination); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[destination] || 0, behavior: "instant" })); };
  const closeSearch = () => setTab(searchReturnTab || "discover");
  const closeAuthorProfile = () => {
    setAuthorProfile(null);
    const url = new URL(window.location.href);
    if (!url.searchParams.has("profile")) return;
    url.searchParams.delete("profile");
    window.history.replaceState(window.history.state, "", url);
  };
  const openMyContent = (returnTab: "mine" | "settings" = "mine") => {
    scrollPositions.current[returnTab] = window.scrollY;
    setMyContentReturnTab(returnTab);
    setTab("my-content");
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  };
  const openCreatorCenter = (returnTab: "mine" | "settings" = "settings") => {
    scrollPositions.current[returnTab] = window.scrollY;
    setMyContentReturnTab(returnTab);
    setTab("creator-center");
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  };
  const submitSearch = (value = searchDraft) => {
    const normalized = value.trim().slice(0, 60);
    setSearchDraft(normalized);
    setSearchTerm(normalized);
    setSearchPage(1);
    searchCursorRef.current = null;
    setSearchPosts([]);
    setSearchPeople([]);
    setSearchTotal(0);
    setSearchHasMore(false);
    setSearchError("");
    setSearchRetry((n) => n + 1);
    if (normalized) {
      setSearchRecent((current) => [normalized, ...current.filter((item) => item !== normalized)].slice(0, 8));
      try { localStorage.setItem("heika-search-recent", JSON.stringify([normalized, ...searchRecent.filter((item) => item !== normalized)].slice(0, 8))); } catch {}
    }
  };
  const setModal = (next: typeof modal) => {
    if (modalCloseTimer.current !== null) {
      window.clearTimeout(modalCloseTimer.current);
      modalCloseTimer.current = null;
    }
    if (next === null && modal !== null) {
      setModalClosing(true);
      modalCloseTimer.current = window.setTimeout(() => {
        setModalState(null);
        setModalClosing(false);
        modalCloseTimer.current = null;
      }, 210);
      return;
    }
    setModalClosing(false);
    setModalState(next);
  };
  const [detailSort, setDetailSort] = useState<"热度" | "最新">("最新");
  const [commentSending, setCommentSending] = useState(false);
  const [commentInputExpanded, setCommentInputExpanded] = useState(false);
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentOffset, setCommentOffset] = useState(0);
  const [commentHasMore, setCommentHasMore] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const commentLikeBusy = useRef(new Set<number>());
  const [likeBusy, setLikeBusy] = useState(false);
  const [discoveryLikeBusy, setDiscoveryLikeBusy] = useState<Record<number, boolean>>({});
  const discoveryLikeBusyRef = useRef(new Set<number>());
  const [detailLikeCounts, setDetailLikeCounts] = useState<Record<number, number>>({});
  const [previewImage, setPreviewImage] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [displayedImageIndex, setDisplayedImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [detailImageDirection, setDetailImageDirection] = useState<"next" | "previous">("next");
  const preloadedDetailImages = useRef(new Map<string, { image: HTMLImageElement; promise: Promise<HTMLImageElement> }>());
  const imageSwitchSequence = useRef(0);
  const imageTouchStart = useRef<{ x: number; y: number } | null>(null);
  const imageSwipeTriggered = useRef(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<number, boolean>>({});
  const [replyTargetName, setReplyTargetName] = useState<string | undefined>();
  const [detailMoreOpen, setDetailMoreOpen] = useState(false);
  // 阅读字号是设备级偏好：标题与正文独立无极调节，进度条默认关闭。
  const readerType = useReaderTypePrefs();
  const [sharePayloadState, setSharePayloadState] = useState<SharePayload | null>(null);
  const [shareClientId, setShareClientId] = useState<string | null>(null);
  const [aiDetailAction, setAiDetailAction] = useState<"versions" | "feedback" | "resources" | null>(null);
  const [aiVersionsAvailable, setAiVersionsAvailable] = useState(false);
  const closeAiDetailAction = useCallback(() => setAiDetailAction(null), []);
  useEffect(() => {
    setAiDetailAction(null);
    setAiVersionsAvailable(false);
  }, [detail]);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastDraftPayload = useRef("");
  const draftSaveTimer = useRef<number | null>(null);
  const draftCloudQueue = useRef<Promise<void>>(Promise.resolve());
  const composerSession = useRef(0);
  const localDraftIdRef = useRef<string | null>(null);
  const pendingAttachmentFiles = useRef(new Map<string, File>());
  const composerRouteSeq = useRef(0);
  const composerSuggestionRef = useRef<{ key: string; route: ComposerRoute | null; topics: string[]; degraded: boolean; checking: boolean } | null>(null);
  const composerTagTouchedRef = useRef(false);
  const markComposerTagTouched = () => { composerTagTouchedRef.current = true; setComposerTagTouchedState(true); };
  const draftRevision = useRef(0);
  const composerDraftRef = useRef<Post | null>(null);
  const composerCloudDrafts = useRef(new Map<string, Post>());
  const flushComposerDraft = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { composerSession.current += 1; composerDraftRef.current = null; composerCloudDrafts.current.clear(); }, [accountId]);
  const publishInFlight = useRef(false);
  /** 图片 id → 预上传 Promise（staging，先落对象存储，发布时只做挂接）。 */
  const preuploadRef = useRef(new Map<string, Promise<string | null>>());
  const attachmentUploadIds = useRef(new WeakMap<File, string>());
  const draftMediaBusy = useRef(new Set<string>());
  const zone = accountTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayKey(new Date(), zone);
  const deckDay = cycleStart ? dayKey(new Date(cycleStart), zone) : today;
  const selectedDay = selectedCalendarDate || today;
  const serverWindow = useMemo(
    () => new Map((explorationServer?.windowDays || []).map((day) => [day.date, day.count] as const)),
    [explorationServer],
  );
  const calendarDays = Array.from({ length: 28 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (27 - index));
    const key = dayKey(date, zone);
    // 服务端有记录就以服务端为准（跨设备一致），否则退回本机记录。
    return { key, count: serverWindow.get(key) ?? (state.opened[key] || []).length };
  });
  const all = useMemo(() => [
    ...new Map(
      [...publicFeed, ...topicPosts, ...searchPosts, ...bookmarkedPosts, ...Object.values(state.revealed), ...state.own].map(
        (post) => [post.id, post],
      ),
    ).values(),
  ], [publicFeed, topicPosts, searchPosts, bookmarkedPosts, state.revealed, state.own]);
  const serverPostById = useMemo(() => {
    const rows = [...(explorationServer?.records || []), ...(explorationServer?.recentRecords || [])];
    return new Map(rows.filter((row) => row.post).map((row) => [row.post.id, row.post] as const));
  }, [explorationServer]);
  const serverRecordsByDate = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const row of explorationServer?.records || []) {
      if (!row.post) continue;
      map.set(row.date, [...(map.get(row.date) || []), row.post]);
    }
    return map;
  }, [explorationServer]);
  const lookupPost = (id: number) => state.revealed[id] || all.find((post) => post.id === id) || serverPostById.get(id);
  const selectedDayLocalIds = state.opened[selectedDay] || [];
  const selectedDayRecords: Post[] = serverRecordsByDate.get(selectedDay)
    || selectedDayLocalIds.map((id) => lookupPost(id)).filter((post): post is Post => Boolean(post));
  // 只有进入探索中心才拉服务端口径，首页不会多发一次请求。
  useEffect(() => {
    if (tab !== "exploration-center" || !accountId) {
      setExplorationServer(null);
      return;
    }
    let cancelled = false;
    setExplorationServerLoading(true);
    cloudFetch("/api/v1/exploration-calendar")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload?.data) setExplorationServer(payload.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setExplorationServerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, accountId]);
  const opened = state.opened[today] || [];
  // 已翻开过的全部卡片：判断卡面状态必须看历史全量，只看今天会把旧卡误判成「未翻开」。
  const openedEverKey = useMemo(
    () => [...new Set([...Object.values(state.opened).flat(), ...Object.keys(state.revealed).map(Number)])].sort((a, b) => a - b),
    [state.opened, state.revealed],
  );
  const openedEver = useMemo(() => new Set(openedEverKey), [openedEverKey]);
  // 已翻开但内容尚未恢复时的状态：pending 自动补拉，failed 等用户点重试。
  const [revealRepair, setRevealRepair] = useState<Record<number, "pending" | "failed">>({});
  /** 按卡片 id 补拉内容：缓存被清、签名图过期、云端内容更新后都靠它恢复。 */
  const repairRevealed = useCallback(async (ids: number[]) => {
    const targets = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 40);
    if (!targets.length) return;
    setRevealRepair((current) => ({ ...current, ...Object.fromEntries(targets.map((id) => [id, "pending" as const])) }));
    try {
      const response = await cloudFetch("/api/demo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targets }),
      });
      const payload = await response.json().catch(() => ({} as { data?: { items?: Post[] } }));
      if (!response.ok) throw new Error("卡片内容恢复失败");
      const items = Array.isArray(payload?.data?.items) ? (payload.data.items as Post[]) : [];
      const recovered = items
        .filter((post) => targets.includes(post.id))
        .map((post) => [post.id, normalizeCachedPost(post)] as const);
      if (recovered.length) {
        setState((current) => ({
          ...current,
          revealed: { ...current.revealed, ...Object.fromEntries(recovered) },
          rarityTiers: {
            ...current.rarityTiers,
            ...Object.fromEntries(recovered.filter(([, post]) => post.rarityTier).map(([id, post]) => [id, post.rarityTier!])),
          },
        }));
      }
      const found = new Set(recovered.map(([id]) => id));
      setRevealRepair((current) => {
        const next = { ...current };
        for (const id of targets) {
          if (found.has(id)) delete next[id];
          else next[id] = "failed";
        }
        return next;
      });
    } catch {
      setRevealRepair((current) => ({ ...current, ...Object.fromEntries(targets.map((id) => [id, "failed" as const])) }));
    }
  }, []);
  useEffect(() => {
    if (!ready) return;
    const missing = openedEverKey.filter((id) => !state.revealed[id] && !revealRepair[id]);
    if (missing.length) void repairRevealed(missing.slice(0, 24));
  }, [ready, openedEverKey, state.revealed, revealRepair, repairRevealed]);
  const latestOpenedDay = Object.keys(state.opened)
    .filter((day) => state.opened[day]?.length)
    .sort()
    .at(-1);
  const latestOpenedId = latestOpenedDay
    ? state.opened[latestOpenedDay]?.at(-1)
    : undefined;
  const latestOpenedPost = latestOpenedId === undefined
    ? null
    : state.revealed[latestOpenedId] || null;
  const luckyBonusToday = Math.min(10, state.luckyBonus?.[today] || 0);
  const membershipTier = experienceSummary.membershipTier || "free";
  const memberFlipAllowance = baseDailyFlipAllowance(membershipTier);
  const dailyAllowance = memberFlipAllowance + luckyBonusToday;
  const candidatePosts = state.cardIds.map(
    (id) =>
      state.revealed[id] ||
      ({
        id,
        tag: "",
        title: "",
        body: "",
        cover: "",
        author: "",
        date: "",
      } as Post),
  );
  const candidates = dailyCandidates(
    candidatePosts,
    state.interests,
    state.deck[deckDay] || [],
    50,
  );
  const visibleCandidates = candidates;
  const openedIds = [
    ...new Set([
      ...Object.values(state.opened).flat(),
      ...Object.keys(state.revealed).map(Number),
    ]),
  ];
  const activeDays = new Set(
    Object.entries(state.opened)
      .filter(([, ids]) => ids.length > 0)
      .map(([date]) => date),
  );
  let streak = 0;
  const streakCursor = new Date();
  if (!activeDays.has(today)) streakCursor.setDate(streakCursor.getDate() - 1);
  while (
    activeDays.has(
      dayKey(streakCursor, Intl.DateTimeFormat().resolvedOptions().timeZone),
    )
  ) {
    streak++;
    streakCursor.setDate(streakCursor.getDate() - 1);
  }
  const serverDiscoveries = (explorationServer?.recentRecords || [])
    .filter((row): row is { date: string; post: Post } => Boolean(row.post))
    .map((row) => ({ date: row.date, post: row.post }));
  const localDiscoveries = Object.entries(state.opened)
    .flatMap(([date, ids]) =>
      ids.map((id) => ({ date, post: lookupPost(id) })),
    )
    .filter((entry): entry is { date: string; post: Post } =>
      Boolean(entry.post),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const recentDiscoveries = (serverDiscoveries.length ? serverDiscoveries : localDiscoveries).slice(0, 8);
  // 探索概览的三个指标全部来自真实记录；数据未就绪时由 UI 显示骨架。
  const recentSevenDayCount = calendarDays.slice(-7).reduce((sum, day) => sum + day.count, 0);
  const activeDayCount = calendarDays.filter((day) => day.count > 0).length;
  // 服务端有全量记录时以服务端为准，避免换设备后「累计翻卡」归零。
  const explorationTotal = explorationServer?.lifetimeTotal ?? openedIds.length;
  const explorationStreak = explorationServer?.streak ?? streak;
  const explorationStatsReady = Boolean(explorationServer) || !explorationServerLoading;
  const explorationHistoryDays = (() => {
    const byDate = new Map<string, number[]>();
    for (const [date, ids] of Object.entries(state.opened)) {
      if (ids.length) byDate.set(date, [...ids]);
    }
    for (const row of explorationServer?.records || []) {
      if (!row.post) continue;
      const list = byDate.get(row.date) || [];
      if (!list.includes(row.post.id)) list.push(row.post.id);
      byDate.set(row.date, list);
    }
    return [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a));
  })();
  const favoritePosts = all.filter((post) =>
    state.saved.includes(post.id) &&
    (favoriteSource === "全部" ||
      (state.savedFrom?.[post.id] || (state.revealed[post.id] ? "today" : "discover")) ===
        (favoriteSource === "今日翻卡" ? "today" : "discover")),
  );
  const collectionPosts = favoriteCollection !== "all" && favoriteCollection !== "uncategorized"
    ? bookmarkCollectionContents[favoriteCollection] || []
    : favoritePosts;
  const favoritePostsForView = collectionPosts.filter((post) => favoriteSource === "全部" || (state.savedFrom?.[post.id] || (state.revealed[post.id] ? "today" : "discover")) === (favoriteSource === "今日翻卡" ? "today" : "discover"));
  const organizedFavoritePosts = favoritePostsForView.filter((post) => {
    const assignedCollection = bookmarkMembership[post.cloudId || ""] || null;
    const inCollection = favoriteCollection !== "all" && favoriteCollection !== "uncategorized" ? true : favoriteCollection === "all" || !assignedCollection;
    const term = favoriteSearch.trim().toLocaleLowerCase();
    const matches = !term || [post.title, post.tag, post.author, post.body].some((value) => value.toLocaleLowerCase().includes(term));
    return inCollection && matches;
  });
  const likedPosts = all.filter((post) => state.liked?.includes(post.id));
  useEffect(() => {
    let cancelled = false;
    let loaded: State = initial;
    try {
      const raw = localStorage.getItem("heika-demo-v1");
      if (raw) {
        const saved = JSON.parse(raw);
        loaded = {
          ...initial, ...saved, comments: [], dailyCount: 5,
          revealed: normalizeRevealedSnapshots(saved.revealed), rarityTiers: saved.rarityTiers || {},
          notifications: saved.notifications || initial.notifications,
          readingMode: saved.readingMode || (saved.compactReading ? "focus" : "standard"),
        };
      }
    } catch {}
    // Local navigation must be usable even when either background request stalls.
    setState(loaded);
    setReady(true);
    const refreshIds = [...new Set([
      ...Object.values(loaded.opened).flat(),
      ...Object.keys(loaded.revealed).map(Number),
    ])].filter(Number.isSafeInteger);
    const refreshHistory = async () => {
      // Bound concurrency so a long history does not flood the startup connection.
      for (let offset = 0; offset < refreshIds.length && !cancelled; offset += 100) {
        try {
          const response = await cloudFetch("/api/demo/cards", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: refreshIds.slice(offset, offset + 100) }),
          });
          const result = await response.json();
          if (!response.ok || cancelled || !Array.isArray(result.data?.items)) continue;
          setState((current) => {
            const eligible = new Set([...Object.keys(current.revealed).map(Number), ...Object.values(current.opened).flat()]);
            const posts = (result.data.items as Post[]).filter((post) => eligible.has(post.id));
            return { ...current,
              revealed: { ...current.revealed, ...Object.fromEntries(posts.map((post) => [post.id, post])) },
              rarityTiers: { ...current.rarityTiers, ...Object.fromEntries(posts.filter((post) => post.rarityTier).map((post) => [post.id, post.rarityTier!])) },
            };
          });
        } catch {}
      }
    };
    void refreshHistory();
    // Published card IDs are public: fetching them must not wait on auth initialization.
    void fetchDailyCardIds().then((ids) => {
      if (!cancelled && ids.length) setState((current) => ({ ...current, cardIds: ids }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      const cachedState: Partial<State> = { ...state };
      delete cachedState.comments;
      // blob: 地址只在当前会话有效，写进 localStorage 后下次打开必然是坏图。
      // 持久化时换成云端地址；云端地址也拿不到就去掉该字段，由本地缓存/云端重新填充。
      if (cachedState.cover?.startsWith("blob:")) cachedState.cover = coverRemoteRef.current;
      // 缓存里只保留「不会过期的媒体标识」：签名地址还原成站内媒体路由，
      // 临时 blob 地址直接丢弃。旧实现在这里把图片字段清空，
      // 一旦后台刷新失败，重新进入时卡片就没有图片、甚至整块空白。
      cachedState.revealed = Object.fromEntries(Object.entries(state.revealed).map(([id, post]) => [id, {
        ...post,
        image: stableCardMediaUrl(post.image),
        images: post.images?.map((image) => stableCardMediaUrl(image)).filter((image): image is string => Boolean(image)),
        thumbnailImages: post.thumbnailImages?.map((image) => stableCardMediaUrl(image)).filter((image): image is string => Boolean(image)),
      }]));
      try { localStorage.setItem(storageKey, JSON.stringify(cachedState)); } catch { /* Storage quota must not interrupt navigation. */ }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [state, ready, storageKey]);
  useEffect(() => () => {
    readingTimer.current.forEach(window.clearTimeout);
    if (ratingPulseTimer.current !== null) window.clearTimeout(ratingPulseTimer.current);
    if (luckyRewardTimer.current !== null) window.clearTimeout(luckyRewardTimer.current);
    if (flipRainTimer.current !== null) window.clearTimeout(flipRainTimer.current);
    if (rarityRevealTimer.current !== null) window.clearTimeout(rarityRevealTimer.current);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    if (noticeExitTimer.current !== null) window.clearTimeout(noticeExitTimer.current);
    noticeQueue.current = [];
    noticeRef.current = null;
  }, []);
  useEffect(() => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);
  const loadPublicFeed = useCallback(async (requestedPage = 1, reset = false, requestedTag = category) => {
    if (publicFeedLoading.current && !reset) return;
    if (reset) feedController.current?.abort();
    if (reset) feedCursor.current = null;
    const controller = new AbortController();
    feedController.current = controller;
    publicFeedLoading.current = true;
    setFeedLoading(true);
    setFeedError("");
    const params = new URLSearchParams({ mode: "discover", limit: "24" });
    if (requestedTag !== "全部") params.set("tag", requestedTag);
    if (sort === "关注") params.set("following", "1");
    if (!reset && feedCursor.current) {
      params.set("cursorCreatedAt", feedCursor.current.createdAt);
      params.set("cursorPostId", feedCursor.current.postId);
    }
    try {
      const requestUrl = `/api/demo/cards?${params}`;
      const response = sort === "关注"
        ? await cloudFetch(requestUrl, { cache: "no-store", signal: controller.signal })
        : await fetch(requestUrl, { cache: "default", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error("内容加载失败");
      const payload = result.data;
      const items: Post[] | undefined = Array.isArray(payload) ? payload : payload?.items;
      if (!Array.isArray(items)) throw new Error("内容格式无效");
      if (controller.signal.aborted) return;
      const pageRatings = { ...communityRatings };
      for (const item of items) {
        if (typeof item.ratingAverage === "number" && typeof item.ratingCount === "number") {
          pageRatings[item.id] = { average: item.ratingAverage, count: item.ratingCount };
        }
      }
      const orderedItems = sort === "最新"
        ? items
        : sort === "高分"
          ? [...items].sort((a, b) => (b.ratingAverage || 0) - (a.ratingAverage || 0) || (b.ratingCount || 0) - (a.ratingCount || 0) || b.date.localeCompare(a.date) || b.id - a.id)
          : rankRecommendations(items, state.interests, state.viewed, state.ratings, pageRatings);
      setPublicFeed((current) => {
        if (reset) return orderedItems;
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...orderedItems.filter((item) => !seen.has(item.id))];
      });
      setFeedPostIds((current) => reset
        ? orderedItems.map((item) => item.id)
        : [...current, ...orderedItems.filter((item) => !current.includes(item.id)).map((item) => item.id)]);
      setCommunityRatings((current) => ({ ...current, ...Object.fromEntries(items.flatMap((item) =>
        typeof item.ratingAverage === "number" && typeof item.ratingCount === "number"
          ? [[item.id, { average: item.ratingAverage, count: item.ratingCount }]]
          : [],
      )) }));
      feedCursor.current = !Array.isArray(payload) && payload.cursor ? payload.cursor : null;
      const total = Array.isArray(payload) ? items.length : typeof payload.total === "number" ? payload.total : null;
      setFeedTotal((current) => reset ? total ?? items.length : total ?? current);
      setFeedPage((current) => reset ? 1 : Math.max(current + 1, requestedPage));
      setFeedHasMore(!Array.isArray(payload) && Boolean(payload.hasMore));
      setFeedLoadedTag(requestedTag);
      setFeedLoadedSort(sort);
      setPage((current) => reset ? Math.min(12, items.length) : current);
    } catch {
      if (!controller.signal.aborted) setFeedError("内容加载失败，请重试");
    } finally {
      if (feedController.current === controller) {
        publicFeedLoading.current = false;
        setFeedLoading(false);
      }
    }
  }, [category, sort, state.interests, state.viewed, state.ratings, communityRatings]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void Promise.all([
      cloudFetch("/api/v1/categories?channel=community&kind=category", { cache: "no-store" }).then((response) => response.json()),
      cloudFetch("/api/v1/categories?channel=ai&kind=category", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([communityResult, aiResult]) => {
      if (!active) return;
      const communityItems = Array.isArray(communityResult.data?.items) ? communityResult.data.items : [];
      const aiItems = Array.isArray(aiResult.data?.items) ? aiResult.data.items : [];
      if (communityItems.length) {
        const categories = communityItems.filter((item: { kind?: string }) => item.kind === "category");
        setCommunityCategories(categories.map((item: { name: string }) => item.name));
        setCommunityCategoryMeta(categories.map((item: { name: string; is_featured?: boolean }) => ({ name: item.name, is_featured: Boolean(item.is_featured) })));
      }
      if (aiItems.length) setAiCategories(aiItems.filter((item: { kind?: string }) => item.kind === "category"));
    }).catch(() => {});
    return () => { active = false; };
  }, [ready]);
  // 列数按「内容容器」的实际可用宽度算，而不是整屏宽度：
  // 桌面有内边距与最大宽度限制时，按屏幕宽度取列会把卡片压窄。
  useEffect(() => {
    if (!ready) return;
    let observer: ResizeObserver | null = null;
    const updateColumns = () => {
      const feed = document.querySelector<HTMLElement>(".discover-page .stable-editorial-feed");
      const width = feed?.clientWidth || Math.max(280, Math.min(window.innerWidth, 1120) - 64);
      setDiscoverColumnCount(width >= 1180 ? 5 : width >= 880 ? 4 : width >= 600 ? 3 : 2);
    };
    updateColumns();
    const timer = window.setTimeout(() => {
      const host = document.querySelector<HTMLElement>(".discover-page .stable-editorial-feed") || document.querySelector<HTMLElement>(".discover-page");
      if (!host || typeof ResizeObserver === "undefined") return;
      observer = new ResizeObserver(updateColumns);
      observer.observe(host);
    }, 260);
    window.addEventListener("resize", updateColumns, { passive: true });
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", updateColumns);
    };
  }, [ready, tab, discoverChannel]);
  useEffect(() => {
    if (!ready || tab !== "discover" || discoverChannel !== "community") return;
    const wantedTag = category;
    if (feedLoadedTag === wantedTag && feedLoadedSort === sort && (publicFeed.length || feedPage > 0)) return;
    void loadPublicFeed(1, true, wantedTag);
  }, [ready, tab, discoverChannel, category, sort, feedLoadedTag, feedLoadedSort, publicFeed.length, feedPage, loadPublicFeed]);
  useEffect(() => {
    if (tab !== "discover" || discoverChannel !== "community") return;
    let active = true;
    void cloudFetch("/api/v1/topic-events", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      if (active && Array.isArray(result.data?.items)) setTopicEvents(result.data.items as TopicEvent[]);
    }).catch(() => {});
    return () => { active = false; };
  }, [tab, discoverChannel]);
  useEffect(() => {
    if (tab !== "discover" || discoverChannel !== "community" || Date.now() - explorationAdLoadedAt.current < 30_000) return;
    let active = true;
    explorationAdLoadedAt.current = Date.now();
    void fetch("/api/v1/exploration-ad", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!active) return;
        const ad = result?.data as PublicExplorationAd | null | undefined;
        setExplorationAd(ad?.enabled && ad.post_client_id ? ad : null);
      })
      .catch(() => { if (active) setExplorationAd(null); });
    return () => { active = false; };
  }, [tab, discoverChannel]);
  useEffect(() => {
    if (typeof window === "undefined" || "HeikaNative" in window) return;
    let active = true;
    void fetch("/api/v1/app-download", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        const url = result?.data?.download_url;
        if (active && typeof url === "string" && /^https:\/\//i.test(url)) setAppDownloadUrl(url);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!accountId) { setCreatorSeries([]); return; }
    let active = true;
    void cloudRequest("/api/v1/series").then((data) => { if (active && Array.isArray(data?.items)) setCreatorSeries(data.items as PostSeries[]); }).catch(() => {});
    return () => { active = false; };
  }, [accountId, tab]);
  const createPostSeries = async () => {
    if (!seriesName.trim()) return;
    try {
      const item = await cloudRequest("/api/v1/series", {
        title: seriesName.trim(),
        description: seriesDescription.trim(),
        coverUrl: seriesCover.trim() || undefined,
        kind: seriesKind,
        status: seriesStatus,
      }) as PostSeries | null;
      if (item) {
        setCreatorSeries((items) => [item, ...items]);
        setSeriesName(""); setSeriesDescription(""); setSeriesCover("");
        setSeriesKind("serial"); setSeriesStatus("ongoing");
        toast("合集已创建，名称与简介通过审核后公开展示");
      }
    } catch (error) { toast(error instanceof Error ? error.message : "合集创建失败"); }
  };
  const joinTopicEvent = async (event: TopicEvent) => {
    if (!accountId) { toast("登录后可以参加话题共创"); return; }
    try {
      const result = await cloudRequest("/api/v1/topic-events", { eventId: event.id }) as { joined: boolean };
      setTopicEvents((items) => items.map((item) => item.id === event.id ? { ...item, joined: result.joined, participantCount: Math.max(0, item.participantCount + (result.joined ? 1 : -1)) } : item));
      if (result.joined) {
        setWriteTag(event.topic); setWriteTopics((items) => [...new Set([...items, event.topic])].slice(0, 5));
        await openComposer();
        setWriteTag(event.topic); setWriteTopics((items) => [...new Set([...items, event.topic])].slice(0, 5));
        toast(`已加入共创，发布时已选中 #${event.topic}`);
      }
    } catch (error) { toast(error instanceof Error ? error.message : "参加活动失败，请重试"); }
  };
  const missingMineIds = [...new Set([...state.saved, ...(state.liked || [])])].filter((id) => !all.some((post) => post.id === id));
  const missingMineIdsKey = missingMineIds.join(",");
  useEffect(() => {
    if (tab !== "mine" || !missingMineIdsKey) return;
    const controller = new AbortController();
    const ids = missingMineIdsKey.split(",").map(Number);
    const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, (index + 1) * 100));
    void Promise.all(batches.map(async (batch) => {
      const response = await cloudFetch("/api/demo/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: batch }), signal: controller.signal });
      if (!response.ok) throw new Error("内容加载失败");
      const result = await response.json();
      return Array.isArray(result.data?.items) ? result.data.items as Post[] : [];
    })).then((results) => {
      if (controller.signal.aborted) return;
      const items = results.flat();
      setPublicFeed((current) => [...current, ...items.filter((item) => !current.some((old) => old.id === item.id))]);
    }).catch(() => {});
    return () => controller.abort();
  }, [tab, missingMineIdsKey]);
  useEffect(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = window.setTimeout(
      () => setDayTick((n) => n + 1),
      next.getTime() - now.getTime() + 100,
    );
    return () => window.clearTimeout(timer);
  }, [dayTick]);
  useEffect(() => {
    if (!ready || !state.cardIds.length || state.deck[deckDay]?.length) return;
    const deck = dailyCandidates(candidatePosts, state.interests, [], 50).map((post) => post.id);
    if (!deck.length) return;
    update((current) => current.deck[today]?.length ? current : {
      ...current,
      deck: { ...current.deck, [deckDay]: deck },
    });
  }, [ready, deckDay, state.cardIds, state.deck, state.interests, candidatePosts]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("heika-search-recent") || "[]");
      if (Array.isArray(saved)) setSearchRecent(saved.filter((item): item is string => typeof item === "string").slice(0, 8));
    } catch {}
  }, []);
  const update = (fn: (s: State) => State) => setState((s) => fn({ ...s }));
  const openSettingsDetail = (detail: SettingsDetail | "feedbackAdmin", returnTab: "settings" | "mine" = "settings") => {
    scrollPositions.current[returnTab] = window.scrollY;
    startPageTransition(() => {
      setSettingsReturnTab(returnTab);
      if (returnTab === "mine") setTabState("settings");
      setSettingsDetailState(detail);
    });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  };
  const closeSettingsDetail = () => {
    startPageTransition(() => {
      setSettingsDetailState(null);
      setTabState(settingsReturnTab);
    });
    requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[settingsReturnTab] || 0, behavior: "instant" }));
  };
  const openAboutPage = () => {
    scrollPositions.current.settings = window.scrollY;
    setTab("about");
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  };
  const closeAboutPage = () => {
    setTab("settings");
    requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.settings || 0, behavior: "instant" }));
  };
  const openFeedbackFromAbout = () => {
    setSettingsReturnTab("settings");
    startPageTransition(() => {
      setSettingsDetailState("feedback");
      setTabState("settings");
    });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  };
  const updateBookmarkVisibility = async (value: boolean) => {
    if (!accountId) {
      toast("登录后可管理收藏公开状态");
      setTab("messages");
      return;
    }
    const previous = publicBookmarks;
    if (!await confirmInApp(value
      ? "将收藏设置为公开展示？其他人可以在你的主页浏览收藏。"
      : "停止展示我的收藏？其他人将无法在你的主页浏览收藏。", {title:"更新收藏公开范围",confirmLabel:"确认更新"})) return;
    setPublicBookmarks(value);
    setPublicBookmarksLoaded(true);
    setBookmarkVisibilityBusy(true);
    void cloudRequest("/api/v1/me", { show_bookmarks: value }, "PATCH")
      .then((result) => { if (!result) throw new Error("会话已失效"); toast("公开范围已更新"); })
      .catch(() => {
        setPublicBookmarks(previous);
        toast("同步失败，请重试");
      })
      .finally(() => setBookmarkVisibilityBusy(false));
  };
  const saveBookmarkCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    if (!accountId) { toast("登录后可以整理收藏夹"); return; }
    try {
      const data = await cloudRequest("/api/v1/bookmark-collections", { action: "create", name });
      setBookmarkCollections((current) => [...current, data]);
      setNewCollectionName("");
      setFavoriteCollection(data.id);
      toast("收藏夹已创建");
    } catch (error) { toast(error instanceof Error ? error.message : "收藏夹创建失败"); }
  };
  const deleteBookmarkCollection = async (collection: BookmarkCollection) => {
    if (!await confirmInApp(`删除“${collection.name}”？其中的内容会回到未分类收藏。`, {title:"删除收藏夹",confirmLabel:"删除",danger:true})) return;
    try {
      await cloudRequest("/api/v1/bookmark-collections", { action: "delete", id: collection.id });
      setBookmarkCollections((current) => current.filter((item) => item.id !== collection.id));
      setBookmarkMembership((current) => Object.fromEntries(Object.entries(current).map(([postId, id]) => [postId, id === collection.id ? null : id])));
      if (favoriteCollection === collection.id) setFavoriteCollection("all");
      toast("收藏夹已删除");
    } catch (error) { toast(error instanceof Error ? error.message : "删除收藏夹失败"); }
  };
  const renameBookmarkCollection = async (collection: BookmarkCollection) => {
    const name = editingCollectionName.trim();
    if (!name) return;
    try {
      const updated = await cloudRequest("/api/v1/bookmark-collections", { action: "rename", id: collection.id, name });
      setBookmarkCollections((current) => current.map((item) => item.id === collection.id ? updated : item));
      setEditingCollection(null);
      toast("收藏夹名称已更新");
    } catch (error) { toast(error instanceof Error ? error.message : "重命名失败"); }
  };
  const assignBookmarkCollection = async (post: Post, collectionId: string) => {
    if (!accountId || !post.cloudId) { toast("登录后可以整理云端收藏"); return; }
    const value = collectionId || null;
    const previous = bookmarkMembership[post.cloudId] || null;
    setBookmarkMembership((current) => ({ ...current, [post.cloudId!]: value }));
    try {
      await cloudRequest("/api/v1/bookmark-collections", { action: "assign", postId: post.cloudId, collectionId: value });
      setBookmarkCollectionContents((current) => {
        const next = Object.fromEntries(Object.entries(current).map(([id, items]) => [id, items.filter((item) => item.cloudId !== post.cloudId)]));
        if (value) next[value] = [...(next[value] || []), post];
        return next;
      });
    } catch (error) {
      setBookmarkMembership((current) => ({ ...current, [post.cloudId!]: previous }));
      toast(error instanceof Error ? error.message : "收藏整理失败");
    }
  };
  const shareBookmarkCollection = async (collection: BookmarkCollection) => {
    try {
      const result = await cloudRequest("/api/v1/bookmark-collections", { action: "share", id: collection.id, isPublic: true, allowCollaboration: true });
      setBookmarkCollections((items) => items.map((item) => item.id === collection.id ? { ...item, ...result } : item));
      const url = `${window.location.origin}${window.location.pathname}?collection=${result.share_code}`;
      try { await navigator.clipboard.writeText(url); toast("协作分享链接已开启并复制，可邀请朋友查看和加入整理"); }
      catch { await promptInApp("复制这个协作分享链接", url, {title:"协作分享链接",confirmLabel:"完成"}); }
    } catch (error) { toast(error instanceof Error ? error.message : "分享设置失败"); }
  };
  const joinBookmarkCollection = async () => {
    try {
      const result = await cloudRequest("/api/v1/bookmark-collections", { action: "join", shareCode: collectionInviteCode.trim() });
      setCollectionInviteCode("");
      const data = await cloudRequest("/api/v1/bookmark-collections");
      if (data?.collections) {
        setBookmarkCollections(data.collections);
        const rows = data.bookmarks || [];
        setBookmarkMembership(Object.fromEntries(rows.filter((item: { userId: string }) => item.userId === accountId).map((item: { postId: string; collectionId: string | null }) => [item.postId, item.collectionId])));
        const byCollection: Record<string, Post[]> = {};
        for (const item of rows as { collectionId: string | null; post: Post | null }[]) if (item.collectionId && item.post) byCollection[item.collectionId] = [...(byCollection[item.collectionId] || []).filter((post) => post.id !== item.post!.id), item.post];
        setBookmarkCollectionContents(byCollection);
        setBookmarkedPosts([...new Map((rows as { post: Post | null }[]).map((item) => item.post).filter((post): post is Post => Boolean(post)).map((post) => [post.id, post])).values()]);
      }
      setFavoriteCollection(result.collectionId);
      toast("已加入协作收藏夹");
    } catch (error) { toast(error instanceof Error ? error.message : "加入失败"); }
  };
  useEffect(() => {
    let active = true;
    if (!accountId) {
      setBookmarkCollections([]);
      setBookmarkMembership({});
      setBookmarkedPosts([]);
      setBookmarkCollectionContents({});
      setCreatorCenter(null);
      return;
    }
    void cloudRequest("/api/v1/bookmark-collections").then((data) => {
      if (!active || !data) return;
      setBookmarkCollections(Array.isArray(data.collections) ? data.collections : []);
      const rows = data.bookmarks || [];
      setBookmarkMembership(Object.fromEntries(rows.filter((item: { userId: string }) => item.userId === accountId).map((item: { postId: string; collectionId: string | null }) => [item.postId, item.collectionId])));
      const byCollection: Record<string, Post[]> = {};
      for (const item of rows as { collectionId: string | null; post: Post | null }[]) if (item.collectionId && item.post) byCollection[item.collectionId] = [...(byCollection[item.collectionId] || []).filter((post) => post.id !== item.post!.id), item.post];
      setBookmarkCollectionContents(byCollection);
      setBookmarkedPosts([...new Map((rows as { post: Post | null }[]).map((item) => item.post).filter((post): post is Post => Boolean(post)).map((post) => [post.id, post])).values()]);
    }).catch(() => {});
    return () => { active = false; };
  }, [accountId]);
  useEffect(() => {
    if (!accountId) return;
    const sync = () => void cloudRequest("/api/v1/bookmark-collections").then((data) => {
      if (!data) return;
      setBookmarkCollections(data.collections || []);
      const rows = data.bookmarks || [];
      setBookmarkMembership(Object.fromEntries(rows.filter((item: { userId: string }) => item.userId === accountId).map((item: { postId: string; collectionId: string | null }) => [item.postId, item.collectionId])));
      const byCollection: Record<string, Post[]> = {};
      for (const item of rows as { collectionId: string | null; post: Post | null }[]) if (item.collectionId && item.post) byCollection[item.collectionId] = [...(byCollection[item.collectionId] || []).filter((post) => post.id !== item.post!.id), item.post];
      setBookmarkCollectionContents(byCollection);
      setBookmarkedPosts([...new Map((rows as { post: Post | null }[]).map((item) => item.post).filter((post): post is Post => Boolean(post)).map((post) => [post.id, post])).values()]);
    }).catch(() => {});
    window.addEventListener("heika-collections-updated", sync);
    return () => window.removeEventListener("heika-collections-updated", sync);
  }, [accountId]);
  useEffect(() => {
    if (tab !== "creator-center" || !accountId) return;
    let active = true;
    setCreatorCenterLoading(true);
    void cloudRequest("/api/v1/creator-center").then((data) => {
      if (active && data) setCreatorCenter(data);
    }).catch((error) => {
      if (active) toast(error instanceof Error ? error.message : "创作者数据加载失败");
    }).finally(() => { if (active) setCreatorCenterLoading(false); });
    return () => { active = false; };
  }, [tab, accountId, toast]);
  const claimCreatorMission = async (missionKey: CreatorMission["key"]) => {
    try {
      const claimed = await cloudRequest("/api/v1/creator-center", { missionKey });
      const [center, summary] = await Promise.all([
        cloudRequest("/api/v1/creator-center"),
        cloudRequest("/api/v1/progression"),
      ]);
      if (center) setCreatorCenter(center);
      if (summary) setExperienceSummary(summary);
      toast(claimed?.claimed ? `任务完成，获得 ${claimed.points} EXP` : "本周奖励已经领取");
    } catch (error) { toast(error instanceof Error ? error.message : "领取失败，请重试"); }
  };
  const chooseHomeMode = (mode: "waterfall" | "blackcard") => {
    update((current) => ({ ...current, homeMode: mode }));
    void browserDb().then(async (db) => {
      const { data } = await db.auth.getUser();
      if (data.user) {
        const { error } = await db.from("browsing_preferences").upsert({ user_id: data.user.id, home_mode: mode });
        if (error) toast("同步失败，请重试");
      }
    }).catch(() => {});
  };
  const renderPreferencePreview = (kind: string, value: string) => (
    <span className={`preference-preview preview-${kind} preview-${value}`} aria-hidden="true">
      {kind === "font" ? <><b>黑卡 HEIKA</b><span>发现值得收藏的灵感</span><small>Aa 0123</small></> :
        kind === "theme" ? <><i /><i /><i /><b /></> :
        kind === "reading" ? <><b>一段值得慢慢读下去的文字</b><i /><i /><i /><small>黑卡 · 阅读体验</small></> :
        kind === "notifications" ? <><b>黑卡提醒</b><i /><i /><i /></> :
        <><i /><i /><i /><i /><i /></>}
    </span>
  );
  const submitRating = async (postId: number, score: number) => {
    if (ratingBusy.current) return;
    ratingBusy.current = true;
    update((s) => ({ ...s, ratings: { ...s.ratings, [postId]: score } }));
    setRatingPulse({ postId, score });
    if (ratingPulseTimer.current !== null) window.clearTimeout(ratingPulseTimer.current);
    ratingPulseTimer.current = window.setTimeout(() => setRatingPulse(null), 1200);
    try {
      if (!accountId) {
        toast("评分已保存在本机；登录后可计入社区均分与推荐");
        return;
      }
      const result = await cloudRequest(`/api/v1/posts/${postId}/rating`, { rating: score });
      setCommunityRatings((current) => ({ ...current, [postId]: { average: result.average, count: result.count } }));
      if (result.experience?.total !== undefined) {
        void cloudRequest("/api/v1/progression").then((summary) => {
          if (summary && Number.isFinite(summary.total)) setExperienceSummary(summary);
          else setExperienceSummary((current) => ({ ...current, total: result.experience.total }));
        }).catch(() => setExperienceSummary((current) => ({ ...current, total: result.experience.total })));
      }
      if (result.experience?.awarded) toast(`已评分 · 获得 ${result.experience.awarded} 点经验`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "评分暂未同步，请稍后重试");
    } finally {
      ratingBusy.current = false;
    }
  };
  const toggleDiscoveryLike = async (postId: number) => {
    if (discoveryLikeBusyRef.current.has(postId)) return;
    discoveryLikeBusyRef.current.add(postId);
    const wasLiked = Boolean(state.liked?.includes(postId));
    const nextLiked = !wasLiked;
    setDiscoveryLikeBusy((current) => ({ ...current, [postId]: true }));
    update((current) => ({
      ...current,
      liked: nextLiked
        ? [...new Set([...(current.liked || []), postId])]
        : (current.liked || []).filter((id) => id !== postId),
    }));
    try {
      await cloudRequest("/api/v1/library-state", { action: "like", id: postId, value: nextLiked });
    } catch {
      update((current) => ({
        ...current,
        liked: wasLiked
          ? [...new Set([...(current.liked || []), postId])]
          : (current.liked || []).filter((id) => id !== postId),
      }));
      toast("点赞暂未同步，已恢复原状态");
    } finally {
      discoveryLikeBusyRef.current.delete(postId);
      setDiscoveryLikeBusy((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
    }
  };
  const claimExperienceReward = async (level: number) => {
    if (!accountId) {
      toast("登录后即可领取并同步等级奖励");
      return;
    }
    if (rewardClaimBusyLevel !== null) return;
    setRewardClaimBusyLevel(level);
    try {
      const result = await cloudRequest("/api/v1/progression", { level });
      const summary = await cloudRequest("/api/v1/progression");
      if (summary && Number.isFinite(summary.total)) setExperienceSummary(summary);
      toast(result?.claimed ? `LV.${level} 奖励已领取并保存到账号` : `LV.${level} 奖励此前已领取`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "奖励领取失败，请稍后重试");
    } finally {
      setRewardClaimBusyLevel(null);
    }
  };
  const submitContentReport = async () => {
    if (reportSubmitting) return;
    if (!accountId) return toast("登录后可以举报内容");
    if ((!reportPostId && !reportCommentId) || !reportReason) return toast("请选择举报原因");
    setReportSubmitting(true);
    try {
      const result = await cloudRequest("/api/v1/reports", { ...(reportCommentId ? { comment_id: reportCommentId } : { post_id: reportPostId }), reason: reportReason, note: reportNote });
      if (!result?.submitted) throw new Error("登录状态已失效，请重新登录后重试");
      setModal(null); setReportPostId(null); setReportCommentId(null); setReportReason(""); setReportNote("");
      toast(result?.duplicate ? "你已举报过这篇内容，平台会继续处理" : "举报已提交，平台会进行人工复核");
    } catch (error) {
      toast(error instanceof Error ? error.message : "举报提交失败，请稍后重试");
    } finally { setReportSubmitting(false); }
  };
  const resetToFreshStart = async () => {
    if (resetBusy) return;
    setResetBusy(true);
    try {
      if (accountId) await cloudRequest("/api/v1/library-state", { action: "reset" });
      localStorage.removeItem("heika-demo-v1");
      localStorage.removeItem(storageKey);
      if (accountId) localStorage.removeItem(`heika-user-${accountId}`);
      localStorage.removeItem("heika-theme");
      localStorage.removeItem("heika-font");
      localStorage.removeItem("heika-bottom-nav-style");
      localStorage.removeItem("heika-bottom-nav-style-explicit");
      localStorage.removeItem("heika-detail-transition");
      localStorage.removeItem("heika-detail-transition-explicit");
      setState({ ...initial, cardIds: state.cardIds });
      setPublicBookmarks(false);
      setPublicBookmarksLoaded(true);
      setTheme("dark");
      setFontChoice("oppo");
      localStorage.setItem("heika-bottom-nav-style", "glass");
      setDetailTransition("blur-rise");
      setSelectedCalendarDate("");
      setTab("today");
      imageSwitchSequence.current += 1;
      setImageLoading(false);
      setDetail(null);
      setDetailReady(false);
      setTransitionPhase(null);
      setViewerId(null);
      setViewerPhase(null);
      setViewerFlipped(false);
      setModal(null);
      setPage(12);
      window.scrollTo({ top: 0, behavior: "instant" });
      toast("已重置为新人状态");
    } catch (error) {
      toast(error instanceof Error ? error.message : "重置失败，请稍后重试");
    } finally {
      setResetBusy(false);
    }
  };
  const findVisibleCard = (id: number) => {
    const selector =
      viewerId === id
        ? `[data-window-card-id="${id}"]`
        : `[data-card-id="${id}"]`;
    const source =
      document.querySelector<HTMLElement>(selector) ||
      document.querySelector<HTMLElement>(`[data-discover-id="${id}"]`);
    if (!source) return null;
    const rect = source.getBoundingClientRect();
    return rect.bottom > 0 &&
      rect.top < innerHeight &&
      rect.right > 0 &&
      rect.left < innerWidth
      ? rect
      : null;
  };
  const openPost = (
    id: number,
    source?: "today" | "discover",
    sourceElement?: Element | null,
    resolvedPost?: Post,
    options?: { instant?: boolean; fromRoute?: boolean },
  ) => {
    if (source) detailSource.current = source;
    if (
      transitionBusy.current ||
      detail !== null ||
      (!resolvedPost && !all.some((p) => p.id === id))
    )
      return;
    if (pageTransition.current) {
      const activeTransition = pageTransition.current;
      const resume = () => {
        if (pageTransition.current === activeTransition) pageTransition.current = null;
        openPost(id, source, sourceElement, resolvedPost);
      };
      void activeTransition.finished.then(resume, resume);
      return;
    }
    const explicitSource = sourceElement?.closest<HTMLElement>(
      `[data-window-card-id="${id}"], [data-card-id="${id}"], [data-discover-id="${id}"]`,
    ) || sourceElement;
    const explicitImage = explicitSource instanceof HTMLImageElement
      ? explicitSource
      : explicitSource?.querySelector<HTMLImageElement>("img");
    const selectors = source === "today" && viewerId === id
      ? [`[data-window-card-id="${id}"] img`]
      : source === "discover"
        ? [`[data-discover-id="${id}"] img`]
        : source === "today"
          ? [`[data-card-id="${id}"] img`]
          : [
              `[data-window-card-id="${id}"] img`,
              `[data-card-id="${id}"] img`,
              `[data-discover-id="${id}"] img`,
            ];
    const sourceImage = (explicitImage && (() => {
      const rect = explicitImage.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? explicitImage : undefined;
    })()) || selectors
      .flatMap((selector) => [...document.querySelectorAll<HTMLImageElement>(selector)])
      .find((image) => {
        const rect = image.getBoundingClientRect();
        const style = getComputedStyle(image);
        return style.display !== "none" && style.visibility !== "hidden" &&
          rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight &&
          rect.right > 0 && rect.left < innerWidth;
      });
    const sourceRect = sourceImage?.getBoundingClientRect();
    const sourceImageUrl = sourceImage?.currentSrc || sourceImage?.src;
    scrollBeforeDetail.current = window.scrollY;
    imageSwitchSequence.current += 1;
    setActiveImageIndex(0);
    setDisplayedImageIndex(0);
    setImageLoading(false);
    setPreviewImage(false);
    const cachedDetail = detailPostCache.current.get(id);
    setDetailPostOverride(cachedDetail && Date.now() - cachedDetail.at < 45 * 60 * 1000
      ? cachedDetail.post
      : all.find((post) => post.id === id) || resolvedPost || null);
    setDetailImageTransition(
      detailTransition === "image-zoom" && sourceImage && sourceRect && sourceImageUrl && sourceRect.width && sourceRect.height
        ? { rect: sourceRect, src: sourceImageUrl, sourceImage }
        : null,
    );
    if (viewerId === id) {
      cancelFlipRain(id);
      if (rarityRevealTimer.current !== null) window.clearTimeout(rarityRevealTimer.current);
      setViewerRevealPhase(null);
      setViewerId(null);
      setViewerFlipped(false);
      setViewerPhase(null);
    }
    void cloudRequest("/api/v1/library-state", { action: "view", id }).catch(
      () => {},
    );
    const instant = options?.instant === true;
    transitionBusy.current = !instant;
    setDetailReady(instant);
    setDetail(id);
    setTransitionPhase(instant ? null : "opening");
    // 详情地址：桌面用独立页面 /p/<id>，可以刷新、复制、新标签页打开；
    // 窄屏与 APP 内嵌仍保持浮层，只记录一条历史用于返回。
    if (options?.fromRoute) {
      // 从 /p/<id> 直接进来：地址已就位，关闭时用 replaceState 回列表，不再压栈。
      detailNoHistory.current = true;
      history.replaceState({ ...history.state, heikaDetail: undefined }, "", location.pathname + location.search);
    } else if (desktopLayout && !appEmbed) {
      detailNoHistory.current = false;
      history.pushState({ ...history.state, heikaDetail: id }, "", `/p/${id}`);
    } else {
      detailNoHistory.current = false;
      history.pushState({ ...history.state, heikaDetail: id }, "");
    }
    update((s) => ({
      ...s,
      viewed: [id, ...s.viewed.filter((x) => x !== id)].slice(0, 50),
    }));
  };
  const openExplorationAdPost = async (sourceElement: Element) => {
    if (!explorationAd?.post_client_id) return;
    const existing = all.find((post) => post.id === explorationAd.post_client_id);
    if (existing) { openPost(existing.id, "discover", sourceElement); return; }
    try {
      const response = await fetch(`/api/v1/posts/${encodeURIComponent(explorationAd.post_id)}`, { cache: "no-store" });
      const result = await response.json();
      const post = result?.data as Post | undefined;
      if (!response.ok || !post || post.id !== explorationAd.post_client_id || post.status !== "published") throw new Error("作品暂不可用");
      openPost(post.id, "discover", sourceElement, post);
    } catch { toast("这篇作品暂时无法打开，请稍后重试"); }
  };
  const cancelFlipRain = (id?: number) => {
    if (id !== undefined && flipRainId !== id) return;
    if (flipRainTimer.current !== null) window.clearTimeout(flipRainTimer.current);
    flipRainTimer.current = null;
    setFlipRainId(null);
  };
  const openPostRef = useRef(openPost);
  openPostRef.current = openPost;
  // APP 内嵌打开时，网页只保留业务内容：顶栏、底栏与发布按钮由原生容器提供，
  // 避免出现两套导航和重复的下载入口。
  useEffect(() => {
    if (!isAppEmbed()) return;
    document.documentElement.dataset.appEmbed = "1";
    setAppEmbed(true);
    // 引导页只属于网页端首次访问，容器里直接跳过。
    update((current) => current.onboardingDone ? current : { ...current, onboardingDone: true });
  }, []);
  // 从 APP 的「底栏装扮 / 卡片装扮 / 创意工坊」直接进入对应页面，不经过网页首页。
  const sharedDecorHandled = useRef<string | null>(null);
  useEffect(() => {
    const target = new URLSearchParams(location.search).get("decor");
    if (!ready || !target || sharedDecorHandled.current === target) return;
    sharedDecorHandled.current = target;
    setDecorKind(target === "card" ? "card" : target === "bar" ? "bottom" : "all");
    setDecorTab(target === "gallery" ? "official" : "studio");
    setDecorOpen(true);
  }, [ready]);
  // 从 APP 的「今日任务 / 探索中心 / 编辑资料」直接进入对应页面（需求 4.2 / 6.3）。
  const sharedMineHandled = useRef<string | null>(null);
  useEffect(() => {
    const target = new URLSearchParams(location.search).get("mine");
    if (!ready || !target || sharedMineHandled.current === target) return;
    sharedMineHandled.current = target;
    if (target === "explore") {
      openExplorationCenter();
    } else if (target === "missions") {
      setTab("mine");
      setMissionsOpen(true);
    } else if (target === "profile") {
      // APP 小铅笔进入应用内网页编辑个人资料，保存成功后由桥接返回并刷新原生主页。
      openSettingsDetail("profile", "mine");
    }
  }, [ready]);
  useEffect(() => {
    const sharedId = new URLSearchParams(location.search).get("profile");
    if (!ready || !sharedId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sharedId) || sharedProfileHandled.current === sharedId) return;
    sharedProfileHandled.current = sharedId;
    setAuthorProfile(sharedId);
  }, [ready]);
  useEffect(() => {
    const sharedId = new URLSearchParams(location.search).get("post");
    if (!ready || !sharedId || detail !== null || sharedPostHandled.current === sharedId) return;
    const id = Number(sharedId);
    if (!Number.isFinite(id) || !all.some((item) => item.id === id)) return;
    sharedPostHandled.current = sharedId;
    openPostRef.current(id, "discover");
  }, [ready, detail, all]);
  const sharedPostLoading = useRef<string | null>(null);
  useEffect(() => {
    const sharedId = new URLSearchParams(location.search).get("post");
    const id = Number(sharedId);
    if (!ready || !sharedId || !Number.isSafeInteger(id) || all.some((item) => item.id === id) || sharedPostLoading.current === sharedId) return;
    sharedPostLoading.current = sharedId;
    void cloudFetch("/api/demo/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      .then((response) => response.json().then((result) => ({ response, result })))
      .then(({ response, result }) => {
        if (response.ok && result.data) setPublicFeed((current) => current.some((post) => post.id === id) ? current : [...current, result.data as Post]);
      })
      .catch(() => {})
      .finally(() => { sharedPostLoading.current = null; });
  }, [ready, all]);

  // /p/<id> 直达：数据就绪后按编号打开。列表里没有时单独取一次，失败给出可重试的状态。
  const routePostHandled = useRef(false);
  const routeAborted = useRef(false);
  const [routeRetry, setRouteRetry] = useState(0);
  useEffect(() => {
    if (!initialPostId || !ready || routePostHandled.current || detailRouteState !== "loading") return;
    const cached = all.find((item) => item.id === initialPostId);
    if (cached) {
      routePostHandled.current = true;
      setDetailRouteState(null);
      openPostRef.current(initialPostId, "discover", null, cached, { instant: true, fromRoute: true });
      return;
    }
    routePostHandled.current = true;
    const settle = (found: Post | null) => {
      // 用户在内容到位前已经切走：不要再弹出详情，也不要覆盖已清空的加载态。
      if (routeAborted.current) return;
      if (!found) { setDetailRouteState("missing"); return; }
      setPublicFeed((current) => current.some((item) => item.id === found.id) ? current : [...current, found]);
      setDetailRouteState(null);
      requestAnimationFrame(() => openPostRef.current(found.id, "discover", null, found, { instant: true, fromRoute: true }));
    };
    void fetch("/api/v1/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [initialPostId] }),
      cache: "no-store",
    })
      .then((response) => response.json().then((result) => ({ ok: response.ok, result })))
      .then(({ ok, result }) => (ok ? ((result?.data?.items as Post[] | undefined)?.[0] ?? null) : null))
      // 未登录访客按编号取内容会被拒；退回公开卡片接口，让分享链接和刷新对新访客同样可读。
      .then((found) => found ?? cloudFetch("/api/demo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: initialPostId }),
        cache: "no-store",
      })
        .then((response) => response.json().then((result) => ({ ok: response.ok, result })))
        .then(({ ok, result }) => (ok ? ((result?.data as Post | undefined) ?? null) : null)))
      .then((found) => settle(found ?? null))
      .catch(() => { routePostHandled.current = false; setDetailRouteState("error"); });
  }, [ready, initialPostId, all, detailRouteState, routeRetry]);
  const closeDetail = (fromHistory = false) => {
    if (detail === null || transitionPhase === "closing") return;
    if (!fromHistory && detailNoHistory.current) {
      detailNoHistory.current = false;
      history.replaceState({ ...history.state, heikaDetail: undefined }, "", "/");
      closeDetail(true);
      return;
    }
    if (!fromHistory && history.state?.heikaDetail === detail) {
      history.back();
      return;
    }
    if (transitionBusy.current) {
      window.setTimeout(() => closeDetail(true), 420);
      return;
    }
    imageSwitchSequence.current += 1;
    setImageLoading(false);
    transitionBusy.current = true;
    setDetailReady(false);
    setTransitionPhase("closing");
  };
  // 顶栏入口切换：详情页模式下先离开详情，否则详情与列表会同时挂载、互相挤窄。
  const leaveDetailThen = (run: () => void) => {
    if (detailPageMode) {
      detailNoHistory.current = false;
      history.replaceState({ ...history.state, heikaDetail: undefined }, "", "/");
      closeDetail(true);
    } else if (detailRouteState !== null) {
      // 直达内容还在路上就被切走：清掉加载/错误态，列表马上可见。
      routeAborted.current = true;
      setDetailRouteState(null);
    }
    run();
  };
  useLayoutEffect(() => {
    if (detail === null) return;
    // 独立详情页用整页滚动：不锁 body，也不保留列表滚动位置在文档里。
    const pageMode = desktopLayout && !appEmbed;
    const body = document.body,
      previousOverflow = body.style.overflow,
      previousPadding = body.style.paddingRight,
      previousScrollRestoration = history.scrollRestoration,
      gutter = Math.max(0, innerWidth - document.documentElement.clientWidth);
    history.scrollRestoration = "manual";
    if (!pageMode) {
      body.style.overflow = "hidden";
      if (gutter) body.style.paddingRight = `${gutter}px`;
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      // 返回列表时回到进入详情前的滚动位置。
      window.scrollTo({ top: scrollBeforeDetail.current, behavior: "instant" });
      history.scrollRestoration = previousScrollRestoration;
    };
  }, [detail, desktopLayout, appEmbed]);
  useEffect(() => {
    const onBack = () => {
      if (detail !== null) closeDetail(true);
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [detail, transitionPhase]);
  useLayoutEffect(() => {
    if (!viewerPhase || viewerId === null) return;
    const opening = viewerPhase === "opening",
      rect = viewerRect,
      stage = viewerStageRef.current,
      reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animation: Animation | undefined;
    const finish = () => {
      if (opening) setViewerPhase(null);
      else {
        setViewerId(null);
        setViewerFlipped(false);
        setViewerRevealPhase(null);
        setViewerPhase(null);
      }
    };
    if (reduced) {
      finish();
      return;
    }
    if (!rect || !stage) {
      const node = document.querySelector<HTMLElement>(".flip-stage");
      if (node) {
        animation = node.animate(
          opening
            ? [
                { opacity: 0, transform: "scale(.86)" },
                { opacity: 1, transform: "scale(1)" },
              ]
            : [
                { opacity: 1, transform: "scale(1)" },
                { opacity: 0, transform: "scale(.88)" },
              ],
          { duration: 240, easing: "ease-out", fill: "forwards" },
        );
        animation.onfinish = finish;
      } else finish();
      return () => animation?.cancel();
    }
    stage.style.transformOrigin = "top left";
    const target = stage.getBoundingClientRect(),
      first = `translate3d(${rect.left - target.left}px,${rect.top - target.top}px,0) scale(${rect.width / target.width},${rect.height / target.height})`;
    animation = stage.animate(
      opening
        ? [
            { transform: first, borderRadius: "7px", opacity: 1 },
            {
              transform: "translate3d(0,0,0) scale(1)",
              borderRadius: "8px",
              opacity: 1,
            },
          ]
        : [
            {
              transform: "translate3d(0,0,0) scale(1)",
              borderRadius: "8px",
              opacity: 1,
            },
            { transform: first, borderRadius: "7px", opacity: 1 },
          ],
      {
        duration: 380,
        easing: "cubic-bezier(.22,.72,.18,1)",
        fill: "forwards",
      },
    );
    animation.onfinish = finish;
    return () => animation?.cancel();
  }, [viewerPhase, viewerId, viewerRect]);
  useLayoutEffect(() => {
    if (!transitionPhase) return;
    const opening = transitionPhase === "opening";
    const usesImageZoom = detailTransition === "image-zoom";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let imageAnimation: Animation | undefined;
    let imageClone: HTMLImageElement | null = null;
    let imageTarget: HTMLImageElement | null = null;
    let cancelled = false;
    let finished = false;
    let detailAnimationFinished = false;
    let imageAnimationPending = false;
    const finish = () => {
      if (finished || cancelled) return;
      finished = true;
      imageTarget?.style.removeProperty("visibility");
      imageClone?.remove();
      if (opening) {
        setDetailReady(true);
      } else {
        setDetail(null);
        setDetailReady(false);
        setDetailImageTransition(null);
      }
      setTransitionPhase(null);
      transitionBusy.current = false;
    };
    const settle = () => {
      if (detailAnimationFinished && !imageAnimationPending) finish();
    };
    const detailNode = document.querySelector<HTMLElement>(".overlay .detail");
    if (!detailNode || reduced) {
      finish();
      return;
    }
    const duration = usesImageZoom ? (opening ? 320 : 240) : (opening ? 220 : 180);
    // 动画结束依赖 Web Animations 的 onfinish；图片解码慢、元素被替换、
    // 或浏览器丢帧都可能让它不触发。到点强制收尾，保证内容和滚动一定可用。
    const watchdog = window.setTimeout(finish, duration + 360);
    const animation = detailNode.animate(
      usesImageZoom
        ? opening
          ? [
              { opacity: 1, transform: "translate3d(0,24px,0)" },
              { opacity: 1, transform: "translate3d(0,0,0)" },
            ]
          : [
              { opacity: 1, transform: "translate3d(0,0,0)" },
              { opacity: 1, transform: "translate3d(0,18px,0)" },
            ]
        : opening
          ? [
              { opacity: .82, transform: "translate3d(0,9px,0)" },
              { opacity: 1, transform: "translate3d(0,0,0)" },
            ]
          : [
              { opacity: 1, transform: "translate3d(0,0,0)" },
              { opacity: .82, transform: "translate3d(0,7px,0)" },
            ],
      { duration, easing: "cubic-bezier(.2,.78,.18,1)", fill: "both" },
    );
    animation.onfinish = () => {
      detailAnimationFinished = true;
      settle();
    };
    const transitionImage = detailImageTransition;
    if (usesImageZoom && transitionImage) {
      imageTarget = document.querySelector<HTMLImageElement>(".overlay .detail-image-button img");
      if (imageTarget) {
        imageAnimationPending = true;
        const animateImage = async () => {
          try { await imageTarget?.decode(); } catch {}
          if (cancelled || !imageTarget) return;
          const targetRect = imageTarget.getBoundingClientRect();
          const originRect = transitionImage.rect;
          const from = opening ? originRect : targetRect;
          const returnRect = transitionImage.sourceImage.isConnected
            ? transitionImage.sourceImage.getBoundingClientRect()
            : originRect;
          const to = opening ? targetRect :
            returnRect.width && returnRect.height ? returnRect : originRect;
          if (!from.width || !from.height || !to.width || !to.height || from.bottom < 0 || from.top > innerHeight || to.bottom < 0 || to.top > innerHeight) {
            imageTarget.style.removeProperty("visibility");
            imageAnimationPending = false;
            settle();
            return;
          }
          imageClone = new Image();
          imageClone.src = transitionImage.src;
          try { await imageClone.decode(); } catch {}
          if (cancelled || !imageClone) return;
          imageClone.alt = "";
          imageClone.setAttribute("aria-hidden", "true");
          Object.assign(imageClone.style, {
            position: "fixed",
            left: `${from.left}px`,
            top: `${from.top}px`,
            width: `${from.width}px`,
            height: `${from.height}px`,
            objectFit: "cover",
            objectPosition: "center",
            zIndex: "120",
            pointerEvents: "none",
            transformOrigin: "top left",
            willChange: "transform,border-radius",
          });
          document.body.appendChild(imageClone);
          imageTarget.style.setProperty("visibility", "hidden");
          const translateX = to.left - from.left;
          const translateY = to.top - from.top;
          const scaleX = to.width / from.width;
          const scaleY = to.height / from.height;
          imageAnimation = imageClone.animate(
            [
              { transform: "translate3d(0,0,0) scale(1)", borderRadius: "6px" },
              { transform: `translate3d(${translateX}px,${translateY}px,0) scale(${scaleX},${scaleY})`, borderRadius: "0px" },
            ],
            { duration, easing: "cubic-bezier(.2,.78,.18,1)", fill: "both" },
          );
          imageAnimation.onfinish = () => {
            imageTarget?.style.removeProperty("visibility");
            imageClone?.remove();
            imageClone = null;
            imageAnimationPending = false;
            settle();
          };
        };
        void animateImage().catch(() => {
          imageTarget?.style.removeProperty("visibility");
          imageClone?.remove();
          imageClone = null;
          imageAnimationPending = false;
          settle();
        });
      }
    }
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      animation?.cancel();
      imageAnimation?.cancel();
      imageTarget?.style.removeProperty("visibility");
      imageClone?.remove();
    };
  }, [transitionPhase, detailImageTransition, detailTransition]);
  const toggleSave = async (id: number) => {
    const value = !state.saved.includes(id);
    try {
      await cloudRequest("/api/v1/library-state", {
        action: "bookmark",
        id,
        value,
      });
      update((s) => ({
        ...s,
        saved: value ? [id, ...s.saved] : s.saved.filter((x) => x !== id),
        savedFrom: { ...s.savedFrom, [id]: detailSource.current },
      }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "收藏失败");
    }
  };
  const flip = (id: number, origin?: Element) => {
    if (flipBusy.current || justFlippedId === id || transitionBusy.current)
      return;
    if (opened.includes(id) && state.revealed[id]) {
      setViewerRect(origin?.getBoundingClientRect() || findVisibleCard(id));
      setViewerId(id);
      setViewerFlipped(true);
      setViewerRevealPhase("content");
      setViewerPhase("opening");
      return;
    }
    if (!accountId && opened.length >= dailyAllowance) {
      toast(`今天的 ${dailyAllowance} 张卡片已经选完，已解锁内容仍可查看。`);
      return;
    }
    setViewerFlipped(false);
    setViewerRevealPhase(null);
    setViewerRect(origin?.getBoundingClientRect() || findVisibleCard(id));
    setViewerId(id);
    setViewerPhase("opening");
  };
  const chooseBlackFacet = (facet: number, origin?: Element) => {
    if (!candidates.length) {
      toast("内容池暂时为空，请稍后刷新。");
      return;
    }
    const available = candidates.filter(
      (candidate) => !opened.includes(candidate.id),
    );
    const unlocked = candidates.filter((candidate) => opened.includes(candidate.id) && Boolean(state.revealed[candidate.id]));
    const pool = opened.length < dailyAllowance || accountId ? [...available, ...unlocked] : unlocked;
    if (!pool.length) {
      toast(`今天的 ${dailyAllowance} 张卡片已经选完，已解锁内容仍可查看。`);
      return;
    }
    const assigned = candidates.find((candidate, candidatePosition) =>
      opened.includes(candidate.id) && Boolean(state.revealed[candidate.id]) &&
      (state.facetSlots?.[candidate.id] ?? candidatePosition % blackCardFacets.length) === facet,
    );
    const candidate = assigned || pool[(facetIndex + facet) % pool.length];
    const candidateIndex = candidates.findIndex((item) => item.id === candidate.id);
    setFacetIndex(candidateIndex + 1);
    setState((current) => ({
      ...current,
      facetSlots: { ...(current.facetSlots || {}), [candidate.id]: facet },
    }));
    flip(candidate.id, origin);
  };
  const completeFlip = async () => {
    if (viewerId === null || flipBusy.current) return;
    const id = viewerId,
      used = state.opened[today] || [],
      scrollBefore = window.scrollY;
    if (!accountId && used.length >= dailyAllowance && !used.includes(id)) {
      toast(`今天的 ${dailyAllowance} 张卡片已经选完，已解锁内容仍可查看。`);
      closeViewer();
      return;
    }
    flipBusy.current = true;
    setFlippingId(id);
    setFlipError(null);
    try {
      let revealedData: Post;
      let lucky = 0;
      let authoritativeOpened: number[] | null = null;
      let authoritativeDay = today;
      let authoritativeAllowance = dailyAllowance;
      let authoritativeBonus: number | null = null;
      if (accountId) {
        const confirmed = await cloudRequest("/api/v1/library-state", {
          action: "flip",
          id,
          idempotencyKey: `flip:${today}:${id}`,
        });
        if (!confirmed) throw new Error("登录状态已失效，请重新登录后重试");
        if (!confirmed?.post || !confirmed?.flipState) throw new Error("翻卡结果暂不可用，请重试");
        revealedData = confirmed.post as Post;
        authoritativeDay = String(confirmed.flipState.localDate || today);
        authoritativeOpened = Array.isArray(confirmed.flipState.openedIds)
          ? (confirmed.flipState.openedIds as unknown[]).map((value) => Number(value)).filter((value): value is number => Number.isSafeInteger(value) && value > 0)
          : null;
        authoritativeAllowance = Number(confirmed.flipState.allowance) || dailyAllowance;
        const serverBonus = Number(confirmed.flipState.bonus);
        if (Number.isFinite(serverBonus)) authoritativeBonus = Math.min(10, Math.max(0, serverBonus));
        lucky = confirmed.flipState.idempotent ? 0 : Number(confirmed.flipState.bonusAwarded) || 0;
        setAccountTimezone(typeof confirmed.flipState.timezone === "string" ? confirmed.flipState.timezone : accountTimezone);
        const confirmedExpiry = Date.parse(String(confirmed.flipState.cycleExpiresAt || ""));
        if (Number.isFinite(confirmedExpiry)) setCycleExpiry(confirmedExpiry);
        const confirmedStart = Date.parse(String(confirmed.flipState.cycleStartedAt || ""));
        if (Number.isFinite(confirmedStart)) setCycleStart(confirmedStart);
        if (["free", "plus", "pro"].includes(confirmed.flipState.membershipTier)) {
          setExperienceSummary((current) => ({ ...current, membershipTier: confirmed.flipState.membershipTier }));
        }
        if (confirmed.experience) {
          void cloudRequest("/api/v1/progression").then((summary) => {
            if (summary && Number.isFinite(summary.total)) setExperienceSummary(summary);
          }).catch(() => {});
        }
      } else {
        const response = await cloudFetch("/api/demo/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const result = await response.json();
        if (!response.ok || !result.data) throw new Error(result.error || "卡片加载失败");
        revealedData = result.data as Post;
        lucky = used.includes(id) || luckyBonusToday >= 10
          ? 0
          : Math.min(drawLuckyBonus(), 10 - luckyBonusToday);
      }
      const nextLuckyBonus = { ...state.luckyBonus };
      if (accountId && authoritativeBonus !== null) {
        // The server's running bonus is account-wide; don't add it a second
        // time when a timed-out request is retried idempotently.
        nextLuckyBonus[authoritativeDay] = authoritativeBonus;
      } else if (lucky > 0) {
        nextLuckyBonus[authoritativeDay] = luckyBonusToday + lucky;
      }
      const rarityTier = (revealedData.rarityTier || cardRarityTier(
        communityRatings[id]?.average || 0,
        communityRatings[id]?.count || 0,
      )) as CardRarityTier;
      const revealedPost: Post = { ...revealedData, rarityTier };
      setState((current) => ({
        ...current,
        luckyBonus: nextLuckyBonus,
        revealed: { ...current.revealed, [id]: revealedPost },
        rarityTiers: { ...current.rarityTiers, [id]: rarityTier },
        opened: {
          ...current.opened,
          [authoritativeDay]: authoritativeOpened || openDailyCard(current.opened[authoritativeDay] || used, id, authoritativeAllowance),
        },
      }));
      setViewerFlipped(true);
      setViewerRevealPhase("rarity");
      if (rarityRevealTimer.current !== null) window.clearTimeout(rarityRevealTimer.current);
      rarityRevealTimer.current = window.setTimeout(() => {
        rarityRevealTimer.current = null;
        setViewerRevealPhase("content");
      }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900);
      if (lucky) {
        if (luckyRewardTimer.current !== null) window.clearTimeout(luckyRewardTimer.current);
        setLuckyReward({ postId: id, amount: lucky });
        luckyRewardTimer.current = window.setTimeout(() => setLuckyReward(null), 3000);
      }
      setJustFlippedId(id);
      cancelFlipRain();
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setFlipRainId(id);
        flipRainTimer.current = window.setTimeout(() => {
          flipRainTimer.current = null;
          setFlipRainId(null);
        }, FLIP_RAIN_CLEANUP_MS);
      }
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      requestAnimationFrame(() =>
        window.scrollTo({ top: scrollBefore, behavior: "instant" }),
      );
      window.setTimeout(() => setJustFlippedId(null), 950);
      if (!lucky) toast("已翻开 · 今日探索进度已更新");
    } catch (error) {
      // 失败原因贴在按钮旁常驻展示（13.3），不再用一闪而过的 toast 重复播报。
      const message = error instanceof Error ? error.message : "内容加载失败，请重试";
      const network = error instanceof TypeError || /failed to fetch|network/i.test(message);
      setFlipError(
        /登录|会话/.test(message)
          ? message
          : network
            ? "网络异常，未能确认翻开结果；重试不会重复扣除次数。"
            : message,
      );
    } finally {
      setFlippingId(null);
      flipBusy.current = false;
    }
  };
  const closeViewer = () => {
    if (
      viewerId === null ||
      viewerPhase === "closing" ||
      flipBusy.current ||
      justFlippedId === viewerId
    )
      return;
    cancelFlipRain(viewerId);
    const source = document.querySelector<HTMLElement>(
      `[data-card-id="${viewerId}"]`,
    );
    const rect = source?.getBoundingClientRect() || (state.homeMode === "blackcard" ? viewerRect : null);
    setViewerRect(
      rect && rect.top < innerHeight && rect.bottom > 0 ? rect : null,
    );
    setFlippingId(null);
    if (rarityRevealTimer.current !== null) window.clearTimeout(rarityRevealTimer.current);
    setViewerRevealPhase(null);
    setViewerPhase("closing");
  };
  // 过渡兜底：145/365ms 两个定时器一旦被打断（快速切帖、切标签），
  // reading-out 会把正文留在 opacity .18，看起来就是「文字消失了」。
  // 这里独立于用户操作监控状态，超时即归位。
  useEffect(() => {
    if (!readingTransition) return;
    const timer = window.setTimeout(() => {
      setReadingTransition((current) => current === "out" ? "in" : null);
    }, readingTransition === "out" ? 260 : 240);
    return () => window.clearTimeout(timer);
  }, [readingTransition]);
  const chooseReadingMode = (mode: "standard" | "focus" | "night") => {
    if (mode === state.readingMode) {
      setModal(null);
      return;
    }
    readingTimer.current.forEach(window.clearTimeout);
    setReadingTransition("out");
    readingTimer.current = [
      window.setTimeout(() => {
        update((s) => ({ ...s, readingMode: mode }));
        setReadingTransition("in");
      }, 145),
      window.setTimeout(() => {
        setReadingTransition(null);
        setModal(null);
      }, 365),
    ];
  };
  const toggleNotification = async (key: "messages" | "comments" | "daily") => {
    if (key !== "messages") return toast("该功能正在完善中");
    if (state.notifications[key]) {
      update((s) => ({
        ...s,
        notifications: { ...s.notifications, [key]: false },
      }));
      toast("已保存至此设备");
      return;
    }
    if (notificationPermission === "unsupported" || !("Notification" in window))
      return toast("此浏览器不支持通知");
    let permission = notificationPermission;
    if (permission === "default") {
      try {
        permission = await Notification.requestPermission();
      } catch {
        return toast("无法请求浏览器通知权限");
      }
      setNotificationPermission(permission);
    }
    if (permission === "denied")
      return toast("通知权限已关闭，请在浏览器设置中允许");
    if (permission !== "granted") return toast("尚未获得浏览器通知权限");
    update((s) => ({
      ...s,
      notifications: { ...s.notifications, [key]: !s.notifications[key] },
    }));
    toast("已保存至此设备");
  };
  const clearTodayFlips = async () => {
    if (!opened.length) return toast("今天还没有翻开的卡片");
    if (!await confirmInApp("清除今天的翻卡记录？这些卡片会重新锁定。", {title:"清除翻卡记录",confirmLabel:"清除记录",danger:true})) return;
    update((current) => ({
      ...current,
      opened: { ...current.opened, [today]: [] },
    }));
    toast("今日翻卡次数已清除");
  };
  const addComment = async () => {
    const value = draft.trim();
    if (!detail || !value || commentSending) return;
    if (!accountId) {
      toast("登录后可发表评论");
      setTab("messages");
      return;
    }
    setCommentSending(true);
    try {
      const comment = await cloudRequest("/api/library-comments", {
        post: detail,
        body: value,
        parent: reply,
      });
      if (!comment) return;
      update((s) => ({ ...s, comments: [...s.comments, comment] }));
      setCommentTotal((count) => count + 1);
      const replyRoot = comment.parent || (reply ? state.comments.find((item) => item.id === reply)?.parent || reply : undefined);
      if (replyRoot) setExpandedReplies((current) => ({ ...current, [replyRoot]: true }));
      setDraft("");
      setReply(undefined);
      setReplyTargetName(undefined);
      setCommentInputExpanded(false);
      toast("评论已发布");
      if (replyRoot) requestAnimationFrame(() => document.getElementById(`comment-${replyRoot}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "评论保存失败");
    } finally {
      setCommentSending(false);
    }
  };
  const deleteOwn = async (p: Post) => {
    if (!await confirmInApp("确定删除这篇内容？", {title:"删除作品",confirmLabel:"删除",danger:true})) return;
    try {
      if (p.cloudId)
        await cloudRequest("/api/v1/library-state", {
          action: "delete",
          id: p.id,
        });
      update((s) => ({ ...s, own: s.own.filter((x) => x.id !== p.id) }));
      setPublicFeed((s) => s.filter((x) => x.id !== p.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败");
    }
  };
  const deleteComment = async (c: Comment) => {
    if (!await confirmInApp("删除这条评论？", {title:"删除评论",confirmLabel:"删除",danger:true})) return;
    try {
      if (c.cloudId)
        await cloudRequest("/api/library-comments", {
          action: "delete",
          post: c.post,
          id: c.id,
        });
      update((s) => ({
        ...s,
        // The database keeps replies and clears their parent_id when a parent is deleted.
        // Mirror that behavior locally so those replies remain visible as top-level comments.
        comments: s.comments.filter((x) => x.id !== c.id).map((x) => x.parent === c.id ? { ...x, parent: undefined } : x),
      }));
      setCommentTotal((count) => Math.max(0, count - 1));
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败");
    }
  };
  const copyComment = async (comment: Comment) => {
    try {
      if (!navigator.clipboard) throw new Error("当前浏览器不支持复制");
      await navigator.clipboard.writeText(comment.body);
      toast("评论已复制");
    } catch (error) {
      toast(error instanceof Error ? error.message : "复制失败");
    }
  };
  const focusReply = (parentId: number, name?: string) => {
    setReply(parentId);
    setReplyTargetName(name || "评论");
    setCommentInputExpanded(true);
    requestAnimationFrame(() => commentInputRef.current?.focus());
  };
  const toggleCommentLike = async (comment: Comment) => {
    if (!accountId) { toast("登录后可点赞"); return; }
    if (!comment.cloudId || commentLikeBusy.current.has(comment.id)) return;
    commentLikeBusy.current.add(comment.id);
    const nextLiked = !comment.liked;
    update((current) => ({ ...current, comments: current.comments.map((item) => item.id === comment.id ? { ...item, liked: nextLiked, likes: Math.max(0, item.likes + (nextLiked ? 1 : -1)) } : item) }));
    try {
      await cloudRequest("/api/library-comments", { action: "like", post: comment.post, id: comment.id, value: nextLiked });
    } catch {
      update((current) => ({ ...current, comments: current.comments.map((item) => item.id === comment.id ? { ...item, liked: comment.liked, likes: comment.likes } : item) }));
      toast("点赞未保存，请重试");
    } finally { commentLikeBusy.current.delete(comment.id); }
  };
  /**
   * 选图后立刻预上传到对象存储（staging）：
   * - 只是把文件放进用户自己的未挂接资产里，不创建作品、不进审核；
   * - 用户在发布页继续编辑/调序/换封面都不受影响，离开页面也不会中断；
   * - 点发布时只做「挂接到草稿 → 提交」，不再等整轮上传。
   */
  const preuploadComposerImage = (image: ComposerImage): Promise<string | null> => {
    if (image.external || !image.file || !accountId) return Promise.resolve(null);
    const existing = preuploadRef.current.get(image.id);
    if (existing) return existing;
    const promise = (async () => {
      try {
        const db = await browserDb(); const { data: session } = await db.auth.getSession();
        if (!session.session) throw new Error("登录状态已失效，请重新登录");
        setComposerImages((items) => items.map((item) => item.id === image.id ? { ...item, status: "uploading", progress: 0, uploadPhase: "uploading" } : item));
        const result = await uploadManager.enqueue({
          file: image.file!,
          token: session.session.access_token,
          uploadId: image.id,
          sortOrder: 0,
          target: { kind: "staging" },
          onProgress: (progress) => {
            setComposerImages((items) => items.map((item) => item.id === image.id
              ? { ...item, progress: progress.percent, uploadPhase: progress.phase === "processing" ? "processing" : "uploading" }
              : item));
          },
        });
        setComposerImages((items) => items.map((item) => item.id === image.id
          ? { ...item, path: result.path, status: "ready", progress: 100, uploadPhase: undefined }
          : item));
        return result.path;
      } catch (error) {
        setComposerImages((items) => items.map((item) => item.id === image.id ? { ...item, status: "failed", uploadPhase: undefined } : item));
        preuploadRef.current.delete(image.id);
        if (error instanceof Error && error.message) setComposerError(`有图片上传失败：${error.message}，可在图片上单张重试`);
        return null;
      }
    })();
    preuploadRef.current.set(image.id, promise);
    return promise;
  };
  const uploadImageToPost = async (
    image: ComposerImage,
    postId: string,
    sortOrder: number,
    onProgress?: (progress: { percent: number; phase: "uploading" | "processing" | "done" }) => void,
  ): Promise<ComposerImage> => {
    if (image.external) return image;
    // 预上传中的图片先等它就绪再挂接，避免同一张图被传两次。
    const pending = preuploadRef.current.get(image.id);
    if (pending && !image.path) {
      onProgress?.({ percent: 0, phase: "uploading" });
      const path = await pending;
      if (path) {
        if (!composerRevisionMode) await cloudRequest(`/api/v1/posts/${postId}/media`, { path, sort_order: sortOrder });
        onProgress?.({ percent: 100, phase: "done" });
        return { ...image, path, status: "ready", sortOrder, progress: 100, uploadPhase: undefined };
      }
      // 预上传失败则继续走下面的直传兜底。
    }
    if (image.path) {
      // 已上传过的图片只需按新顺序挂到当前草稿，不再重传文件。
      if (!composerRevisionMode) await cloudRequest(`/api/v1/posts/${postId}/media`, { path: image.path, sort_order: sortOrder });
      onProgress?.({ percent: 100, phase: "done" });
      return { ...image, sortOrder, progress: 100, uploadPhase: undefined };
    }
    if (!image.file || !accountId) throw new Error("登录后可同步草稿图片");
    const db = await browserDb(); const { data: session } = await db.auth.getSession();
    if (!session.session) throw new Error("登录状态已失效，请重新登录");
    const result = await uploadManager.enqueue({
      file: image.file,
      token: session.session.access_token,
      uploadId: image.id,
      sortOrder,
      target: composerRevisionMode ? { kind: "revision", postId } : { kind: "post", postId },
      onProgress,
    });
    return { ...image, path: result.path, status: "ready", sortOrder, progress: 100, uploadPhase: undefined };
  };
  /**
   * 多张图片并发上传（最多 3 张同时在途），并按真实字节汇总总进度。
   * 现在图片在选图时已预上传，这里主要是「等待未完成的预上传 + 挂接到草稿」，
   * 进度来自 uploadManager 的真实字节数（含预上传阶段），不再用估算值。
   */
  const uploadComposerImages = async (
    images: ComposerImage[],
    postId: string,
    onMediaProgress?: (state: { sentBytes: number; totalBytes: number; ready: number; uploading: number; failed: number }) => void,
  ): Promise<ComposerImage[]> => {
    if (!images.length) return [];
    const totalBytes = images.reduce((sum, image) => sum + (image.file?.size || 0), 0);
    const stats = () => {
      let sent = 0, ready = 0, uploading = 0, failed = 0;
      for (const image of images) {
        if (image.external) { ready += 1; continue; }
        const item = uploadManager.findByUploadId(image.id);
        if (image.path || item?.status === "ready") { ready += 1; sent += image.file?.size || item?.size || 0; }
        else if (item?.status === "failed") { failed += 1; sent += item.bytesSent || 0; }
        else { uploading += 1; sent += item?.bytesSent || 0; }
      }
      return { sentBytes: Math.min(sent, totalBytes), totalBytes, ready, uploading, failed };
    };
    const emit = (phase: "uploading" | "processing" | "done") => {
      const current = stats();
      const percent = current.totalBytes > 0
        ? Math.min(99, Math.round((current.sentBytes / current.totalBytes) * 100))
        : Math.min(99, Math.round((current.ready / Math.max(1, images.length)) * 100));
      setImageUploadProgress({ percent, done: current.ready, total: images.length, phase });
      onMediaProgress?.(current);
    };
    setUploadingImages(true);
    emit("uploading");
    const off = uploadManager.subscribe(() => emit("uploading"));
    try {
      const uploaded = await mapWithConcurrency(images, 3, async (image, index) => {
        draftMediaBusy.current.add(image.id);
        setComposerImages((items) => items.map((item) => item.id === image.id ? { ...item, status: "uploading", progress: item.progress ?? 0, uploadPhase: "uploading" } : item));
        try {
          const current = await uploadImageToPost(image, postId, index, () => emit("uploading"));
          setComposerImages((items) => items.map((item) => item.id === image.id ? current : item));
          return current;
        } catch (error) {
          setComposerImages((items) => items.map((item) => item.id === image.id ? { ...item, status: "failed", progress: undefined, uploadPhase: undefined } : item));
          throw error;
        } finally {
          draftMediaBusy.current.delete(image.id);
        }
      });
      setImageUploadProgress({ percent: 100, done: images.length, total: images.length, phase: "done" });
      return uploaded;
    } finally {
      off();
      setUploadingImages(false);
    }
  };
  /** 发布成功后只清「草稿存档」，不动编辑区内容——结果页还要用标题与封面。 */
  const clearComposerDraftStorage = async (channel: "community" | "ai", owner: string) => {
    if (channel === "community") localStorage.removeItem(`heika-compose-${owner}`);
    localStorage.removeItem(`heika-compose-${channel}-${owner}`);
    await clearDraftFiles(`${owner}:${channel}`).catch(() => {});
    if (owner !== "guest") {
      if (channel === "community") localStorage.removeItem("heika-compose-guest");
      localStorage.removeItem(`heika-compose-${channel}-guest`);
      await clearDraftFiles(`guest:${channel}`).catch(() => {});
    }
    composerCloudDrafts.current.delete(`${owner}:${channel}`);
    composerDraftRef.current = null;
    lastDraftPayload.current = "";
    if (localDraftIdRef.current) {
      const removing = localDraftIdRef.current;
      localDraftIdRef.current = null;
      await deleteDraft(removing).catch(() => {});
      setLocalDraftId(null);
      setDraftLocalState("idle");
      void refreshLocalDraftCount();
    }
    pendingAttachmentFiles.current.clear();
    setComposerCheckPhase("idle");
  };
  /** 清空编辑区（结果页「再写一篇 / 完成」时调用），图片 objectURL 在此时才释放。 */
  const resetComposer = () => {
    composerImages.forEach((image) => { if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url); });
    preuploadRef.current.clear();
    setComposerImages([]);
    setTitle("");
    setBody("");
    setPollQuestion("");
    setPollOptions(["", ""]);
    setImageUploadProgress(null);
    setCoverIndex(0);
    setEditing(null);
    setComposerEditingPublished(false);
    setComposerRevisionMode(false);
    setWriteChannel("community");
    setWriteContentType("knowledge_article");
    setAiResourceFields({});
    setComposerAttachments([]);
    setAttachmentError("");
    setComposerValidation("");
    setComposerError("");
    setComposerOutcome(null);
    setResumeTaskKey(null);
    setComposerCheckPhase("idle");
    composerSuggestionRef.current = null;
    setComposerSuggestion(null);
    setComposerTagTouchedState(false);
    composerTagTouchedRef.current = false;
  };
  const finishComposerOutcome = () => { resetComposer(); setModal(null); };
  const startAnotherPost = () => { resetComposer(); void openComposer(); };
  /**
   * 从浮窗/任务中心回到创作页：优先用任务快照里的本机草稿恢复完整现场，
   * 草稿缺失时退回快照文字，图片需要重新选择（不会伪造已上传结果）。
   */
  const resumeComposeFromTask = async (task: PublishTask) => {
    const snapshot = task.snapshot;
    const owner = snapshot?.draftOwner || accountId || "guest";
    let draft: LocalDraft | null = null;
    let draftMissing = false;
    if (snapshot?.localDraftId) {
      draft = await getDraft(owner, snapshot.localDraftId).catch(() => null);
      draftMissing = !draft;
    } else {
      draftMissing = true;
    }
    await openComposer(undefined, snapshot?.channel || "community", draft || undefined);
    if (!draft && snapshot) {
      // 没有本机草稿记录时，至少把文字与分类恢复出来，图片留待重新选择。
      setTitle(snapshot.title || "");
      setBody(snapshot.body || "");
      if (snapshot.tag) setWriteTag(snapshot.tag);
      if (snapshot.topics?.length) setWriteTopics(snapshot.topics);
      setWriteSeriesId(snapshot.seriesId || "");
      if (snapshot.poll?.question) { setPollQuestion(snapshot.poll.question); setPollOptions([...(snapshot.poll.options || []), "", ""].slice(0, 4)); }
    }
    setResumeTaskKey(task.taskKey);
    setComposerError(task.error || "");
    if (draftMissing) toast("已恢复文字内容；图片需要重新选择后再提交");
  };
  const publish = async () => {
    if (publishInFlight.current) return;
    if (!title.trim()) { setComposerValidation("title"); toast("请先填写标题"); document.querySelector<HTMLTextAreaElement>(".composer-title-field textarea")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (!body.trim()) { setComposerValidation("body"); toast("请先填写正文"); document.querySelector<HTMLTextAreaElement>(".composer-body-field textarea")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    setComposerValidation("");
    // 基础校验放在最前面：校验不过就不消耗任何模型额度（需求 6.4 第一步）。
    let channel: "community" | "ai" = writeChannel;
    let contentType: AiContentType = writeContentType;
    let tag = writeTag;
    let topics = writeTopics;
    // 发布前是否已经完成过一次 AI 分类：是则服务端跳过重复的分类入队，只保留安全审核。
    let routeClassifiedByAi = false;
    if (!composerEditingPublished && !composerRouteLocked) {
      setComposerCheckPhase("checking");
      const key = `${title.trim()}\u0000${body.trim()}`;
      const cached = composerSuggestionRef.current;
      // 同一份内容重复点发布：直接复用上次结果，不重复调用模型。
      const suggestion = cached && cached.key === key && !cached.checking ? cached : await runComposerSuggest(key);
      if (suggestion?.route) {
        channel = suggestion.route.channel;
        contentType = suggestion.route.contentType;
        routeClassifiedByAi = suggestion.route.source === "ai";
        if (!composerTagTouchedRef.current) tag = suggestion.route.category;
        if (suggestion.topics.length) topics = [...new Set([...suggestion.topics, ...topics])].slice(0, 5);
      }
      setWriteChannel(channel);
      setWriteContentType(contentType);
      if (!composerTagTouchedRef.current) setWriteTag(tag);
      setComposerCheckPhase("idle");
    }
    const pollDraft = channel === "community" ? { question: pollQuestion.trim(), options: pollOptions.map((option) => option.trim()).filter(Boolean) } : { question:"", options:[] as string[] };
    if ((pollDraft.question || pollDraft.options.length) && (!pollDraft.question || pollDraft.options.length < 2 || pollDraft.options.length > 4)) return toast("投票需要填写问题，并设置 2–4 个选项");
    if (composerMediaLoadFailed) return toast("附件列表尚未恢复，请先重试读取附件");
    if (!tag.trim()) return toast("请选择内容分类");
    if (!accountId) { await flushComposerDraft.current().catch(()=>{}); return toast("请先在消息页面登录，当前输入会保留"); }
    if (composerImages.some(image=>!image.external&&!image.path&&!image.file)) return toast("有图片文件未恢复，请替换后再提交");
    if (draftSaveTimer.current !== null) {
      window.clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = null;
    }
    if (draftSaving) return toast("草稿正在同步，请稍后发布");
    setComposerError("");
    // 先把本机草稿最新状态落盘：任务失败或页面中断后，返回创作可完整恢复现场。
    if (publishInFlight.current) return;
    await flushComposerDraft.current().catch(() => {});
    publishInFlight.current = true;
    setIsPublishing(true);
    const ownerForDraft = accountId || "guest";
    const localDraftForTask = localDraftIdRef.current;
    let publishTaskKey: string | null = null;
    try {
      const old = state.own.find((p) => p.id === editing);
      const coverImagePreview = composerImages[coverIndex];
      const snapshotMedia = composerImages.map((image) => ({
        id: image.id,
        path: image.path || null,
        name: image.file?.name || null,
        size: image.file?.size ?? null,
        external: Boolean(image.external),
        url: image.external ? image.url : null,
      }));
      const snapshotBase = {
        title: title.trim(),
        body,
        tag,
        topics,
        mediaPaths: [] as string[],
        coverUrl: coverImagePreview?.external ? coverImagePreview.url : null,
        seriesId: writeSeriesId || null,
        channel,
        contentType,
        localDraftId: localDraftForTask,
        draftOwner: ownerForDraft,
        media: snapshotMedia,
        coverIndex,
        attachments: composerAttachments,
        poll: pollDraft.question ? pollDraft : null,
      };
      const resumeTask = resumeTaskKey ? publishTaskManager.get(resumeTaskKey) : null;
      if (resumeTask && !["published", "cancelled"].includes(resumeTask.status)) {
        // 同一个任务的重新提交：不新建任务、不新建草稿，避免出现重复条目。
        publishTaskKey = resumeTask.taskKey;
        publishTaskManager.update(publishTaskKey, { status: "task_created", error: null, title: snapshotBase.title, snapshot: snapshotBase, step: "重新提交发布任务" });
      } else {
        // 点击发布即创建全局发布任务（含内容快照），离开页面任务继续，浮窗实时可见。
        const snapshotTask = await publishTaskManager.create({ title: snapshotBase.title, coverUrl: snapshotBase.coverUrl, snapshot: snapshotBase });
        publishTaskKey = snapshotTask.taskKey;
        publishTaskManager.update(publishTaskKey, { status: "task_created", step: "发布任务已创建" });
      }
      const resourceData = Object.fromEntries(Object.entries(aiResourceFields).map(([key, value]) => [key, value.trim()]).filter(([, value]) => Boolean(value)));
      let attachmentPayload = composerAttachments;
      if (composerAttachments.some((item) => item.path.startsWith("local:"))) {
        try { attachmentPayload = await flushPendingAttachments(); }
        catch (error) {
          const message = error instanceof Error ? error.message : "附件上传失败，请稍后重试";
          setAttachmentError(message);
          toast(message);
          if (publishTaskKey) publishTaskManager.update(publishTaskKey, { status: "failed", error: message, step: "附件上传失败" });
          return;
        }
      }
      const draft = composerEditingPublished && old?.cloudId ? old : channel === "ai"
        ? await cloudRequest("/api/v1/ai-space", { action: "draft", id: old?.cloudId, title, body, category: tag, contentType: contentType, resourceData, topics: topics, attachments: attachmentPayload, seriesId: writeSeriesId || null, coverUrl: composerImages[coverIndex]?.external ? composerImages[coverIndex].url : null }) as Post | null
        : await cloudRequest("/api/v1/library-state", { action: "draft", id: old?.cloudId ? old.id : undefined, title, body, tag: tag, topics: topics, attachments: attachmentPayload, seriesId: writeSeriesId || null, poll: pollDraft.question ? pollDraft : null, coverUrl: composerImages[coverIndex]?.external ? composerImages[coverIndex].url : null }) as Post | null;
      if (!draft?.cloudId) throw new Error("草稿保存失败，请重试");
      const cover = composerImages[coverIndex];
      const storageImages = composerImages.filter((image) => !image.external);
      const orderedImages = cover?.external ? storageImages : storageImages.length ? [storageImages.find((image) => image.id === cover?.id), ...storageImages.filter((image) => image.id !== cover?.id)].filter((image): image is ComposerImage => Boolean(image)) : [];
      const readyAtStart = orderedImages.filter((image) => Boolean(image.path)).length;
      if (publishTaskKey) publishTaskManager.update(publishTaskKey, {
        status: readyAtStart === orderedImages.length ? "verifying_media" : readyAtStart > 0 ? "uploading_media" : "waiting_for_media",
        step: orderedImages.length ? (readyAtStart === orderedImages.length ? "图片已就绪，准备提交" : `等待剩余 ${orderedImages.length - readyAtStart} 张图片上传`) : "无需上传图片",
        media: { total: orderedImages.length, ready: readyAtStart, uploading: orderedImages.length - readyAtStart, failed: 0, sentBytes: orderedImages.filter((image) => image.path).reduce((sum, image) => sum + (image.file?.size || 0), 0), totalBytes: orderedImages.reduce((sum, image) => sum + (image.file?.size || 0), 0) },
      });
      const uploaded = await uploadComposerImages(orderedImages, draft.cloudId, (state) => {
        if (!publishTaskKey) return;
        publishTaskManager.progress(publishTaskKey, {
          total: orderedImages.length,
          ready: state.ready,
          uploading: state.uploading,
          failed: state.failed,
          sentBytes: state.sentBytes,
          totalBytes: state.totalBytes,
        }, uploadManager.snapshot().speedBps);
      });
      const mediaPaths = uploaded.map((image) => image.path!);
      if (publishTaskKey) publishTaskManager.update(publishTaskKey, {
        status: "verifying_media",
        step: "图片就绪，开始校验媒体",
        media: { total: uploaded.length, ready: uploaded.length, uploading: 0, failed: 0, sentBytes: uploaded.reduce((sum, image) => sum + (image.file?.size || 0), 0), totalBytes: uploaded.reduce((sum, image) => sum + (image.file?.size || 0), 0) },
      });
      if (publishTaskKey) publishTaskManager.update(publishTaskKey, { status: "submitting_content", step: "正在提交内容" });
      const item = channel === "ai"
        ? await cloudRequest("/api/v1/ai-space", { action: "submit", id: draft.cloudId, title, body, category: tag, topics: topics, contentType: contentType, resourceData, attachments: attachmentPayload, seriesId: writeSeriesId || null, mediaPaths, coverUrl: cover?.external ? cover.url : null, routeConfirmed: routeClassifiedByAi })
        : await cloudRequest("/api/v1/library-state", { action: "publish", id: draft.id, title, body, tag: tag, topics: topics, attachments: attachmentPayload, seriesId: writeSeriesId || null, poll: pollDraft.question ? pollDraft : null, mediaPaths, coverUrl: cover?.external ? cover.url : null, routeConfirmed: routeClassifiedByAi });
      if (!item) {
        if (publishTaskKey) publishTaskManager.update(publishTaskKey, { status: "failed", error: "发布未获得服务端确认，请重试", step: "提交失败" });
        return;
      }
      if (publishTaskKey) {
        const submittedForReview = item.status === "pending_review";
        publishTaskManager.update(publishTaskKey, {
          status: submittedForReview ? "waiting_for_human_review" : item.status === "published" ? "published" : "ai_reviewing",
          step: submittedForReview ? "已提交人工审核" : item.status === "published" ? "发布成功" : "进入审核流程",
          postId: item.cloudId ?? null,
          clientId: item.id ?? null,
          snapshot: { title: title.trim(), body, tag, topics, mediaPaths, coverUrl: cover?.external ? cover.url : null, seriesId: writeSeriesId || null },
        });
      }
      update((s) => ({
        ...s,
        own: [
          item,
          ...s.own.filter((p) => p.id !== editing && p.id !== item.id),
        ],
        cardIds: item.status === "published" ? [...new Set([...s.cardIds, item.id])] : s.cardIds,
      }));
      // 发布成功后不再强制跳回首页：留在创作页展示结果，用户自己决定继续写还是离开。
      const submittedForReview = item.status === "pending_review";
      setComposerOutcome({
        kind: submittedForReview ? "pending_review" : "published",
        title: title.trim(),
        cover: composerImages[coverIndex]?.url || null,
        imageCount: mediaPaths.length,
        clientId: item.id ?? null,
        cloudId: item.cloudId ?? null,
        at: Date.now(),
      });
      setResumeTaskKey(null);
      setComposerError("");
      // 内容已提交：清掉本机草稿与本地缓存，避免下次进入又带出同一篇。
      await clearComposerDraftStorage(channel, ownerForDraft);
      toast(composerRevisionMode ? "修改已提交审核，通过后将更新公开内容" : submittedForReview ? "已提交审核，可以留在这里或直接离开" : "发布成功");
    } catch (e) {
      setUploadingImages(false);
      setComposerCheckPhase("failed");
      const message = e instanceof Error ? e.message : "发布失败，请重试";
      setComposerError(message);
      if (publishTaskKey) publishTaskManager.update(publishTaskKey, { status: "failed", error: message, step: "发布失败" });
      toast(message);
    } finally {
      publishInFlight.current = false;
      setIsPublishing(false);
    }
  };
  const composerMediaUrl = async (path:string) => {
    try { const db=await browserDb();const result=await db.storage.from(mediaBucketForPath(path)).createSignedUrl(path,3600);return result.data?.signedUrl || ""; } catch { return ""; }
  };
  const refreshAttachmentQuota = async () => {
    try {
      const quota = await cloudRequest("/api/v1/attachments") as { used: number; limit: number; remaining: number } | null;
      if (quota) setAttachmentQuota(quota);
    } catch { /* 名额查询失败不阻塞写作 */ }
  };

  useEffect(() => {
    if (modal !== "write") return;
    void refreshAttachmentQuota();
  }, [modal, writeChannel]);

  /**
   * 附件也保持本地：选中时只记录文件与占位路径，
   * 真正上传发生在点击发布之后，避免草稿阶段暗中把附件传到云端。
   */
  const uploadComposerAttachments = async (files: File[]) => {
    if (!files.length || attachmentBusy) return;
    setAttachmentError("");
    if (composerAttachments.length + files.length > MAX_ATTACHMENT_FILES) {
      setAttachmentError(`最多上传 ${MAX_ATTACHMENT_FILES} 个附件`);
      return;
    }
    const total = composerAttachments.reduce((sum, item) => sum + item.size, 0);
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) { setAttachmentError(`「${file.name}」超过单个 30 MB 的限制`); return; }
    }
    if (total + files.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_TOTAL_BYTES) {
      setAttachmentError("附件合计不能超过 50 MB");
      return;
    }
    const staged: PostAttachment[] = files.map((file) => {
      const uploadId = crypto.randomUUID();
      pendingAttachmentFiles.current.set(uploadId, file);
      return { path: `local:${uploadId}`, name: file.name, size: file.size, mime: file.type || "application/octet-stream" };
    });
    setComposerAttachments((current) => [...current, ...staged]);
    setAttachmentRetryFiles([]);
  };

  /** 发布前把本地暂存的附件按既有接口上传，返回服务端路径。 */
  const flushPendingAttachments = async (): Promise<PostAttachment[]> => {
    const pending = composerAttachments.filter((item) => item.path.startsWith("local:"));
    if (!pending.length) return composerAttachments;
    const db = await browserDb();
    const { data } = await db.auth.getSession();
    if (!data.session) throw new Error("登录状态已失效，请重新登录后重试");
    const resolved: PostAttachment[] = [];
    for (const item of composerAttachments) {
      if (!item.path.startsWith("local:")) { resolved.push(item); continue; }
      const file = pendingAttachmentFiles.current.get(item.path.slice(6));
      if (!file) throw new Error(`「${item.name}」的本地文件已丢失，请重新选择`);
      const form = new FormData();
      form.set("file", file);
      form.set("uploadId", crypto.randomUUID());
      const uploaded = await new Promise<PostAttachment>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/v1/attachments");
        xhr.setRequestHeader("Authorization", `Bearer ${data.session!.access_token}`);
        xhr.onerror = () => reject(new Error("网络中断，附件未能上传，请重试"));
        xhr.onload = () => {
          let payload: { data?: PostAttachment; error?: string } | null = null;
          try { payload = JSON.parse(xhr.responseText); } catch { /* 由状态码提供通用错误 */ }
          if (xhr.status < 200 || xhr.status >= 300 || !payload?.data) { reject(new Error(payload?.error || "附件上传失败，请稍后重试")); return; }
          resolve(payload.data);
        };
        xhr.send(form);
      });
      pendingAttachmentFiles.current.delete(item.path.slice(6));
      resolved.push({ ...uploaded, name: uploaded.name || item.name, size: uploaded.size || item.size, mime: uploaded.mime || item.mime });
    }
    setComposerAttachments(resolved);
    return resolved;
  };

  const addComposerAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    setAttachmentRetryFiles([]);
    await uploadComposerAttachments([...files]);
  };

  const retryComposerAttachments = async () => {
    if (!attachmentRetryFiles.length) return;
    const retry = [...attachmentRetryFiles];
    setAttachmentRetryFiles([]);
    await uploadComposerAttachments(retry);
  };

  const removeComposerAttachment = async (path: string) => {
    if (path.startsWith("local:")) {
      pendingAttachmentFiles.current.delete(path.slice(6));
      setComposerAttachments((current) => current.filter((item) => item.path !== path));
      return;
    }
    const previous = composerAttachments;
    setComposerAttachments((current) => current.filter((item) => item.path !== path));
    if (composerEditingPublished) return;
    try {
      await cloudRequest(`/api/v1/attachments?path=${encodeURIComponent(path)}`, undefined, "DELETE");
    } catch {
      setComposerAttachments(previous);
      setAttachmentError("移除失败，请稍后重试");
    } finally {
      void refreshAttachmentQuota();
    }
  };

  const saveAndNewDraft = async () => {
    await flushComposerDraft.current().catch(() => {});
    setComposerPanel(null);
    await openComposer();
    toast("已保存到本机草稿，开始一篇新的作品");
  };

  const deleteCurrentDraft = async () => {
    if (!localDraftIdRef.current) { toast("当前内容还没有保存到本机草稿"); return; }
    if (!await confirmInApp("删除当前草稿？正文、图片与附件都会从本机移除。", { title: "删除草稿", confirmLabel: "删除", danger: true })) return;
    const removing = localDraftIdRef.current;
    localDraftIdRef.current = null;
    setLocalDraftId(null);
    pendingAttachmentFiles.current.clear();
    await deleteDraft(removing).catch(() => {});
    composerSession.current += 1;
    setTitle("");
    setBody("");
    setComposerImages([]);
    setComposerAttachments([]);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setDraftLocalState("idle");
    setComposerPanel(null);
    void refreshLocalDraftCount();
    toast("草稿已删除");
  };

  const openComposer = async (post?: Post, requestedChannel: "community" | "ai" = "community", localDraft?: LocalDraft) => {
    composerImages.forEach(image=>{if(image.url.startsWith("blob:"))URL.revokeObjectURL(image.url);});
    composerSession.current += 1; setComposerPanel(null); setComposerMediaId(null); setDraftSyncError(""); setDraftCloudSynced(false); setDraftSaving(false); setComposerMediaLoadFailed(false); setImageUploadProgress(null);
    setComposerOutcome(null); setResumeTaskKey(null); setComposerError("");
    // 正常入口一律从空白开始；只有主动从草稿箱选择才会恢复内容。
    const initialPost = post;
    composerDraftRef.current = initialPost || null;
    if (initialPost?.status === "draft") composerCloudDrafts.current.set(`${accountId || "guest"}:${requestedChannel}`,initialPost);
    const revisionPayload = initialPost?.pendingRevision?.payload;
    const channel = initialPost?.channel === "ai" ? "ai" : initialPost ? "community" : requestedChannel;
    const initialResourceData = revisionPayload?.resourceData || initialPost?.resourceData || {};
    setWriteChannel(channel);
    setWriteContentType(channel === "ai" && initialPost?.contentType && initialPost.contentType !== "community_post" ? initialPost.contentType : "knowledge_article");
    const initialAttachments = readAttachments(initialResourceData);
    setComposerAttachments(initialAttachments);
    setAttachmentError("");
    setAiResourceFields(Object.fromEntries(Object.entries(initialResourceData).filter(([key]) => key !== "attachments").map(([key, value]) => [key, Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value : ""]).filter(([, value]) => Boolean(value))));
    setEditing(initialPost?.id ?? null);
    // 只有编辑「已发布/审核中」的作品才锁定原分类；草稿仍允许 AI 重新判断，
    // 否则草稿首次保存时若还没判断完，就会永远停在默认分类。
    setComposerRouteLocked(Boolean(post && post.status !== "draft"));
    composerSuggestionRef.current = null;
    setComposerSuggestion(null);
    composerTagTouchedRef.current = false;
    setComposerTagTouchedState(false);
    setComposerEditingPublished(Boolean(post && post.status !== "draft"));
    setComposerRevisionMode(Boolean(post && (post.status === "published" || post.pendingRevision)));
    setTitle(revisionPayload?.title || initialPost?.title || "");
    setBody(revisionPayload?.body || initialPost?.body || "");
    setPollQuestion("");
    setPollOptions(["", ""]);
    setWriteTag(revisionPayload?.tag || initialPost?.tag || (channel === "ai" ? aiCategories[0]?.name || "AI 知识" : communityCategories[0] || tags[0]));
    setWriteTopics(channel === "ai"
      ? revisionPayload?.topics || initialPost?.topics || []
      : revisionPayload?.topics?.length ? revisionPayload.topics : initialPost?.topics?.length ? initialPost.topics : initialPost?.tag ? [initialPost.tag] : [communityCategories[0] || tags[0]]);
    setWriteSeriesId(revisionPayload?.seriesId || initialPost?.seriesId || "");
    setTopicSearch("");
    setComposerImages([]);
    setComposerValidation("");
    setCoverIndex(0);
    lastDraftPayload.current = "";
    if (initialPost?.cloudId) {
      try {
        const data = await cloudRequest(`/api/v1/posts/${initialPost.cloudId}`) as { image_url?:string|null; post_media?: { storage_path: string; sort_order: number }[] } | null;
        const pollResponse = await cloudFetch(`/api/v1/posts/${initialPost.cloudId}/poll`, { cache: "no-store" });
        if (revisionPayload) {
          setPollQuestion(revisionPayload.poll?.question || "");
          setPollOptions(revisionPayload.poll ? [...revisionPayload.poll.options, "", ""].slice(0, 4) : ["", ""]);
        } else if (pollResponse.ok) {
          const pollResult = await pollResponse.json();
          if (pollResult.data?.poll) {
            setPollQuestion(pollResult.data.poll.question || "");
            setPollOptions((pollResult.data.poll.options || []).map((option: { label: string }) => option.label).concat(["", ""]).slice(0, 4));
          }
        }
        const revisionMedia = revisionPayload?.mediaPaths?.map((storage_path, sort_order) => ({ storage_path, sort_order }));
        const mediaToLoad = revisionMedia || data?.post_media || [];
        if (mediaToLoad.length || revisionPayload?.coverUrl || data?.image_url) {
          const orderedMedia = mediaToLoad.slice().sort((a,b) => a.sort_order-b.sort_order);
          // 历史视频作品只保留原作品展示；发布器不再加载视频，也不提供新的上传入口。
          const imageMedia = orderedMedia.filter((item) => !isVideoMediaPath(item.storage_path));
          const images = await Promise.all(imageMedia.map(async (item, index) => {
            const url = await composerMediaUrl(item.storage_path);
            return {id:`saved-${index}-${item.storage_path}`,path:item.storage_path,url:url || "/image-not-loaded.svg",status:"ready" as const,sortOrder:index};
          }));
          const externalCover = revisionPayload ? revisionPayload.coverUrl : data?.image_url;
          const external = externalCover ? [{ id: "legacy-cover", url: externalCover, status: "ready" as const, external: true }] : [];
          setComposerImages([...external, ...images.filter((image): image is NonNullable<typeof image> => Boolean(image))]);
        }
      } catch { setComposerMediaLoadFailed(true);toast("已恢复草稿文字，附件列表读取失败，请重试读取后提交"); }
    }
    // 仅「从草稿箱继续编辑」会回填内容；其余入口保持空白。
    localDraftIdRef.current = localDraft?.id ?? null;
    setLocalDraftId(localDraft?.id ?? null);
    setDraftLocalState("idle");
    pendingAttachmentFiles.current.clear();
    if (localDraft) {
      setTitle(localDraft.title);
      setBody(localDraft.body);
      if (localDraft.tag) setWriteTag(localDraft.tag);
      if (localDraft.topics.length) setWriteTopics(localDraft.topics);
      setWriteSeriesId(localDraft.seriesId || "");
      setPollQuestion(localDraft.poll?.question || "");
      setPollOptions(localDraft.poll?.options?.length ? [...localDraft.poll.options, "", ""].slice(0, 4) : ["", ""]);
      if (localDraft.contentType) setWriteContentType(localDraft.contentType as AiContentType);
      setAiResourceFields(localDraft.resourceData || {});
      setComposerAttachments((localDraft.attachments || []) as PostAttachment[]);
      setCoverIndex(localDraft.coverIndex || 0);
      const restoredImages: ComposerImage[] = [];
      for (const image of localDraft.images) {
        if (image.fileId) {
          const blob = await getDraftFile(localDraft.id, image.fileId).catch(() => null);
          if (blob) restoredImages.push({ id: image.id, file: new File([blob], image.name || `image-${image.id}`, { type: image.type || blob.type || "image/jpeg" }), url: URL.createObjectURL(blob), status: "ready", path: image.storagePath });
          else restoredImages.push({ id: image.id, url: "/image-not-loaded.svg", status: "failed", path: image.storagePath });
        } else if (image.externalUrl) {
          restoredImages.push({ id: image.id, url: image.externalUrl, status: "ready", external: true });
        }
      }
      // 恢复草稿时可能已经在恢复过程中又选了新图：合并而不是覆盖，避免把新图清掉。
      setComposerImages((current) => {
        if (!current.length) return restoredImages;
        const existing = new Set(current.map((image) => image.id));
        return [...current, ...restoredImages.filter((image) => !existing.has(image.id))].slice(0, 9);
      });
      setComposerValidation("");
    }
    setDraftSaved(false);
    setModal("write");
  };
  // 草稿自动保存：只写本机 IndexedDB，不上传云端；发布成功后由 publish 删除。
  useEffect(() => {
    if (modal !== "write" || composerEditingPublished) return;
    const generation = composerSession.current;
    const currentSession = () => composerSession.current === generation;
    const persist = async () => {
      if (publishInFlight.current || !currentSession()) return;
      const poll = { question: pollQuestion.trim(), options: pollOptions.map((option) => option.trim()).filter(Boolean) };
      const hasContent = Boolean(title.trim() || body.trim() || composerImages.length || composerAttachments.length || poll.question || poll.options.length);
      if (!hasContent) return;
      const id = localDraftIdRef.current || crypto.randomUUID();
      const draft: LocalDraft = {
        id,
        owner: accountId || "guest",
        channel: writeChannel,
        title,
        body,
        tag: writeTag,
        topics: writeTopics,
        seriesId: writeSeriesId || null,
        poll: poll.question || poll.options.length ? poll : null,
        contentType: writeContentType,
        resourceData: aiResourceFields,
        attachments: composerAttachments,
        coverIndex,
        images: composerImages.map((image) => ({
          id: image.id,
          fileId: image.file ? image.id : undefined,
          externalUrl: image.external ? image.url : undefined,
          storagePath: image.path,
          name: image.file?.name,
          type: image.file?.type,
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const files: { fileId: string; blob: Blob }[] = [];
      for (const image of composerImages) if (image.file) files.push({ fileId: image.id, blob: image.file });
      for (const attachment of composerAttachments) {
        if (!attachment.path.startsWith("local:")) continue;
        const file = pendingAttachmentFiles.current.get(attachment.path.slice(6));
        if (file) files.push({ fileId: attachment.path, blob: file });
      }
      if (currentSession()) setDraftLocalState("saving");
      try {
        await saveDraft(draft, files);
        localDraftIdRef.current = id;
        if (!currentSession()) return;
        setLocalDraftId(id);
        setDraftLocalState("saved");
        setDraftSyncError("");
        void refreshLocalDraftCount();
      } catch (error) {
        if (!currentSession()) return;
        setDraftLocalState("error");
        setDraftSyncError(error instanceof Error ? error.message : "本机草稿保存失败");
      }
    };
    flushComposerDraft.current = persist;
    const save = () => { void persist().catch(() => { if (currentSession()) { setDraftLocalState("error"); setDraftSyncError("本机保存失败，请重试"); } }); };
    const timer = window.setTimeout(save, 700);
    draftSaveTimer.current = timer;
    window.addEventListener("pagehide", save);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide", save); if (draftSaveTimer.current === timer) draftSaveTimer.current = null; };
  // 面板开关等纯 UI 状态不参与依赖，避免打开面板就重启自动保存。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, editing, accountId, title, body, writeTag, writeTopics, writeSeriesId, pollQuestion, pollOptions, coverIndex, composerImages, composerAttachments, composerEditingPublished, writeChannel, writeContentType, aiResourceFields]);
  const reloadComposerMedia = async () => {
    const old=composerDraftRef.current || state.own.find(item=>item.id===editing);
    if(!old?.cloudId)return;
    setUploadingImages(true);
    try {
      const data=await cloudRequest(`/api/v1/posts/${old.cloudId}`) as {image_url?:string|null;post_media?:{storage_path:string;sort_order:number}[]}|null;
      if(!data)throw new Error("附件读取失败，请检查登录和网络后重试");
      const media=(old.pendingRevision?.payload.mediaPaths?.map((storage_path,sort_order)=>({storage_path,sort_order})) || data.post_media || []).slice().sort((a,b)=>a.sort_order-b.sort_order);
      const images=await Promise.all(media.filter(item=>!isVideoMediaPath(item.storage_path)).map(async(item,index)=>({id:`saved-${index}-${item.storage_path}`,path:item.storage_path,url:(await composerMediaUrl(item.storage_path)) || "/image-not-loaded.svg",status:"ready" as const,sortOrder:index})));
      const external=old.pendingRevision?old.pendingRevision.payload.coverUrl:data.image_url;
      setComposerImages(current=>[...(external&&!current.some(image=>image.external)?[{id:"legacy-cover",url:external,external:true,status:"ready" as const}]:[]),...images,...current.filter(image=>!images.some(item=>item.path===image.path))]);
      setComposerMediaLoadFailed(false);
    } catch(error) { toast(error instanceof Error?error.message:"附件读取失败，请重试"); } finally {setUploadingImages(false);}
  };
  const changeComposerTitle = useCallback((value: string) => { setTitle(value); setDraftSaved(false); setDraftCloudSynced(false); if(value.trim()) setComposerValidation(""); }, []);
  const changeComposerBody = useCallback((value: string) => { setBody(value); setDraftSaved(false); setDraftCloudSynced(false); if(value.trim()) setComposerValidation(""); }, []);
  const closeComposer = async () => {
    // 发布进行中允许离开：任务在后台继续，浮窗与任务中心仍可查看进度。
    if (isPublishing) {
      const leave = await confirmInApp("发布任务会在后台继续，离开后可在悬浮窗查看进度。要现在离开吗？", { title: "发布进行中", confirmLabel: "离开" });
      if (!leave) return;
      setComposerPanel(null); setComposerMediaId(null); setModal(null);
      return;
    }
    try { await flushComposerDraft.current(); }
    catch { if (!await confirmInApp("本机草稿保存失败，仍要退出吗？", { title:"草稿尚未保存", confirmLabel:"退出编辑" })) return; }
    setComposerPanel(null); setComposerMediaId(null); setModal(null);
  };
  const composerCloseRef = useRef(closeComposer);
  const composerOverlayRef = useRef({ panel:composerPanel, media:composerMediaId });
  composerCloseRef.current = closeComposer; composerOverlayRef.current = {panel:composerPanel,media:composerMediaId};
  useEffect(() => {
    if (modal !== "write") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; document.documentElement.classList.add("is-composing");
    const viewport = window.visualViewport;
    const resize = () => { document.documentElement.style.setProperty("--composer-height", `${viewport?.height || window.innerHeight}px`); document.documentElement.style.setProperty("--composer-top", `${viewport?.offsetTop || 0}px`); };
    resize(); viewport?.addEventListener("resize",resize); viewport?.addEventListener("scroll",resize);
    const footer=document.querySelector<HTMLElement>(".composer-footer");
    const measureFooter=()=>document.documentElement.style.setProperty("--composer-footer-height",`${footer?.offsetHeight || 76}px`);
    const footerObserver=typeof ResizeObserver!=="undefined"?new ResizeObserver(measureFooter):null;
    if(footer)footerObserver?.observe(footer);measureFooter();
    history.pushState({...history.state, heikaComposer:true}, "");
    let consumed = false;
    const back = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      if (composerOverlayRef.current.panel || composerOverlayRef.current.media) { setComposerPanel(null); setComposerMediaId(null); history.pushState({...history.state,heikaComposer:true},""); return; }
      consumed = true; void composerCloseRef.current();
    };
    const escape = (event: KeyboardEvent) => { if(event.key === "Escape" && !composerOverlayRef.current.panel && !composerOverlayRef.current.media) void composerCloseRef.current(); };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (draftSaveTimer.current !== null || draftMediaBusy.current.size) { void flushComposerDraft.current(); event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("popstate",back,true); window.addEventListener("keydown",escape); window.addEventListener("beforeunload",beforeUnload);
    return () => {
      document.body.style.overflow = previousOverflow; document.documentElement.classList.remove("is-composing"); document.documentElement.style.removeProperty("--composer-height"); document.documentElement.style.removeProperty("--composer-top");
      viewport?.removeEventListener("resize",resize); viewport?.removeEventListener("scroll",resize); footerObserver?.disconnect();document.documentElement.style.removeProperty("--composer-footer-height");
      window.removeEventListener("popstate",back,true); window.removeEventListener("keydown",escape); window.removeEventListener("beforeunload",beforeUnload);
      if (!consumed && history.state?.heikaComposer) { window.addEventListener("popstate",event=>event.stopImmediatePropagation(),{capture:true,once:true}); history.back(); }
    };
  }, [modal]);
  // AI 发布检测：只在点击「发布」后触发；编辑、粘贴、切预览、自动保存、失焦都不会调用模型。
  // 输入、切焦、正文变化都不调用模型；同一稿内容重复点击发布直接复用上次结果。
  const applyComposerRoute = (route: ComposerRoute, keepTag = false) => {
    setComposerRoute(route);
    setComposerRouteReason(route.reason);
    setWriteChannel(route.channel);
    setWriteContentType(route.contentType);
    if (!keepTag) setWriteTag(route.category);
  };
  /**
   * 发布分类与话题判断：只在「用户点了发布」之后调用一次。
   * 编辑、粘贴、切预览、自动保存草稿都不会走到这里（需求 6.3）。
   * 返回最终采用的结果，调用方直接用于提交，不再让用户二次确认。
   */
  const runComposerSuggest = async (cacheKey?: string) => {
    const titleText = title.trim();
    const bodyText = body.trim();
    const key = cacheKey ?? `${titleText}\u0000${bodyText}`;
    const communityList = communityCategories.length ? communityCategories : [...tags];
    const aiList = aiCategories.filter((item) => item.kind === "category").map((item) => item.name);
    const local = routeByRules({ title: titleText, body: bodyText, communityCategories: communityList, aiCategories: aiList });
    const pending = { key, route: local, topics: [] as string[], degraded: false, checking: true };
    composerSuggestionRef.current = pending;
    setComposerSuggestion(pending);
    if (!accountId) {
      // 未登录不消耗模型额度：给规则结果，登录后仍可手动调整。
      const done = { ...pending, checking: false };
      composerSuggestionRef.current = done;
      setComposerSuggestion(done);
      return done;
    }
    try {
      const result = await cloudRequest("/api/v1/composer", { title: titleText, body: bodyText, communityCategories: communityList, aiCategories: aiList }) as { route?: ComposerRoute; topics?: string[]; degraded?: boolean } | null;
      if (!result?.route) throw new Error("检测结果为空");
      const done = { key, route: result.route, topics: Array.isArray(result.topics) ? result.topics.slice(0, 5) : [], degraded: Boolean(result.degraded), checking: false };
      composerSuggestionRef.current = done;
      setComposerSuggestion(done);
      // 用户手动改过分类就不再覆盖，只记录建议。
      if (!composerTagTouchedRef.current) applyComposerRoute(result.route, false);
      return done;
    } catch {
      // AI 服务异常：保留全部内容，给规则去向并允许手动选择，发布流程不中断。
      const done = { key, route: local, topics: [], degraded: true, checking: false };
      composerSuggestionRef.current = done;
      setComposerSuggestion(done);
      return done;
    }
  };
  const handlePublishClick = () => {
    // 一次点击完成「校验 → 分类 → 提交」，不再有二次确认与常驻重新判断。
    void publish();
  };
  const reorderComposerImages = (from: number, to: number) => {
    if (isPublishing || from === to || from < 0 || to < 0 || to >= composerImages.length) return;
    const coverId = composerImages[coverIndex]?.id;
    const next = [...composerImages]; const [image] = next.splice(from,1); next.splice(to,0,image);
    setComposerImages(next); setCoverIndex(Math.max(0,next.findIndex(item=>item.id===coverId)));
  };
  const replaceComposerImage = async (id: string, file?: File) => {
    if (!file || isPublishing || draftSaving) return;
    const validation = validateComposerFiles([file],0); if(validation.error) return toast(validation.error);
    setUploadingImages(true);
    try {
      const compressed=await compressUploadImage(file);
      const image=composerImages.find(item=>item.id===id); if(!image) return;
      const old=state.own.find(item=>item.id===editing);
      if(image.path && old?.cloudId && !composerRevisionMode) await cloudRequest(`/api/v1/posts/${old.cloudId}/media`,{path:image.path},"DELETE");
      const oldRunning = uploadManager.findByUploadId(image.id);
      if (oldRunning && oldRunning.status !== "ready") uploadManager.cancel(oldRunning.taskId);
      preuploadRef.current.delete(image.id);
      const replacement: ComposerImage={id:crypto.randomUUID(),file:compressed,url:URL.createObjectURL(compressed),status:"uploading",progress:0,uploadPhase:"uploading"};
      setComposerImages(items=>items.map(item=>item.id===id?replacement:item)); setComposerMediaId(replacement.id);
      if(image.url.startsWith("blob:")) URL.revokeObjectURL(image.url);
      void preuploadComposerImage(replacement);
    } catch(error) { toast(error instanceof Error?error.message:"图片替换失败，请重试"); } finally { setUploadingImages(false); }
  };

  const chooseComposerImages = async (files: FileList | null) => {
    if (!files?.length || uploadingImages || isPublishing) return;
    const validation = validateComposerFiles(Array.from(files), composerImages.length);
    if (validation.error) toast(validation.error);
    if (!validation.accepted.length) return;
    setUploadingImages(true);
    let failureMessage = "";
    try {
      // 多张图同时压缩：原来 for-await 一张张等 canvas 编码，9 张要串行好几秒。
      const compressed = await mapWithConcurrency(validation.accepted, 3, async (file) => {
        try {
          const current = await compressUploadImage(file);
          return { id: crypto.randomUUID(), file: current, url: URL.createObjectURL(current), status: "ready" as const };
        } catch (error) {
          failureMessage ||= error instanceof Error ? error.message : "有图片压缩失败，请重新选择";
          return null;
        }
      });
      const next: ComposerImage[] = compressed.flatMap((image) => image ? [image] : []);
      if (failureMessage) toast(failureMessage);
      setComposerImages((current) => [...current, ...next]);
      if (!composerImages.length && next.length) setCoverIndex(0);
      if (next.length) {
        setComposerError("");
        // 选完即预上传（staging）：用户继续编辑/调序/换封面都不受影响，也不会生成作品或进入审核。
        for (const image of next) void preuploadComposerImage(image);
      }
    } finally { setUploadingImages(false); }
  };
  const moveComposerImage = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= composerImages.length) return;
    setComposerImages((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
    if (coverIndex === index) setCoverIndex(target); else if (coverIndex === target) setCoverIndex(index);
  };
  const removeComposerImage = async (index: number) => {
    const image = composerImages[index];
    const old = state.own.find((item) => item.id === editing);
    // 上传中的图片先取消，避免删掉之后后台还在写。
    const running = uploadManager.findByUploadId(image.id);
    if (running && running.status !== "ready") uploadManager.cancel(running.taskId);
    preuploadRef.current.delete(image.id);
    if (image.path && old?.cloudId && !composerRevisionMode) {
      try { await cloudRequest(`/api/v1/posts/${old.cloudId}/media`, { path: image.path }, "DELETE"); }
      catch (error) { toast(error instanceof Error ? error.message : "图片移除失败"); return; }
    } else if (image.file && accountId) {
      // 未挂接的预上传对象也一并清理；清理失败不阻塞用户移除图片。
      void cloudRequest("/api/v1/media", { upload_id: image.id, file_type: image.file.type, post_id: old?.cloudId ?? undefined }, "DELETE").catch(() => {});
    }
    if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url);
    setComposerImages((items) => items.filter((_, i) => i !== index));
    setCoverIndex((current) => index < current ? current - 1 : current > index ? current : 0);
  };
  const retryComposerImage = async (imageId: string) => {
    const image = composerImages.find((item) => item.id === imageId);
    if (!accountId) return toast("登录后可重试图片上传");
    if (!image?.file) return toast("本机图片文件未恢复，请点击图片重新替换");
    if (draftMediaBusy.current.has(imageId)) return;
    draftMediaBusy.current.add(imageId);
    setComposerError("");
    // 预上传失败只需重传这一张，不需要先建云端草稿。
    preuploadRef.current.delete(imageId);
    try {
      const path = await preuploadComposerImage(image);
      if (path) toast("图片已就绪，点发布即可提交");
      else toast("图片上传仍未成功，请检查网络后重试");
    } finally { draftMediaBusy.current.delete(imageId); }
  };
  const discardComposerDraft = async () => {
    if (draftSaving || composerImages.some((image) => draftMediaBusy.current.has(image.id))) return toast("图片正在处理，请稍后再删除");
    if (!await confirmInApp("删除这份草稿及其图片？此操作无法撤销。", {title:"删除草稿",confirmLabel:"删除草稿",danger:true})) return;
    if (draftSaveTimer.current !== null) { window.clearTimeout(draftSaveTimer.current);draftSaveTimer.current=null; }
    await draftCloudQueue.current;
    composerSession.current += 1;
    let old = composerDraftRef.current || state.own.find((item) => item.id === editing);
    if (accountId && !composerEditingPublished && old?.cloudId) {
      try {
        const draft = old;
        if (draft?.cloudId) {
          old = draft;
          for (const image of composerImages) if (image.file && !image.path) await cloudRequest("/api/v1/media", { upload_id: image.id, file_type: image.file.type, post_id: draft.cloudId }, "DELETE");
          if (writeChannel === "ai") await cloudRequest(`/api/v1/posts/${draft.cloudId}`, {}, "DELETE"); else await cloudRequest("/api/v1/library-state", { action: "delete", id: draft.id });
          update((current) => ({ ...current, own: current.own.filter((item) => item.id !== draft.id) }));
        }
      } catch (error) { toast(error instanceof Error ? error.message : "草稿删除失败"); setDraftRetry(value=>value+1); return; }
    }
    const owner = accountId || "guest";
    localStorage.removeItem(`heika-compose-${writeChannel}-${owner}`); if (writeChannel === "community") localStorage.removeItem(`heika-compose-${owner}`); await clearDraftFiles(`${owner}:${writeChannel}`).catch(() => {});
    composerImages.forEach((image) => { if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url); });
    composerSession.current += 1; composerDraftRef.current = null; composerCloudDrafts.current.delete(`${owner}:${writeChannel}`);
    setComposerImages([]); setTitle(""); setBody(""); setPollQuestion(""); setPollOptions(["", ""]); setEditing(null); setModal(null); toast("草稿已删除");
  };
  const openTopic = async (name: string) => {
    setTopicLoading(true);
    try {
      const listResponse = await cloudFetch(`/api/v1/topics?q=${encodeURIComponent(name)}`);
      const listResult = await listResponse.json();
      if (!listResponse.ok) throw new Error(listResult.error || "话题读取失败");
      const topic = (listResult.data as TopicSummary[]).find((item) => item.name === name);
      if (!topic) throw new Error("话题不存在");
      const response = await cloudFetch(`/api/v1/topics/${topic.id}?page=1&limit=12`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "话题内容读取失败");
      const page = result.data as TopicPageResponse;
      setTopicSummary(page.topic); setTopicPosts(page.items); setTopicTotal(page.total); setTopicPage(1);
      setTopicReturnPostId(detail); setTopicReturnTab(detail === null ? tab : detailSource.current);
      if (detail !== null) { imageSwitchSequence.current += 1; setImageLoading(false); setDetail(null); setDetailReady(false); }
      scrollPositions.current[tab] = window.scrollY;
      setTab("topic"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
    } catch (error) { toast(error instanceof Error ? error.message : "话题读取失败"); }
    finally { setTopicLoading(false); }
  };
  const loadMoreTopicPosts = async () => {
    if (!topicSummary || topicLoading || topicPosts.length >= topicTotal) return;
    const nextPage = topicPage + 1; setTopicLoading(true);
    try {
      const response = await cloudFetch(`/api/v1/topics/${topicSummary.id}?page=${nextPage}&limit=12`);
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "内容读取失败");
      const page = result.data as TopicPageResponse;
      setTopicPosts((items) => [...items, ...page.items]); setTopicTotal(page.total); setTopicPage(nextPage);
    } catch (error) { toast(error instanceof Error ? error.message : "内容读取失败"); }
    finally { setTopicLoading(false); }
  };
  const closeTopicPage = () => {
    const backTab = topicReturnTab;
    setTab(backTab); setTopicSummary(null); setTopicPosts([]); setTopicTotal(0); setTopicPage(1);
    requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[backTab] || 0, behavior: "instant" }));
    if (topicReturnPostId !== null) {
      const postId = topicReturnPostId;
      imageSwitchSequence.current += 1;
      setDetail(postId); setDetailReady(true); setTransitionPhase(null); setTopicReturnPostId(null);
    }
  };
  const switchDiscoverChannel = (next: "community" | "ai" | "series" | "mall") => {
    if (discoverChannelBusy.current) {
      queuedDiscoverChannel.current = next;
      return;
    }
    if (next === discoverChannel) return;
    discoverScrollPositions.current[discoverChannel] = window.scrollY;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOutgoingDiscoverChannel(null);
      setDiscoverChannelPhase(null);
      setDiscoverChannel(next);
      requestAnimationFrame(() => window.scrollTo({ top: discoverScrollPositions.current[next], behavior: "instant" }));
      return;
    }
    discoverChannelBusy.current = true;
    queuedDiscoverChannel.current = null;
    setOutgoingDiscoverChannel(discoverChannel);
    setDiscoverChannelPhase("primed");
    setDiscoverChannel(next);
    requestAnimationFrame(() => {
      setDiscoverChannelPhase("running");
      window.scrollTo({ top: discoverScrollPositions.current[next], behavior: "instant" });
    });
    discoverChannelTimer.current = window.setTimeout(() => {
      discoverChannelTimer.current = null;
      setOutgoingDiscoverChannel(null);
      setDiscoverChannelPhase(null);
      discoverChannelBusy.current = false;
      const queued = queuedDiscoverChannel.current;
      queuedDiscoverChannel.current = null;
      if (queued && queued !== next) requestAnimationFrame(() => switchDiscoverChannelRef.current(queued));
    }, 260);
  };
  switchDiscoverChannelRef.current = switchDiscoverChannel;
  // 从首页/消息等页面点顶部「AI 专区」「合集」时只会排队一个目标频道，
  // 这里在真正进入发现页后消费它，否则按钮看起来点了没反应。
  useEffect(() => {
    if (tab !== "discover") return;
    const queued = queuedDiscoverChannel.current;
    if (!queued) return;
    queuedDiscoverChannel.current = null;
    const frame = requestAnimationFrame(() => switchDiscoverChannelRef.current(queued));
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  useEffect(() => () => {
    if (discoverChannelTimer.current !== null) window.clearTimeout(discoverChannelTimer.current);
  }, []);
  // 发现页导航：向下滚动收起、向上滚动恢复。仅改变 transform，不参与布局，避免跳动。
  useEffect(() => {
    let lastY = typeof window === "undefined" ? 0 : window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - lastY;
        if (Math.abs(delta) < 8) return;
        if (delta > 0 && y > 96) setDiscoverNavCollapsed(true);
        else if (delta < 0) setDiscoverNavCollapsed(false);
        lastY = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => {
    if (tab !== "mine" || !accountId) { setMineCollections([]); return; }
    let alive = true;
    void cloudRequest("/api/v1/series?scope=following")
      .then((data) => {
        const items = (data as { items?: { id: string; title: string; kind: string; publishedCount?: number }[] } | null)?.items;
        if (alive) setMineCollections(Array.isArray(items) ? items : []);
      })
      .catch(() => { if (alive) setMineCollections([]); });
    return () => { alive = false; };
  }, [tab, accountId]);
  const openCollection = (id: string) => {
    if (!id) return;
    setCollectionReturnTab(tab);
    setCollectionId(id);
    scrollPositions.current.collection = 0;
    startPageTransition(() => setTabState("collection"));
  };
  // 正文里点「目录」时，先无动画收起详情再切到合集页，避免遮罩挡住合集。
  const openCollectionFromDetail = (seriesId: string) => {
    imageSwitchSequence.current += 1;
    setImageLoading(false);
    setDetail(null);
    setDetailReady(false);
    setDetailImageTransition(null);
    setTransitionPhase(null);
    transitionBusy.current = false;
    if (history.state?.heikaDetail != null) {
      history.replaceState({ ...history.state, heikaDetail: null }, "");
    }
    openCollection(seriesId);
  };
  // 详情已经打开时直接换章：openPost 有「详情已打开就返回」的守卫，不能复用它，
  // 否则合集正文里的「上一章 / 下一章」点了没反应。
  const switchDetailChapter = (post: Post) => {
    setPublicFeed((current) => current.some((item) => item.id === post.id) ? current : [...current, post]);
    detailPostCache.current.set(post.id, { post, at: Date.now() });
    setDetailPostOverride(post);
    setDetailImageTransition(null);
    imageSwitchSequence.current += 1;
    setImageLoading(false);
    setDetailReady(true);
    setTransitionPhase(null);
    transitionBusy.current = false;
    setDetail(post.id);
    if (desktopLayout && !appEmbed) {
      history.replaceState({ ...history.state, heikaDetail: post.id }, "", `/p/${post.id}`);
      window.scrollTo({ top: 0, behavior: "instant" });
    } else {
      history.replaceState({ ...history.state, heikaDetail: post.id }, "");
      requestAnimationFrame(() => {
        const scroller = document.querySelector<HTMLElement>(".overlay .detail");
        if (scroller) scroller.scrollTop = 0;
      });
    }
    void cloudRequest("/api/v1/library-state", { action: "view", id: post.id }).catch(() => {});
  };
  // 合集章节可能不在当前 feed 的 all 里，先拉取真实作品再作为 resolvedPost 打开。
  const openCollectionChapter = async (chapter: { id: string }) => {
    try {
      const response = await fetch(`/api/v1/posts/${encodeURIComponent(chapter.id)}`, { cache: "no-store" });
      const result = await response.json();
      const post = result?.data as Post | undefined;
      if (!response.ok || !post) throw new Error("章节暂不可用");
      setPublicFeed((current) => current.some((item) => item.id === post.id) ? current : [...current, post]);
      if (detail !== null) switchDetailChapter(post);
      else openPost(post.id, "discover", null, post);
    } catch {
      toast("这一章暂时无法打开，请稍后重试");
    }
  };
  // 搜索结果只有云端 id：先取完整作品再按普通详情打开，避免用不完整对象渲染正文。
  const openSearchPost = async (cloudId: string, source: Element | null) => {
    try {
      const response = await fetch(`/api/v1/posts/${encodeURIComponent(cloudId)}`, { cache: "no-store" });
      const result = await response.json();
      const post = result?.data as Post | undefined;
      if (!response.ok || !post || typeof post.id !== "number") throw new Error("unavailable");
      setPublicFeed((current) => current.some((item) => item.id === post.id) ? current : [...current, post]);
      if (detail !== null) switchDetailChapter(post);
      else openPost(post.id, "discover", source, post);
    } catch {
      toast("这篇内容暂时不可用");
    }
  };
  const openAiPost = (item: Post, source: Element | null) => {
    setPublicFeed((current) => current.some((post) => post.id === item.id) ? current : [...current, item]);
    setFeedPostIds((current) => current.includes(item.id) ? current : [...current, item.id]);
    // 直接把条目作为 resolvedPost 传入：rAF 回调里的 openPost 闭包可能仍是旧的
    // （all 尚未包含本条），不带 resolvedPost 会被 openPost 的存在性守卫拦下，
    // 表现为点击 AI 空间卡片后详情打不开。
    requestAnimationFrame(() => requestAnimationFrame(() => openPost(item.id, "discover", source, item)));
  };
  useEffect(() => {
    const isDiscover = tab === "discover" && discoverChannel === "community" && modal !== "write";
    if (!isDiscover && modal !== "write") return;
    let alive = true;
    const url = modal === "write" && writeChannel === "ai"
      ? `/api/v1/categories?channel=ai&kind=tag${topicSearch.trim() ? `&q=${encodeURIComponent(topicSearch.trim())}` : ""}`
      : `/api/v1/topics${isDiscover ? "?featured=1" : topicSearch.trim() ? `?q=${encodeURIComponent(topicSearch.trim())}` : ""}`;
    void cloudFetch(url).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "话题读取失败");
      const items = Array.isArray(result.data?.items) ? result.data.items : Array.isArray(result.data) ? result.data : [];
      if (alive) setTopicChoices(items as TopicSummary[]);
    }).catch(() => {
      if (alive) setTopicChoices(tags.map((name, index) => ({ id: index + 1, name, description: "", postCount: 0, participantCount: 0 })));
    });
    return () => { alive = false; };
  }, [tab, modal, topicSearch, discoverChannel, writeChannel]);
  const createTopic = async () => {
    const name = topicSearch.trim().replace(/^#+/, "");
    if (!name) return;
    if (!accountId) return toast("登录后可以创建自定义话题");
    if (writeTopics.length >= 5) return toast("最多选择 5 个话题");
    setCreatingTopic(true);
    try {
      if (writeChannel === "ai") {
        const created = await cloudRequest("/api/v1/categories/tags", { name, channel: "ai" }) as { id?: number; name?: string } | null;
        if (!created?.id || !created.name) throw new Error("自定义标签创建失败");
        const topic: TopicSummary = { id: created.id, name: created.name, description: "自定义 AI 标签", postCount: 0, participantCount: 0 };
        setTopicChoices((items) => [topic, ...items.filter((item) => item.name.toLocaleLowerCase("zh-CN") !== topic.name.toLocaleLowerCase("zh-CN"))]);
        setWriteTopics((items) => items.includes(topic.name) ? items : [...items, topic.name]);
        setTopicSearch("");
        toast(`已创建 #${topic.name}，现在就能使用`);
        return;
      }
      const created = await cloudRequest("/api/v1/topics", { name }) as TopicSummary;
      if (!created?.name) throw new Error("话题创建失败");
      setTopicChoices((items) => [created, ...items.filter((item) => item.name.toLocaleLowerCase("zh-CN") !== created.name.toLocaleLowerCase("zh-CN"))]);
      setWriteTopics((items) => items.includes(created.name) ? items : [...items, created.name]);
      setTopicSearch("");
      toast(`已添加 #${created.name}`);
    } catch (error) { toast(error instanceof Error ? error.message : "话题创建失败"); }
    finally { setCreatingTopic(false); }
  };
  const generateAiWorkbench = async () => {
    if (!accountId) { toast("登录后可以使用 AI 创作工作台"); return; }
    const prompt = aiWorkbenchPrompt.trim();
    setAiWorkbenchBusy(true); setAiWorkbenchOutput(""); setAiResultApplied(false);
    try {
      setAiWorkbenchOutput("");
      const result = await cloudRequest("/api/v1/ai/workbench", { mode: aiWorkbenchMode, title, content: body, category: writeTag, prompt, messages: aiWorkbenchMessages }) as { output?: unknown; warning?: unknown } | null;
      if (typeof result?.output !== "string" || !result.output.trim()) throw new Error("登录状态已失效或 AI 没有返回内容，请重试");
      setAiWorkbenchOutput(result.output);
      if (typeof result.warning === "string" && result.warning.trim()) toast(result.warning);
      const userMessage = prompt || `请根据当前稿件执行${({ title: "标题建议", outline: "写作提纲", polish: "润色正文", continue: "内容续写", markdown: "Markdown 优化", topics: "推荐话题" } as const)[aiWorkbenchMode]}。`;
      setAiWorkbenchMessages((current) => [...current, { role: "user" as const, content: userMessage }, { role: "assistant" as const, content: result.output as string }].slice(-12));
      setAiWorkbenchPrompt("");
    } catch (error) { toast(error instanceof Error ? error.message : "AI 生成失败，请稍后重试"); }
    finally { setAiWorkbenchBusy(false); }
  };
  const applyAiWorkbenchResult = () => {
    if (!aiWorkbenchOutput.trim()) return;
    setAiPreviousBody(body);
    setAiPreviousTitle(title);
    setAiPreviousTopics(writeTopics);
    if (aiWorkbenchMode === "title") {
      const suggestion = aiWorkbenchOutput.split("\n").map((line) => line.replace(/^\s*(?:#{1,6}\s*|\d+[.、)）]\s*|[-*+]\s*)/, "").trim()).find(Boolean);
      if (suggestion) setTitle(suggestion.slice(0, 80));
    } else if (aiWorkbenchMode === "polish" || aiWorkbenchMode === "markdown") setBody(aiWorkbenchOutput.trim());
    else if (aiWorkbenchMode === "topics") {
      const knownTopics = new Set(topicChoices.map((item) => item.name));
      const candidates = [...aiWorkbenchOutput.matchAll(/#([\u4e00-\u9fa5A-Za-z0-9_-]{2,20})/g)].map((match) => match[1]).filter((name) => knownTopics.has(name));
      if (!candidates.length) { toast("建议中的话题不在社区话题列表中，可手动搜索添加"); return; }
      setWriteTopics((current) => [...new Set([...current, ...candidates])].slice(0, 5));
    } else setBody((current) => current.trim() ? `${current.trim()}\n\n${aiWorkbenchOutput.trim()}` : aiWorkbenchOutput.trim());
    setAiResultApplied(true);
    toast("建议已放入编辑区，可以继续修改");
  };
  const undoAiWorkbenchResult = () => {
    if (aiPreviousBody !== null) setBody(aiPreviousBody);
    if (aiPreviousTitle !== null) setTitle(aiPreviousTitle);
    if (aiPreviousTopics !== null) setWriteTopics(aiPreviousTopics);
    setAiPreviousBody(null); setAiPreviousTitle(null); setAiPreviousTopics(null); setAiResultApplied(false);
    toast("已撤回 AI 建议");
  };
  const copyAiWorkbenchResult = async () => {
    try { await navigator.clipboard.writeText(aiWorkbenchOutput); toast("AI 建议已复制"); }
    catch { toast("复制失败，请检查剪贴板权限"); }
  };
  const optimizeMarkdown = async () => {
    if (!accountId) { toast("登录后可以使用 Markdown 优化"); return; }
    if (!body.trim()) { toast("先写下正文，再做 Markdown 优化"); return; }
    setMarkdownOptimizeOpen(true);
    setMarkdownOptimizeBusy(true);
    setMarkdownOptimizeError("");
    setMarkdownOptimizeOutput("");
    try {
      const result = await cloudRequest("/api/v1/ai/workbench", { mode: "markdown", title, content: body, category: writeTag, prompt: "", messages: [] }) as { output?: unknown; warning?: unknown } | null;
      if (typeof result?.output !== "string" || !result.output.trim()) throw new Error("登录状态已失效或 AI 没有返回内容，请重试");
      setMarkdownOptimizeOutput(result.output.trim());
      if (typeof result.warning === "string" && result.warning.trim()) toast(result.warning);
    } catch (error) { setMarkdownOptimizeError(error instanceof Error ? error.message : "Markdown 优化失败，请稍后重试"); }
    finally { setMarkdownOptimizeBusy(false); }
  };
  const applyMarkdownOptimize = () => {
    if (!markdownOptimizeOutput.trim()) return;
    setMarkdownPreviousBody(body);
    setBody(markdownOptimizeOutput.trim());
    setMarkdownOptimizeOpen(false);
    toast("已使用优化后的 Markdown 版本");
  };
  const undoMarkdownOptimize = () => {
    if (markdownPreviousBody !== null) setBody(markdownPreviousBody);
    setMarkdownPreviousBody(null);
    toast("已撤回 Markdown 优化");
  };
  const copyMarkdownOptimize = async () => {
    try { await navigator.clipboard.writeText(markdownOptimizeOutput); toast("已复制优化结果"); }
    catch { toast("复制失败，请检查剪贴板权限"); }
  };
  const secondaryTitle = modal === "write"
    ? "取消"
    : tab === "settings"
      ? settingsDetail ? settingsReturnTab === "mine" ? "我的" : "设置" : settingsPersonalOpen ? "设置" : "我的"
      : tab === "topic" ? "发现"
        : tab === "search" ? "搜索"
        : tab === "notifications" ? "通知"
        : tab === "exploration-center" ? "探索中心"
        : tab === "co-explore" || tab === "monthly-recap" || tab === "card-chain" ? secondaryReturnTab === "exploration-center" ? "探索中心" : "我的"
        : tab === "shared-collection" ? "分享收藏夹"
        : tab === "collection" ? "合集"
        : tab === "about" || tab === "moderation" ? "设置"
          : tab === "debug" ? debugReturnTab === "settings" ? "设置" : "我的"
            : tab === "creator-center" || tab === "my-content" ? myContentReturnTab === "settings" ? "设置" : "我的"
            : null;
  const handleSecondaryBack = () => {
    if (modal === "write") { void closeComposer(); return; }
    if (tab === "settings" && settingsDetail) { closeSettingsDetail(); return; }
    if (tab === "settings" && settingsPersonalOpen) { setSettingsPersonalOpen(false); return; }
    if (tab === "settings") { setSettingsPersonalOpen(false); setTab("mine"); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.mine || 0, behavior: "instant" })); return; }
    if (tab === "topic") { closeTopicPage(); return; }
    if (tab === "search") { closeSearch(); return; }
    if (tab === "exploration-center") { setTab("mine"); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.mine || 0, behavior: "instant" })); return; }
    if (tab === "notifications" || tab === "co-explore" || tab === "shared-collection" || tab === "monthly-recap" || tab === "card-chain") { returnToSecondaryTab(); return; }
    if (tab === "collection") { setTab(collectionReturnTab); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[collectionReturnTab] || 0, behavior: "instant" })); return; }
    if (tab === "about" || tab === "moderation") { setTab("settings"); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.settings || 0, behavior: "instant" })); return; }
    if (tab === "debug") {
      setTab(debugReturnTab);
      requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[debugReturnTab] || 0, behavior: "instant" }));
      return;
    }
    if (tab === "creator-center" || tab === "my-content") {
      setTab(myContentReturnTab);
      requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[myContentReturnTab] || 0, behavior: "instant" }));
      return;
    }
  };
  useEffect(() => {
    if (detail === null) return;
    setActiveImageIndex(0);
    setDisplayedImageIndex(0);
    setImageLoading(false);
    setDetailImageDirection("next");
    setPreviewImage(false);
    setCommentsLoading(true);
    setCommentsError(false);
    setCommentOffset(0);
    setCommentTotal(0);
    setCommentHasMore(false);
    let alive = true;
    void fetch(`/api/library-comments?id=${detail}&offset=0&limit=40&sort=${detailSort === "最新" ? "new" : "hot"}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((result) => {
        if (!alive) return;
        if (result.data?.items && Array.isArray(result.data.items)) {
          const items = result.data.items as Comment[];
          setState((s) => ({
            ...s,
            comments: [
              ...s.comments.filter((c) => c.post !== detail || !c.cloudId),
              ...items,
            ],
          }));
          setCommentTotal(result.data.total || 0);
          setCommentOffset(items.length);
          setCommentHasMore(items.length < (result.data.total || 0));
        } else throw new Error("评论加载失败");
      })
      .catch(() => { if (alive) setCommentsError(true); })
      .finally(() => { if (alive) setCommentsLoading(false); });
    return () => {
      alive = false;
    };
  }, [detail, detailSort]);
  const loadMoreComments = async () => {
    if (detail === null || commentsLoading || !commentHasMore) return;
    setCommentsLoading(true);
    setCommentsError(false);
    try {
      const response = await fetch(`/api/library-comments?id=${detail}&offset=${commentOffset}&limit=40&sort=${detailSort === "最新" ? "new" : "hot"}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.data?.items)) throw new Error("评论加载失败");
      const items = result.data.items as Comment[];
      setState((s) => ({ ...s, comments: [...s.comments.filter((c) => !items.some((item) => item.cloudId && item.cloudId === c.cloudId)), ...items] }));
      setCommentOffset((offset) => offset + items.length);
      setCommentTotal(result.data.total || 0);
      setCommentHasMore(commentOffset + items.length < (result.data.total || 0));
    } catch { setCommentsError(true); }
    finally { setCommentsLoading(false); }
  };
  /** 评论面板的「重试」：从第 0 条重新拉，避免失败后停在半截状态。 */
  const reloadComments = async () => {
    if (detail === null) return;
    setCommentsLoading(true);
    setCommentsError(false);
    try {
      const response = await fetch(`/api/library-comments?id=${detail}&offset=0&limit=40&sort=${detailSort === "最新" ? "new" : "hot"}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.data?.items)) throw new Error("评论加载失败");
      const items = result.data.items as Comment[];
      setState((prev) => ({ ...prev, comments: [...prev.comments.filter((c) => c.post !== post?.id), ...items] }));
      setCommentTotal(result.data.total || 0);
      setCommentOffset(items.length);
      setCommentHasMore(items.length < (result.data.total || 0));
    } catch { setCommentsError(true); }
    finally { setCommentsLoading(false); }
  };
  const refreshFeed = async () => {
    if (tab === "today") {
      try {
        const ids = await fetchDailyCardIds();
        if (!ids.length) throw new Error();
        setState((current) => ({ ...current, cardIds: ids }));
      } catch {
        setFeedError("内容加载失败，请重试");
      }
      return;
    }
    await loadPublicFeed(1, true, tab === "discover" ? category : "全部");
  };
  const ratingIdsKey = [...new Set(all.map((post) => post.id))].filter((id) => !loadedRatingIds.current.has(id)).sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!ready || !ratingIdsKey) return;
    const controller = new AbortController();
    const ids = ratingIdsKey.split(",");
    const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, (index + 1) * 100));
    void Promise.all(batches.map(async (batch) => {
      const response = await fetch(`/api/v1/ratings?ids=${batch.join(",")}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("评分加载失败");
      const result = await response.json();
      return result.data && typeof result.data === "object" ? result.data as Record<number, CommunityRating> : {};
    })).then((results) => {
      if (controller.signal.aborted) return;
      ids.forEach((id) => loadedRatingIds.current.add(Number(id)));
      setCommunityRatings((current) => Object.assign({}, current, ...results));
    }).catch(() => {});
    return () => controller.abort();
  }, [ready, ratingIdsKey]);
  const filtered = useMemo(
    () => {
      const postsById = new Map(publicFeed.map((post) => [post.id, post]));
      return feedPostIds.flatMap((id) => {
        const post = postsById.get(id);
        return post && !state.dismissed?.includes(post.id) && (category === "全部" || post.tag === category)
          ? [post]
          : [];
      });
    },
    [publicFeed, feedPostIds, category, state.dismissed],
  );
  const list = filtered.slice(0, page);
  const discoverColumns = useMemo(() => {
    const columnCount = state.discoverLayout === "single" ? 1 : discoverColumnCount;
    const columns = Array.from({ length: columnCount }, () => [] as Post[]);
    const heights = Array.from({ length: columnCount }, () => 0);
    for (const post of filtered.slice(0, page)) {
      let target = 0;
      for (let index = 1; index < heights.length; index += 1) {
        if (heights[index] < heights[target]) target = index;
      }
      columns[target].push(post);
      const coverRatio = discoverCoverRatio(post.id).split("/").map(Number);
      const coverHeight = coverRatio.length === 2 ? (coverRatio[1] / coverRatio[0]) * 100 : 125;
      const textHeight = 48;
      heights[target] += coverHeight + textHeight;
    }
    return columns;
  }, [filtered, page, discoverColumnCount, state.discoverLayout]);
  useEffect(() => {
    if (
      !ready ||
      !["today", "discover"].includes(tab) ||
      !loadMoreRef.current ||
      detail !== null ||
      viewerId !== null
    )
      return;
    const total = tab === "today" ? candidates.length : filtered.length;
    if (page >= total && !(tab === "discover" && feedHasMore)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (tab === "discover" && page >= filtered.length) void loadPublicFeed(feedPage + 1, false, category);
        else setPage((n) => Math.min(n + 12, total));
      },
      { rootMargin: "400px" },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [ready, tab, page, filtered.length, candidates.length, detail, viewerId, feedHasMore, feedPage, feedLoading, category, loadPublicFeed]);
  useEffect(() => {
    if (!detailReady || detail === null) return;
    let observer: IntersectionObserver | undefined;
    const timer = setTimeout(() => {
      // 阅读系统 2.0 起正文末尾不再常驻评论区，完成标记改挂到「全文完」文末块上。
      const marker = document.querySelector<HTMLElement>(".reader-end") || document.getElementById("detail-comments");
      if (!marker) return;
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            void cloudRequest("/api/v1/library-state", {
              action: "complete",
              id: detail,
            }).catch(() => {});
            observer?.disconnect();
          }
        },
        { threshold: 0.2 },
      );
      observer.observe(marker);
    }, 1200);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [detailReady, detail]);
  // 分类默认只露出 AI 常分的几类，手动建的长尾分类收进「更多」，避免首屏被一长排标签挤满。
  const allDiscoverCategories = communityCategories.length ? communityCategories : [...tags];
  const featuredCategoryNames = communityCategoryMeta.filter((item) => item.is_featured).map((item) => item.name);
  const primaryDiscoverCategories = (featuredCategoryNames.length ? featuredCategoryNames : allDiscoverCategories.slice(0, 3))
    .filter((name) => allDiscoverCategories.includes(name));
  // 收起时也保证当前选中的分类可见，否则用户看不到自己选了什么。
  const selectedExtraCategory = category !== "全部" && !primaryDiscoverCategories.includes(category) ? [category] : [];
  const visibleDiscoverCategories = categoryOverflowOpen ? allDiscoverCategories : [...primaryDiscoverCategories, ...selectedExtraCategory];
  const hiddenCategoryCount = Math.max(0, allDiscoverCategories.length - primaryDiscoverCategories.length);
  const isImmersive = (tab === "messages" && (chatConversationOpen || messagePeer !== null)) || detail !== null || transitionPhase !== null;
  const candidatePost = detail === null ? null : all.find((p) => p.id === detail);
  const post = detail !== null && detailPostOverride?.id === detail ? detailPostOverride : candidatePost;
  // 阅读系统 2.0：详情页模式与阅读状态在组件顶层初始化。未完成兴趣引导时组件会提前 return，
  // 这些 Hooks 必须放在那之前，否则每次 render 的调用顺序不一致。
  const detailReaderMode: "page" | "overlay" = desktopLayout && post !== null && !appEmbed ? "page" : "overlay";
  const {
    outline: detailOutline,
    progress: detailProgress,
    activeHeading: detailActiveHeading,
    commentPanelOpen,
    setCommentPanelOpen,
    commentPanelFocus,
    setCommentPanelFocus,
    tocOpen: readerTocOpen,
    setTocOpen: setReaderTocOpen,
  } = useReaderShell(post?.body, detailReaderMode, { postId: post ? String(post.id) : null, accountId });
  const sharePayload = (target: Post, summary = "") => {
    const url = postShareUrl(target);
    const plain = markdownToText(target.body || "").replace(/\s+/g, " ").replace(/^#+\s*/, "").trim();
    const source = (summary || plain).replace(/\s+/g, " ").trim();
    // 摘要控制在一句话、十多个字：太短像标签，太长会被各平台折叠。
    const firstSentence = source.split(/[。！？!?；;\n]/).map((item) => item.trim()).find(Boolean) || "";
    // 十几字最合适：太长会被平台折叠，太短像标签；优先在「｜，、空格」处断开，避免半句硬切。
    const clipBlurb = (text: string) => {
      if (text.length <= 18) return text.replace(/[｜|，,、\s]+$/, "");
      const head = text.slice(0, 18);
      const boundary = Math.max(head.lastIndexOf("｜"), head.lastIndexOf("|"), head.lastIndexOf("，"), head.lastIndexOf("、"), head.lastIndexOf(" "));
      return (boundary >= 8 ? head.slice(0, boundary) : head).replace(/[｜|，,、\s]+$/, "");
    };
    const blurb = firstSentence.length >= 12 ? clipBlurb(firstSentence) : `${(target.title || "这篇内容").slice(0, 18)}，值得花两分钟读完`;
    // 预览用封面与作者：都取列表里已有的字段，不额外请求。
    const cover = target.thumbnailImages?.[0] || target.image || target.cover || "";
    return {
      title: target.title,
      blurb,
      url,
      text: `《${(target.title || "").replace(/[。！？!?，,]+$/, "")}》\n${blurb}\n这是黑卡的链接，打开后可以进入黑卡探索更多内容：\n${url}`,
      cover: cover && /^https?:|^data:|^blob:/.test(cover) ? cover : undefined,
      author: target.author,
    };
  };
  const openSharePanel = async () => {
    if (!post || post.status !== "published") { toast("仅公开发布的作品可以分享"); return; }
    let summary = "";
    if (post.cloudId) {
      try {
        const response = await fetch(`/api/v1/posts/${encodeURIComponent(post.cloudId)}/summary`, { cache: "no-store" });
        const result = response.ok ? await response.json() : null;
        if (typeof result?.data?.summary === "string") summary = result.data.summary;
      } catch { /* 没有摘要也能分享，退回正文首句 */ }
    }
    setShareClientId(post.cloudId ?? null);
    setSharePayloadState(sharePayload(post, summary));
    setDetailMoreOpen(false);
  };
  const closeSharePanel = useCallback(() => setSharePayloadState(null), []);
  useEffect(() => {
    if (detail === null || !post?.cloudId || !post.isPartial) return;
    if (detailPostOverride?.id === detail && !detailPostOverride.isPartial) return;
    const cached = detailPostCache.current.get(detail);
    if (cached && Date.now() - cached.at < 45 * 60 * 1000) {
      setDetailPostOverride(cached.post);
      return;
    }
    const controller = new AbortController();
    void cloudFetch("/api/demo/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: detail, resolve_images: true }),
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.data || controller.signal.aborted) return;
      const loaded = result.data as Post;
      detailPostCache.current.delete(detail);
      detailPostCache.current.set(detail, { post: loaded, at: Date.now() });
      while (detailPostCache.current.size > 8) detailPostCache.current.delete(detailPostCache.current.keys().next().value as number);
      setDetailPostOverride(loaded);
    }).catch(() => {});
    return () => controller.abort();
  }, [detail, post?.cloudId, post?.isPartial, detailPostOverride?.id, detailPostOverride?.isPartial]);
  const detailImages = useMemo(() => post
    ? (post.images?.filter(Boolean).length ? post.images.filter(Boolean) : post.image ? [post.image] : [])
    : [], [post]);
  const detailThumbnails = post?.thumbnailImages?.length ? post.thumbnailImages : detailImages;
  const detailRetinaImages = post?.retinaImages || [];
  const detailVideo = post?.video || post?.videos?.[0];
  const preloadDetailImage = useCallback((src: string, priority: "low" | "high" = "low") => {
    const cached = preloadedDetailImages.current.get(src);
    if (cached) {
      if (priority === "high") cached.image.fetchPriority = "high";
      return cached.promise;
    }
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority;
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片加载失败"));
      image.src = src;
      if (image.complete) {
        if (image.naturalWidth > 0) resolve(image);
        else reject(new Error("图片加载失败"));
      }
    }).then(async (readyImage) => {
      try { await readyImage.decode(); } catch {}
      return readyImage;
    }).catch((error: unknown) => {
      preloadedDetailImages.current.delete(src);
      throw error;
    });
    preloadedDetailImages.current.set(src, { image, promise: loaded });
    if (preloadedDetailImages.current.size > 36) {
      const oldest = preloadedDetailImages.current.keys().next().value;
      if (oldest && oldest !== src) preloadedDetailImages.current.delete(oldest);
    }
    return loaded;
  }, []);
  useEffect(() => {
    if (detail === null || detailImages.length < 2) return;
    const count = detailImages.length;
    const adjacent = [...new Set([
      (activeImageIndex + 1) % count,
      (activeImageIndex - 1 + count) % count,
    ])];
    for (const index of adjacent) {
      const src = detailImages[index];
      if (src) void preloadDetailImage(src).catch(() => {});
    }
  }, [detail, detailImages, activeImageIndex, preloadDetailImage]);
  const selectDetailImage = (nextIndex: number) => {
    if (detailImages.length < 2) return;
    const normalized = (nextIndex + detailImages.length) % detailImages.length;
    if (normalized === activeImageIndex) return;
    const forward = (normalized - activeImageIndex + detailImages.length) % detailImages.length;
    const direction = forward <= detailImages.length / 2 ? "next" : "previous";
    const sequence = ++imageSwitchSequence.current;
    setActiveImageIndex(normalized);
    setDetailImageDirection(direction);
    // Gallery navigation always uses the directional horizontal blur-slide.
    // Card-to-detail transitions are controlled separately by detailTransition.
    if (normalized === displayedImageIndex) {
      setImageLoading(false);
      return;
    }
    setImageLoading(true);
    void preloadDetailImage(detailImages[normalized], "high").then(() => {
      if (sequence === imageSwitchSequence.current && detail !== null) {
        setDisplayedImageIndex(normalized);
        setImageLoading(false);
      }
    }).catch(() => {
      if (sequence === imageSwitchSequence.current) {
        setActiveImageIndex(displayedImageIndex);
        setImageLoading(false);
        toast("这张图片暂时无法加载，请稍后重试");
      }
    });
  };
  const postCard = (p: Post, source: "today" | "discover" = "discover", own = false, discoveryFeed = false, priority = false) => {
    const rating = communityRatings[p.id];
    if (discoveryFeed) return <DiscoveryPostCard
      key={p.id}
      post={p}
      rating={rating}
      liked={Boolean(state.liked?.includes(p.id))}
      likeBusy={Boolean(discoveryLikeBusy[p.id])}
      onLike={() => void toggleDiscoveryLike(p.id)}
      onOpen={(element) => openPost(p.id, source, element)}
      onAuthorOpen={setAuthorProfile}
    />;
    const rarityTier = p.rarityTier || (rating ? cardRarityTier(rating.average, rating.count) : "pending");
    const rarityLabel = rarityTier === "ordinary" ? "普通" : rarityTier === "pending" ? "待评级" : rarityTier;
    const coverImage = p.image || p.images?.find(Boolean);
    const coverVideo = p.video || p.videos?.[0];
    // 用真实链接承载「打开作品」：右键、新标签页、复制地址都是浏览器原生行为；
    // 普通左键仍走站内切换，不整页刷新。草稿没有公开地址，退回按钮语义。
    const isDraftCard = own && p.status === "draft";
    return <a
      className={`post-card editorial-post${discoveryFeed ? " discover-content-card" : ""}`}
      key={p.id}
      data-discover-id={p.id}
      href={isDraftCard ? undefined : `/p/${p.id}`}
      role={isDraftCard ? "button" : undefined}
      tabIndex={isDraftCard ? 0 : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        if (isDraftCard) void openComposer(p);
        else openPost(p.id, source, event.currentTarget);
      }}
    >
      {(coverImage || coverVideo || discoveryFeed) && <div
        className={`post-cover editorial-cover${discoveryFeed ? ` discover-post-cover${coverImage || coverVideo ? "" : " is-placeholder"}` : ""}`}
        style={{ background: discoveryFeed && !coverImage && !coverVideo ? "linear-gradient(145deg,#30383d,#13171a)" : coverColor(p.tag), ...(own ? { aspectRatio: "3 / 4" } : source === "discover" ? { aspectRatio: discoverCoverRatio(p.id) } : {}) }}
      >
        {coverImage && <img
            src={discoveryFeed ? feedImageSource(coverImage) : coverImage}
            srcSet={!discoveryFeed && coverImage === p.image && p.imageRetina ? `${coverImage} 480w, ${p.imageRetina} 960w` : undefined}
            sizes={state.discoverLayout === "single" ? "100vw" : "(min-width: 1600px) 20vw, (min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"}
            alt={discoveryFeed ? p.title : ""}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "low"}
            decoding="async"
            onError={(e) => {
              if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = "true"; e.currentTarget.src = "/image-not-loaded.svg"; }
            }}
          />}
        {!coverImage && coverVideo && <video src={coverVideo} muted playsInline preload="metadata" aria-label="视频作品封面" />}
        {discoveryFeed ? <>
          <span className="post-cover-tag">{p.tag}</span>
          <i className={`post-cover-rarity rarity-tier-${rarityTier}`} aria-label={`评级：${rarityLabel}`}>{rarityLabel}</i>
          <strong className="post-cover-title">{p.title}</strong>
        </> : <>
          <i className={`post-cover-rarity rarity-tier-${rarityTier}`} aria-label={`${rarityLabel}稀有度`}>{rarityLabel}</i>
          {p.cover && <span>{p.cover}</span>}
        </>}
      </div>}
      <div className={`post-meta${discoveryFeed ? " discover-post-meta" : ""}`}>
        {discoveryFeed ? <>
          <span className="discover-post-author">{p.author}</span>
          <span className="post-card-footer-trailing">
            <span className={`post-card-like-count${state.liked?.includes(p.id) ? " is-liked" : ""}`} aria-label={`${p.likeCount ?? 0} 个赞`}><Heart size={12} fill={state.liked?.includes(p.id) ? "currentColor" : "none"} /> {p.likeCount ?? 0}</span>
            <span className="post-read-action">阅读 ↗</span>
          </span>
        </> : <>
        <small>{p.tag}</small>
        <b>{p.title}</b>
        <p className="post-summary">{markdownToText(p.body).slice(0, 100)}</p>
        {communityRatings[p.id]?.count ? <span className={`post-card-rarity rarity-${cardRarity(communityRatings[p.id].average, communityRatings[p.id].count).replaceAll(" ", "")}`}><Star size={11} fill="currentColor"/> {cardRarity(communityRatings[p.id].average, communityRatings[p.id].count)} · {communityRatings[p.id].average.toFixed(1)}</span> : null}
        <div className="post-card-footer">
          <span>{p.author}</span>
          <span className="post-card-footer-trailing">
            {typeof p.likeCount === "number" && <span className={`post-card-like-count${state.liked?.includes(p.id) ? " is-liked" : ""}`} aria-label={`${p.likeCount} 个赞`}><Heart size={12} fill={state.liked?.includes(p.id) ? "currentColor" : "none"} /> {p.likeCount}</span>}
            <span>{own && p.status === "draft" ? "编辑草稿" : own && p.status === "pending_review" ? "审核中" : own && p.status === "hidden" ? "审核未通过" : state.saved.includes(p.id) ? "♥ 已收藏" : "阅读 ↗"}</span>
          </span>
        </div>
        </>}
      </div>
    </a>;
  };
  const feed = (items: Post[]) => (
    <>
      {feedError && items.length > 0 && (
        <div className="feed-inline-error" role="status">
          <span>{feedError}</span>
          <button className="text-button" onClick={() => void refreshFeed()}>重试</button>
        </div>
      )}
      {items.length ? (
        <div className={`stable-editorial-feed${state.discoverLayout === "single" ? " single-column" : ""}`} style={{ "--masonry-columns": state.discoverLayout === "single" ? 1 : discoverColumnCount } as CSSProperties}>
          {discoverColumns.map((column, index) => <div className="stable-editorial-column" key={`discover-column-${index}`}>
            {column.map((item, itemIndex) => postCard(item, "discover", false, true, itemIndex === 0))}
          </div>)}
        </div>
      ) : feedLoading || (tab === "discover" && feedLoadedTag !== category && !feedError) ? (
        <div className="discover-loading" role="status" aria-live="polite">
          <span>正在整理发现内容…</span>
          <div><i/><i/><i/><i/></div>
        </div>
      ) : feedError ? (
        <div className="empty discover-feed-error" role="alert">
          <span>{feedError}</span>
          <button className="text-button" onClick={() => void refreshFeed()}>重试</button>
        </div>
      ) : (
        <div className="empty">{sort === "关注" ? accountId ? "还没有关注创作者，去搜索用户并打开主页关注他们。" : "登录后关注喜欢的创作者，这里会汇集他们的更新。" : "这里暂时没有内容，试试其他话题。"}</div>
      )}
      {(items.length < filtered.length || (tab === "discover" && feedHasMore)) && (
        <div ref={loadMoreRef} className="feed-sentinel">
          <span>{feedLoading ? "正在加载发现内容…" : "正在发现更多内容…"}</span>
          <button disabled={feedLoading} onClick={() => tab === "discover" && page >= filtered.length ? void loadPublicFeed(feedPage + 1, false, category) : setPage((n) => n + 12)}>加载更多</button>
        </div>
      )}
    </>
  );

  const renderNavButton = ([id, label, Icon]: (typeof nav)[number]) => {
    const navActive = tab === id || (tab === "settings" && id === "mine") || ((tab === "topic" || tab === "shared-collection") && id === "discover") || ((tab === "exploration-center" || tab === "co-explore" || tab === "monthly-recap" || tab === "card-chain") && id === "mine") || (tab === "notifications" && id === "messages");
    const slot = id === "today" ? "home" : id === "discover" ? "discover" : id === "messages" ? "messages" : "mine";
    const custom = decorState.decor.bottomBar.icons[slot];
    return (
    <button
      key={id}
      className={navActive ? "active" : ""}
      aria-label={label}
      onClick={() => {
        scrollPositions.current[tab] = window.scrollY;
        setTab(id);
        imageSwitchSequence.current += 1;
        setImageLoading(false);
        if (detail !== null) {
          setDetail(null);
          setDetailReady(false);
          setTransitionPhase(null);
          setDetailImageTransition(null);
          transitionBusy.current = false;
        }
        if (detailRouteState !== null) {
          routeAborted.current = true;
          setDetailRouteState(null);
        }
        requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[id] || 0, behavior: "instant" }));
      }}
    >
      <span className="bottom-nav-icon">
        {id === "messages" && <InboxBadge enabled={state.notifications.messages} inAppEnabled={tab !== "messages"} onNotice={toast} onOpenConversationPeer={(peerId) => { setMessagePeer(peerId); setTab("messages"); }} />}
        <BottomNavDecorIcon icon={custom} active={navActive} fallback={Icon} />
      </span>
      {decorState.decor.bottomBar.showLabel !== false && <span className="bottom-nav-label">{label}</span>}
    </button>
  );
  };

  const renderCandidate = (p: Post, deckPosition = candidates.findIndex((candidate) => candidate.id === p.id), showHistoricalReveal = false) => {
    const unlocked = showHistoricalReveal || openedEver.has(p.id);
    const revealed = unlocked ? state.revealed[p.id] : undefined;
    const rarityTier = unlocked ? state.rarityTiers[p.id] || revealed?.rarityTier || p.rarityTier : undefined;
    const rarityLabel = rarityTier === "ordinary" ? "普通" : rarityTier === "pending" || !rarityTier ? "" : rarityTier;
    const rareTier = rarityTier === "S" || rarityTier === "SS" || rarityTier === "SSS" ? rarityTier : null;
    // 翻卡状态、内容状态、图片状态是三个独立维度：
    // 已翻开不等于内容已就绪，这里是「翻开后整块空白」的根源，必须分别处理。
    const contentState: CardContentState = !unlocked ? "loading" : revealed ? "ready" : revealRepair[p.id] === "failed" ? "error" : "loading";
    const activate = () => {
      if (!unlocked) { flip(p.id); return; }
      if (revealed) { openPost(p.id, "today"); return; }
      // 内容没恢复时，点击先补拉，而不是打开一个空详情。
      void repairRevealed([p.id]);
    };
    return (
      <button
        key={p.id}
        data-card-id={p.id}
        className={`candidate-feed-card flip-in-place${unlocked ? " is-unlocked" : ""}${justFlippedId === p.id ? " just-flipped" : ""}${detail === p.id ? " is-detail-source" : ""}`}
        onClick={activate}
        aria-label={unlocked ? `阅读 ${revealed?.title || "已翻开的卡片"}${rareTier ? `，${rareTier}级稀有卡` : ""}` : opened.length >= dailyAllowance ? `今日 ${dailyAllowance} 张已翻完，点击查看提示` : "选择并翻开一张未知卡片"}
      >
        <span className="card-flip-inner">
          <span className="card-flip-face card-flip-front">
            <span className="card-number">{deckPosition >= 0 ? String(deckPosition + 1).padStart(2, "0") : "—"}</span>
            {rarityLabel && <i className={`candidate-rarity-chip rarity-tier-${rarityTier}`} aria-label={`${rarityLabel}稀有卡`}>{rarityLabel}</i>}
            <span className="card-brand">黑卡 · HEIKA</span>
            <span className="card-prompt">轻触翻开</span>
          </span>
          <CardBackFace
            post={revealed}
            state={contentState}
            rarityLabel={rarityLabel}
            rarityTier={rarityTier}
            onRetry={() => void repairRevealed([p.id])}
          />
        </span>
      </button>
    );
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "reset" || window.location.hash.includes("type=recovery")) {
      sessionStorage.setItem("heika-auth-action", "reset");
      setTab("messages");
    }
  }, []);

  useEffect(() => {
    const refreshExperience = () => {
      if (accountId) void cloudRequest("/api/v1/progression").then((summary) => { if (summary && Number.isFinite(summary.total)) setExperienceSummary(summary); }).catch(() => {});
    };
    window.addEventListener("heika-experience-updated", refreshExperience);
    return () => window.removeEventListener("heika-experience-updated", refreshExperience);
  }, [accountId]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let cleanup = () => {};
    void browserDb()
      .then((db) => {
        if (!alive) return;
        let generation = 0;
        let currentUserId: string | null | undefined;
        let restoredUserId: string | null = null;
        let hydrationTimer: ReturnType<typeof setTimeout> | undefined;
        const hydrate = async (user: User | null, version: number) => {
          const isCurrent = () => alive && version === generation;
          if (!isCurrent()) return;
          cloudHydrated.current = false;
          setPublicBookmarksLoaded(false);
          setAccountId(user?.id || null);
          setAccountReady(true);
          if (!user) {
            setAccountTimezone(null);
            setIsStaff(false);
            setAdminRole("member");
            setPublicBookmarks(false);
            setPublicBookmarksLoaded(true);
            setExperienceSummary({ total: 0, membershipTier: "free", events: [], claimedLevels: [] });
            setStorageKey("heika-demo-v1");
            if (restoredUserId === null) return;
            restoredUserId = null;
            // 退出登录：释放上一个账号的本地封面地址，避免内存与状态串号。
            if (coverBlobUrlRef.current) { URL.revokeObjectURL(coverBlobUrlRef.current); coverBlobUrlRef.current = null; }
            coverRemoteRef.current = undefined;
            try {
              const guest = JSON.parse(
                localStorage.getItem("heika-demo-v1") || "null",
              );
              setState((s) => ({
                ...initial,
                ...guest,
                cover: typeof guest?.cover === "string" && !guest.cover.startsWith("blob:") ? guest.cover : undefined,
                coverMeta: guest?.coverMeta,
                revealed: normalizeRevealedSnapshots(guest?.revealed),
                comments: [],
                cardIds: s.cardIds,
              }));
            } catch { setState((s) => ({ ...initial, cardIds: s.cardIds })); }
            return;
          }
          setIsStaff(false);
          setAdminRole("member");
          setPublicBookmarks(false);
          setExperienceSummary({ total: 0, membershipTier: "free", events: [], claimedLevels: [] });
          restoredUserId = user.id;
          // 切换账号：先释放上一个账号的 blob，再读新账号缓存。
          if (coverBlobUrlRef.current) { URL.revokeObjectURL(coverBlobUrlRef.current); coverBlobUrlRef.current = null; }
          coverRemoteRef.current = undefined;
          setStorageKey(`heika-user-${user.id}`);
          setState((previous) => {
            let local;
            try { local = JSON.parse(localStorage.getItem(`heika-user-${user.id}`) || "null"); } catch {}
            return {
              ...initial,
              ...local,
              // 旧版本可能把 blob 地址写进了 localStorage：这里直接丢弃，交给 IndexedDB 缓存恢复。
              cover: typeof local?.cover === "string" && !local.cover.startsWith("blob:") ? local.cover : undefined,
              revealed: normalizeRevealedSnapshots(local?.revealed),
              comments: [],
              cardIds: previous.cardIds,
            };
          });
          void cloudRequest("/api/v1/progression").then((summary) => {
            if (isCurrent() && summary && Number.isFinite(summary.total)) setExperienceSummary(summary);
          }).catch(() => {});
          // 封面第一层：本地缓存先上屏，不等云端返回，完全离线也能看到上次的封面。
          let cachedCover: CoverCacheRecord | null = null;
          try { cachedCover = await readCoverCache(user.id); } catch { cachedCover = null; }
          if (!isCurrent()) return;
          const cachedCoverUrl = coverCacheObjectUrl(cachedCover);
          if (cachedCoverUrl) {
            if (coverBlobUrlRef.current) URL.revokeObjectURL(coverBlobUrlRef.current);
            coverBlobUrlRef.current = cachedCoverUrl;
            setState((current) => ({ ...current, cover: cachedCoverUrl }));
            if (cachedCover?.url) coverRemoteRef.current = cachedCover.url;
          }
          try {
            const data = await cloudRequest("/api/v1/library-state");
            if (!isCurrent() || !data) return;
            const flipState = data.dailyFlipState;
            const expiry = Date.parse(String(flipState?.cycleExpiresAt || ""));
            if (Number.isFinite(expiry)) setCycleExpiry(expiry);
            const started = Date.parse(String(flipState?.cycleStartedAt || ""));
            if (Number.isFinite(started)) setCycleStart(started);
            if (typeof flipState?.timezone === "string") setAccountTimezone(flipState.timezone);
            else if (typeof data.profile?.timezone === "string") setAccountTimezone(data.profile.timezone);
            if (["free", "plus", "pro"].includes(data.profile?.membership_tier)) {
              setExperienceSummary((current) => ({ ...current, membershipTier: data.profile.membership_tier }));
            }
            setPublicBookmarks(Boolean(data.profile?.show_bookmarks));
            setPublicBookmarksLoaded(true);
            const role = data.profile?.role === "admin" || data.profile?.role === "content_manager" || data.profile?.role === "reviewer" ? data.profile.role : "member";
            setAdminRole(role);
            setIsStaff(role !== "member");
            if (adminEntryPending.current) {
              adminEntryPending.current = false;
              if (role !== "member") setTab("moderation");
              else toast("当前账号没有管理员权限。");
            }
            setStorageKey(`heika-user-${user.id}`);
            // 封面第二层：云端是权威源。
            // 注意：字段「缺失」和「明确为 null」语义不同——缺失要保留本地状态，
            // 只有明确 null 才代表用户删除了封面。上一版接口没查这两列，
            // 缺失被当成空值，正是「上传成功、重开就没了」的根因。
            const cloudCover = typeof data.profile.cover_url === "string" && data.profile.cover_url ? data.profile.cover_url : null;
            const cloudCoverVersion = Number(data.profile.cover_version || 0);
            const cloudCoverUpdatedAt = typeof data.profile.cover_updated_at === "string" ? data.profile.cover_updated_at : null;
            coverRemoteRef.current = cloudCover || undefined;
            // 同一张图、同一版本才继续用本地 blob，避免已经显示后又被云端地址替换造成闪动。
            const reusableCover = cachedCoverUrl && cachedCover && cloudCover && cachedCover.url === cloudCover && cachedCover.version === cloudCoverVersion
              ? cachedCoverUrl
              : null;
            const nextCover = cloudCover ? reusableCover || cloudCover : undefined;
            setState((previous) => {
              // Preserve local interactions made while cloud hydration was in flight.
              const s: State = previous;
              const saved = [
                ...new Set<number>([
                  ...data.bookmarks
                    .map((r: { posts: { client_id: number } }) =>
                      Number(r.posts?.client_id),
                    )
                    .filter(Boolean),
                ]),
              ];
              const opened = { ...s.opened };
              const rarityTiers = { ...s.rarityTiers };
              for (const row of data.interactions) {
                if (row.opened_at && row.posts) {
                  const day = row.opened_at.slice(0, 10);
                  const postId = Number(row.posts.client_id);
                  opened[day] = [
                    ...new Set([
                      ...(opened[day] || []),
                      postId,
                    ]),
                  ];
                  if (["ordinary", "S", "SS", "SSS", "pending"].includes(row.rarity_tier))
                    rarityTiers[postId] = row.rarity_tier as CardRarityTier;
                }
              }
              const bonus = Number(flipState?.bonus);
              const flipDate = typeof flipState?.localDate === "string" ? flipState.localDate : null;
              const serverOpened = Array.isArray(flipState?.openedIds)
                ? [...new Set((flipState.openedIds as unknown[]).map((value) => Number(value)).filter((id): id is number => Number.isSafeInteger(id) && id > 0))]
                : null;
              if (flipDate && serverOpened) opened[flipDate] = serverOpened;
              const luckyBonus = { ...s.luckyBonus };
              if (flipDate && Number.isFinite(bonus)) luckyBonus[flipDate] = Math.min(10, Math.max(0, bonus));
              return {
                ...s,
                luckyBonus,
                onboardingDone:
                  // APP 内嵌打开时跳过网页引导：用户是从原生功能直接进来的，
                  // 不该先看到一套只属于网页端的兴趣选择。
                  previous.onboardingDone || isAppEmbed() || Boolean(data.interests.length),
                name: data.profile.nickname,
                bio: data.profile.bio,
                avatar: data.profile.avatar_url,
                cover: nextCover,
                coverMeta: data.profile.cover_meta !== undefined && data.profile.cover_meta !== null
                  ? (data.profile.cover_meta as CoverMeta)
                  : s.coverMeta,
                profileDetails: hydrateProfileDetails(data.profileDetails),
                saved,
                opened,
                rarityTiers,
                own: [
                  ...new Map(
                    [...s.own.filter((p) => !p.cloudId), ...data.own].map(
                      (p) => [p.id, p],
                    ),
                  ).values(),
                ],
                viewed: [
                  ...new Set<number>([
                    ...s.viewed,
                    ...data.interactions
                      .filter((r: { viewed_at: string }) => r.viewed_at)
                      .map((r: { posts: { client_id: number } }) =>
                        Number(r.posts?.client_id),
                      )
                      .filter(Boolean),
                  ]),
                ],
                liked: [
                  ...new Set<number>([
                    ...data.interactions
                      .filter((r: { liked: boolean }) => r.liked)
                      .map((r: { posts: { client_id: number } }) =>
                        Number(r.posts?.client_id),
                      )
                      .filter(Boolean),
                  ]),
                ],
                ratings: {
                  ...s.ratings,
                  ...Object.fromEntries(
                    data.interactions
                      .filter((row: { rating: number | null }) => row.rating !== null)
                      .map((row: { rating: number; posts: { client_id: number } }) => [
                        Number(row.posts.client_id),
                        Number(row.rating),
                      ]),
                  ),
                },
                dismissed: [
                  ...new Set<number>([
                    ...(s.dismissed || []),
                    ...data.interactions
                      .filter((r: { skipped_at: string }) => r.skipped_at)
                      .map((r: { posts: { client_id: number } }) =>
                        Number(r.posts?.client_id),
                      )
                      .filter(Boolean),
                  ]),
                ],
                ...(data.prefs
                  ? {
                      homeMode: data.prefs.home_mode,
                      dailyCount: 5,
                      readingMode: data.prefs.reading_mode,
                      notifications: data.prefs.notifications,
                    }
                  : {}),
                ...(data.interests.length
                  ? {
                      interests: data.interests.map(
                        (r: { interest_tags: { name: string } }) =>
                          r.interest_tags.name,
                      ),
                    }
                  : {}),
              };
            });
            cloudHydrated.current = true;
            // 封面第三层：后台对齐本地缓存与云端版本。
            // 云端更新 → 下载新图替换缓存；云端删除 → 清空缓存，避免旧图重新出现。
            if (cloudCover) {
              const cacheStale = !cachedCover || cachedCover.url !== cloudCover || cachedCover.version !== cloudCoverVersion;
              if (cacheStale) {
                void cacheCoverFromUrl(user.id, cloudCover, cloudCoverVersion, cloudCoverUpdatedAt).then((record) => {
                  const url = coverCacheObjectUrl(record);
                  if (!url || !isCurrent()) return;
                  if (coverBlobUrlRef.current) URL.revokeObjectURL(coverBlobUrlRef.current);
                  coverBlobUrlRef.current = url;
                  setState((current) => ({ ...current, cover: url }));
                });
              }
            } else {
              void clearCoverCache(user.id);
              if (coverBlobUrlRef.current) {
                URL.revokeObjectURL(coverBlobUrlRef.current);
                coverBlobUrlRef.current = null;
              }
            }
          } catch (e) {
            if (!isCurrent()) return;
            setPublicBookmarksLoaded(true);
            toast(e instanceof Error ? e.message : "云端同步失败");
          }
        };
        const scheduleHydration = (event: string, user: User | null) => {
          const id = user?.id || null;
          if (id === currentUserId && event !== "USER_UPDATED") return;
          currentUserId = id;
          setAccountReady(false);
          const version = ++generation;
          clearTimeout(hydrationTimer);
          // Defer beyond the auth lock; microtasks can run while it is still held.
          hydrationTimer = setTimeout(() => { void hydrate(user, version); }, 0);
        };
        const { data } = db.auth.onAuthStateChange((event, session) => {
          // 记住本机登录过的账号，供「隐私与安全」里一键切换。
          if (session?.user) rememberSession(session);
          scheduleHydration(event, session?.user || null);
        });
        cleanup = () => {
          generation += 1;
          clearTimeout(hydrationTimer);
          data.subscription.unsubscribe();
        };
      })
      .catch(() => {});
    return () => {
      alive = false;
      cleanup();
    };
  }, [ready, toast]);
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    let remove = () => {};
    void browserDb().then((db) => {
      if (!alive) return;
      const channel = db.channel(`membership-${accountId}`).on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${accountId}`,
      }, (payload) => {
        const tier = (payload.new as { membership_tier?: string }).membership_tier;
        if (alive && (tier === "free" || tier === "plus" || tier === "pro"))
          setExperienceSummary((current) => ({ ...current, membershipTier: tier }));
      }).subscribe();
      remove = () => { void db.removeChannel(channel); };
    }).catch(() => {});
    return () => { alive = false; remove(); };
  }, [accountId]);
  useEffect(() => {
    const syncProfile = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; nickname?: string; bio?: string; avatar?: string; cover?: string; coverMeta?: CoverMeta }>).detail;
      if (!detail || detail.id !== accountId) return;
      // 换封面 / 删除封面后同步本地缓存：换图先写云端地址再缓存本体，删除则清空缓存与 blob。
      if (typeof detail.cover === "string") {
        if (!detail.cover) {
          coverRemoteRef.current = undefined;
          if (coverBlobUrlRef.current) { URL.revokeObjectURL(coverBlobUrlRef.current); coverBlobUrlRef.current = null; }
          if (accountId) void clearCoverCache(accountId);
        } else {
          coverRemoteRef.current = detail.cover;
          const coverUrl = detail.cover;
          void cloudRequest("/api/v1/me/cover").then((meta: { cover_version?: number; cover_updated_at?: string | null } | null) => {
            if (!meta || !accountId) return;
            void cacheCoverFromUrl(accountId, coverUrl, Number(meta.cover_version || 0), meta.cover_updated_at || null).then((record) => {
              const blobUrl = coverCacheObjectUrl(record);
              if (!blobUrl) return;
              if (coverBlobUrlRef.current) URL.revokeObjectURL(coverBlobUrlRef.current);
              coverBlobUrlRef.current = blobUrl;
              setState((current) => ({ ...current, cover: blobUrl }));
            });
          }).catch(() => { /* 版本拿不到时保留云端地址显示，下次进入再对齐 */ });
        }
      }
      setState((current) => ({
        ...current,
        name: detail.nickname || current.name,
        bio: detail.bio ?? current.bio,
        avatar: detail.avatar || undefined,
        cover: detail.cover !== undefined ? (detail.cover || undefined) : current.cover,
        coverMeta: detail.coverMeta !== undefined ? detail.coverMeta : current.coverMeta,
        comments: current.comments.map((comment) => comment.authorId === accountId ? { ...comment, name: detail.nickname || comment.name, avatar: detail.avatar || undefined } : comment),
      }));
    };
    window.addEventListener("heika-profile-updated", syncProfile);
    return () => window.removeEventListener("heika-profile-updated", syncProfile);
  }, [accountId]);

  // 装扮：属于账号设置。退出登录后回到默认，避免把上一位用户的主题留在界面上。
  const decorState = useDecor();
  useEffect(() => installDecorThemeSync(), []);
  useEffect(() => {
    if (!ready) return;
    if (accountId) void loadDecor(true);
    else resetDecor();
  }, [accountId, ready]);

  const refreshLocalDraftCount = useCallback(async () => {
    setLocalDraftCount(await countDrafts(accountId || "guest"));
  }, [accountId]);
  useEffect(() => {
    let alive = true;
    // 旧版「自动恢复」草稿搬进草稿箱，之后打开发布页不再自动填充。
    void migrateLegacyDrafts(accountId || "guest").then(async () => {
      const count = await countDrafts(accountId || "guest");
      if (alive) setLocalDraftCount(count);
    }).catch(() => {});
    return () => { alive = false; };
  }, [accountId]);
  useEffect(() => {
    if (!accountId || !cloudHydrated.current) return;
    const timer = setTimeout(
      () =>
        void cloudRequest("/api/v1/library-state", {
          action: "preferences",
          homeMode: state.homeMode,
          dailyCount: state.dailyCount,
          readingMode: state.readingMode,
          notifications: state.notifications,
          interests: state.interests,
        }).catch(() => toast("偏好同步失败，本地记录已保留")),
      600,
    );
    return () => clearTimeout(timer);
  }, [
    accountId,
    state.homeMode,
    state.dailyCount,
    state.readingMode,
    state.notifications,
    state.interests,
    toast,
  ]);
  if (!ready)
    return (
      <main className="app editorial-skeleton" aria-label="正在加载内容">
        <div className="skeleton-brand" />
        <div className="skeleton-title" />
        <div className="skeleton-subtitle" />
        <div className="skeleton-feature" />
        <div className="skeleton-grid">
          <i />
          <i />
        </div>
      </main>
    );
  // APP 内嵌且该功能要求登录：不静默注入 APP 的会话（两边共用 refresh_token 会互相作废），
  // 没登录就直接挡在这里，登录成功后 reload 继续进入原来的功能。
  if (
    appEmbed &&
    accountReady &&
    !accountId &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("requireAuth") === "1"
  ) {
    const wantsAdmin = new URLSearchParams(window.location.search).get("admin") === "1";
    return <AppLoginGate
      title={wantsAdmin ? "管理员登录" : "登录后继续"}
      hint={wantsAdmin ? "管理后台只对管理员开放。请在这里用管理员账号登录一次，登录状态会保留在这台设备上，之后直接进入后台。" : undefined}
    />;
  }
  if (pendingRecoveryCodes.length)
    return <RecoveryCodesPage
      codes={pendingRecoveryCodes}
      standalone
      onDone={() => {
        try { window.localStorage.removeItem("heika:pending-recovery-codes"); } catch {}
        window.dispatchEvent(new Event("heika:recovery-codes"));
        setPendingRecoveryCodes([]);
      }}
    />;
  if (pendingInvitation)
    return <InvitationWelcomePage
      invitation={pendingInvitation}
      onDone={() => {
        try { window.localStorage.removeItem("heika:pending-invitation"); } catch {}
        window.dispatchEvent(new Event("heika:pending-invitation"));
        setPendingInvitation(null);
      }}
    />;
  // 深链（后台、我的、合集、装扮、分享合集等）本身就是明确的功能入口，
  // 新设备上不该先被兴趣引导拦一道；只有真正落到首页时才需要选方向。
  const deepLink = (() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return ["admin", "mine", "series", "collection", "room", "chain", "decor", "post", "p"].some((key) => params.has(key));
  })();
  if (!state.onboardingDone && !deepLink)
    return (
      <main className="heika-onboarding">
        <header className="heika-onboarding-top">
          <span className="heika-brand">
            黑卡 <i>HEIKA</i>
          </span>
          <button
            className="onboarding-skip"
            onClick={() => update((s) => ({ ...s, onboardingDone: true }))}
          >
            先随便看看 <ArrowRight size={15} />
          </button>
        </header>
        <section className="onboarding-content">
          <div className="onboarding-heading">
            <span className="onboarding-kicker">
              FIND YOUR NEXT WORLD <i>8 个探索方向</i>
            </span>
            <h1>你想先探索什么？</h1>
            <p>
              黑卡有很多值得发现的内容。选几个你感兴趣的方向，我们每天从中为你精选
              5 张，作为今日优先翻看的入口；翻完之后，还可以继续探索更多。
            </p>
          </div>
          <div className="onboarding-mode-picker" role="group" aria-label="选择主页样式">
            <strong className="onboarding-mode-title">选择主页样式</strong>
            <div className="onboarding-mode-options">
              {([['waterfall', '瀑布流', '多张黑卡并列浏览'], ['blackcard', '黑卡', '菱形切面组成的单张黑卡']] as const).map(([mode, label, description]) => (
                <button
                  key={mode}
                  type="button"
                  className={`onboarding-mode-option${state.homeMode === mode ? ' selected' : ''}`}
                  aria-pressed={state.homeMode === mode}
                  onClick={() => update((current) => ({ ...current, homeMode: mode }))}
                >
                  <span className={`mode-preview ${mode}`} aria-hidden="true" />
                  <span className="onboarding-mode-copy"><b>{label}</b><small>{description}</small></span>
                  <span className="onboarding-mode-check" aria-hidden="true">{state.homeMode === mode ? '✓' : ''}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="topic-grid">
            {topicOptions.map((topic, index) => {
              const selected = state.interests.includes(topic.tag);
              return (
                <button
                  key={topic.tag}
                  className={`topic-card topic-card-${index + 1}${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() =>
                    update((s) => ({
                      ...s,
                      interests: s.interests.includes(topic.tag)
                        ? s.interests.filter((t) => t !== topic.tag)
                        : [...s.interests, topic.tag],
                    }))
                  }
                  style={{
                    backgroundImage: `linear-gradient(180deg,rgba(9,10,11,.08) 10%,rgba(9,10,11,.22) 42%,rgba(9,10,11,.88) 100%),url("${topic.image}")`,
                  }}
                >
                  <span className="topic-index">0{index + 1}</span>
                  <span className="topic-check" aria-hidden="true">
                    {selected && <Check size={17} strokeWidth={2.5} />}
                  </span>
                  <span className="topic-copy">
                    <strong>{topic.title}</strong>
                    <small>{topic.description}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <footer className="onboarding-footer">
          <div className="onboarding-count">
            <strong>
              已选 <i>{state.interests.length}</i> 个
            </strong>
            <span>
              {state.interests.length < 3
                ? "至少选择 3 个话题"
                : "会据此挑选今日精选"}
            </span>
          </div>
          <button
            className="onboarding-start"
            disabled={state.interests.length < 3}
            onClick={() => update((s) => ({ ...s, onboardingDone: true }))}
          >
            开启探索 <ArrowRight size={18} />
          </button>
        </footer>
      </main>
    );
  const currentExperience = experienceProgress(experienceSummary.total);
  const visibleOwnPosts = selectedSeriesId ? state.own.filter((post) => post.seriesId === selectedSeriesId) : state.own;
  // 「我的作品」瀑布流只展示已提交的内容（不含草稿），与 APP 端一致；草稿在编辑器与作品管理中查看
  const visibleOwnWorks = visibleOwnPosts.filter((post) => post.status !== "draft");
  const detailArticleContent = post ? (
    <Suspense fallback={<div className="detail-article-loading" aria-live="polite">正在加载正文…</div>}>
      <EditorialArticle post={post} />
    </Suspense>
  ) : null;
  // 桌面左右栏共用：点赞放在函数里，底部操作条与左侧操作栏调用同一份业务逻辑。
  const toggleDetailLike = () => {
    if (!post || likeBusy) return;
    const next = !state.liked?.includes(post.id);
    setLikeBusy(true);
    void cloudRequest("/api/v1/library-state", { action: "like", id: post.id, value: next }).then(() => {
      const nextCount = Math.max(0, (detailLikeCounts[post.id] ?? post.likeCount ?? 0) + (next ? 1 : -1));
      setDetailLikeCounts((current) => ({ ...current, [post.id]: Math.max(0, (current[post.id] ?? post.likeCount ?? 0) + (next ? 1 : -1)) }));
      setPublicFeed((current) => current.map((item) => item.id === post.id ? { ...item, likeCount: nextCount } : item));
      update((s) => ({ ...s, liked: next ? [...(s.liked || []), post.id] : (s.liked || []).filter((id) => id !== post.id) }));
    }).catch(() => toast("点赞同步失败")).finally(() => setLikeBusy(false));
  };
  // 相关内容：同标签或共享话题，最多取 6 条交给右栏再截 3 条。
  const detailRelated = post ? all.filter((item) => item.id !== post.id && item.status !== "draft" && (
    item.tag === post.tag || (item.topics || []).some((topic) => (post.topics || []).includes(topic))
  )).slice(0, 6) : [];
  // 桌面独立详情页：≥1024 且不在 APP 容器里。窄屏保持原有浮层交互。
  const detailPageMode = detailReaderMode === "page";
  // 目录跳转：桌面页滚窗口，浮层滚详情容器；都按顶栏高度留出偏移，标题不会被遮住。
  const jumpToHeading = (id: string) => {
    const node = document.getElementById(id);
    if (!node) return;
    const offset = detailPageMode ? 96 : 78;
    const scroller = detailPageMode ? null : document.getElementById("detail-scroll");
    if (scroller) {
      // 用两个 rect 的差值算，offsetTop 的参照元素在浮层里不一定是滚动容器。
      const top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
      scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
  };
  // 独立详情页里顶栏显示返回与作品名；其余页面沿用原有二级页标题。
  const topbarTitle = detailPageMode ? (post?.title?.trim() || "作品详情") : secondaryTitle;
  const topbarBack = detailPageMode ? () => closeDetail() : handleSecondaryBack;
  // 管理后台是全屏控制台：隐藏网页端自己的顶栏与底栏，只保留后台的返回键，
  // 否则移动端会同时出现「返回设置」和后台的返回箭头（两个返回键）。
  const adminConsole = tab === "moderation" && isStaff;
  // APP 内打开时，后台的返回键应关闭网页容器回原生设置页，而不是在网页里跳到设置。
  const closeAdminConsole = () => {
    if (appEmbed) {
      try {
        (window as unknown as { HeikaNative?: { post?: (message: string) => void } }).HeikaNative?.post?.(JSON.stringify({ type: "close" }));
      } catch { /* 网页端无桥接时走网页返回 */ }
      return;
    }
    setTab("settings");
    requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.settings || 0, behavior: "instant" }));
  };
  // 「更多」菜单在浮层里挂在头部，在独立页面里挂在左操作栏，共用同一份条目。
  const detailMoreMenu = post ? <>
    {post.channel === "ai" && <>
      <span className="detail-more-group">资源与版本</span>
      {(aiVersionsAvailable || Boolean(post.resourceData?.version || post.resourceData?.changelog)) && <button onClick={() => { setAiDetailAction("versions"); setDetailMoreOpen(false); }}><History size={16} /> 查看更新记录</button>}
      {Object.keys(post.resourceData || {}).length > 0 && <button onClick={() => { setAiDetailAction("resources"); setDetailMoreOpen(false); }}><ExternalLink size={16} /> 相关资源</button>}
      <span className="detail-more-group">反馈与操作</span>
      <button onClick={() => { setAiDetailAction("feedback"); setDetailMoreOpen(false); }}><Flag size={16} /> 内容纠错</button>
    </>}
    <button onClick={() => {
      update((s) => ({ ...s, dismissed: [...new Set([...(s.dismissed || []), post.id])] }));
      void cloudRequest("/api/v1/library-state", { action: "dismiss", id: post.id }).catch(() => toast("反馈同步失败"));
      setDetailMoreOpen(false);
      toast("已减少类似内容推荐");
    }}><ThumbsDown size={16} /> 不感兴趣</button>
    {post.authorId && <button onClick={() => {
      if (!accountId) { setDetailMoreOpen(false); toast("登录后可以调整推荐偏好"); return; }
      void cloudRequest("/api/v1/recommendation-feedback", { action: "mute_author", authorId: post.authorId }).then(() => {
        setPublicFeed((items) => items.filter((item) => item.authorId !== post.authorId));
        void loadPublicFeed(1, true, category);
        setDetailMoreOpen(false); toast("已减少这位创作者的推荐，可在推荐偏好中恢复");
      }).catch((error) => toast(error instanceof Error ? error.message : "推荐偏好保存失败"));
    }}><UserRound size={16} /> 减少此作者推荐</button>}
    {post.topics?.[0] && (() => { const firstTopic = post.topics[0]; return <button onClick={() => {
      if (!accountId) { setDetailMoreOpen(false); toast("登录后可以调整推荐偏好"); return; }
      void cloudRequest("/api/v1/recommendation-feedback", { action: "mute_topic", topic: firstTopic }).then(() => {
        setPublicFeed((items) => items.filter((item) => !item.topics?.includes(firstTopic)));
        void loadPublicFeed(1, true, category);
        setDetailMoreOpen(false); toast(`已减少 #${firstTopic} 推荐，可在推荐偏好中恢复`);
      }).catch((error) => toast(error instanceof Error ? error.message : "推荐偏好保存失败"));
    }}><ThumbsDown size={16} /> 减少 #{firstTopic}</button>; })()}
    {post.status === "published" && <>
      <button onClick={() => {
        const url = postShareUrl(post);
        void navigator.clipboard?.writeText(url).then(() => toast("链接已复制")).catch(() => toast("复制失败"));
        setDetailMoreOpen(false);
      }}><Share2 size={16} /> 复制链接</button>
      <button onClick={() => void openSharePanel()}><Share2 size={16} /> 打开分享面板</button>
    </>}
    {post.cloudId && post.status === "published" && <button onClick={() => {
      if (!accountId) { setDetailMoreOpen(false); toast("登录后可以举报内容"); return; }
      setReportPostId(post.cloudId!); setReportCommentId(null); setReportReason(""); setReportNote(""); setDetailMoreOpen(false); setModal("report");
    }}><Flag size={16} /> 举报内容</button>}
  </> : null;
  // 评论输入框：浮层里是底部悬浮条，独立页面里放在评论区顶部。
  const commentComposerForm = post ? <form className="detail-dock-comment heika-solid-glass" onSubmit={(event) => { event.preventDefault(); void addComment(); }}>
    <div className={`detail-comment-input${reply ? " replying" : ""}${commentInputExpanded || draft ? " expanded" : ""}`}>
      <span className="comment-compose-avatar" aria-hidden="true"><span>{(state.name || "探").slice(0, 1)}</span>{state.avatar && <img src={state.avatar} alt="" onError={(event) => { event.currentTarget.dataset.failed = "true"; }} />}</span>
      {reply && <span className="reply-label">回复 @{replyTargetName || state.comments.find((c) => c.id === reply)?.name || "评论"}<button type="button" aria-label="取消回复" onClick={() => { setReply(undefined); setReplyTargetName(undefined); }}><X size={13} /></button></span>}
      <textarea ref={commentInputRef} value={draft} onFocus={() => setCommentInputExpanded(true)} onBlur={(event) => { if (!draft.trim() && !reply && !event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) setCommentInputExpanded(false); }} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void addComment(); } }} placeholder="说说你的想法…" rows={commentInputExpanded || draft ? 3 : 1} maxLength={1000} aria-label="评论内容" />
      {draft.trim() && <button type="button" className="comment-clear" aria-label="清除输入" onClick={() => setDraft("")}><X size={14} /></button>}
      {draft.trim() && <button type="submit" className="comment-send" disabled={commentSending} aria-label="发送评论"><ArrowUp size={18} strokeWidth={2.4} /></button>}
    </div>
  </form> : null;
  return (
    <main className={`app${detailPageMode ? " is-detail-page" : ""}${tab === "discover" ? " app-discover" : ""}${secondaryTitle ? " has-secondary-header" : ""}${isImmersive ? " app-immersive" : ""}${adminConsole ? " app-admin-console" : ""}${secondaryTitle || tab === "search" || (tab === "settings" && settingsDetail !== null) ? " app-nav-hidden-mobile" : ""}`}>
      {adminConsole ? null : (
      <>
      <header className="desktop-topbar" aria-label="桌面主导航">
        <div className="dtb-inner">
          {topbarTitle ? (
            <button type="button" className="dtb-back" onClick={topbarBack} aria-label={`返回，当前页面：${topbarTitle}`}>
              <ArrowLeft size={18} /><strong>{topbarTitle}</strong>
            </button>
          ) : (
            <button type="button" className="dtb-brand" onClick={() => leaveDetailThen(() => { setTab("today"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); })}>
              <span className="brand"><span>黑卡</span><i>HEIKA</i></span>
            </button>
          )}
          <nav className="dtb-nav" aria-label="主入口">
            <button type="button" className={tab === "today" ? "active" : ""} aria-current={tab === "today" ? "page" : undefined} onClick={() => leaveDetailThen(() => { setTab("today"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); })}>首页</button>
            <button type="button" className={tab === "discover" && discoverChannel !== "ai" && discoverChannel !== "series" ? "active" : ""} aria-current={tab === "discover" && discoverChannel !== "ai" && discoverChannel !== "series" ? "page" : undefined} onClick={() => leaveDetailThen(() => { if (tab !== "discover") setTab("discover"); if (discoverChannel === "ai") switchDiscoverChannel("community"); })}>发现</button>
            <button type="button" className={tab === "discover" && discoverChannel === "ai" ? "active" : ""} aria-current={tab === "discover" && discoverChannel === "ai" ? "page" : undefined} onClick={() => leaveDetailThen(() => { if (tab !== "discover") { setTab("discover"); queuedDiscoverChannel.current = "ai"; } else if (discoverChannel !== "ai") switchDiscoverChannel("ai"); })}>AI 专区</button>
            <button type="button" className={tab === "discover" && discoverChannel === "series" ? "active" : ""} aria-current={tab === "discover" && discoverChannel === "series" ? "page" : undefined} onClick={() => leaveDetailThen(() => { if (tab !== "discover") { setTab("discover"); queuedDiscoverChannel.current = "series"; } else if (discoverChannel !== "series") switchDiscoverChannel("series"); })}>合集</button>
            <button type="button" className={tab === "messages" ? "active" : ""} aria-current={tab === "messages" ? "page" : undefined} onClick={() => leaveDetailThen(() => setTab("messages"))}>消息<InboxBadge enabled={state.notifications.messages} inAppEnabled={tab !== "messages"} onNotice={toast} onOpenConversationPeer={(peerId) => { setMessagePeer(peerId); setTab("messages"); }} /></button>
          </nav>
          <form className="dtb-search" role="search" onSubmit={(event) => { event.preventDefault(); const value = desktopSearch.trim(); if (!value) return; setSearchReturnTab(tab === "discover" ? "discover" : "today"); leaveDetailThen(() => { submitSearch(value); setTab("search"); }); }}>
            <Search size={16} aria-hidden="true" />
            <input value={desktopSearch} onChange={(event) => setDesktopSearch(event.target.value)} placeholder="搜索内容、话题或用户" maxLength={60} aria-label="搜索内容、话题或用户" />
            {desktopSearch.trim() && <button type="submit" aria-label="开始搜索">搜索</button>}
          </form>
          <div className="dtb-actions">
            <button type="button" className="dtb-publish" onClick={() => void openComposer()}><Plus size={16} /> 发布</button>
            <button type="button" className="dtb-icon" aria-label="打开通知" onClick={() => openNotifications(tab === "today" ? "today" : "discover")}><Bell size={19} strokeWidth={1.8} /></button>
            <div className="dtb-account">
              <button type="button" className="dtb-avatar" aria-haspopup="menu" aria-expanded={desktopMenuOpen} aria-label="账号菜单" onClick={() => setDesktopMenuOpen((open) => !open)}>
                {state.avatar ? <img src={state.avatar} alt="" /> : <span>{(state.name || "探").slice(0, 1)}</span>}
              </button>
              {desktopMenuOpen && (
                <>
                  <button type="button" className="dtb-menu-scrim" aria-label="关闭账号菜单" onClick={() => setDesktopMenuOpen(false)} />
                  <div className="dtb-menu" role="menu">
                    <div className="dtb-menu-head"><strong>{state.name || "探索者"}</strong><small>{accountId ? `会员 · ${membershipTier === "pro" ? "Pro" : membershipTier === "plus" ? "Plus" : "免费版"}` : "未登录"}</small></div>
                    <button type="button" role="menuitem" onClick={() => { setDesktopMenuOpen(false); leaveDetailThen(() => { setTab("mine"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); }); }}><UserRound size={16} /> 个人主页</button>
                    <button type="button" role="menuitem" onClick={() => { setDesktopMenuOpen(false); leaveDetailThen(openMineSettings); }}><Settings size={16} /> 设置</button>
                    <button type="button" role="menuitem" onClick={() => { setDesktopMenuOpen(false); leaveDetailThen(() => openSettingsDetail("membership", "mine")); }}><Crown size={16} /> 会员中心</button>
                    {appDownloadUrl && <a role="menuitem" href={appDownloadUrl} target="_blank" rel="noopener noreferrer" onClick={() => setDesktopMenuOpen(false)}><Smartphone size={16} /> 下载 App</a>}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      <header className={`topline${secondaryTitle ? " secondary-topline" : ""}${tab === "mine" && !secondaryTitle ? " mine-topline" : ""}${tab === "discover" && !secondaryTitle ? " is-discover-topline" : ""}${tab === "discover" && discoverNavCollapsed ? " is-nav-collapsed" : ""}`}>
        {secondaryTitle ? <button type="button" className="topline-back" onClick={handleSecondaryBack} aria-label={`返回，当前页面：${secondaryTitle}`}><ArrowLeft size={19}/><strong>{secondaryTitle}</strong></button> : <><span className="brand"><span>黑卡</span><i>HEIKA</i></span>
        {tab === "discover" && !secondaryTitle ? <div className="discover-channel-tabs topline-channel-tabs" role="tablist" aria-label="发现频道">
            <button type="button" role="tab" aria-selected={discoverChannel === "community"} className={discoverChannel === "community" ? "selected" : ""} onClick={() => switchDiscoverChannel("community")}><span>精选</span></button>
            <button type="button" role="tab" aria-selected={discoverChannel === "ai"} className={discoverChannel === "ai" ? "selected ai-channel-active" : ""} onClick={() => switchDiscoverChannel("ai")}><span><Sparkles size={13} aria-hidden="true"/>AI</span></button>
            <button type="button" role="tab" aria-selected={discoverChannel === "series"} className={discoverChannel === "series" ? "selected" : ""} onClick={() => switchDiscoverChannel("series")}><span>合集</span></button>
            <button type="button" role="tab" aria-selected={discoverChannel === "mall"} className={discoverChannel === "mall" ? "selected" : ""} onClick={() => switchDiscoverChannel("mall")}><span>商城</span></button>
          </div> : null}</>}
        <div className="topline-end-actions">
        {tab === "today" && !secondaryTitle ? <div className="discover-top-actions today-top-actions">
          <button type="button" className="topline-action" aria-label="搜索内容或用户" onClick={() => { setSearchReturnTab("today"); setSearchDraft(searchTerm); setTab("search"); }}><Search size={19} strokeWidth={1.8}/></button>
          <button type="button" className="topline-action" aria-label="打开通知" onClick={() => openNotifications("today")}><Bell size={19} strokeWidth={1.8}/></button>
        </div> : tab === "mine" && !secondaryTitle ? <div className="mine-topline-actions"><button type="button" className="mine-membership-button" aria-label={`会员中心，当前${membershipTier === "pro" ? "Pro" : membershipTier === "plus" ? "Plus" : "免费版"}`} onClick={() => openSettingsDetail("membership", "mine")}><Crown size={16}/><span>会员中心</span></button><button type="button" className="mine-settings-button" aria-label="打开设置" onClick={openMineSettings}><Settings size={19}/></button></div> : null}
        {!secondaryTitle && tab === "today" && appDownloadUrl && !(typeof window !== "undefined" && "HeikaNative" in window) && <a className="app-download-link" href={appDownloadUrl} target="_blank" rel="noopener noreferrer" aria-label="下载黑卡 Android App"><Smartphone size={16}/><span>下载 App</span></a>}
        </div>
      </header>
      </>
      )}
      {/* 列表与详情独立：桌面进入详情时列表只隐藏不卸载，返回后频道、筛选、分页与滚动位置都还在。 */}
      <div className="app-views" hidden={detailPageMode || detailRouteState !== null}>
      {tab === "today" && (
        <section
          key={state.homeMode}
          className={`page editorial-home home-${state.homeMode}`}
          onTouchStart={(e) => {
            pullStart.current =
              window.scrollY < 2 ? e.touches[0].clientY : null;
          }}
          onTouchEnd={(e) => {
            if (
              state.homeMode === "waterfall" &&
              pullStart.current !== null &&
              e.changedTouches[0].clientY - pullStart.current > 90
            )
              void refreshFeed();
            pullStart.current = null;
          }}
        >
          {state.homeMode === "blackcard" ? (
            <div className="today-heading">
              <div>
                <h1>精选</h1>
                <p className="lead">轻触菱面 · 翻开今日黑卡</p>
              </div>
            </div>
          ) : (
            <div className="daily-quota-summary" role="status" aria-live="polite">
              <strong>本周期已翻开 {Math.min(opened.length, dailyAllowance)} / {dailyAllowance} 张</strong>
              <span>{opened.length >= dailyAllowance ? "本周期额度已用完，已解锁卡片仍可查看" : `还可翻开 ${dailyAllowance - opened.length} 张`}{cycleLabel ? ` · ${cycleLabel}` : ""}</span>
            </div>
          )}
          {/* 首页推荐位：额度下方、卡池上方。无有效内容时组件自身返回 null，不留占位。 */}
          <HomeBannerCarousel
            onOpenPost={(cloudId) => void openSearchPost(cloudId, null)}
            onOpenSeries={(seriesId) => openCollection(seriesId)}
          />
          {state.homeMode === "waterfall" ? (
            <>
              <div className="candidate-feed waterfall-card-feed">
                {visibleCandidates.map((candidate, index) => renderCandidate(candidate, index))}
              </div>
              <p className="daily-deck-caption">本周期卡池 · 50 张 · 翻卡次数每 24 小时自动刷新</p>
            </>
          ) : (
            <>
              <div className="black-facet-card" aria-label="黑卡菱形切面选择区">
                <span className="black-facet-brand">HEIKA · 黑卡</span>
                <span className="black-facet-hint">选择一个菱面，翻开一张黑卡</span>
                <svg className="black-facet-matrix" viewBox="0 0 100 125" preserveAspectRatio="none" role="group" aria-label="选择要翻开的黑卡">
                  <defs>
                    <clipPath id="black-facet-inset"><rect x="0" y="0" width="100" height="125" /></clipPath>
                    <linearGradient id="facet-metal-a" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#9aa9ae"/><stop offset=".48" stopColor="#53636a"/><stop offset="1" stopColor="#7d8d93"/></linearGradient>
                    <linearGradient id="facet-metal-b" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#718188"/><stop offset=".52" stopColor="#29363c"/><stop offset="1" stopColor="#7b8b91"/></linearGradient>
                    <linearGradient id="facet-metal-c" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#9aa8ad"/><stop offset=".55" stopColor="#6c7c82"/><stop offset="1" stopColor="#35444a"/></linearGradient>
                    <linearGradient id="facet-metal-d" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#34434a"/><stop offset=".46" stopColor="#8c999e"/><stop offset="1" stopColor="#4c5c63"/></linearGradient>
                  </defs>
                  {blackCardFacets.map((points, index) => {
            const hasUnlocked = candidates.some((candidate, candidatePosition) =>
                      opened.includes(candidate.id) && Boolean(state.revealed[candidate.id]) &&
                      (state.facetSlots?.[candidate.id] ?? candidatePosition % blackCardFacets.length) === index,
                    );
                    const unavailable = !candidates.length || (!hasUnlocked && opened.length >= dailyAllowance);
                    return <polygon
                      key={index}
                      points={points}
                      className={`black-facet facet-tone-${index % 4}${hasUnlocked ? " unlocked" : ""}${unavailable ? " unavailable" : ""}`}
                      clipPath="url(#black-facet-inset)"
                      role="button"
                      tabIndex={unavailable ? -1 : 0}
                      aria-label={hasUnlocked ? `第 ${index + 1} 个菱面已翻开，点击查看黑卡` : `第 ${index + 1} 个菱面未翻开，点击选择黑卡`}
                      onClick={(event) => !unavailable && chooseBlackFacet(index, event.currentTarget)}
                      onKeyDown={(event) => {
                        if ((event.key === "Enter" || event.key === " ") && !unavailable) {
                          event.preventDefault();
                          chooseBlackFacet(index, event.currentTarget);
                        }
                      }}
                    />;
                  })}
                </svg>
                <span className="black-facet-progress">今日已翻 {Math.min(opened.length, dailyAllowance)} / {dailyAllowance}</span>
              </div>
              <div className="black-card-quota-meta">
                <p className="fineprint">每日基础 5 次{luckyBonusToday ? ` · 幸运加成 +${luckyBonusToday}` : ""} · 已选 {Math.min(opened.length, dailyAllowance)}/{dailyAllowance}</p>
              </div>
            </>
          )}
        </section>
      )}
      {tab === "search" && <SearchPage
        query={searchTerm}
        accountId={accountId}
        onBack={closeSearch}
        onSearch={(term) => submitSearch(term)}
        onOpenPost={(cloudId, source) => void openSearchPost(cloudId, source)}
        onOpenSeries={(seriesId) => openCollection(seriesId)}
        onOpenPerson={(personId) => setAuthorProfile(personId)}
        onOpenTopic={(name) => { setSearchDraft(name); submitSearch(name); }}
      />}
      {tab === "discover" && (
        <section className="page editorial-home discover-page">
          
          {discoverSearchOpen && <form className="discover-inline-search" role="search" onSubmit={(event) => { event.preventDefault(); setSearchReturnTab("discover"); submitSearch(searchDraft); setDiscoverSearchOpen(false); setTab("search"); }}>
            <Search size={17} aria-hidden="true" />
            <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜索标题、作者或内容" aria-label="搜索内容或用户" autoFocus maxLength={60} />
            {searchDraft && <button type="button" aria-label="清除搜索内容" onClick={() => setSearchDraft("")}><X size={15}/></button>}
            <button type="submit" className="discover-inline-search-submit" disabled={!searchDraft.trim()}>搜索</button>
          </form>}
          <div className={`discover-channel-content${discoverChannelPhase ? ` is-${discoverChannelPhase}` : ""}`}>
          <div className={`discover-community-channel discover-channel-panel${discoverChannel === "community" ? " is-active" : ""}${outgoingDiscoverChannel === "community" ? " is-outgoing" : ""}`} hidden={discoverChannel !== "community" && outgoingDiscoverChannel !== "community"}>
          {explorationAd?.enabled && explorationAd.post_client_id && <button type="button" className={`exploration-ad-card${explorationAd.kind === "image" && explorationAd.image_url ? " has-image" : ""}`} aria-label={`${explorationAd.title}，打开相关作品`} onClick={(event) => void openExplorationAdPost(event.currentTarget)}>
            {explorationAd.kind === "image" && explorationAd.image_url && <img src={explorationAd.image_url} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.remove(); event.currentTarget.closest(".exploration-ad-card")?.classList.remove("has-image"); }}/>}
                <span className="exploration-ad-card-copy"><small><Megaphone size={12}/> 黑卡 · 推荐</small><strong>{explorationAd.title}</strong>{explorationAd.body && <span>{explorationAd.body}</span>}</span>
            <ArrowRight size={17} aria-hidden="true"/>
          </button>}
          <div className="discover-secondary-bar">
<div className={`discover-category-nav${categoryOverflowOpen ? " is-expanded" : ""}`} role="tablist" aria-label="发现内容分类">
            {["全部", ...visibleDiscoverCategories].map((t) => (
              <button
                key={t}
                className={category === t ? "selected" : ""}
                role="tab"
                aria-selected={category === t}
                onClick={() => {
                  if (category === t) return;
                  setCategory(t);
                  setPublicFeed([]);
                  setFeedPostIds([]);
                  setFeedPage(0);
                  setFeedTotal(0);
                  setFeedHasMore(false);
                  feedCursor.current = null;
                  setFeedLoadedTag(null);
                  setPage(12);
                }}
              >
                {t === "全部" ? "推荐" : t}
              </button>
            ))}
            {hiddenCategoryCount > 0 && <button type="button" className="discover-category-more" aria-expanded={categoryOverflowOpen} onClick={() => setCategoryOverflowOpen((open) => !open)}>{categoryOverflowOpen ? "收起分类" : `更多分类${hiddenCategoryCount ? ` ${hiddenCategoryCount}` : ""}`}<ChevronDown size={13} aria-hidden="true"/></button>}
          </div>
          <div className="discover-bar-actions">
<div className="discover-top-actions discover-bar-group">
            <button type="button" className={`topline-action${discoverSearchOpen ? " selected" : ""}`} aria-label={discoverSearchOpen ? "关闭搜索" : "搜索内容或用户"} aria-expanded={discoverSearchOpen} onClick={() => { setSearchDraft(searchTerm); setDiscoverSearchOpen((open) => !open); setDiscoverSettingsOpen(false); }}><Search size={19} strokeWidth={1.8}/></button>
            <button type="button" className={`topline-action${discoverSettingsOpen ? " selected" : ""}`} aria-label="更多" aria-expanded={discoverSettingsOpen} aria-controls="discover-quick-settings" onClick={() => { setDiscoverSettingsOpen((open) => !open); setDiscoverSearchOpen(false); }}><MoreHorizontal size={21} strokeWidth={1.8}/></button>
            {discoverSettingsOpen && <div className="discover-quick-settings" id="discover-quick-settings" role="group" aria-label="发现页浏览设置">
              <span>话题</span>
            <div className="discover-quick-topics">{topicChoices.slice(0, 8).map((topic) => <button key={topic.id} type="button" onClick={() => { setDiscoverSettingsOpen(false); void openTopic(topic.name); }}>#{topic.name}<small>{topic.postCount}</small></button>)}</div>
            <span>浏览方式</span>
              <button type="button" aria-pressed={state.discoverLayout === "waterfall"} className={state.discoverLayout === "waterfall" ? "selected" : ""} onClick={() => { update((current) => ({ ...current, discoverLayout: "waterfall" })); setDiscoverSettingsOpen(false); }}><LayoutGrid size={16}/><span>双列瀑布流</span></button>
              <button type="button" aria-pressed={state.discoverLayout === "single"} className={state.discoverLayout === "single" ? "selected" : ""} onClick={() => { update((current) => ({ ...current, discoverLayout: "single" })); setDiscoverSettingsOpen(false); }}><List size={16}/><span>单列浏览</span></button>
              <RecommendationControls accountId={accountId} onLogin={() => { setDiscoverSettingsOpen(false); setTab("messages"); }} onNotice={toast} onChange={() => void loadPublicFeed(1, true, category)} />
            </div>}
        </div>
          </div>
        </div>
          {sort === "精选" && category === "全部" && latestOpenedPost && (
            <section className="recent-flip-section" aria-labelledby="recent-flip-title">
              <div className="recent-flip-heading">
                <div><h2 id="recent-flip-title">最近翻开的卡</h2></div>
                <span>随时回来继续阅读</span>
              </div>
              {renderCandidate(latestOpenedPost, -1, true)}
            </section>
          )}
          
          {topicEvents.length > 0 && <section className="topic-events-section" aria-labelledby="topic-events-title"><div className="topic-events-heading"><div><h2 id="topic-events-title">本期话题共创</h2></div><span>{topicEvents.length} 个进行中</span></div><div className="topic-event-list">{topicEvents.map((event) => <article className="topic-event-card" key={event.id}><div className="topic-event-mark">#{event.topic}</div><div className="topic-event-copy"><h3>{event.title}</h3><p>{event.description}</p><small>{event.participantCount} 人参与 · {event.postCount} 篇内容 · 截止 {new Date(event.ends_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></div><button type="button" className={event.joined ? "joined" : ""} onClick={() => void joinTopicEvent(event)}>{event.joined ? "继续创作" : "加入共创"}</button></article>)}</div></section>}
          <div className="discover-sort" role="group" aria-label="发现排序">
            {["精选", "最新", "高分", "关注"].map((option) => <button key={option} type="button" className={sort === option ? "selected" : ""} aria-pressed={sort === option} onClick={() => { if (sort !== option) { setPublicFeed([]); setFeedPostIds([]); setFeedPage(0); setFeedTotal(0); setFeedHasMore(false); feedCursor.current = null; setFeedLoadedTag(null); setFeedLoadedSort(null); setPage(12); setSort(option); } }}>{option === "精选" ? "为你推荐" : option === "高分" ? "高评分" : option}</button>)}
          </div>
          {sort === "关注" && !accountId && <p className="fineprint follow-feed-hint">登录并关注创作者后，这里会集中显示他们的新内容。</p>}
          <div className="section-head editorial-section-head discover-feed-heading">
            <h2>{category === "全部" ? "为你推荐" : category}</h2>
            <span>{Math.max(filtered.length, feedTotal)} 篇内容</span>
            <button type="button" className="text-button feed-refresh" onClick={() => void refreshFeed()}>刷新 ↻</button>
          </div>
          {feed(list)}
          </div>
          <div className={`discover-ai-channel discover-channel-panel${discoverChannel === "ai" ? " is-active" : ""}${outgoingDiscoverChannel === "ai" ? " is-outgoing" : ""}`} hidden={discoverChannel !== "ai" && outgoingDiscoverChannel !== "ai"}>
            <AISpace accountId={accountId} onOpen={openAiPost} onLogin={() => setTab("messages")} onNotice={toast}
              onOpenPostById={(cloudId) => void openSearchPost(cloudId, null)}
              onOpenSeries={(seriesId) => openCollection(seriesId)}
              onOpenSeriesChannel={() => switchDiscoverChannel("series")} />
          </div>
          <div className={`discover-series-channel discover-channel-panel${discoverChannel === "series" ? " is-active" : ""}${outgoingDiscoverChannel === "series" ? " is-outgoing" : ""}`} hidden={discoverChannel !== "series" && outgoingDiscoverChannel !== "series"}>
            <SeriesChannel accountId={accountId} onOpenSeries={(seriesId) => openCollection(seriesId)} onLogin={() => setTab("messages")} />
          </div>
          <div className={`discover-mall-channel discover-channel-panel${discoverChannel === "mall" ? " is-active" : ""}${outgoingDiscoverChannel === "mall" ? " is-outgoing" : ""}`} hidden={discoverChannel !== "mall" && outgoingDiscoverChannel !== "mall"}>
            <div className="mall-shell">
              <span className="mall-shell-icon"><ShoppingBag size={26} strokeWidth={1.6}/></span>
              <strong>商城</strong>
              <p>限定卡面、实体周边与会员礼盒正在准备中。</p>
              <span className="mall-shell-status">正在开发 · 敬请期待</span>
            </div>
          </div>
          </div>
        </section>
      )}
      {tab === "co-explore" && <CoExplore accountId={accountId} posts={publicFeed.length ? publicFeed : all} onLogin={() => setTab("messages")} onNotice={toast}/>}
      {tab === "notifications" && <NotificationCenter accountId={accountId} onLogin={() => setTab("messages")} onOpenPost={(item) => {
        const post = item.post_id ? all.find((candidate) => candidate.cloudId === item.post_id || candidate.id.toString() === item.post_id) || item.post : item.post;
        if (post) { setPublicFeed((items) => items.some((candidate) => candidate.id === post.id) ? items : [...items, post]); requestAnimationFrame(() => openPost(post.id, "discover")); } else toast("这篇内容暂时不可用");
      }}/ >}
      {tab === "shared-collection" && <SharedCollection code={sharedCollectionCode} accountId={accountId} onNotice={toast} onLogin={() => setTab("messages")} onOpenPost={(post) => {
        setPublicFeed((items) => items.some((item) => item.id === post.id) ? items : [...items, post]);
        requestAnimationFrame(() => openPost(post.id, "discover"));
      }}/>}
      {tab === "topic" && topicSummary && (
        <section className="page editorial-home topic-detail-page">
          <button className="back settings-back" onClick={closeTopicPage}><ArrowLeft size={18} /> 返回</button>
          <h1>#{topicSummary.name}</h1>
          <p className="lead">{topicSummary.description}</p>
          <div className="topic-detail-stats">
            <span><strong>{topicSummary.postCount}</strong> 篇公开内容</span>
            <span><strong>{topicSummary.participantCount}</strong> 位创作者</span>
            <TopicFollowButton topicId={topicSummary.id} accountId={accountId} onLogin={() => setTab("messages")} onNotice={toast} />
          </div>
          {topicPosts.length ? <div className={`masonry${state.discoverLayout === "single" ? " single-column" : ""}`}>{topicPosts.map((item) => postCard(item, "discover"))}</div> : <p className="topic-empty-state">这个话题还没有公开内容，来分享你的第一篇发现。</p>}
          {topicPosts.length < topicTotal && <button className="feed-refresh" disabled={topicLoading} onClick={() => void loadMoreTopicPosts()}>{topicLoading ? "正在加载…" : "加载更多"}</button>}
        </section>
      )}
      {(tab === "messages" || messagesTabVisited) && (
        <div className="messages-tab-cache" hidden={tab !== "messages"}>
          <Messages
            initialPeer={messagePeer}
            isActive={tab === "messages"}
            onPeerOpened={() => setMessagePeer(null)}
            onConversationChange={setChatConversationOpen}
            onOpenProfile={(id) => setAuthorProfile(id)}
            onOpenNotifications={openNotifications}
            onNotice={toast}
            onOpenConversationPeer={(id) => { setMessagePeer(id); setTab("messages"); }}
            messageNotificationsEnabled={state.notifications.messages}
          />
        </div>
      )}
      {tab === "settings" && settingsDetail === null && (
        <SettingsHome
          theme={theme}
          fontChoice={fontChoice}
          homeMode={state.homeMode}
          readingMode={state.readingMode}
          detailTransition={detailTransition}
          discoverLayout={state.discoverLayout}
          profileLayout={profileLayout}
          messagesEnabled={state.notifications.messages}
          accountId={accountId}
          isStaff={isStaff}
          onOpenDetail={openSettingsDetail}
          onOpenDecor={(target) => { setDecorKind(target === "card" ? "card" : target === "bottom" ? "bottom" : "all"); setDecorTab(target === "official" ? "official" : "studio"); setDecorOpen(true); }}
          onOpenDrafts={() => setDraftBoxOpen(true)}
          onOpenAbout={openAboutPage}
          onOpenContent={() => openMyContent("settings")}
          onOpenCreator={() => openCreatorCenter("settings")}
          onOpenFeedbackAdmin={() => openSettingsDetail("feedbackAdmin")}
          onOpenModeration={() => { setTab("moderation"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); }}
          onBack={() => {
            setSettingsPersonalOpen(false);
            setTab("mine");
            requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.mine || 0, behavior: "instant" }));
          }}
        />
      )}
      {tab === "settings" && settingsDetail !== null && (
        <section key={settingsDetail} className={`page settings-page settings-detail-page${settingsDetail === "membership" ? " membership-settings-page" : ""}`}>
          <button className="back settings-back" onClick={closeSettingsDetail}><ArrowLeft size={18} /> {settingsReturnTab === "mine" ? "我的" : "设置"}</button>
          {settingsDetail !== "membership" && <><h1>{({theme:"主题外观",font:"字体设置",discoverLayout:"发现页布局",profileLayout:"他人主页布局",homeMode:"首页浏览方式",reading:"阅读模式",detailTransition:"详情过渡效果",notifications:"通知与提醒",profile:"个人资料",interests:"兴趣与话题",security:"隐私与安全",membership:"会员中心",progression:"等级与奖励",creator:"创作者中心",cache:"缓存管理",feedback:"意见反馈",feedbackAdmin:"反馈管理",announcement:"公告管理",certification:"兑换认证码"})[settingsDetail]}</h1><p className="lead">{settingsDetail === "profile" ? "完善公开资料，让其他探索者更好地认识你。" : settingsDetail === "interests" ? "选择感兴趣的方向，帮助黑卡整理每日探索内容。" : settingsDetail === "security" ? "管理笔记可见范围、私聊接收范围、黑名单和账号安全。" : settingsDetail === "progression" ? "翻开卡片、认真评分，积累经验解锁探索者等级奖励。" : settingsDetail === "certification" ? "查看已获得的认证标识，兑换管理员发放的认证码。" : "预览效果并选择偏好，设置会自动保存。"}</p></>}
          {settingsDetail === "progression" && (() => {
            const progress = experienceProgress(experienceSummary.total);
            return <div className="experience-page-content">
              <div className="experience-total-card"><span>当前等级</span><strong>LV.{progress.current.level}</strong><b>{experienceSummary.total} EXP</b><div className="experience-track"><i style={{ width: `${progress.percent}%` }} /></div><small>{progress.next ? `距离 LV.${progress.next.level} 还差 ${progress.next.threshold - experienceSummary.total} EXP` : "已达到当前最高等级"}</small></div>
              <div className="experience-rule-note"><strong>经验获取</strong><span>当天首次翻卡 +10 EXP · 每日最多 10 次翻卡计分</span><span>首次给每篇内容评分 +2 EXP · 每日最多 5 次</span><small>评分修改不会重复获得经验；给自己发布的内容评分不计入。</small></div>
              <div className="experience-level-list">
                <h2>等级奖励</h2>
                <p className="experience-reward-intro">达到经验要求后领取奖励，领取记录会同步保存到账号。</p>
                {EXPERIENCE_LEVELS.map((item) => {
                  const unlocked = experienceSummary.total >= item.threshold;
                  const claimed = experienceSummary.claimedLevels.includes(item.level);
                  return <div className={`experience-level-row${unlocked ? " unlocked" : ""}${item.level === progress.current.level ? " is-current" : ""}${claimed ? " is-claimed" : ""}`} aria-current={item.level === progress.current.level ? "step" : undefined} key={item.level}>
                    <strong>LV.{item.level}</strong>
                    <span className="experience-reward-copy"><b>{item.reward}</b><small>{item.description}</small></span>
                    <small className="experience-reward-threshold">{item.threshold} EXP</small>
                    {claimed ? <span className="experience-reward-state"><Check size={13}/> 已领取</span> : unlocked ? <button className="experience-reward-claim" type="button" disabled={rewardClaimBusyLevel !== null} onClick={() => void claimExperienceReward(item.level)}>{rewardClaimBusyLevel === item.level ? "领取中…" : "领取奖励"}</button> : <span className="experience-reward-state is-locked">未解锁</span>}
                  </div>;
                })}
              </div>
              <div className="experience-rule-note"><strong>Plus / Pro 加成 · 当前 {experienceSummary.membershipTier.toUpperCase()}</strong><span>Plus 每日首次翻卡额外 +3 EXP · Pro 额外 +6 EXP。</span><small>会员等级由管理员根据已核验权益设置；订阅预览页不会自动开通会员。</small></div>
              {!!experienceSummary.events.length && <div className="experience-level-list"><button type="button" className="collapsible-panel-toggle" aria-expanded={recentExperienceOpen} onClick={() => setRecentExperienceOpen((open) => !open)}><h2>最近经验</h2><span>{experienceSummary.events.length} 条 <ChevronDown size={16}/></span></button>{recentExperienceOpen && experienceSummary.events.map((event, index) => <div className="experience-event-row" key={`${event.createdAt}-${index}`}><span>{event.type === "flip" ? "翻开卡片" : event.type === "mission" ? "创作者任务" : event.type === "daily_mission" ? "每日探索任务" : "内容评分"}</span><strong>+{event.points} EXP</strong><small>{new Date(event.createdAt).toLocaleDateString("zh-CN")}</small></div>)}</div>}
            </div>;
          })()}
          {settingsDetail === "profile" && <AccountProfile mode="page" name={state.name} bio={state.bio} avatar={state.avatar} cover={state.cover} coverMeta={state.coverMeta} accountId={accountId} details={state.profileDetails} onNotice={toast} onSave={(name,bio,avatar,profileDetails)=>{update(current=>({...current,name,bio,avatar,profileDetails}));window.dispatchEvent(new CustomEvent("heika-profile-updated",{detail:{id:accountId,nickname:name,bio,avatar}}));}} onClose={closeSettingsDetail}/>}
          {settingsDetail === "security" && <><AccountSwitcher accountId={accountId} onNotice={toast}/><MessagingPreferences accountId={accountId} onLogin={() => { closeSettingsDetail(); setTab("messages"); }} publicBookmarks={publicBookmarks} publicBookmarksLoaded={publicBookmarksLoaded} bookmarkVisibilityBusy={bookmarkVisibilityBusy} onBookmarkVisibilityChange={updateBookmarkVisibility} onNotice={toast}/><AppealCenter accountId={accountId} onLogin={() => { closeSettingsDetail(); setTab("messages"); }} onNotice={toast}/></>}
          {settingsDetail === "announcement" && <AnnouncementAdmin onNotice={toast}/>}
          {settingsDetail === "membership" && <MembershipCenter tier={membershipTier} dailyAllowance={dailyAllowance} usedFlips={opened.length} accountId={accountId} experienceTotal={experienceSummary.total} /> }
          {settingsDetail === "certification" && <CertificationSettings />}
          {settingsDetail === "interests" && <div className="account-interests-page">
            <div className="interest-page-note"><Sparkles size={16}/><span>兴趣保存在此设备，并按账号分别存储。</span></div>
            <div className="account-interest-grid" role="group" aria-label="兴趣偏好">
              {tags.map((tag,index)=>{const InterestIcon=[Compass,Heart,Star,Sparkles][index%4];const selected=state.interests.includes(tag);return <button key={tag} className={`account-interest-option${selected?" selected":""}`} aria-pressed={selected} onClick={()=>update(current=>({...current,interests:current.interests.includes(tag)?current.interests.filter(item=>item!==tag):[...current.interests,tag]}))}><span><InterestIcon size={17}/></span><strong>{tag}</strong><i>{selected?<Check size={14}/>:null}</i></button>})}
            </div>
            <FollowedTopicsSettings accountId={accountId} onOpen={(name) => { closeSettingsDetail(); void openTopic(name); }} onNotice={toast}/>
          </div>}
          {settingsDetail === "theme" && (
            <div className="preference-options" role="radiogroup" aria-label="外观主题">
              {([['light','浅色','清爽白底，适合明亮环境'],['dark','深色','降低亮度，适合暗光浏览'],['system','跟随系统','随设备外观自动切换']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={theme===value} className={`preference-option${theme===value?' selected':''}`} onClick={()=>setTheme(value)}>{renderPreferencePreview('theme',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{theme===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "font" && (
            <div className="preference-options" role="radiogroup" aria-label="字体选择">
              {([['oppo','OPPO Sans 4.0','使用设备已安装的 OPPO Sans；未安装时自动回退系统字体'],['system','系统字体','跟随设备默认字体']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={fontChoice===value} className={`preference-option${fontChoice===value?' selected':''}`} onClick={()=>setFontChoice(value)}>{renderPreferencePreview('font',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{fontChoice===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "discoverLayout" && (
            <div className="preference-options" role="radiogroup" aria-label="发现页布局">
              {([['waterfall','瀑布流','双列卡片，快速浏览更多内容'],['single','单列阅读','单列排版，适合连续阅读']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={state.discoverLayout===value} className={`preference-option${state.discoverLayout===value?' selected':''}`} onClick={()=>update(current=>({...current,discoverLayout:value}))}>{renderPreferencePreview('discover',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{state.discoverLayout===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "profileLayout" && (
            <div className="preference-options" role="radiogroup" aria-label="他人主页布局">
              {([['masonry','大图瀑布流','用图片卡片快速浏览对方发布的内容'],['list','列表','以紧凑条目展示标题和发布时间']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={profileLayout===value} className={`preference-option${profileLayout===value?' selected':''}`} onClick={()=>setProfileLayout(value)}>{renderPreferencePreview('discover',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{profileLayout===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "homeMode" && (
            <div className="preference-options" role="radiogroup" aria-label="首页浏览方式">
              {([['waterfall','瀑布流','未翻开前隐藏内容，每日选 5 张'],['blackcard','黑卡','逐张探索，每日最多翻开 5 张']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={state.homeMode===value} className={`preference-option${state.homeMode===value?' selected':''}`} onClick={()=>chooseHomeMode(value)}>{renderPreferencePreview('home',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{state.homeMode===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "reading" && (
            <div className="preference-options" role="radiogroup" aria-label="阅读模式">
              {([['standard','标准','舒展排版与清晰层级'],['focus','专注','减少干扰，突出正文'],['night','夜间','深色背景，适合暗光阅读']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={state.readingMode===value} className={`preference-option${state.readingMode===value?' selected':''}`} onClick={()=>chooseReadingMode(value)}>{renderPreferencePreview('reading',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{state.readingMode===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "detailTransition" && (
            <div className="preference-options" role="radiogroup" aria-label="详情过渡效果">
              {([
                ["image-zoom", "连续展开", "保留封面放大进入详情、返回原卡片的连贯转场"],
                ["blur-rise", "柔和上浮", "新图片从轻微柔焦与短距离上浮中清晰出现"],
                ["ghost-handoff", "留影衔接", "上一张短暂留影，新图轻柔上浮；快速切换可立即接续"],
              ] as const).map(([value, label, description]) => <button key={value} role="radio" aria-checked={detailTransition === value} className={`preference-option${detailTransition === value ? " selected" : ""}`} onClick={() => { localStorage.setItem("heika-detail-transition-explicit", "1"); setDetailTransition(value); }}>
                <span className={`preference-preview preview-transition preview-transition-${value}`} aria-hidden="true"><i/><b/></span><span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{detailTransition === value ? "✓" : ""}</i>
              </button>)}
            </div>
          )}
          {settingsDetail === "notifications" && <NotificationSettings
            accountId={accountId}
            messagesEnabled={state.notifications.messages}
            onMessagesChange={() => void toggleNotification("messages")}
            onNotice={toast}
          />}
          {settingsDetail === "cache" && <CacheManager onNotice={toast} />}
          {settingsDetail === "feedback" && <FeedbackForm accountId={accountId} onLogin={() => setTab("messages")} onNotice={toast} />}
          {settingsDetail === "feedbackAdmin" && <FeedbackAdmin />}

        </section>
      )}
      {tab === "collection" && collectionId && <CollectionView
        id={collectionId}
        accountId={accountId}
        ownPosts={state.own}
        onBack={handleSecondaryBack}
        onOpenChapter={(chapter) => void openCollectionChapter(chapter)}
        onLogin={() => setTab("messages")}
        onNotice={toast}
        onChanged={() => { void cloudRequest("/api/v1/series").then((data) => { const items = (data as { items?: PostSeries[] })?.items; if (Array.isArray(items)) setCreatorSeries(items); }).catch(() => {}); }}
      />}
      {tab === "moderation" && isStaff && <AdminModeration role={adminRole as "admin" | "content_manager" | "reviewer"} onBack={closeAdminConsole} />}
      {tab === "moderation" && !isStaff && (
        <section className="page admin-gate-page">
          {/* APP 内没有网页顶栏，登录引导页必须自带返回，否则会被困在后台入口。 */}
          {appEmbed ? <button type="button" className="admin-gate-back" aria-label="返回" onClick={closeAdminConsole}><ArrowLeft size={19} /></button> : null}
          <h1>管理后台<span className="red-dot">.</span></h1>
          <p className="lead">{accountId ? "当前账号没有管理员权限，请使用管理员账号登录后进入后台。" : "管理后台只对管理员开放，请先使用管理员账号登录。"}</p>
          <button type="button" className="primary-button full" onClick={() => { adminEntryPending.current = true; setTab("messages"); }}>
            <ShieldCheck size={17} /> 使用管理员账号登录
          </button>
          <p className="lead" style={{ marginTop: 12 }}>登录成功后会自动回到这里；普通账号无法查看任何后台数据。</p>
        </section>
      )}
      {tab === "about" && <AboutHeika onBack={closeAboutPage} onFeedback={openFeedbackFromAbout} />}
      {tab === "debug" && (
        <section className="page debug-page">
          <h1>调试模式<span className="red-dot">.</span></h1>
          <p className="lead">一键清空个人偏好、翻卡与收藏状态，重新开始新人引导。</p>
          <button className="debug-admin-entry" onClick={() => {
            if (accountId) {
              if (isStaff) { setTab("moderation"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); }
              else toast("当前账号没有管理员权限。");
              return;
            }
            adminEntryPending.current = true;
            setTab("messages");
            requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
          }}>
            <span><ShieldCheck size={19}/></span>
            <span><strong>{isStaff ? "进入管理后台" : "管理员后台登录"}</strong><small>{isStaff ? "账号、内容与社区举报管理" : "使用管理员账号登录后进入后台"}</small></span>
            <ChevronRight size={17}/>
          </button>
          <button className="primary-button full debug-reset-button" disabled={resetBusy} onClick={() => void resetToFreshStart()}>
            <RefreshCw size={17} /> {resetBusy ? "正在重置…" : "一键重置，重新开始"}
          </button>
        </section>
      )}
      {tab === "mine" && (
        <section className="page mine-page">
          <ProfileHeader
            mode="self"
            nickname={state.name}
            avatar={state.avatar}
            coverUrl={state.cover}
            coverMeta={state.coverMeta}
            badges={<ProfileBadgeList badges={ownBadges} compact/>}
            level={<button className="mine-level-tag" type="button" aria-label={`探索等级 LV.${currentExperience.current.level}，查看经验详情`} onClick={() => openSettingsDetail("progression", "mine")}>LV.{currentExperience.current.level}</button>}
            bio={state.bio}
            accountLine={accountId ? `黑卡编号 · ${accountId.slice(0, 8).toUpperCase()}` : undefined}
            stats={<div className="profile-hero-stats"><div><strong>{openedIds.length}</strong><span>累计翻卡</span></div><div><strong>{streak}</strong><span>连续探索</span></div><div><strong>{state.saved.length}</strong><span>我的收藏</span></div></div>}
            onEditProfile={() => openSettingsDetail("profile", "mine")}
            onEditCover={() => openSettingsDetail("profile", "mine")}
          />
          <section className="mine-exploration-hub" aria-label="常用入口">
            <div className="mine-exploration-row">
              <button type="button" className="mine-exploration-entry mine-draft-entry" onClick={() => setDraftBoxOpen(true)}>
                <span className="mine-exploration-entry-icon"><FileText size={19}/></span>
                <strong>草稿箱</strong>
                <small>{localDraftCount > 0 ? `${localDraftCount} 篇草稿` : "暂无草稿"}</small>
              </button>
              <button type="button" className="mine-exploration-entry" aria-expanded={missionsOpen} onClick={() => setMissionsOpen((open) => !open)}>
                <span className="mine-exploration-entry-icon"><Gift size={19}/></span>
                <strong>今日任务</strong>
                <small>{missionSummary || "查看进度"}</small>
              </button>
              <button type="button" className="mine-exploration-entry" onClick={openExplorationCenter}>
                <span className="mine-exploration-entry-icon"><Compass size={19}/></span>
                <strong>探索中心</strong>
                <small>好友 · 月报 · 接龙</small>
              </button>
            </div>
            <DailyMissions accountId={accountId} onNotice={toast} hideToggle open={missionsOpen} onOpenChange={setMissionsOpen} onSummary={setMissionSummary} />
          </section>
          <div className="mine-tabs-shell">
            <div className="mine-tabs mine-content-tabs" role="tablist" aria-label="个人内容分类">
              {([
                ["works", "我的作品"],
                ["favorites", "我的收藏"],
                ["liked", "我的点赞"],
                ["collections", "合集"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  id={`mine-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={mineSection === id}
                  aria-controls="mine-category-panel"
                  tabIndex={mineSection === id ? 0 : -1}
                  onClick={() => setMineSection(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div id="mine-category-panel" className="mine-category-panel" role="tabpanel" aria-labelledby={`mine-tab-${mineSection}`} key={mineSection}>
            {mineSection === "works" && (
              <div className="mine-tab-content">
                <div className="mine-works-heading"><div><span>共 {visibleOwnWorks.length} 篇作品</span></div><button type="button" className="mine-works-manage-button" onClick={() => setTaskCenterOpen(true)}>发布任务 <ChevronRight size={15}/></button><button type="button" className="mine-works-manage-button" onClick={() => openMyContent("mine")}>作品管理 <ChevronRight size={15}/></button></div>
                {selectedSeriesId && <button type="button" className="series-filter-reset" onClick={() => setSelectedSeriesId("")}>查看全部作品</button>}
                {visibleOwnWorks.length ? <div className="masonry mine-works-masonry">{visibleOwnWorks.map((post) => <article className="mine-work-card" key={post.id}>
                  {postCard(post, "discover", true)}
                  <div className="mine-work-actions"><span>{post.pendingRevision?.status === "pending" ? "修改审核中 · 当前版本正常展示" : post.pendingRevision?.status === "rejected" ? "修改未通过 · 当前版本正常展示" : post.status === "pending_review" ? "审核中" : post.status === "hidden" ? "审核未通过" : "已发布"}</span><button type="button" aria-label={`编辑${post.title || "未命名内容"}`} onClick={() => void openComposer(post)}><PenLine size={14}/><span>{post.pendingRevision?.status === "pending" ? "编辑待审修改" : "编辑"}</span></button><button type="button" aria-label={`删除${post.title || "未命名内容"}`} onClick={() => void deleteOwn(post)}><Trash2 size={14}/><span>删除</span></button></div>
                </article>)}</div> : <div className="empty">{selectedSeriesId ? "这个系列还没有内容，发布时可以从系列菜单加入。" : "你发布的内容会以瀑布流卡片显示在这里。"}</div>}
              </div>
            )}
            {mineSection === "favorites" && (
              <div className="mine-tab-content">
                <div className="mine-works-heading mine-panel-heading"><div><span>共 {favoritePostsForView.length} 篇收藏</span></div></div>
                <div className="filters favorite-filters" role="group" aria-label="收藏来源">
                  {["全部", "今日翻卡", "发现"].map((source) => (
                    <button key={source} className={favoriteSource === source ? "selected" : ""} aria-pressed={favoriteSource === source} onClick={() => setFavoriteSource(source)}>{source}</button>
                  ))}
                </div>
                <div className="collection-toolbar">
                  <label className="collection-search"><Search size={15}/><input aria-label="搜索收藏" placeholder="搜标题、话题或作者" value={favoriteSearch} onChange={(event) => setFavoriteSearch(event.target.value)}/>{favoriteSearch && <button type="button" aria-label="清空搜索" onClick={() => setFavoriteSearch("")}><X size={14}/></button>}</label>
                  <div className="collection-create"><input aria-label="新收藏夹名称" maxLength={24} placeholder="新建收藏夹" value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveBookmarkCollection(); }}/><button type="button" disabled={!newCollectionName.trim()} onClick={() => void saveBookmarkCollection()}><Plus size={15}/>创建</button></div>
                </div>
                <div className="collection-collaboration"><span>加入朋友的收藏夹</span><input aria-label="收藏夹分享码" value={collectionInviteCode} maxLength={32} onChange={(event) => setCollectionInviteCode(event.target.value)} placeholder="粘贴分享码"/><button type="button" disabled={!accountId || collectionInviteCode.trim().length < 6} onClick={() => void joinBookmarkCollection()}>加入协作</button></div>
                <div className="collection-chips" role="group" aria-label="收藏夹筛选">
                  <button type="button" className={favoriteCollection === "all" ? "selected" : ""} onClick={() => setFavoriteCollection("all")}>全部收藏</button>
                  <button type="button" className={favoriteCollection === "uncategorized" ? "selected" : ""} onClick={() => setFavoriteCollection("uncategorized")}>未分类</button>
                  {bookmarkCollections.map((collection) => <span className="collection-chip" key={collection.id}>{editingCollection === collection.id ? <><input aria-label="收藏夹新名称" maxLength={24} value={editingCollectionName} onChange={(event) => setEditingCollectionName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void renameBookmarkCollection(collection); if (event.key === "Escape") setEditingCollection(null); }}/><button type="button" className="collection-delete" aria-label="保存收藏夹名称" onClick={() => void renameBookmarkCollection(collection)}><Check size={13}/></button><button type="button" className="collection-delete" aria-label="取消重命名" onClick={() => setEditingCollection(null)}><X size={12}/></button></> : <><button type="button" className={favoriteCollection === collection.id ? "selected" : ""} onClick={() => setFavoriteCollection(collection.id)}>{collection.name}{collection.role === "collaborator" ? " · 协作" : ""}</button>{collection.role !== "collaborator" && <><button type="button" className="collection-delete" aria-label={`分享收藏夹 ${collection.name}`} onClick={() => void shareBookmarkCollection(collection)}><Share2 size={12}/></button><button type="button" className="collection-delete" aria-label={`重命名收藏夹 ${collection.name}`} onClick={() => { setEditingCollection(collection.id); setEditingCollectionName(collection.name); }}><PenLine size={12}/></button><button type="button" className="collection-delete" aria-label={`删除收藏夹 ${collection.name}`} onClick={() => void deleteBookmarkCollection(collection)}><X size={12}/></button></>}</>}</span>)}
                </div>
                {organizedFavoritePosts.length ? <div className={`masonry${state.discoverLayout === "single" ? " single-column" : ""}`}>{organizedFavoritePosts.map((post) => <div className="organized-favorite-card" key={post.id}>{postCard(post, state.revealed[post.id] ? "today" : "discover")}{state.saved.includes(post.id) ? <label className="collection-assignment">整理到<ChoiceSelect label={`整理《${post.title}》到收藏夹`} value={bookmarkMembership[post.cloudId || ""] || ""} disabled={!accountId || !post.cloudId} onChange={(value) => void assignBookmarkCollection(post, value)} placeholder="未分类" options={[{value:"",label:"未分类"},...bookmarkCollections.map((collection) => ({value:collection.id,label:collection.name}))]}/></label> : <small className="collection-assignment shared-bookmark-note">朋友也收藏了这份灵感</small>}</div>)}</div> : <div className="empty">{favoritePostsForView.length ? "没有符合搜索条件的收藏。" : favoriteCollection !== "all" && favoriteCollection !== "uncategorized" ? "这个协作收藏夹还没有内容。" : "收藏的内容会集中保存在这里。"}</div>}
              </div>
            )}
            {mineSection === "collections" && (
              <div className="mine-tab-content">
                <div className="mine-works-heading"><div><span>共 {creatorSeries.length} 个合集</span></div></div>
                <div className="series-create-form mine-series-create">
                  <input aria-label="合集名称" maxLength={48} placeholder="合集名称（必填），例如：一周城市观察" value={seriesName} onChange={(event) => setSeriesName(event.target.value)}/>
                  <input aria-label="合集简介" maxLength={240} placeholder="一句话介绍（可选）" value={seriesDescription} onChange={(event) => setSeriesDescription(event.target.value)}/>
                  <input aria-label="合集封面" maxLength={600} placeholder="封面图片地址（可选）" value={seriesCover} onChange={(event) => setSeriesCover(event.target.value)}/>
                  <div className="series-create-row"><select aria-label="合集类型" value={seriesKind} onChange={(event) => setSeriesKind(event.target.value)}><option value="serial">连载</option><option value="tutorial">教程</option><option value="resource">资源</option></select><select aria-label="连载状态" value={seriesStatus} onChange={(event) => setSeriesStatus(event.target.value)}><option value="ongoing">连载中</option><option value="completed">已完结</option></select></div>
                  <button type="button" disabled={!accountId || seriesName.trim().length < 2} onClick={() => void createPostSeries()}><Plus size={15}/>新建合集</button>
                </div>
                {creatorSeries.length ? <div className="series-list">{creatorSeries.map((series) => <button type="button" key={series.id} onClick={() => openCollection(series.id)}>
                  <strong>{series.title}</strong><span>{series.description || "持续更新中"}</span><small>{series.postCount || 0} 篇</small><em className="series-manage-link">管理</em>
                </button>)}</div> : <div className="empty">还没有合集。创建后可以把已有作品加入连载，作品仍可独立存在。</div>}
                {mineCollections.length > 0 && <section className="mine-collections" aria-label="我收藏的合集">
                  <div className="mine-collections-head"><strong>我收藏的合集</strong><small>{mineCollections.length} 个</small></div>
                  <div className="mine-collection-row">{mineCollections.map((item) => <button type="button" key={item.id} className="mine-collection-card" onClick={() => openCollection(item.id)}>
                    <span className="mine-collection-copy"><strong>{item.title}</strong><small>{item.publishedCount || 0} 章 · {item.kind === "tutorial" ? "教程" : item.kind === "resource" ? "资源" : "连载"}</small></span>
                    <ChevronRight size={15} aria-hidden="true"/>
                  </button>)}</div>
                </section>}
              </div>
            )}
            {mineSection === "liked" && (
              <div className="mine-tab-content">
                <div className="mine-works-heading mine-panel-heading"><div><span>共 {likedPosts.length} 篇点赞</span></div></div>
                {likedPosts.length ? <div className={`masonry${state.discoverLayout === "single" ? " single-column" : ""}`}>{likedPosts.map((post) => postCard(post, state.revealed[post.id] ? "today" : "discover"))}</div> : <div className="empty">点过赞的内容会显示在这里。</div>}
              </div>
            )}
          </div>
        </section>
      )}
      {tab === "exploration-center" && (
        <section className="page exploration-center-page explore-page">
          <header className="explore-hero">
            <span className="explore-hero-kicker">探索档案</span>
            <h1>每一次发现，都值得留下痕迹<span className="red-dot">.</span></h1>
            <p>从今日的卡片开始，记录属于你的探索轨迹。</p>
          </header>

          <div className="explore-metrics" aria-label="探索概览">
            {explorationStatsReady ? (
              <>
                <div><strong>{explorationTotal}</strong><span>累计翻卡</span></div>
                <div><strong>{explorationStreak}</strong><span>连续探索</span></div>
                <div><strong>{recentSevenDayCount}</strong><span>最近发现</span></div>
              </>
            ) : (
              <div className="explore-metrics-skeleton" aria-hidden="true">
                {[0, 1, 2].map((index) => <span key={index}><i /><b /></span>)}
              </div>
            )}
          </div>

          <section className="explore-block" aria-label="28 天探索轨迹">
            <div className="explore-block-head">
              <h2>28 天探索轨迹</h2>
              <span>{activeDayCount} 天有记录</span>
            </div>
            <div className="explore-heatmap" role="group" aria-label="最近 28 天的探索热力图">
              {calendarDays.map(({ key, count }) => (
                <button
                  key={key}
                  type="button"
                  className={`explore-heat-day level-${Math.min(count, 5)}${selectedDay === key ? " is-selected" : ""}${key === today ? " is-today" : ""}`}
                  aria-label={`${key}，翻开 ${count} 张${key === today ? "，今天" : ""}`}
                  aria-pressed={selectedDay === key}
                  title={`${key} · ${count} 张`}
                  onClick={() => setSelectedCalendarDate(key)}
                />
              ))}
            </div>
            <div className="explore-heat-legend" aria-hidden="true">
              <span>少</span>
              {[0, 1, 2, 3, 4, 5].map((level) => <i key={level} className={`level-${level}`} />)}
              <span>多</span>
            </div>
            <div className="explore-day-detail">
              <div className="explore-day-detail-head">
                <strong>{(() => { const [year, month, day] = selectedDay.split("-"); return `${year}年${Number(month)}月${Number(day)}日`; })()}</strong>
                <span>{selectedDayRecords.length ? `${selectedDayRecords.length} 张` : "还没有记录"}</span>
              </div>
              {selectedDayRecords.length ? (
                <div className="explore-day-posts">
                  {selectedDayRecords.map((item) => {
                    const tier = state.rarityTiers[item.id] || item.rarityTier;
                    const rareTier = tier === "S" || tier === "SS" || tier === "SSS" ? tier : null;
                    return <button key={item.id} type="button" onClick={() => openPost(item.id, "today", null, item)}><span>{item.tag}</span>{rareTier && <i className={`rarity-history-chip rarity-tier-${rareTier}`}>{rareTier}</i>}<strong>{item.title}</strong><ChevronRight size={15} /></button>;
                  })}
                </div>
              ) : <p className="explore-empty-line">这一天还没有翻开新卡片。翻一张，轨迹就会多一个点。</p>}
            </div>
          </section>

          <section className="explore-block" aria-label="最近发现">
            <div className="explore-block-head">
              <h2>最近发现</h2>
              <span>最近 {Math.min(recentDiscoveries.length, 6)} 条</span>
            </div>
            {recentDiscoveries.length ? (
              <div className="explore-discoveries">
                {recentDiscoveries.slice(0, 6).map(({ date, post }) => {
                  const tier = state.rarityTiers[post.id] || state.revealed[post.id]?.rarityTier || post.rarityTier;
                  const rareTier = tier === "S" || tier === "SS" || tier === "SSS" ? tier : null;
                  const excerpt = markdownToText(post.body || "").replace(/\s+/g, " ").trim().slice(0, 88);
                  return (
                    <button
                      key={`${date}-${post.id}`}
                      type="button"
                      className="explore-discovery"
                      onClick={() => openPost(post.id, state.revealed[post.id] ? "today" : "discover", null, post)}
                    >
                      <span className="explore-discovery-meta">
                        <small>{post.tag}</small>
                        <small>{date.slice(5).replace("-", ".")}</small>
                        {rareTier && <i className={`rarity-history-chip rarity-tier-${rareTier}`}>{rareTier}</i>}
                      </span>
                      <strong>{post.title}</strong>
                      {excerpt && <span className="explore-discovery-excerpt">{excerpt}{markdownToText(post.body || "").length > 88 ? "…" : ""}</span>}
                      <span className="explore-discovery-open">查看详情 <ChevronRight size={14} /></span>
                    </button>
                  );
                })}
              </div>
            ) : <div className="empty">翻开第一张卡片后，这里会留下你的近期发现。</div>}
          </section>

          <div className="explore-pair" aria-label="和探索者一起">
            <button type="button" onClick={() => openCoExplore("exploration-center")}>
              <span className="explore-pair-icon"><UsersRound size={18} /></span>
              <strong>与好友一起探索</strong>
              <small>共同翻卡，分享发现</small>
              <em>进入 <ChevronRight size={13} /></em>
            </button>
            <button type="button" onClick={() => openMineFeature("card-chain", "exploration-center")}>
              <span className="explore-pair-icon"><GitBranch size={18} /></span>
              <strong>卡片接龙</strong>
              <small>从一张卡片续写故事</small>
              <em>进入 <ChevronRight size={13} /></em>
            </button>
          </div>

          <button type="button" className="explore-recap-entry" onClick={() => openMineFeature("monthly-recap", "exploration-center")}>
            <span className="explore-recap-icon"><Sparkles size={18} /></span>
            <span className="explore-recap-copy">
              <strong>探索月报</strong>
              <small>本月探索次数、活跃天数与兴趣分布</small>
            </span>
            <ChevronRight size={17} />
          </button>

          {appDownloadUrl && !(typeof window !== "undefined" && "HeikaNative" in window) && (
            <a className="mine-download-card exploration-download-card" href={appDownloadUrl} target="_blank" rel="noopener noreferrer">
              <span className="mine-download-icon"><Smartphone size={17} /></span>
              <span className="mine-download-copy"><strong>下载黑卡 App</strong><small>安卓客户端 · 原生体验，支持消息推送</small></span>
              <span className="mine-download-go">去下载<ChevronRight size={14} /></span>
            </a>
          )}

          <section className="explore-block" aria-label="探索历史">
            <div className="explore-block-head">
              <button type="button" className="explore-history-toggle" aria-expanded={explorationHistoryOpen} onClick={() => setExplorationHistoryOpen((open) => !open)}>
                <h2>探索历史</h2>
                <span>{explorationHistoryDays.length} 天 <ChevronDown size={15} style={{ transform: explorationHistoryOpen ? "rotate(180deg)" : undefined }} /></span>
              </button>
            </div>
            {explorationHistoryOpen ? (
              explorationHistoryDays.length ? (
                <>
                  {explorationHistoryDays.slice(0, explorationHistoryLimit).map(([day, values]) => (
                    <div className="explore-history-day" key={day}>
                      <div className="explore-history-date"><strong>{day}</strong><span>{values.length} 张</span></div>
                      {values.map((id) => {
                        const tier = state.rarityTiers[id] || state.revealed[id]?.rarityTier || lookupPost(id)?.rarityTier;
                        const rareTier = tier === "S" || tier === "SS" || tier === "SSS" ? tier : null;
                        return (
                          <button key={id} type="button" onClick={() => { const resolved = lookupPost(id); if (resolved) openPost(id, undefined, null, resolved); }}>
                            {rareTier && <i className={`rarity-history-chip rarity-tier-${rareTier}`}>{rareTier}</i>}
                            <span>{lookupPost(id)?.title || "已移除内容"}</span>
                            <ChevronRight size={14} />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {explorationHistoryDays.length > explorationHistoryLimit && (
                    <button type="button" className="explore-history-more" onClick={() => setExplorationHistoryLimit((limit) => limit + 5)}>
                      加载更多（还有 {explorationHistoryDays.length - explorationHistoryLimit} 天）
                    </button>
                  )}
                </>
              ) : <div className="empty">翻开第一张卡，开始记录。</div>
            ) : <p className="explore-empty-line">按日期归档的全部探索记录，展开后可以回到任意一天。</p>}
          </section>
        </section>
      )}
      {tab === "monthly-recap" && <ExplorationRecap opened={state.opened} rarityTiers={state.rarityTiers} posts={all} onNotice={toast} onBack={returnToSecondaryTab} backLabel={secondaryReturnTab === "exploration-center" ? "‹　探索中心" : "‹　我的"} />}
      {tab === "card-chain" && <CardChainPanel accountId={accountId} posts={all} onLogin={() => setTab("messages")} onBack={returnToSecondaryTab} onNotice={toast} backLabel={secondaryReturnTab === "exploration-center" ? "‹　探索中心" : "‹　我的"} />}
      {tab === "creator-center" && (
        <section className="page my-content-page creator-dashboard-page">
          <button className="back settings-back" onClick={() => {
            setTab(myContentReturnTab);
            requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[myContentReturnTab] || 0, behavior: "instant" }));
          }}><ArrowLeft size={18} /> {myContentReturnTab === "settings" ? "设置" : "我的"}</button>
          <h1>创作者中心<span className="red-dot">.</span></h1>
          <p className="lead">查看公开内容表现与本周成长任务。</p>
          <section className="creator-center" aria-label="创作者数据与成长任务">
            <div className="creator-center-heading"><div><h2>创作数据</h2></div><span>{creatorCenter?.weekStart ? `本周任务 · ${creatorCenter.weekStart}` : "数据仅统计已公开内容"}</span></div>
            {!accountId ? <div className="empty">登录后查看创作数据并领取每周经验。</div> : creatorCenterLoading && !creatorCenter ? <div className="creator-center-loading">正在汇总创作数据…</div> : <>
              <div className="creator-metrics">{[["公开内容", creatorCenter?.insights.posts || 0], ["阅读", creatorCenter?.insights.views || 0], ["点赞", creatorCenter?.insights.likes || 0], ["收藏", creatorCenter?.insights.saves || 0], ["评论", creatorCenter?.insights.comments || 0]].map(([label, value]) => <div key={label}><strong>{Number(value).toLocaleString("zh-CN")}</strong><span>{label}</span></div>)}</div>
              <div className="creator-missions"><div className="creator-subheading"><h3>本周成长任务</h3><span>每项 +20 EXP</span></div>{(creatorCenter?.missions || []).map((mission) => <div className="creator-mission-row" key={mission.key}><div className="creator-mission-copy"><strong>{mission.title}</strong><small>{mission.description}</small><span className="creator-mission-progress"><i><b style={{ width: `${Math.min(100, mission.progress / mission.target * 100)}%` }}/></i>{mission.progress}/{mission.target}</span></div><button type="button" disabled={mission.claimed || mission.progress < mission.target} onClick={() => void claimCreatorMission(mission.key)}>{mission.claimed ? "已领取" : "领取"}</button></div>)}</div>
              {!!creatorCenter?.insights.topPosts.length && <div className="creator-top-posts"><h3>表现较好的内容</h3>{creatorCenter.insights.topPosts.map((post) => <div key={post.id}><span>{post.title}</span><small>{post.views} 阅读 · {post.likes} 赞 · {post.saves} 收藏</small></div>)}</div>}
            </>}
          </section>
        </section>
      )}
      {tab === "my-content" && (
        <section className="page my-content-page">
          <button className="back settings-back" onClick={() => {
            setTab(myContentReturnTab);
            requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[myContentReturnTab] || 0, behavior: "instant" }));
          }}><ArrowLeft size={18} /> {myContentReturnTab === "settings" ? "设置" : "我的"}</button>
          <h1>作品管理<span className="red-dot">.</span></h1>
          <p className="lead">整理系列、查看内容状态并管理草稿。</p>
          <div className="series-manager"><div className="series-manager-heading"><strong>作品合集</strong><span>连载、教程与资源合集，章节可排序</span></div><div className="series-create-form"><input aria-label="合集名称" maxLength={48} placeholder="合集名称（必填），例如：一周城市观察" value={seriesName} onChange={(event) => setSeriesName(event.target.value)}/><input aria-label="合集简介" maxLength={240} placeholder="一句话介绍（可选）" value={seriesDescription} onChange={(event) => setSeriesDescription(event.target.value)}/><input aria-label="合集封面" maxLength={600} placeholder="封面图片地址（可选）" value={seriesCover} onChange={(event) => setSeriesCover(event.target.value)}/><div className="series-create-row"><select aria-label="合集类型" value={seriesKind} onChange={(event) => setSeriesKind(event.target.value)}><option value="serial">连载</option><option value="tutorial">教程</option><option value="resource">资源</option></select><select aria-label="连载状态" value={seriesStatus} onChange={(event) => setSeriesStatus(event.target.value)}><option value="ongoing">连载中</option><option value="completed">已完结</option></select></div><button type="button" disabled={!accountId || seriesName.trim().length < 2} onClick={() => void createPostSeries()}><Plus size={15}/>新建</button></div>{creatorSeries.length > 0 && <div className="series-list">{creatorSeries.map((series) => <button type="button" className={selectedSeriesId === series.id ? "active" : ""} key={series.id} onClick={() => setSelectedSeriesId((current) => current === series.id ? "" : series.id)}><strong>{series.title}</strong><span>{series.description || "持续更新中"}</span><small>{series.postCount || 0} 篇</small><em className="series-manage-link" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); openCollection(series.id); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); openCollection(series.id); } }}>管理</em></button>)}</div>}</div>
          <div className="section-head"><h2>作品列表</h2><span>{visibleOwnPosts.length} 项</span></div>
          {selectedSeriesId && <button type="button" className="series-filter-reset" onClick={() => setSelectedSeriesId("")}>查看全部作品</button>}
          {visibleOwnPosts.length ? visibleOwnPosts.map((post) => (
            <div className="own-row" key={post.id}>
              <button onClick={() => post.status === "draft" ? void openComposer(post) : openPost(post.id)}>{post.status === "draft" ? `草稿 · ${post.title || "未命名内容"}` : post.status === "pending_review" ? `审核中 · ${post.title}` : post.status === "hidden" ? `审核未通过 · ${post.title}` : post.title}</button>
              <button aria-label="编辑" onClick={() => void openComposer(post)}><PenLine size={16} /></button>
              <button aria-label="删除" onClick={() => void deleteOwn(post)}><Trash2 size={16} /></button>
            </div>
          )) : <div className="empty">发布的内容和草稿会保存在这里。</div>}
        </section>
      )}
      {tab === "today" && viewerId === null && (
        <div
          className={`floating-count ${opened.length >= dailyAllowance ? "is-complete" : ""}`}
        >
          <span className="floating-card-icon">▰</span>
          <span>
            {opened.length >= dailyAllowance ? "今日已完成" : "今日已翻"}{" "}
            <b key={opened.length}>{Math.min(opened.length, dailyAllowance)}/{dailyAllowance}</b>
            {opened.length < dailyAllowance ? ` · 剩余 ${dailyAllowance - opened.length} 次` : ""}
          </span>
        </div>
      )}
      <div className="bottom-nav-shell floating-glass">
        <nav className="bottom-nav" aria-label="主导航">
          {nav.slice(0, 2).map(renderNavButton)}
          {nav.slice(2).map(renderNavButton)}
        </nav>
        <button type="button" className="compose" aria-label="发布内容" onClick={() => void openComposer()}>
          <span className="bottom-nav-icon">
            {decorState.decor.bottomBar.publish.iconUrl
              ? <img className="decor-nav-icon" src={decorState.decor.bottomBar.publish.iconUrl} alt="" aria-hidden="true" style={{ width: 25, height: 25 }} />
              : <Plus size={25} strokeWidth={1.8} />}
          </span>
          <span>发布</span>
        </button>
      </div>
      {viewerId !== null && (
        <div
          className={`flip-overlay${viewerPhase ? ` is-${viewerPhase}` : ""}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && flippingId === null)
              closeViewer();
          }}
        >
          <button
            className="flip-close"
            disabled={flippingId !== null || justFlippedId === viewerId}
            onClick={closeViewer}
            aria-label="关闭"
          >
            ×
          </button>
          {flipRainId === viewerId && (
            <div key={flipRainId} className="flip-confetti" aria-hidden="true">
              {Array.from({ length: FLIP_RAIN_PARTICLES }, (_, index) => {
                const spread = index / (FLIP_RAIN_PARTICLES - 1);
                const startX = -2 + spread * 104;
                const drift = ((index * 37) % 25) - 12;
                const duration = FLIP_RAIN_DURATION_MIN_MS + ((index * 97) % (FLIP_RAIN_DURATION_SPREAD_MS + 1));
                const stagger = ((index * 37) % FLIP_RAIN_PARTICLES) / (FLIP_RAIN_PARTICLES - 1);
                const delay = FLIP_RAIN_LEAD_MS + Math.round(stagger * FLIP_RAIN_STAGGER_WINDOW_MS) + ((index * 13) % FLIP_RAIN_JITTER_MS);
                return <i key={index} style={{
                  left: `${startX}%`,
                  animationDelay: `${delay}ms`,
                  "--rain-duration": `${duration}ms`,
                  "--fall-x": `${drift}vw`,
                  "--fall-y": `${108 + ((index * 17) % 24)}vh`,
                  "--twist": `${(index % 2 ? 1 : -1) * (80 + (index % 5) * 65)}deg`,
                } as CSSProperties} />;
              })}
            </div>
          )}
          {luckyReward?.postId === viewerId && (
            <div className="lucky-reward-burst" role="status" aria-live="polite">
              <Sparkles size={17}/><span>幸运加成</span><strong>+{luckyReward.amount}</strong><small>今日翻卡次数</small>
            </div>
          )}
          {(() => {
            const revealed = state.revealed[viewerId];
            const revealImage = revealed?.image || revealed?.images?.find(Boolean);
            const hasRevealImage = Boolean(revealImage);
            const revealBody = revealed?.body?.trim() || "";
            const isShortTextOnly = !hasRevealImage && revealBody.length <= 120;
            const rarityTier = state.rarityTiers[viewerId] || revealed?.rarityTier || "pending";
            const rarityLabel = cardRarityLabel(rarityTier);
            const rarityGrade = rarityTier === "ordinary" ? "N" : rarityTier === "pending" ? "待评" : rarityTier;
            return (
              <div
                ref={viewerStageRef}
                className={`flip-stage ${viewerFlipped ? "is-flipped" : ""}`}
              >
                <div className="flip-inner">
                  <div className="flip-face flip-front flip-window-face">
                    <span className="window-brand-cn">黑卡</span>
                    <span className="window-brand-en">HEIKA</span>
                    {!viewerFlipped && (
                      <>
                        {flipError && (
                          <p className="flip-error" role="alert">
                            {flipError}
                          </p>
                        )}
                        <button
                          className="flip-button"
                          disabled={flippingId === viewerId}
                          onClick={completeFlip}
                        >
                          {flippingId === viewerId
                            ? "正在翻开…"
                            : flipError
                              ? "重试翻开"
                              : "确认翻开"}
                        </button>
                      </>
                    )}
                  </div>
                  <div
                    className={`flip-face flip-back flip-window-revealed${hasRevealImage ? " has-image" : " no-image"}${viewerRevealPhase === "rarity" ? " is-rarity-reveal" : ""}`}
                    data-window-card-id={viewerId}
                  >
                    {hasRevealImage && (
                      <img
                        src={revealImage || ""}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.dataset.failed = "true";
                        }}
                      />
                    )}
                    {hasRevealImage && <span className="flip-window-image-error" role="status">封面暂时无法加载</span>}
                    {viewerRevealPhase === "rarity" && (
                      <div className={`flip-rarity-reveal rarity-tier-${rarityTier}`} aria-live="polite">
                        <small>卡片稀有度</small>
                        <strong>{rarityGrade}</strong>
                        <span>{rarityLabel}</span>
                      </div>
                    )}
                    <div className={`window-reveal-copy${hasRevealImage ? " has-image" : " no-image"}${viewerRevealPhase === "rarity" ? " is-rarity-hidden" : ""}`} aria-hidden={viewerRevealPhase === "rarity" || undefined}>
                      <div className="window-reveal-meta"><small>{revealed?.tag || "HEIKA"}</small><i className={`rarity-inline-chip rarity-tier-${rarityTier}`}>{rarityTier === "ordinary" ? "普通" : rarityTier === "pending" ? "待评级" : rarityTier}</i></div>
                      <h2>{revealed?.title || ""}</h2>
                      <button
                        className="window-more"
                        disabled={!viewerFlipped || viewerPhase !== null || viewerRevealPhase === "rarity"}
                        onClick={(event) => openPost(viewerId, "today", event.currentTarget)}
                      >
                        {isShortTextOnly ? "查看详情" : "查看更多"} <ArrowRight size={17} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      </div>
      {/* 直达链接的加载 / 失效 / 失败状态：每一种都有明确出口，不留空白页。 */}
      {!post && detailRouteState !== null && (
        <section className="detail-page-state" aria-live="polite">
          {detailRouteState === "loading" ? (
            <>
              <span className="detail-page-state-spinner" aria-hidden="true" />
              <strong>正在打开作品…</strong>
              <p>正在读取正文与评论。</p>
            </>
          ) : (
            <>
              <strong>{detailRouteState === "missing" ? "内容不存在或暂不可见" : "内容加载失败"}</strong>
              <p>{detailRouteState === "missing" ? "链接可能已失效，或这篇内容还没有公开。" : "网络或服务暂时不可用，可以重试一次。"}</p>
              <div className="detail-page-state-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    routePostHandled.current = false;
                    setDetailRouteState(initialPostId ? "loading" : "missing");
                    setRouteRetry((value) => value + 1);
                  }}
                >重试</button>
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    history.replaceState({}, "", "/");
                    routePostHandled.current = false;
                    setDetailRouteState(null);
                    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
                  }}
                >返回首页</button>
              </div>
            </>
          )}
        </section>
      )}
      {post && (() => {
        // 浮层与独立页面共用同一份内容，只有外壳与滚动方式不同。
        const detailContent = (
          <>
          <div className={`detail${detailPageMode ? " detail-page" : ""}`}>
                <header className="detail-header">
                  <button className="detail-back" aria-label="返回" onClick={() => closeDetail()}>
                    <ArrowLeft size={21} />
                  </button>
                  {/* 顶栏回到品牌导航：不展示文章标题，AI 内容标注「AI · HEIKA」，
                      品牌字样绝对居中；目录按钮位于右侧倒数第二位，更多在最右。 */}
                  <span className="detail-header-brand" aria-label={post.channel === "ai" ? "AI · HEIKA" : "黑卡 HEIKA"}>
                    {post.channel === "ai" ? <>AI<i>·</i>HEIKA</> : <>黑卡<i>HEIKA</i></>}
                  </span>
                  {detailOutline.filter((item) => item.level <= 3).length >= 3 && (
                    <button type="button" className="reader-toc-button" aria-label="文章目录" onClick={() => setReaderTocOpen(true)}>
                      <ListTree size={19} />
                    </button>
                  )}
                  <div className="detail-more-wrap">
                    <button className="detail-more-button" aria-label="更多操作" aria-expanded={detailMoreOpen} onClick={() => setDetailMoreOpen((open) => !open)}>
                      <MoreHorizontal size={22} />
                    </button>
                    {detailMoreOpen && <div className="detail-more-menu">{detailMoreMenu}</div>}
                  </div>
                  {readerType.prefs.progress && <ReaderProgress progress={detailProgress} />}
                </header>
                <div className="detail-scroll" id="detail-scroll" key={post.id}>
                  {post.cloudId && <PostReadTracker key={post.cloudId} postId={post.cloudId} seriesId={post.seriesId} />}
                  <div className={`detail-body reading-${state.readingMode}${readingTransition ? ` reading-${readingTransition}` : ""}`} style={readerType.style}>
                    <nav className="detail-rail" aria-label="作品操作栏">
                      <button type="button" className={`detail-rail-button${state.liked?.includes(post.id) ? " selected" : ""}`} aria-pressed={!!state.liked?.includes(post.id)} aria-label={`${state.liked?.includes(post.id) ? "取消点赞" : "点赞"}，${detailLikeCounts[post.id] ?? post.likeCount ?? 0} 个赞`} disabled={likeBusy} onClick={toggleDetailLike}>
                        <Heart size={20} fill={state.liked?.includes(post.id) ? "currentColor" : "none"} /><span>{detailLikeCounts[post.id] ?? post.likeCount ?? 0}</span>
                      </button>
                      <button type="button" className="detail-rail-button" aria-label={`查看评论，共 ${commentTotal} 条`} onClick={() => { setCommentPanelFocus(0); setCommentPanelOpen(true); }}>
                        <MessageSquare size={20} /><span>{commentTotal}</span>
                      </button>
                      <button type="button" className={`detail-rail-button${state.saved.includes(post.id) ? " selected" : ""}`} aria-pressed={state.saved.includes(post.id)} aria-label={state.saved.includes(post.id) ? "取消收藏" : "收藏"} onClick={() => void toggleSave(post.id)}>
                        <Bookmark size={20} fill={state.saved.includes(post.id) ? "currentColor" : "none"} />
                      </button>
                      {post.status === "published" && <button type="button" className="detail-rail-button" aria-label="分享内容" onClick={() => void openSharePanel()}><Share2 size={20} /></button>}
                      <div className="detail-rail-item">
                        <button type="button" className="detail-rail-button" aria-label="更多操作" aria-expanded={detailMoreOpen} onClick={() => setDetailMoreOpen((open) => !open)}><MoreHorizontal size={20} /></button>
                        {detailPageMode && detailMoreOpen && <div className="detail-more-menu detail-rail-more">{detailMoreMenu}</div>}
                      </div>
                    </nav>
                    <div className="detail-main">
                    <div className="detail-article-column" id="detail-article">
                    {detailImages.length > 0 && (
                      <div className="detail-gallery" aria-busy={imageLoading} onPointerDown={(event) => {
                        imageSwipeTriggered.current = false;
                        if (event.pointerType === "mouse" || detailImages.length < 2 || (event.target as HTMLElement).closest(".detail-gallery-controls")) return;
                        imageTouchStart.current = { x: event.clientX, y: event.clientY };
                      }} onPointerUp={(event) => {
                        const start = imageTouchStart.current;
                        imageTouchStart.current = null;
                        if (!start || detailImages.length < 2) return;
                        const deltaX = event.clientX - start.x;
                        const deltaY = event.clientY - start.y;
                        if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
                        imageSwipeTriggered.current = true;
                        event.preventDefault();
                        selectDetailImage(activeImageIndex + (deltaX < 0 ? 1 : -1));
                        window.setTimeout(() => { imageSwipeTriggered.current = false; }, 0);
                      }} onPointerCancel={() => { imageTouchStart.current = null; imageSwipeTriggered.current = false; }}>
                      <button className={`detail-image-button detail-image-frame transition-${detailTransition} is-${detailImageDirection}`} onClick={(event) => {
                        if (imageSwipeTriggered.current) { event.preventDefault(); imageSwipeTriggered.current = false; return; }
                        setPreviewImage(true);
                      }} aria-label="查看大图">
                        {(() => {
                          const index = displayedImageIndex;
                          const lowSrc = detailThumbnails[index] || detailImages[index];
                          const highSrc = post.isPartial ? detailRetinaImages[index] || lowSrc : detailImages[index];
                          // 有尺寸就按真实比例预留，没有就退回统一 4:5；两种都不依赖图片是否到达。
                          const size = post.imageSizes?.[index] || null;
                          return <ProgressiveImage
                            key={`${lowSrc}:${highSrc}`}
                            lowSrc={lowSrc}
                            src={highSrc}
                            alt={`${post.title}，第 ${index + 1} 张`}
                            width={size?.width}
                            height={size?.height}
                            onHighReady={() => { if (activeImageIndex === displayedImageIndex) setImageLoading(false); }}
                            onHighError={() => { if (activeImageIndex === displayedImageIndex) setImageLoading(false); }}
                          />;
                        })()}
                        <span>查看大图</span>
                      </button>
                      {imageLoading && activeImageIndex !== displayedImageIndex && <span className="detail-image-loading is-visible" role="status" aria-live="polite" aria-busy="true">正在加载</span>}
                      {detailImages.length > 1 && <div className="detail-gallery-controls" aria-label="图片切换">
                        <button type="button" aria-label="上一张图片" onClick={() => selectDetailImage(activeImageIndex - 1)}><ArrowLeft size={15} /></button>
                        <span>{activeImageIndex + 1} / {detailImages.length}</span>
                        <button type="button" aria-label="下一张图片" onClick={() => selectDetailImage(activeImageIndex + 1)}><ArrowRight size={15} /></button>
                      </div>}
                      </div>
                    )}
                    {detailImages.length === 0 && detailVideo && <div className="detail-video"><video src={detailVideo} controls playsInline preload="metadata" aria-label={`${post.title} 视频`} /></div>}
                    {detailImages.length === 0 && !detailVideo ? <section className="detail-text-cover" aria-label="文字作品标题区域">
                      <span>{post.tag || "社区作品"}</span>
                      <h1>{post.title}</h1>
                    </section> : <h1>{post.title}</h1>}
                    {post.cloudId && post.status === "published" && <PostAISummary postId={post.cloudId}/>}
                    <div className="reader-author">
                      <button
                        type="button"
                        className="reader-author-avatar"
                        aria-label={`查看 ${post.author} 的主页`}
                        onClick={() => { if (post.authorId) setAuthorProfile(post.authorId); }}
                      >
                        <span>{post.author.slice(0, 1)}</span>
                      </button>
                      <div className="reader-author-copy">
                        <button
                          type="button"
                          className="reader-author-name"
                          onClick={() => { if (post.authorId) setAuthorProfile(post.authorId); }}
                        >
                          <strong>{post.author}</strong>
                          <ProfileBadgeMarks badges={post.authorBadges || []} />
                        </button>
                        <div className="reader-author-meta">
                          <span>{post.date}</span>
                          {typeof post.viewCount === "number" && <span>· {post.viewCount} 阅读</span>}
                        </div>
                      </div>
                      <AuthorFollowButton creatorId={post.authorId} accountId={accountId} onNotice={toast} />
                    </div>
                    <button className="detail-reading-setting" onClick={() => setModal("reading")}>
                      阅读模式 · {{ standard: "标准", focus: "专注", night: "夜间" }[state.readingMode]} <ChevronRight size={14} />
                    </button>
                    {post.seriesId && post.cloudId ? <SeriesChapterNav
                      slot="head"
                      seriesId={post.seriesId}
                      postId={post.cloudId}
                      accountId={accountId}
                      onLogin={() => setTab("messages")}
                      onNotice={toast}
                      onOpen={(chapterId) => void openCollectionChapter({ id: chapterId })}
                      onOpenCollection={openCollectionFromDetail}
                    /> : post.seriesTitle ? <div className="detail-series-card"><div className="detail-series-copy"><small>所属合集</small><strong>{post.seriesTitle}</strong></div></div> : null}
                    {post.cloudId ? <PrivateHighlights postId={post.cloudId} accountId={accountId} onLogin={() => setTab("messages")} onNotice={toast}>{detailArticleContent}</PrivateHighlights> : detailArticleContent}
                    {post.channel === "ai" && post.cloudId && <Suspense fallback={<div className="detail-article-loading" aria-live="polite">正在加载 AI 资源详情…</div>}><AIResourceDetails postId={post.cloudId} contentType={post.contentType || "knowledge_article"} resourceData={post.resourceData || {}} accountId={accountId} onLogin={() => setTab("messages")} onNotice={toast} action={aiDetailAction} onActionClose={closeAiDetailAction} onVersionsAvailability={setAiVersionsAvailable}/></Suspense>}
                    {post.channel !== "ai" && <Suspense fallback={null}><PostAttachmentsPanel resourceData={post.resourceData || {}} onNotice={toast}/></Suspense>}
                    {post.cloudId && <PostPoll postId={post.cloudId} accountId={accountId} onLogin={() => setTab("messages")} onNotice={toast} />}
                    <section className={`detail-rating${ratingPulse?.postId === post.id ? " rating-pulse" : ""}`} aria-label="内容评分">
                      <div className="detail-rating-main"><span>内容评分</span>
                      <div className="detail-rating-stars" role="radiogroup" aria-label="选择内容星级">{[1, 2, 3, 4, 5].map((n) => (
                        <button className={`rating-star${ratingPulse?.postId === post.id && n <= ratingPulse.score ? " is-pulsing" : ""}`} key={n} style={{ animationDelay: `${(n - 1) * 58}ms`, "--star-delay": `${(n - 1) * 58}ms`, "--rating-color": RATING_COLORS[n - 1] } as CSSProperties} aria-label={`${n} 星`} aria-pressed={(state.ratings[post.id] || 0) === n} onClick={() => submitRating(post.id, n)}>
                          <Star size={18} fill={(state.ratings[post.id] || 0) >= n ? "currentColor" : "none"} />
                        </button>
                      ))}</div><span className="detail-rating-current">{state.ratings[post.id] ? `${state.ratings[post.id]} 星` : "未评分"}</span></div>
                      {(state.ratings[post.id] || ratingPulse?.postId === post.id) && (communityRatings[post.id]?.count ? (
                        <small className="community-rating" aria-live="polite">
                          <Star size={12} fill="currentColor" /> 社区均分 {communityRatings[post.id].average.toFixed(1)} · {communityRatings[post.id].count} 人 <i className={`rarity-badge rarity-${cardRarity(communityRatings[post.id].average, communityRatings[post.id].count).replaceAll(" ", "")}`}>{cardRarity(communityRatings[post.id].average, communityRatings[post.id].count)}</i>
                        </small>
                      ) : null)}
                      {ratingPulse?.postId === post.id ? <small className="rating-feedback" key={ratingPulse.score} aria-live="polite">信号已校准 · {ratingPulse.score} 星</small> : state.ratings[post.id] ? <small>已评 {state.ratings[post.id]} 星</small> : null}
                    </section>
                    </div>
                    <section className="reader-end" aria-label="文章结尾">
                      <p className="reader-end-mark">全文完</p>
                      {post.topics?.length ? <div className="reader-topics" aria-label="内容话题">{post.topics.map((topic) => <button key={topic} type="button" className="reader-topic" onClick={() => void openTopic(topic)}>#{topic}</button>)}</div> : null}
                      {post.seriesId && post.seriesTitle ? (
                        <button type="button" className="reader-collection" onClick={() => openCollectionFromDetail(post.seriesId!)}>
                          <span className="reader-collection-cover" aria-hidden="true"><ListTree size={17} /></span>
                          <span className="reader-collection-copy"><small>所属合集</small><strong>{post.seriesTitle}</strong><span>查看合集目录</span></span>
                        </button>
                      ) : null}
                      <button type="button" className="reader-discuss" onClick={() => { setCommentPanelFocus(0); setCommentPanelOpen(true); }}>
                        <MessageSquare size={18} />
                        <span><strong>参与讨论{commentTotal > 0 ? ` · ${commentTotal} 条` : ""}</strong><span>在评论面板里查看与回复</span></span>
                      </button>
                    </section>
                    {post.seriesId && post.cloudId && <SeriesChapterNav
                      slot="foot"
                      seriesId={post.seriesId}
                      postId={post.cloudId}
                      onOpen={(chapterId) => void openCollectionChapter({ id: chapterId })}
                      onOpenCollection={openCollectionFromDetail}
                    />}
                    {post.cloudId && <RelatedContent
                      key={`related-${post.cloudId}`}
                      postId={post.cloudId}
                      onOpenPost={(cloudId) => void openSearchPost(cloudId, null)}
                      onOpenSeries={(seriesId) => openCollectionFromDetail(seriesId)}
                      onOpenTopic={(name) => void openTopic(name)}
                    />}
                    </div>
                    <DetailAside
                      post={post}
                      accountId={accountId}
                      related={detailRelated}
                      onOpenAuthor={(id) => setAuthorProfile(id)}
                      onOpenPost={(item) => { if (detail !== null) switchDetailChapter(item); else void openPost(item.id, "discover"); }}
                  pageMode={detailPageMode}
                      onMessage={(id) => { setMessagePeer(id); setTab("messages"); }}
                      onNotice={toast}
                    />
                  </div>
                  {!detailPageMode && <div className="detail-dock" role="group" aria-label="作品操作">
                  <button type="button" className="detail-dock-comment detail-dock-comment-entry" onClick={() => { setCommentPanelFocus((value) => value + 1); setCommentPanelOpen(true); }}>
                    <MessageSquare size={18} />
                    <span>说说你的想法…</span>
                    {commentTotal > 0 && <small>{commentTotal}</small>}
                  </button>
                  <div className="detail-dock-actions heika-solid-glass">
                  <button type="button" className={`bar-icon like-action${state.liked?.includes(post.id) ? " selected" : ""}`} aria-label={`${state.liked?.includes(post.id) ? "取消点赞" : "点赞"}，${detailLikeCounts[post.id] ?? post.likeCount ?? 0} 个赞`} aria-pressed={!!state.liked?.includes(post.id)} disabled={likeBusy} onClick={() => {
                    if (likeBusy) return;
                    const next = !state.liked?.includes(post.id);
                    setLikeBusy(true);
                    void cloudRequest("/api/v1/library-state", { action: "like", id: post.id, value: next }).then(() => {
                      const nextCount = Math.max(0, (detailLikeCounts[post.id] ?? post.likeCount ?? 0) + (next ? 1 : -1));
                      setDetailLikeCounts((current) => ({ ...current, [post.id]: Math.max(0, (current[post.id] ?? post.likeCount ?? 0) + (next ? 1 : -1)) }));
                      setPublicFeed((current) => current.map((item) => item.id === post.id ? { ...item, likeCount: nextCount } : item));
                      update((s) => ({ ...s, liked: next ? [...(s.liked || []), post.id] : (s.liked || []).filter((id) => id !== post.id) }));
                    }).catch(() => toast("点赞同步失败")).finally(() => setLikeBusy(false));
                  }}><Heart size={19} fill={state.liked?.includes(post.id) ? "currentColor" : "none"} /><span className="detail-like-count">{detailLikeCounts[post.id] ?? post.likeCount ?? 0}</span></button>
                  <button type="button" className={`bar-icon${state.saved.includes(post.id) ? " selected" : ""}`} aria-label={state.saved.includes(post.id) ? "取消收藏" : "收藏"} aria-pressed={state.saved.includes(post.id)} onClick={() => void toggleSave(post.id)}><Bookmark size={20} fill={state.saved.includes(post.id) ? "currentColor" : "none"} /></button>
                  {post.status === "published" && <button type="button" className="bar-icon" aria-label="分享内容" onClick={() => void openSharePanel()}><Share2 size={20} /></button>}
                  </div>
                  </div>}
                </div>
              </div>
              {detailPageMode && (
                <ReaderTocAside outline={detailOutline} activeId={detailActiveHeading} onJump={(item) => jumpToHeading(item.id)} />
              )}
              {readerTocOpen && (
                <ReaderTocSheet
                  outline={detailOutline}
                  activeId={detailActiveHeading}
                  onClose={() => setReaderTocOpen(false)}
                  onJump={(item) => { setReaderTocOpen(false); jumpToHeading(item.id); }}
                />
              )}
              {commentPanelOpen && (
                <CommentPanel
                  open={commentPanelOpen}
                  total={commentTotal}
                  sort={detailSort === "最新" ? "new" : "hot"}
                  comments={state.comments.filter((item) => item.post === post.id)}
                  loading={commentsLoading}
                  error={commentsError ? "评论加载失败" : null}
                  hasMore={commentHasMore}
                  loadingMore={commentsLoading}
                  accountId={accountId}
                  postAuthorId={post.authorId}
                  composer={commentComposerForm}
                  focusToken={commentPanelFocus}
                  onClose={() => setCommentPanelOpen(false)}
                  onSort={(next) => {
                    const label = next === "hot" ? "热度" : "最新";
                    if (detailSort !== label) setDetailSort(label);
                  }}
                  onLoadMore={() => void loadMoreComments()}
                  onRetry={() => void reloadComments()}
                  onLike={(comment) => void toggleCommentLike(comment)}
                  onReply={(comment) => { focusReply(comment.id, comment.name); setCommentPanelFocus((value) => value + 1); }}
                  onDelete={(comment) => void deleteComment(comment)}
                  onReport={(comment) => { setReportCommentId(comment.cloudId ?? null); setReportPostId(null); setReportReason(""); setReportNote(""); setModal("report"); }}
                  onCopy={(comment) => void copyComment(comment)}
                  onNotice={toast}
                />
              )}
              {previewImage && detailImages[displayedImageIndex] && <div className="detail-image-preview" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setPreviewImage(false)}><button aria-label="关闭图片预览" onClick={() => setPreviewImage(false)}><X size={23} /></button><img src={detailImages[displayedImageIndex]} alt={post.title} onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "true"; event.currentTarget.src = "/image-not-loaded.svg"; } }} /></div>}
          </>
        );
        return detailPageMode ? (
          <section className="detail-page-shell" aria-label="作品详情">{detailContent}</section>
        ) : (
          <div
            className={`overlay ${viewerId === post.id ? "from-flip-window " : ""}${detailReady ? "detail-ready" : transitionPhase ? `detail-${transitionPhase}` : "detail-preparing"}`}
            inert={!detailReady}
            aria-hidden={!detailReady}
          >
            {detailContent}
          </div>
        );
      })()}
      <SharePanel
        open={Boolean(sharePayloadState)}
        payload={sharePayloadState}
        clientId={shareClientId}
        surface="web"
        onClose={closeSharePanel}
        onNotice={toast}
      />
      {authorProfile && (
        <PublicProfile
          id={authorProfile}
          currentUserId={accountId}
          accountReady={accountReady}
          layout={profileLayout}
          onClose={closeAuthorProfile}
          onOpenMine={() => {
            closeAuthorProfile();
            setTab("mine");
            requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
          }}
          onOpenCollection={(seriesId) => { closeAuthorProfile(); openCollection(seriesId); }}
          onNotice={toast}
          onSelectPost={(id) => {
            closeAuthorProfile();
            if (all.some((post) => post.id === id)) {
              requestAnimationFrame(() => openPostRef.current(id, "discover"));
              return;
            }
            void fetch("/api/v1/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) })
              .then((response) => response.json())
              .then(({ data }) => {
                const post = data?.items?.[0] as Post | undefined;
                if (!post) { toast("这篇内容暂时无法查看"); return; }
                setPublicFeed((current) => current.some((item) => item.id === post.id) ? current : [...current, post]);
                requestAnimationFrame(() => openPostRef.current(id, "discover"));
              })
              .catch(() => toast("内容加载失败，请稍后重试"));
          }}
          onMessage={(id) => {
            closeAuthorProfile();
            setMessagePeer(id);
            setTab("messages");
            imageSwitchSequence.current += 1;
            setImageLoading(false);
            setDetail(null);
            setViewerId(null);
          }}
        />
      )}
      {recentPreview && (
        <div className="recent-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecentPreview(null); }}>
          <section className="recent-preview-card" role="dialog" aria-modal="true" aria-labelledby="recent-preview-title">
            <button type="button" className="recent-preview-close" aria-label="关闭预览" onClick={() => setRecentPreview(null)}><X size={19}/></button>
            {recentPreview.post.image || recentPreview.post.images?.[0] ? <img className="recent-preview-image" src={recentPreview.post.image || recentPreview.post.images?.[0]} alt="" onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "true"; event.currentTarget.src = "/image-not-loaded.svg"; } }} /> : recentPreview.post.video && <video className="recent-preview-image" src={recentPreview.post.video} controls playsInline preload="metadata" aria-label="最近发现的视频" />}
            {!recentPreview.post.image && !recentPreview.post.images?.[0] && !recentPreview.post.video && <div className="recent-preview-image recent-preview-placeholder" style={{ background: coverColor(recentPreview.post.tag) }} aria-hidden="true"><span>{recentPreview.post.tag}</span></div>}
            <div className="recent-preview-copy"><small>{recentPreview.post.tag} · {recentPreview.post.author}</small><h2 id="recent-preview-title">{recentPreview.post.title}</h2><p>{markdownToText(recentPreview.post.body)}</p><button type="button" className="recent-preview-open" onClick={() => { const item = recentPreview; setRecentPreview(null); requestAnimationFrame(() => openPost(item.post.id, item.source)); }}>查看内容 <ArrowRight size={17}/></button></div>
          </section>
        </div>
      )}
      {modal && (
        <div className={`modal-backdrop${modal === "write" ? " composer-backdrop" : ""}${modalClosing ? " is-closing" : ""}`} aria-hidden={modalClosing || undefined}>
          <div
            className={`modal ${modal === "write" ? "composer-modal" : ""} ${readingTransition ? `reading-${readingTransition}` : ""}`}
            inert={modal === "write" && Boolean(composerPanel || composerMediaId)}
            role={modal === "write" ? "dialog" : undefined} aria-modal={modal === "write" ? true : undefined} aria-label={modal === "write" ? "创作内容" : undefined}
          >
            {modal === "write" ? <header className="composer-topbar">
              <button type="button" className="composer-back" onClick={() => void closeComposer()} aria-label="返回"><ArrowLeft size={19}/><span>返回</span></button>
              <strong>创作内容</strong>
              <div className="composer-topbar-actions">
                <button type="button" className="composer-draft-button" onClick={() => { void flushComposerDraft.current().catch(() => {}); setDraftBoxOpen(true); }}>草稿箱{localDraftCount > 0 && <small>{localDraftCount}</small>}</button>
                <button type="button" className="composer-preview-button" onClick={() => setComposerPanel("preview")}>预览</button>
              </div>
            </header> : <button
              className="close"
              aria-label="关闭"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>}
            {modal === "report" ? (
              <div className="report-dialog">
                <div className="eyebrow">社区举报</div>
                <h2>举报内容</h2>
                <p>举报信息仅用于平台安全与人工复核，不会公开举报者身份。</p>
                <fieldset className="report-reasons"><legend>选择原因</legend>{REPORT_REASONS.map((reason) => <label key={reason} className={reportReason === reason ? "selected" : ""}><input type="radio" name="report-reason" value={reason} checked={reportReason === reason} onChange={() => setReportReason(reason)} />{reason}</label>)}</fieldset>
                <label className="report-note-label">补充说明 <span>选填</span><textarea value={reportNote} maxLength={300} onChange={(event) => setReportNote(event.target.value)} placeholder="可简要说明你认为不合适的部分" /></label>
                <button className="primary-button full" disabled={!reportReason || reportSubmitting} onClick={() => void submitContentReport()}>{reportSubmitting ? "正在提交…" : "提交举报"}</button>
              </div>
            ) : modal === "browsing" ? (
              <>
                <div className="eyebrow">浏览偏好</div>
                <h2>首页浏览模式</h2>
                <div className="reading-mode-list">
                  {(["waterfall", "blackcard"] as const).map((mode) => (
                    <button
                      className={`reading-mode-option ${state.homeMode === mode ? "selected" : ""}`}
                      key={mode}
                      aria-pressed={state.homeMode === mode}
                      onClick={() => {
                        update((s) => ({ ...s, homeMode: mode }));
                        void browserDb()
                          .then(async (db) => {
                            const { data } = await db.auth.getUser();
                            if (data.user) {
                              const { error } = await db
                                .from("browsing_preferences")
                                .upsert({
                                  user_id: data.user.id,
                                  home_mode: mode,
                                });
                              if (error) toast("本地已保存，云端同步失败");
                            }
                          })
                          .catch(() => {});
                      }}
                    >
                      <span className={`mode-preview ${mode}`} />
                      <span>
                        <strong>
                          {mode === "waterfall" ? "瀑布流" : "黑卡"}
                        </strong>
                        <small>
                          {mode === "waterfall"
                            ? "未翻开前隐藏内容，每日选 5 张"
                            : "逐张探索，每日最多翻开 5 张"}
                        </small>
                      </span>
                      <i>{state.homeMode === mode ? "✓" : ""}</i>
                    </button>
                  ))}
                </div>
                <button
                  className="primary-button full"
                  onClick={() => setModal(null)}
                >
                  完成
                </button>
              </>
            ) : modal === "interests" ? (
              <>
                <div className="eyebrow">我的兴趣</div>
                <h2>选择你的兴趣</h2>
                <p>这些方向会帮助黑卡排序每日翻卡候选，也会影响首页推荐。</p>
                <div className="interest-picker">
                  {tags.map((t) => (
                    <button
                      key={t}
                      className={state.interests.includes(t) ? "selected" : ""}
                      onClick={() =>
                        update((s) => ({
                          ...s,
                          interests: s.interests.includes(t)
                            ? s.interests.filter((x) => x !== t)
                            : [...s.interests, t],
                        }))
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button
                  className="primary-button full"
                  disabled={state.interests.length < 3}
                  onClick={() => setModal(null)}
                >
                  保存兴趣 · 已选 {state.interests.length} 个
                </button>
              </>
            ) : modal === "profile" ? (
              <AccountProfile
                name={state.name}
                bio={state.bio}
                avatar={state.avatar}
                details={state.profileDetails}
                onSave={(name, bio, avatar, profileDetails) =>
                  update((s) => ({ ...s, name, bio, avatar, profileDetails }))
                }
                onClose={() => setModal(null)}
              />
            ) : modal === "notifications" ? (
              <>
                <div className="eyebrow">偏好设置</div>
                <h2>通知设置</h2>
                <p className="settings-note">
                  通知偏好会同步到账号。开启浏览器提醒需系统许可；关闭页面后的后台推送暂未提供。
                </p>
                {notificationPermission === "unsupported" && (
                  <div className="permission-state">此浏览器不支持通知。</div>
                )}
                {notificationPermission === "denied" && (
                  <div className="permission-state">
                    浏览器通知权限已拒绝，请在站点设置中重新允许。
                  </div>
                )}
                <div className="switch-list">
                  {(
                    [
                      ["messages", "消息通知", "新消息提醒偏好"],
                      ["comments", "评论回复提醒", "有人回复时提醒偏好"],
                      ["daily", "每日探索提醒", "每日探索提醒偏好"],
                    ] as const
                  ).map(([key, label, description]) => (
                    <div className="switch-row" key={key}>
                      <span>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={state.notifications[key]}
                        aria-label={label}
                        disabled={notificationPermission === "unsupported"}
                        className={`toggle-switch ${state.notifications[key] ? "on" : ""}`}
                        onClick={() => void toggleNotification(key)}
                      >
                        <i />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="primary-button full"
                  onClick={() => setModal(null)}
                >
                  完成
                </button>
              </>
            ) : modal === "reading" ? (
              <>
                <div className="eyebrow">阅读与外观</div>
                <h2>阅读模式</h2>
                <p className="settings-note">
                  选择会保存在此浏览器，并应用于完整阅读页。
                </p>
                <div className="reading-mode-list">
                  {(
                    [
                      {
                        id: "standard",
                        name: "标准模式",
                        description: "深灰阅读背景与舒展排版，适合日常阅读。",
                      },
                      {
                        id: "focus",
                        name: "专注模式",
                        description: "减少辅助操作，突出正文与内容层级。",
                      },
                      {
                        id: "night",
                        name: "夜间模式",
                        description: "更深的阅读背景，适合暗光环境。",
                      },
                    ] as const
                  ).map((mode) => (
                    <button
                      type="button"
                      key={mode.id}
                      aria-pressed={state.readingMode === mode.id}
                      className={`reading-mode-option ${state.readingMode === mode.id ? "selected" : ""}`}
                      onClick={() => chooseReadingMode(mode.id)}
                    >
                      <span className={`reading-swatch ${mode.id}`} />
                      <span>
                        <strong>{mode.name}</strong>
                        <small>{mode.description}</small>
                      </span>
                      <i aria-hidden="true">
                        {state.readingMode === mode.id ? "✓" : ""}
                      </i>
                    </button>
                  ))}
                </div>
                {/* 字号与进度条：与阅读模式一起持久化在本机，滑动即作用到正文。 */}
                <ReaderTypeControls prefs={readerType.prefs} onChange={readerType.update} onReset={readerType.reset} />
                <button
                  className="primary-button full"
                  onClick={() => setModal(null)}
                >
                  完成
                </button>
              </>
            ) : (
              <div className="composer-workspace">
              <div className="composer-scroll">
                {(resumeTaskKey || composerError) && <section className={`composer-status-banner${composerError ? " is-error" : ""}`} role="status" aria-live="polite">
                  <span className="composer-status-icon" aria-hidden="true">{composerError ? "!" : <RefreshCw size={14} className="composer-check-spinner"/>}</span>
                  <div>
                    <strong>{composerError ? "上次发布没有完成" : "这份内容正在发布中"}</strong>
                    <small>{composerError ? `${composerError}。标题、正文和图片都还在，可以直接重新发布。` : "任务在后台继续，可在悬浮窗查看进度；完成前不会重复提交。"}</small>
                  </div>
                </section>}
                {!composerEditingPublished && <section className="composer-route" aria-label="发布状态">
                  <div className="composer-route-head">
                    <span>发布状态</span>
                    <small>{composerRouteLocked ? "沿用原分类" : composerCheckPhase === "checking" ? "正在检查内容" : composerCheckPhase === "failed" ? "检查暂时失败" : "等待发布"}</small>
                  </div>
                  <div className={`composer-route-target${writeChannel === "ai" ? " is-ai" : ""}`}>
                    <span className="composer-route-icon">{composerCheckPhase === "checking" ? <RefreshCw size={16} className="composer-check-spinner"/> : writeChannel === "ai" ? <Sparkles size={17}/> : <Compass size={17}/>}</span>
                    <div className="composer-route-copy">
                      <strong>{composerCheckPhase === "checking" ? "正在检查内容" : composerCheckPhase === "failed" ? "内容检查暂时失败" : composerRouteLocked ? "修改将沿用原分类" : writeChannel === "ai" ? `AI 空间 · ${AI_CONTENT_TYPE_LABELS[writeContentType]}` : `社区精选 · ${writeTag}`}</strong>
                      <small>{composerCheckPhase === "failed" ? "已编辑内容完整保留，再次点击发布即可重试。" : composerRouteLocked ? "已发布内容的分类不随编辑改变。" : "发布时将自动完成分类与审核，需要调整可在「更多发布设置」里改。"}</small>
                    </div>
                  </div>
                </section>}
                <ComposerTextEditor title={title} body={body} error={composerValidation} onTitle={changeComposerTitle} onBody={changeComposerBody}/>
                <section className={`ai-workbench-demo${aiWorkbenchOpen ? " is-open" : ""}`} aria-label="AI 创作工作台">
                  <button type="button" className="ai-workbench-trigger" aria-expanded={aiWorkbenchOpen} onClick={() => setAiWorkbenchOpen((open) => !open)}><span><Sparkles size={17}/><strong>AI 创作工作台</strong></span><small>{aiWorkbenchOpen ? "收起工作台" : "润色、扩写、标题与话题建议"}</small><ChevronDown size={17}/></button>
                  {aiWorkbenchOpen && <div className="ai-workbench-body">
                    <div className="ai-workbench-modes">{([["outline", "生成提纲"], ["title", "标题建议"], ["polish", "润色正文"], ["continue", "续写正文"], ["topics", "推荐话题"]] as const).map(([mode, label]) => <button type="button" className={aiWorkbenchMode === mode ? "selected" : ""} key={mode} onClick={() => { setAiWorkbenchMode(mode); setAiWorkbenchOutput(""); setAiWorkbenchMessages([]); setAiWorkbenchPrompt(""); setAiResultApplied(false); }}>{label}</button>)}</div>
                    <p className="ai-workbench-guidance">当前标题与正文会作为上下文。你可以继续提出修改意见；原稿只有点击“使用此版本”后才会改变。整理正文排版请用底部的「Markdown 优化」。</p>
                    {aiWorkbenchMessages.length > 2 && <div className="ai-workbench-conversation" aria-label="此前的修改对话">{aiWorkbenchMessages.slice(0, -2).map((message, index) => <div className={`ai-workbench-turn ${message.role}`} key={`${index}-${message.role}`}><small>{message.role === "user" ? "你的要求" : "AI 修改结果"}</small><p>{message.content}</p></div>)}</div>}
                    {aiWorkbenchMessages.length >= 2 && <div className="ai-workbench-last-request"><small>本轮要求</small><p>{aiWorkbenchMessages.at(-2)?.content}</p></div>}
                    <label className="ai-workbench-prompt"><span>你希望怎么修改</span><textarea value={aiWorkbenchPrompt} onChange={(event) => setAiWorkbenchPrompt(event.target.value)} maxLength={2000} rows={3} placeholder="例如：保留原意，语气更自然一些；再补充一个具体步骤。" /></label>
                    <div className="ai-workbench-prompt-actions"><button type="button" className="soft-button" onClick={() => { setAiWorkbenchMessages([]); setAiWorkbenchOutput(""); setAiWorkbenchPrompt("请从当前正文开始，保留原意和事实，给出一版润色结果。"); setAiWorkbenchMode("polish"); }}>从当前正文开始润色</button><button type="button" className="soft-button" disabled={!aiWorkbenchMessages.length} onClick={() => { setAiWorkbenchMessages([]); setAiWorkbenchOutput(""); setAiWorkbenchPrompt(""); }}>清空对话</button></div>
                    <button type="button" className="primary-button full ai-workbench-generate" disabled={aiWorkbenchBusy || (!title.trim() && !body.trim() && !aiWorkbenchPrompt.trim())} onClick={() => void generateAiWorkbench()}><Sparkles size={15}/>{aiWorkbenchBusy ? "正在整理…" : aiWorkbenchMessages.length ? "继续修改" : "生成建议"}</button>
                    {aiWorkbenchOutput && <><div className="ai-workbench-result"><small>生成结果 · 尚未写入正文</small><MarkdownContent source={aiWorkbenchOutput} className="ai-workbench-markdown"/></div><div className="ai-workbench-result-actions"><button type="button" className="ai-workbench-apply" onClick={applyAiWorkbenchResult}>{aiWorkbenchMode === "title" ? "使用首条标题" : aiWorkbenchMode === "topics" ? "添加有效话题" : aiWorkbenchMode === "polish" ? "使用此版本" : aiWorkbenchMode === "continue" ? "使用续写内容" : "插入写作提纲"}</button><button type="button" className="soft-button" onClick={() => void copyAiWorkbenchResult()}>复制</button>{aiResultApplied && <button type="button" className="soft-button" onClick={undoAiWorkbenchResult}>撤回</button>}</div></>}
                    {!aiWorkbenchOutput && <div className="ai-workbench-placeholder">可直接输入修改要求，或从当前正文开始；生成结果会先预览，不会自动覆盖原稿。</div>}
                  </div>}
                </section>
                <section className="composer-media-picker is-single" aria-label="选择图片">
                  <div className="composer-media-choices" role="group" aria-label="媒体类型">
                    <label className={`composer-media-choice${composerImages.length ? " selected" : ""}${composerImages.length >= 9 ? " disabled" : ""}`}>
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={uploadingImages || composerImages.length >= 9} onChange={(event) => { void chooseComposerImages(event.target.files); event.currentTarget.value = ""; }} />
                      <span className="composer-media-choice-icon"><ImagePlus size={20}/></span>
                      <span className="composer-media-choice-copy"><strong>图片</strong><small>{composerImages.length >= 9 ? "已达最多 9 张" : composerImages.length ? `已选 ${composerImages.length}/9` : "JPG / PNG / WebP · 最多 9 张"}</small></span>
                      <span className="composer-media-choice-mark">{composerImages.length ? `${composerImages.length}/9` : "选择"}</span>
                    </label>
                  </div>
                  <p className="composer-media-hint">选图后立即在后台上传（尚未发布）· 3 张并发 · 每张显示真实进度，失败可单张重试</p>
                </section>
                {composerImages.length > 0 && <><ComposerMediaStrip images={composerImages} coverIndex={coverIndex} busy={isPublishing} onSelect={setComposerMediaId} onRetry={(id) => void retryComposerImage(id)} onMove={reorderComposerImages} onAdd={(files) => void chooseComposerImages(files)}/><p className="composer-media-tip">长按或拖动排序 · 点击图片管理封面</p></>}
                {imageUploadProgress && imageUploadProgress.phase !== "done" && <div className="composer-upload-progress" role="status" aria-live="polite">
                  <div><span>{imageUploadProgress.phase === "processing" ? "服务器正在生成缩略图…" : `正在上传图片 ${imageUploadProgress.done}/${imageUploadProgress.total}`}</span><b>{imageUploadProgress.percent}%</b></div>
                  <progress max={100} value={imageUploadProgress.percent} aria-label={`图片上传 ${imageUploadProgress.percent}%`}/>
                </div>}
                <ComposerAttachments items={composerAttachments} quota={attachmentQuota} busy={attachmentBusy} error={attachmentError} progress={attachmentProgress} retryAvailable={attachmentRetryFiles.length > 0} onAdd={(files) => void addComposerAttachments(files)} onRetry={() => void retryComposerAttachments()} onRemove={(path) => void removeComposerAttachment(path)}/>
                
                <button type="button" className="composer-setting-row" onClick={() => setComposerPanel("topics")}><span># 话题</span><small>{writeTopics.length ? writeTopics.map(topic=>`#${topic}`).join(" ") : "添加话题"}</small><ChevronRight size={16}/></button>
                <button type="button" className="composer-setting-row" onClick={() => setComposerPanel("settings")}><span>更多发布设置</span><small>{writeTag}{writeSeriesId ? " · 已选系列" : ""}{pollQuestion.trim() ? " · 已加投票" : ""}</small><ChevronRight size={16}/></button>
                {!composerEditingPublished && (composerImages.length > 0 || title || body || state.own.some((item) => item.id === editing && item.status === "draft")) && <button type="button" className="composer-discard" onClick={() => void discardComposerDraft()}>删除草稿</button>}
                <p className="fineprint">
                  {accountId ? "草稿先保留在此设备；云端同步状态请查看底部提示。" : "草稿保存在此设备；登录后可发布并同步到云端。"}
                </p>
              </div>
              </div>
            )}
            {modal === "write" && composerPanel && <ComposerSheet title={composerPanel === "topics" ? "选择话题" : composerPanel === "settings" ? "更多发布设置" : "内容预览"} full={composerPanel === "preview"} onClose={() => setComposerPanel(null)}>
              {composerPanel === "topics" ? <>                <section className="composer-topic-section" aria-label="选择话题">
                  <div className="composer-section-heading"><span><strong>话题</strong><small>选择已有话题，也可以创建自己的话题</small></span><span>{writeTopics.length}/5</span></div>
                  {writeTopics.length > 0 && <div className="composer-selected-topics" aria-label="已选话题">{writeTopics.map((topic) => <button type="button" key={topic} onClick={() => setWriteTopics((current) => current.filter((item) => item !== topic))}>#{topic}<span aria-hidden="true">×</span></button>)}</div>}
                  <label className="composer-topic-search"><Search size={16} /><input value={topicSearch} onChange={(event) => setTopicSearch(event.target.value)} placeholder="搜索话题" aria-label="搜索话题" /></label>
                  <div className="composer-topic-options">
                    {topicChoices.filter((topic) => !topicSearch.trim() || topic.name.toLocaleLowerCase("zh-CN").includes(topicSearch.trim().toLocaleLowerCase("zh-CN"))).map(({ name: topic }) => {
                      const selected = writeTopics.includes(topic);
                      return <button type="button" key={topic} aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => {
                        if (selected) setWriteTopics((current) => current.filter((item) => item !== topic));
                        else if (writeTopics.length >= 5) toast("最多选择 5 个话题");
                        else setWriteTopics((current) => [...current, topic]);
                      }}>#{topic}</button>;
                    })}
                    {topicSearch.trim() && !topicChoices.some((topic) => topic.name.toLocaleLowerCase("zh-CN") === topicSearch.trim().toLocaleLowerCase("zh-CN")) && <button type="button" className="composer-topic-create" onClick={() => void createTopic()} disabled={creatingTopic}>{creatingTopic ? "正在创建…" : `创建 #${topicSearch.trim().replace(/^#+/, "")}`}</button>}
                    {!topicChoices.length && !topicSearch.trim() && <small className="composer-topic-empty">正在加载话题…</small>}
                  </div>
                </section>
</> : composerPanel === "settings" ? <>                <label className="composer-category-field">
                  {writeChannel === "ai" ? "AI 分类" : "分类"}
                  <ChoiceSelect label={writeChannel === "ai" ? "AI 分类" : "分类"} value={writeTag} onChange={(value) => { markComposerTagTouched(); setWriteTag(value); }} options={(writeChannel === "ai" ? aiCategories.filter((item) => item.kind === "category").map((item) => item.name) : communityCategories).map((tag) => ({value:tag,label:tag}))}/>
                </label>
                {accountId && <label className="composer-series-field">加入合集<ChoiceSelect label="加入合集" value={writeSeriesId} onChange={setWriteSeriesId} options={[{value:"",label:"暂不加入合集"},...creatorSeries.map((series) => ({value:series.id,label:series.title}))]}/><small>可选。{writeChannel === "ai" ? "AI 内容与社区作品共用同一套合集，详情页与个人主页都会展示。" : "合集在「我的 → 作品管理」中创建和管理，发布后也能随时把作品加进去。"}</small></label>}
                <div className="composer-advanced">
                  <div className="composer-advanced-content">
                {writeChannel === "community" && <section className="composer-poll-editor" aria-label="添加投票">
                  <div className="composer-section-heading"><span><strong>互动投票</strong><small>给帖子增加一个单选问题，读者可查看实时结果</small></span><span>{pollQuestion.trim() ? "已添加" : "可选"}</span></div>
                  <input className="composer-poll-question" value={pollQuestion} maxLength={180} onChange={(event) => setPollQuestion(event.target.value)} placeholder="输入投票问题" aria-label="投票问题" />
                  <div className="composer-poll-options">{pollOptions.map((option, index) => <div key={index}><span>{index + 1}</span><input value={option} maxLength={80} onChange={(event) => setPollOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`选项 ${index + 1}`} aria-label={`投票选项 ${index + 1}`} />{pollOptions.length > 2 && <button type="button" aria-label={`删除选项 ${index + 1}`} onClick={() => setPollOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15}/></button>}</div>)}</div>
                  {pollOptions.length < 4 && <button type="button" className="composer-poll-add" onClick={() => setPollOptions((current) => [...current, ""])}><Plus size={14}/>添加选项</button>}
                </section>}
                  </div>
                </div>
                <section className="composer-draft-actions" aria-label="草稿操作">
                  <button type="button" onClick={() => void saveAndNewDraft()}><Plus size={15} /> 保存并新建</button>
                  <button type="button" className="is-danger" onClick={() => void deleteCurrentDraft()}><Trash2 size={15} /> 删除当前草稿</button>
                  <small>草稿只保存在当前设备，不会上传云端。</small>
                </section>
</> : <article className="composer-preview detail-body"><small>{writeChannel === "ai" ? "AI 空间" : "社区作品"} · {writeTag}</small><h1>{title || "未填写标题"}</h1><div className="composer-preview-media">{[composerImages[coverIndex], ...composerImages.filter((_,index)=>index!==coverIndex)].filter(Boolean).map(image=><img key={image.id} src={image.url} alt="内容图片预览"/>)}</div><MarkdownContent source={body} className="article"/>{writeChannel === "ai" && <AIResourceDetails preview postId="" contentType={writeContentType} resourceData={aiResourceFields} accountId={accountId} onLogin={()=>{}} onNotice={toast}/>}<PostAttachmentsPanel resourceData={{ attachments: composerAttachments }} onNotice={toast}/><div className="composer-preview-topics">{writeTopics.map(topic=><span key={topic}>#{topic}</span>)}</div>{pollQuestion.trim() && writeChannel === "community" && <section className="composer-preview-poll"><strong>{pollQuestion}</strong>{pollOptions.filter(option=>option.trim()).map((option,index)=><p key={index}>{option}</p>)}</section>}<p className="fineprint">创作预览 · 提交后进入人工审核</p></article>}
            </ComposerSheet>}
            {modal === "write" && markdownOptimizeOpen && <ComposerSheet title="Markdown 优化" full onClose={() => { if (!markdownOptimizeBusy) setMarkdownOptimizeOpen(false); }}>
              {markdownOptimizeBusy ? <section className="composer-markdown-state" aria-live="polite"><strong>正在整理 Markdown 结构…</strong><small>保持原意与事实，只调整标题层级、列表、引用和代码块。</small></section> : markdownOptimizeError ? <section className="composer-markdown-state"><p role="alert">{markdownOptimizeError}</p><div className="composer-markdown-actions"><button type="button" className="primary-button" onClick={() => void optimizeMarkdown()}>重试</button><button type="button" className="soft-button" onClick={() => setMarkdownOptimizeOpen(false)}>关闭</button></div></section> : <>
                <p className="composer-markdown-hint">确认这版结构后再替换正文，原稿会保留撤回入口。</p>
                <article className="composer-preview detail-body"><MarkdownContent source={markdownOptimizeOutput} className="article"/></article>
                <div className="composer-markdown-actions"><button type="button" className="primary-button" onClick={applyMarkdownOptimize}>使用此版本</button><button type="button" className="soft-button" onClick={() => void copyMarkdownOptimize()}>复制</button><button type="button" className="soft-button" onClick={() => setMarkdownOptimizeOpen(false)}>取消</button></div>
              </>}
            </ComposerSheet>}
            {modal === "write" && composerMediaId && (() => { const index=composerImages.findIndex(image=>image.id===composerMediaId); const image=composerImages[index]; return image ? <ComposerSheet title="图片管理" full onClose={()=>setComposerMediaId(null)}><div className="composer-media-preview"><img src={image.url} alt={`第 ${index+1} 张图片预览`}/><div className="composer-media-actions"><button type="button" onClick={()=>setCoverIndex(index)}>{coverIndex===index ? "当前封面" : "设为封面"}</button><button type="button" disabled={index===0} onClick={()=>moveComposerImage(index,-1)}>前移</button><button type="button" disabled={index===composerImages.length-1} onClick={()=>moveComposerImage(index,1)}>后移</button><label>替换图片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event=>{void replaceComposerImage(image.id,event.target.files?.[0]);event.currentTarget.value="";}}/></label><button type="button" disabled={draftSaving || uploadingImages} onClick={async()=>{await removeComposerImage(index);setComposerMediaId(null);}}>删除</button></div></div></ComposerSheet> : null; })()}
            {modal === "write" && markdownPreviousBody !== null && <div className="composer-markdown-applied" role="status"><span>已应用 Markdown 优化</span><button type="button" onClick={undoMarkdownOptimize}>撤回</button></div>}
            {modal === "write" && composerOutcome && <div className="composer-outcome" role="dialog" aria-modal="true" aria-label="发布结果">
              <div className="composer-outcome-card">
                <span className={`composer-outcome-icon is-${composerOutcome.kind}`} aria-hidden="true">{composerOutcome.kind === "published" ? "✓" : "⌛"}</span>
                <h2>{composerOutcome.kind === "published" ? "发布成功" : "已提交审核"}</h2>
                <p>{composerOutcome.kind === "published" ? "作品已公开展示，可在「我的作品」里继续编辑。" : "内容已进入审核流程，通过后自动公开展示；这段时间可以直接离开。"}</p>
                <div className="composer-outcome-summary">
                  {composerOutcome.cover ? <img src={composerOutcome.cover} alt="" /> : <span className="composer-outcome-cover-fallback" aria-hidden="true"><ImagePlus size={18}/></span>}
                  <div>
                    <strong>{composerOutcome.title || "未命名作品"}</strong>
                    <small>{composerOutcome.imageCount ? `${composerOutcome.imageCount} 张图片 · ` : ""}{new Date(composerOutcome.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 提交</small>
                  </div>
                </div>
                <div className="composer-outcome-actions">
                  {composerOutcome.clientId ? <button type="button" className="primary-button" onClick={() => { const id = composerOutcome.clientId; finishComposerOutcome(); if (id) openPost(id, "discover"); }}>查看作品</button> : null}
                  <button type="button" className={composerOutcome.clientId ? "soft-button" : "primary-button"} onClick={startAnotherPost}>再写一篇</button>
                  <button type="button" className="soft-button" onClick={finishComposerOutcome}>完成</button>
                </div>
                <p className="composer-outcome-hint">发布任务可在悬浮窗与「发布任务」里查看，离开本页不会中断。</p>
              </div>
            </div>}
            {modal === "write" && <footer className="composer-footer"><span><strong role="status">{composerMediaLoadFailed ? "附件列表读取失败" : draftSyncError || (draftLocalState === "saving" ? "正在保存到本机…" : draftLocalState === "saved" ? "已保存到本机" : draftLocalState === "error" ? "本机保存失败" : "自动保存草稿")}</strong>{composerMediaLoadFailed && <button type="button" className="composer-save-retry" disabled={uploadingImages} onClick={()=>void reloadComposerMedia()}>重试读取附件</button>}{draftSyncError && <button type="button" className="composer-save-retry" onClick={()=>setDraftRetry(value=>value+1)}>重试保存</button>}<small>提交后进入人工审核</small></span><button type="button" className="composer-markdown-optimize" onClick={() => void optimizeMarkdown()} disabled={markdownOptimizeBusy || isPublishing || !body.trim()}><Wand2 size={15} aria-hidden="true"/>{markdownOptimizeBusy ? "优化中…" : "Markdown 优化"}</button><button className="primary-button composer-publish-button" disabled={isPublishing || draftSaving || (!!resumeTaskKey && runningTaskKeys.includes(resumeTaskKey))} onClick={handlePublishClick}><ArrowUpRight size={15} aria-hidden="true"/>{composerSuggestion?.checking ? "正在检查内容…" : isPublishing ? "正在提交…" : resumeTaskKey && runningTaskKeys.includes(resumeTaskKey) ? "正在发布…" : resumeTaskKey ? "重新发布" : composerEditingPublished ? "保存修改" : "发布内容"}</button></footer>}
          </div>
        </div>
      )}
      <DecorCenter
        open={decorOpen}
        initialTab={decorTab}
        initialKind={decorKind}
        accountId={accountId}
        onClose={() => setDecorOpen(false)}
        onNotice={toast}
        onLogin={() => { setDecorOpen(false); setTab("messages"); toast("登录后可以保存自己的装扮"); }}
      />
      <DraftBox
        open={draftBoxOpen}
        owner={accountId || "guest"}
        onClose={() => setDraftBoxOpen(false)}
        onNew={() => { setDraftBoxOpen(false); setModal(null); void openComposer(); }}
        onResume={(draft) => { setDraftBoxOpen(false); setModal(null); void openComposer(undefined, draft.channel, draft); }}
        onNotice={toast}
      />
      {notice && <NoticeBanner key={notice.id} notice={notice} leaving={noticeLeaving} expanded={noticeExpanded} onExpand={expandNotice} onDismiss={dismissNotice} />}
      <PublishFloatingWindow
        taskCenterOpen={taskCenterOpen}
        onOpenTaskCenter={() => setTaskCenterOpen(true)}
        onCloseTaskCenter={() => setTaskCenterOpen(false)}
        onOpenPost={(task: PublishTask) => {
          if (task.clientId) openPost(task.clientId, "discover");
          else toast("作品已发布，可在「我的作品」中查看");
        }}
        onRetryPublish={(task: PublishTask) => { setTaskCenterOpen(false); void resumeComposeFromTask(task); }}
        onResumeCompose={(task: PublishTask) => { setTaskCenterOpen(false); void resumeComposeFromTask(task); }}
      />
      {announcement && <div className="announcement-backdrop" role="dialog" aria-modal="true" aria-labelledby="announcement-title" onClick={dismissAnnouncement}>
        <div className="announcement-card" onClick={(event) => event.stopPropagation()}>
          <span className="announcement-kicker"><Megaphone size={14}/> 公告</span>
          <h2 id="announcement-title">{announcement.title}</h2>
          <p>{announcement.body}</p>
          <button type="button" className="primary-button full" onClick={dismissAnnouncement}>我知道了</button>
        </div>
      </div>}
    </main>
  );
}
