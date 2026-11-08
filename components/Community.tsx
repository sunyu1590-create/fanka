"use client";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  Send,
  Trash2,
  PenLine,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  ArrowRight,
  MessageSquare,
  Share2,
  ThumbsDown,
  MoreHorizontal,
  Flag,
  Sparkles,
  UsersRound,
  Crown,
  ShieldCheck,
  Settings,
  GitBranch,
  CalendarDays,
  History,
  ImagePlus,
  Video as VideoIcon,
  LayoutGrid,
  List,
} from "lucide-react";
import dynamic from "next/dynamic";
import ProgressiveImage from "./ProgressiveImage";
import ChoiceSelect from "./ChoiceSelect";
import { confirmInApp, promptInApp } from "@/lib/in-app-dialog";
const Messages = dynamic(() => import("./Messages"), {
  loading: () => <div className="empty">正在加载消息…</div>,
});
const AdminModeration = dynamic(() => import("./AdminModeration"), {
  loading: () => <div className="empty">正在加载审核队列…</div>,
});
import DiscoveryPostCard from "./DiscoveryPostCard";
const EditorialArticle = dynamic(() => import("./EditorialArticle"));
import { MarkdownContent, markdownToText } from "./MarkdownContent";
import { FollowedTopicsSettings, TopicFollowButton, SeriesSubscription, PostPoll, PrivateHighlights, RecommendationControls } from "./InteractiveDiscovery";
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
import { ComposerSheet, ComposerTextEditor, ComposerMediaStrip } from "./ComposerPanels";
import { clearDraftFiles, loadDraftFiles, saveDraftFiles } from "@/lib/draft-files";
import { validateComposerFiles } from "@/lib/composer-validation";
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
import { POST_VIDEO_MAX_BYTES, POST_VIDEO_TYPES, uploadVideoResumable, videoExtension } from "@/lib/video-upload";
import { compressVideoForUpload, supportsVideoCompression, VIDEO_COMPRESSION_THRESHOLD } from "@/lib/video-compression";
import NoticeBanner, { type NoticeBannerItem, type NoticeKind, type NoticeOptions } from "./NoticeBanner";
import SettingsHome, { type SettingsDetail } from "./SettingsHome";
import MembershipCenter from "./MembershipCenter";
import { baseDailyFlipAllowance } from "@/lib/membership-plans";
const AboutHeika = dynamic(() => import("./AboutHeika"));
const CacheManager = dynamic(() => import("./CacheManager"));
const FeedbackForm = dynamic(() => import("./FeedbackForm"));
const FeedbackAdmin = dynamic(() => import("./FeedbackAdmin"));
const NotificationSettings = dynamic(() => import("./NotificationSettings"));
const AISpace = dynamic(() => import("./AISpace"), { loading: () => <div className="empty">正在加载 AI 空间…</div> });
const AIResourceDetails = dynamic(() => import("./AIResourceDetails"));
const AppealCenter = dynamic(() => import("./AppealCenter"));
import type { AiContentType } from "@/lib/ai-resources";

const FLIP_RAIN_PARTICLES = 96;
const FLIP_RAIN_DURATION_MIN_MS = 2900;
const FLIP_RAIN_DURATION_SPREAD_MS = 900;
const FLIP_RAIN_LEAD_MS = 240;
const FLIP_RAIN_STAGGER_WINDOW_MS = 900;
const FLIP_RAIN_JITTER_MS = 90;
const FLIP_RAIN_CLEANUP_MS = FLIP_RAIN_LEAD_MS + FLIP_RAIN_STAGGER_WINDOW_MS + FLIP_RAIN_JITTER_MS + FLIP_RAIN_DURATION_MIN_MS + FLIP_RAIN_DURATION_SPREAD_MS + 180;
const RATING_COLORS = ["#ff5d78", "#ff9452", "#edbd36", "#65b95e", "#34aeb5"];
const AI_EDITOR_FIELDS: Record<AiContentType, { key: string; label: string; hint: string; multiline?: boolean; required?: boolean }[]> = {
  knowledge_article: [],
  agent: [
    { key: "functionality", label: "主要功能", hint: "这个 Agent 能解决什么问题", multiline: true, required: true },
    { key: "platforms", label: "兼容平台", hint: "例如：OpenAI API、Claude、Dify", required: true },
    { key: "run_mode", label: "运行方式", hint: "云端 / 本地 / 工作流", required: true },
    { key: "source_url", label: "项目来源", hint: "公开的 HTTPS 项目地址", required: true },
    { key: "use_cases", label: "适用场景", hint: "补充推荐使用场景", multiline: true },
    { key: "tutorial", label: "使用教程", hint: "安装和使用步骤", multiline: true },
    { key: "version", label: "版本", hint: "例如：1.0.0", required: true },
    { key: "changelog", label: "更新记录", hint: "本次版本变更", multiline: true },
  ],
  skill: [
    { key: "functionality", label: "功能说明", hint: "这个 Skill 扩展了什么能力", multiline: true, required: true },
    { key: "environments", label: "兼容环境", hint: "例如：Claude Code、Cursor", required: true },
    { key: "installation", label: "安装步骤", hint: "安装命令或配置步骤", multiline: true, required: true },
    { key: "configuration", label: "配置内容", hint: "可选配置或环境变量", multiline: true },
    { key: "example", label: "使用示例", hint: "展示典型调用方式", multiline: true },
    { key: "version", label: "版本", hint: "例如：1.0.0", required: true },
    { key: "changelog", label: "更新记录", hint: "本次版本变更", multiline: true },
    { key: "source_url", label: "来源地址", hint: "公开的 HTTPS 项目地址", required: true },
  ],
  prompt: [
    { key: "model", label: "适用模型", hint: "例如：GPT-5、Claude、通用模型", required: true },
    { key: "scenario", label: "应用场景", hint: "说明适用任务", required: true },
    { key: "prompt", label: "完整提示词", hint: "请粘贴可直接使用的提示词", multiline: true, required: true },
    { key: "variables", label: "可替换变量", hint: "例如：主题、语气、受众", multiline: true },
    { key: "example", label: "使用示例", hint: "补充输入和输出示例", multiline: true },
  ],
  ai_tool: [
    { key: "functionality", label: "功能说明", hint: "工具核心能力", multiline: true, required: true },
    { key: "platforms", label: "支持平台", hint: "Web、iOS、Android、桌面端等", required: true },
    { key: "source_url", label: "工具地址", hint: "公开的网站或项目地址", required: true },
    { key: "pricing", label: "价格信息", hint: "免费方案或订阅价格" },
    { key: "experience", label: "使用体验", hint: "优缺点与适合人群", multiline: true },
  ],
  tutorial: [
    { key: "difficulty", label: "难度", hint: "入门 / 进阶 / 高级", required: true },
    { key: "requirements", label: "准备条件", hint: "账号、模型、软件或素材", required: true },
    { key: "steps", label: "实战步骤", hint: "按顺序说明如何完成任务", multiline: true, required: true },
    { key: "source_url", label: "参考来源", hint: "可选公开资料地址" },
  ],
};

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
type ComposerImage = { id: string; file?: File; path?: string; url: string; status: "ready" | "uploading" | "failed"; sortOrder?: number; external?: boolean };
type ComposerVideo = { id: string; file?: File; path?: string; url: string; name: string; size: number; type: string; status: "ready" | "compressing" | "uploading" | "failed"; progress: number; compressionProgress?: number; originalSize?: number; compressionNote?: string; existing?: boolean };
type PageTransitionHandle = { finished: Promise<unknown> };
const VIDEO_UPLOAD_BETA_ENABLED = process.env.NEXT_PUBLIC_VIDEO_UPLOAD_BETA === "1";
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
const nav = [
  ["today", "首页", Home],
  ["discover", "发现", Compass],
  ["messages", "消息", MessageSquare],
  ["mine", "我的", UserRound],
] as const;
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
export default function Community() {
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [themeReady, setThemeReady] = useState(false);
  const [bottomNavStyle, setBottomNavStyle] = useState<"glass" | "fixed">("glass");
  const [discoverSettingsOpen, setDiscoverSettingsOpen] = useState(false);
  const [discoverSearchOpen, setDiscoverSearchOpen] = useState(false);
  const [bottomNavStyleReady, setBottomNavStyleReady] = useState(false);
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
    const savedBottomNavStyle = localStorage.getItem("heika-bottom-nav-style");
    if (savedBottomNavStyle === "glass") setBottomNavStyle("glass");
    if (savedBottomNavStyle === "fixed") {
      const explicitlyChosen = localStorage.getItem("heika-bottom-nav-style-explicit") === "1";
      const nextStyle = explicitlyChosen ? "fixed" : "glass";
      setBottomNavStyle(nextStyle);
      if (!explicitlyChosen) localStorage.setItem("heika-bottom-nav-style", nextStyle);
    }
    setBottomNavStyleReady(true);
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
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => { root.dataset.theme = theme === "system" ? (media.matches ? "light" : "dark") : theme; };
    apply();
    media.addEventListener("change", apply);
    localStorage.setItem("heika-theme", theme);
    return () => media.removeEventListener("change", apply);
  }, [theme, themeReady]);
  useEffect(() => {
    if (!fontReady) return;
    document.documentElement.dataset.font = fontChoice;
    localStorage.setItem("heika-font", fontChoice);
  }, [fontChoice, fontReady]);
  useEffect(() => {
    if (!bottomNavStyleReady) return;
    document.documentElement.dataset.bottomNav = bottomNavStyle;
    localStorage.setItem("heika-bottom-nav-style", bottomNavStyle);
  }, [bottomNavStyle, bottomNavStyleReady]);
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
    viewerStageRef = useRef<HTMLDivElement | null>(null),
    loadMoreRef = useRef<HTMLDivElement | null>(null),
    scrollPositions = useRef<Record<string, number>>({});
  const discoverScrollPositions = useRef<Record<"community" | "ai", number>>({ community: 0, ai: 0 });
  const sharedPostHandled = useRef<string | null>(null);
  const searchCursorRef = useRef<string | null>(null);
  const [authorProfile, setAuthorProfile] = useState<string | null>(null);
  const [publicBookmarks, setPublicBookmarks] = useState(false);
  const [publicBookmarksLoaded, setPublicBookmarksLoaded] = useState(false);
  const [bookmarkVisibilityBusy, setBookmarkVisibilityBusy] = useState(false);
  const [messagePeer, setMessagePeer] = useState<string | null>(null);
  const [chatConversationOpen, setChatConversationOpen] = useState(false);
  const [storageKey, setStorageKey] = useState("heika-demo-v1");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [adminRole, setAdminRole] = useState<"member" | "admin" | "content_manager" | "reviewer">("member");
  const adminEntryPending = useRef(false);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const cloudHydrated = useRef(false);
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
  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [topicEvents, setTopicEvents] = useState<TopicEvent[]>([]);
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
    [mineSection, setMineSection] = useState<"works" | "favorites" | "liked">("works"),
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
  const [explorationCalendarOpen, setExplorationCalendarOpen] = useState(true);
  const [explorationHistoryOpen, setExplorationHistoryOpen] = useState(false);
  const [myContentReturnTab, setMyContentReturnTab] = useState<"mine" | "settings">("mine");
  const readingTimer = useRef<number[]>([]),
    scrollBeforeDetail = useRef(0),
    ratingPulseTimer = useRef<number | null>(null);
  const ratingBusy = useRef(false);
  const [state, setState] = useState<State>(initial),
    [ready, setReady] = useState(false),
    [tab, setTabState] = useState("today"),
    [detail, setDetail] = useState<number | null>(null),
    [detailPostOverride, setDetailPostOverride] = useState<Post | null>(null),
    [detailReady, setDetailReady] = useState(false),
    [transitionPhase, setTransitionPhase] = useState<
      "opening" | "closing" | null
    >(null),
    [justFlippedId, setJustFlippedId] = useState<number | null>(null),
    [category, setCategory] = useState("全部"),
    [discoverChannel, setDiscoverChannel] = useState<"community" | "ai">("community"),
    [searchDraft, setSearchDraft] = useState(""),
    [searchTerm, setSearchTerm] = useState(""),
    [searchKind, setSearchKind] = useState<"content" | "people">("content"),
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
    [aiWorkbenchMode, setAiWorkbenchMode] = useState<"title" | "outline" | "polish" | "topics">("outline"),
    [aiWorkbenchOutput, setAiWorkbenchOutput] = useState(""),
    [aiWorkbenchBusy, setAiWorkbenchBusy] = useState(false),
    [aiPreviousBody, setAiPreviousBody] = useState<string | null>(null),
    [aiPreviousTitle, setAiPreviousTitle] = useState<string | null>(null),
    [aiPreviousTopics, setAiPreviousTopics] = useState<string[] | null>(null),
    [aiResultApplied, setAiResultApplied] = useState(false),
    [writeTag, setWriteTag] = useState<string>(tags[0]),
    [communityCategories, setCommunityCategories] = useState<string[]>([...tags]),
    [aiCategories, setAiCategories] = useState<{id:number;name:string;description?:string;kind?:string;moderation_status?:string}[]>([]),
    [writeChannel, setWriteChannel] = useState<"community" | "ai">("community"),
    [writeContentType, setWriteContentType] = useState<AiContentType>("knowledge_article"),
    [aiResourceFields, setAiResourceFields] = useState<Record<string, string>>({}),
    [writeTopics, setWriteTopics] = useState<string[]>([]),
    [writeSeriesId, setWriteSeriesId] = useState(""),
    [topicSearch, setTopicSearch] = useState(""),
    [topicChoices, setTopicChoices] = useState<TopicSummary[]>([]),
    [creatingTopic, setCreatingTopic] = useState(false),
    [composerImages, setComposerImages] = useState<ComposerImage[]>([]),
    [composerVideo, setComposerVideo] = useState<ComposerVideo | null>(null),
    [composerValidation, setComposerValidation] = useState<"" | "title" | "body">(""),
    [uploadingImages, setUploadingImages] = useState(false),
    [coverIndex, setCoverIndex] = useState(0),
    [draftSaved, setDraftSaved] = useState(false),
    [composerEditingPublished, setComposerEditingPublished] = useState(false),
    [composerRevisionMode, setComposerRevisionMode] = useState(false),
    [draftSaving, setDraftSaving] = useState(false),
    [isPublishing, setIsPublishing] = useState(false),
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
  useEffect(() => () => {
    if (modalCloseTimer.current !== null) window.clearTimeout(modalCloseTimer.current);
  }, []);
  const [messagesTabVisited, setMessagesTabVisited] = useState(false);
  const [secondaryReturnTab, setSecondaryReturnTab] = useState("discover");
  const [sharedCollectionCode, setSharedCollectionCode] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("room")) { setSecondaryReturnTab("mine"); setTabState("co-explore"); }
    else if (params.get("collection")) { setSharedCollectionCode(params.get("collection") || ""); setSecondaryReturnTab("discover"); setTabState("shared-collection"); }
    else if (params.get("chain")) { setSecondaryReturnTab("mine"); setTabState("card-chain"); }
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
      updatePage();
      return;
    }
    if (pageTransition.current) {
      pageTransitionQueue.current.push(updatePage);
      return;
    }
    const transition = transitionDocument.startViewTransition(updatePage);
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
    if (next === "messages") setMessagesTabVisited(true);
    startPageTransition(() => setTabState(next));
  };
  const openNotifications = (returnTab = "messages") => { setSecondaryReturnTab(returnTab); setTab("notifications"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const openMineSettings = () => { scrollPositions.current.mine = window.scrollY; setSettingsPersonalOpen(false); setTab("settings"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const openExplorationCenter = () => { scrollPositions.current.mine = window.scrollY; setTab("exploration-center"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const openCoExplore = (returnTab: "mine" | "exploration-center" = "mine") => { scrollPositions.current[returnTab] = window.scrollY; setSecondaryReturnTab(returnTab); setTab("co-explore"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const openMineFeature = (feature: "monthly-recap" | "card-chain", returnTab: "mine" | "exploration-center" = "mine") => { scrollPositions.current[returnTab] = window.scrollY; setSecondaryReturnTab(returnTab); setTab(feature); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const returnToSecondaryTab = () => { const destination = secondaryReturnTab; setTab(destination); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[destination] || 0, behavior: "instant" })); };
  const closeSearch = () => setTab(searchReturnTab || "discover");
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
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastDraftPayload = useRef("");
  const draftSaveTimer = useRef<number | null>(null);
  const draftCloudQueue = useRef<Promise<void>>(Promise.resolve());
  const composerSession = useRef(0);
  const draftRevision = useRef(0);
  const composerDraftRef = useRef<Post | null>(null);
  const composerCloudDrafts = useRef(new Map<string, Post>());
  const flushComposerDraft = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { composerSession.current += 1; composerDraftRef.current = null; composerCloudDrafts.current.clear(); }, [accountId]);
  const publishInFlight = useRef(false);
  const videoCompressionSequence = useRef(0);
  const videoCompressionAbort = useRef<AbortController | null>(null);
  const draftMediaBusy = useRef(new Set<string>());
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayKey(new Date(), zone);
  const selectedDay = selectedCalendarDate || today;
  const calendarDays = Array.from({ length: 28 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (27 - index));
    const key = dayKey(date, zone);
    return { key, count: (state.opened[key] || []).length };
  });
  const selectedDayIds = state.opened[selectedDay] || [];
  const all = useMemo(() => [
    ...new Map(
      [...publicFeed, ...topicPosts, ...searchPosts, ...bookmarkedPosts, ...Object.values(state.revealed), ...state.own].map(
        (post) => [post.id, post],
      ),
    ).values(),
  ], [publicFeed, topicPosts, searchPosts, bookmarkedPosts, state.revealed, state.own]);
  const opened = state.opened[today] || [];
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
    state.deck[today] || [],
    50,
    today,
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
  const recentDiscoveries = Object.entries(state.opened)
    .flatMap(([date, ids]) =>
      ids.map((id) => ({ date, post: all.find((item) => item.id === id) })),
    )
    .filter((entry): entry is { date: string; post: Post } =>
      Boolean(entry.post),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
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
          revealed: saved.revealed || {}, rarityTiers: saved.rarityTiers || {},
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
    void fetch("/api/demo/cards", { cache: "no-store" }).then(async (response) => {
      const { data } = await response.json();
      if (response.ok && !cancelled && Array.isArray(data)) {
        setState((current) => ({ ...current, cardIds: data.map((item: { id: number }) => item.id) }));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      const cachedState: Partial<State> = { ...state };
      delete cachedState.comments;
      const isSignedImage = (src?: string) => Boolean(src && (src.startsWith("/api/v1/media?") || src.includes("/storage/v1/object/sign/")));
      cachedState.revealed = Object.fromEntries(Object.entries(state.revealed).map(([id, post]) => [id, {
        ...post,
        image: isSignedImage(post.image) ? undefined : post.image,
        images: post.images?.filter((image) => !isSignedImage(image)),
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
      if (communityItems.length) setCommunityCategories(communityItems.filter((item: { kind?: string }) => item.kind === "category").map((item: { name: string }) => item.name));
      if (aiItems.length) setAiCategories(aiItems.filter((item: { kind?: string }) => item.kind === "category"));
    }).catch(() => {});
    return () => { active = false; };
  }, [ready]);
  useEffect(() => {
    const updateColumns = () => setDiscoverColumnCount(window.innerWidth >= 1600 ? 5 : window.innerWidth >= 1280 ? 4 : window.innerWidth >= 768 ? 3 : 2);
    updateColumns();
    window.addEventListener("resize", updateColumns, { passive: true });
    return () => window.removeEventListener("resize", updateColumns);
  }, []);
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
    if (!accountId) { setCreatorSeries([]); return; }
    let active = true;
    void cloudRequest("/api/v1/series").then((data) => { if (active && Array.isArray(data?.items)) setCreatorSeries(data.items as PostSeries[]); }).catch(() => {});
    return () => { active = false; };
  }, [accountId, tab]);
  const createPostSeries = async () => {
    if (!seriesName.trim()) return;
    try {
      const item = await cloudRequest("/api/v1/series", { title: seriesName.trim(), description: seriesDescription.trim() }) as PostSeries | null;
      if (item) { setCreatorSeries((items) => [item, ...items]); setSeriesName(""); setSeriesDescription(""); toast("作品系列已创建，发布内容时可以加入"); }
    } catch (error) { toast(error instanceof Error ? error.message : "系列创建失败"); }
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
    if (!ready || !state.cardIds.length || state.deck[today]?.length) return;
    const deck = dailyCandidates(candidatePosts, state.interests, [], 50, today).map((post) => post.id);
    if (!deck.length) return;
    update((current) => current.deck[today]?.length ? current : {
      ...current,
      deck: { ...current.deck, [today]: deck },
    });
  }, [ready, today, state.cardIds, state.deck, state.interests, candidatePosts]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("heika-search-recent") || "[]");
      if (Array.isArray(saved)) setSearchRecent(saved.filter((item): item is string => typeof item === "string").slice(0, 8));
    } catch {}
  }, []);
  useEffect(() => {
    if (tab !== "search" || !searchTerm) return;
    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError("");
    const cursor = searchKind === "content" && searchPage > 1 && searchCursorRef.current
      ? `&cursor=${encodeURIComponent(searchCursorRef.current)}`
      : "";
    const url = `/api/v1/search?q=${encodeURIComponent(searchTerm)}&kind=${searchKind}&page=${searchPage}&limit=12${cursor}`;
    void fetch(url, { signal: controller.signal, cache: "default" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.data?.items)) throw new Error(result.error || "搜索失败，请重试");
        const items = result.data.items as (Post | SearchPerson)[];
        if (searchKind === "content") {
          searchCursorRef.current = result.data.next_cursor || null;
          setSearchHasMore(Boolean(result.data.has_more));
          setSearchPosts((current) => searchPage === 1 ? items as Post[] : [...current, ...(items as Post[])]);
        } else {
          setSearchTotal(result.data.total || 0);
          setSearchHasMore(false);
          setSearchPeople((current) => searchPage === 1 ? items as SearchPerson[] : [...current, ...(items as SearchPerson[])]);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : "搜索失败，请重试");
      })
      .finally(() => { if (!controller.signal.aborted) setSearchLoading(false); });
    return () => controller.abort();
  }, [tab, searchTerm, searchKind, searchPage, searchRetry]);
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
        kind === "bottomNav" ? <><i /><i /><b>＋</b><i /><i /></> :
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
      setBottomNavStyle("glass");
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
  const openPost = (id: number, source?: "today" | "discover", sourceElement?: Element | null) => {
    if (source) detailSource.current = source;
    if (
      transitionBusy.current ||
      detail !== null ||
      !all.some((p) => p.id === id)
    )
      return;
    if (pageTransition.current) {
      const activeTransition = pageTransition.current;
      const resume = () => {
        if (pageTransition.current === activeTransition) pageTransition.current = null;
        openPost(id, source, sourceElement);
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
      : all.find((post) => post.id === id) || null);
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
    transitionBusy.current = true;
    setDetailReady(false);
    setDetail(id);
    setTransitionPhase("opening");
    history.pushState({ ...history.state, heikaDetail: id }, "");
    update((s) => ({
      ...s,
      viewed: [id, ...s.viewed.filter((x) => x !== id)].slice(0, 50),
    }));
  };
  const cancelFlipRain = (id?: number) => {
    if (id !== undefined && flipRainId !== id) return;
    if (flipRainTimer.current !== null) window.clearTimeout(flipRainTimer.current);
    flipRainTimer.current = null;
    setFlipRainId(null);
  };
  const openPostRef = useRef(openPost);
  openPostRef.current = openPost;
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
  const closeDetail = (fromHistory = false) => {
    if (detail === null || transitionPhase === "closing") return;
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
  useLayoutEffect(() => {
    if (detail === null) return;
    const body = document.body,
      previousOverflow = body.style.overflow,
      previousPadding = body.style.paddingRight,
      previousScrollRestoration = history.scrollRestoration,
      gutter = Math.max(0, innerWidth - document.documentElement.clientWidth);
    history.scrollRestoration = "manual";
    body.style.overflow = "hidden";
    if (gutter) body.style.paddingRight = `${gutter}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      window.scrollTo({ top: scrollBeforeDetail.current, behavior: "instant" });
      history.scrollRestoration = previousScrollRestoration;
    };
  }, [detail]);
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
    if (opened.length >= dailyAllowance) {
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
    const pool = opened.length < dailyAllowance ? [...available, ...unlocked] : unlocked;
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
    if (used.length >= dailyAllowance && !used.includes(id)) {
      toast(`今天的 ${dailyAllowance} 张卡片已经选完，已解锁内容仍可查看。`);
      closeViewer();
      return;
    }
    flipBusy.current = true;
    setFlippingId(id);
    try {
      const response = await cloudFetch("/api/demo/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok || !result.data)
        throw new Error(result.error || "卡片加载失败");
      const lucky = used.includes(id) || luckyBonusToday >= 10
        ? 0
        : Math.min(drawLuckyBonus(), 10 - luckyBonusToday);
      const nextLuckyBonus = lucky
        ? { ...state.luckyBonus, [today]: luckyBonusToday + lucky }
        : state.luckyBonus;
      const rarityTier = (result.data.rarityTier || cardRarityTier(
        communityRatings[id]?.average || 0,
        communityRatings[id]?.count || 0,
      )) as CardRarityTier;
      const revealedPost: Post = { ...result.data, rarityTier };
      const next = {
        ...state,
        luckyBonus: nextLuckyBonus,
        revealed: { ...state.revealed, [id]: revealedPost },
        rarityTiers: { ...state.rarityTiers, [id]: rarityTier },
        opened: {
          ...state.opened,
          [today]: openDailyCard(used, id, dailyAllowance),
        },
      };
      setState(next);
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
      void cloudRequest("/api/v1/library-state", { action: "open", id }).then(async (saved) => {
        if (accountId && saved?.experience) {
          const summary = await cloudRequest("/api/v1/progression");
          if (summary && Number.isFinite(summary.total)) setExperienceSummary(summary);
        }
      }).catch(() => toast("阅读记录云端同步失败，本地已保留"));
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
    } catch {
      toast("内容加载失败，请重试");
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
  const uploadImageToPost = async (image: ComposerImage, postId: string, sortOrder: number): Promise<ComposerImage> => {
    if (image.external) return image;
    if (image.path) {
      if (composerRevisionMode) return { ...image, sortOrder };
      await cloudRequest(`/api/v1/posts/${postId}/media`, { path: image.path, sort_order: sortOrder });
      return { ...image, sortOrder };
    }
    if (!image.file || !accountId) throw new Error("登录后可同步草稿图片");
    const db = await browserDb(); const { data: session } = await db.auth.getSession();
    if (!session.session) throw new Error("登录状态已失效，请重新登录");
    const form = new FormData(); form.set("file", image.file); form.set(composerRevisionMode ? "revision_post_id" : "post_id", postId); form.set("sort_order", String(sortOrder)); form.set("upload_id", image.id);
    const response = await fetch("/api/v1/media", { method: "POST", headers: { Authorization: `Bearer ${session.session.access_token}` }, body: form });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "图片上传失败");
    if (!result.data?.path) throw new Error("图片上传未完成，请重试");
    return { ...image, path: result.data.path, status: "ready", sortOrder };
  };
  const uploadVideoToPost = async (video: ComposerVideo, postId: string, sortOrder: number): Promise<ComposerVideo> => {
    if (!VIDEO_UPLOAD_BETA_ENABLED) throw new Error("视频上传目前仅在 Beta 预览版开放");
    if (!accountId) throw new Error("登录后可上传视频");
    const file = video.file;
    let path = video.path;
    if (!path) {
      if (!file) throw new Error("视频草稿文件已丢失，请重新选择视频");
      const extension = videoExtension(file.type);
      if (!extension) throw new Error("视频测试版仅支持 MP4、WebM 格式");
      if (!file.size || file.size > POST_VIDEO_MAX_BYTES) throw new Error("视频大小不能超过 50 MB");
      path = `${accountId}/${video.id}.${extension}`;
      const db = await browserDb();
      const clientConfig = await browserDbConfig();
      const { data } = await db.auth.getSession();
      if (!data.session) throw new Error("登录状态已失效，请重新登录");
      await uploadVideoResumable({
        file,
        path,
        supabaseUrl: clientConfig.url,
        publishableKey: clientConfig.key,
        accessToken: data.session.access_token,
        onProgress: (progress) => setComposerVideo((current) => current?.id === video.id ? { ...current, progress, status: "uploading" } : current),
      });
      video = { ...video, path, status: "ready", progress: 100 };
      setComposerVideo((current) => current?.id === video.id ? video : current);
    }
    if (!composerRevisionMode || !video.existing) {
      await cloudRequest(`/api/v1/posts/${postId}/media`, {
        path,
        sort_order: sortOrder,
        media_type: "video",
        ...(composerRevisionMode ? { revision: true } : {}),
      });
    }
    return { ...video, path, status: "ready", progress: 100 };
  };
  const chooseComposerVideo = (file: File | null) => {
    if (!file) return;
    if (composerImages.length) return toast("视频 Beta 暂不与图片混发，请先移除已选图片");
    if (!POST_VIDEO_TYPES.includes(file.type as (typeof POST_VIDEO_TYPES)[number])) return toast("视频测试版仅支持 MP4、WebM 格式");
    if (!file.size || file.size > POST_VIDEO_MAX_BYTES) return toast("视频大小需在 1 B 到 50 MB 之间");
    videoCompressionAbort.current?.abort();
    const controller = new AbortController();
    videoCompressionAbort.current = controller;
    const sequence = ++videoCompressionSequence.current;
    const id = crypto.randomUUID();
    if (composerVideo?.url.startsWith("blob:")) URL.revokeObjectURL(composerVideo.url);
    const url = URL.createObjectURL(file);
    const wantsCompression = file.size > VIDEO_COMPRESSION_THRESHOLD;
    const canCompress = wantsCompression && supportsVideoCompression();
    setComposerVideo({ id, file, url, name: file.name, size: file.size, type: file.type, status: canCompress ? "compressing" : "ready", progress: 0, compressionProgress: 0, originalSize: file.size, compressionNote: wantsCompression && !canCompress ? "此浏览器暂不支持本地压缩，将保留原视频" : undefined });
    if (!canCompress) return;
    void compressVideoForUpload(file, (compressionProgress) => {
      if (videoCompressionSequence.current !== sequence || controller.signal.aborted) return;
      setComposerVideo((current) => current?.id === id ? { ...current, compressionProgress } : current);
    }, controller.signal).then((result) => {
      if (videoCompressionSequence.current !== sequence || controller.signal.aborted) return;
      const nextUrl = result.file === file ? url : URL.createObjectURL(result.file);
      if (nextUrl !== url) URL.revokeObjectURL(url);
      setComposerVideo((current) => current?.id === id ? {
        ...current,
        file: result.file,
        url: nextUrl,
        name: result.file.name,
        size: result.file.size,
        type: result.file.type,
        status: "ready",
        compressionProgress: 100,
        compressionNote: result.compressed
          ? `已优化 ${(file.size / 1024 / 1024).toFixed(1)} MB → ${(result.file.size / 1024 / 1024).toFixed(1)} MB`
          : result.reason === "unsupported" ? "此浏览器暂不支持本地压缩，将保留原视频" : "原视频画质已保留",
      } : current);
      videoCompressionAbort.current = null;
    }).catch(() => {
      if (controller.signal.aborted || videoCompressionSequence.current !== sequence) return;
      setComposerVideo((current) => current?.id === id ? { ...current, status: "ready", compressionProgress: 100, compressionNote: "压缩未完成，已保留原视频" } : current);
      videoCompressionAbort.current = null;
    });
  };
  const removeComposerVideo = async () => {
    if (!composerVideo) return;
    videoCompressionAbort.current?.abort();
    videoCompressionAbort.current = null;
    videoCompressionSequence.current += 1;
    const old = state.own.find((item) => item.id === editing);
    if (composerVideo.path && old?.cloudId && composerVideo.existing && !composerRevisionMode) {
      try { await cloudRequest(`/api/v1/posts/${old.cloudId}/media`, { path: composerVideo.path }, "DELETE"); }
      catch (error) { toast(error instanceof Error ? error.message : "视频移除失败"); return; }
    } else if (composerVideo.path && accountId && old?.cloudId) {
      try { await cloudRequest("/api/v1/media", { upload_id: composerVideo.id, file_type: composerVideo.type, post_id: old.cloudId }, "DELETE"); }
      catch (error) { toast(error instanceof Error ? error.message : "视频移除失败"); return; }
    }
    if (composerVideo.url.startsWith("blob:")) URL.revokeObjectURL(composerVideo.url);
    setComposerVideo(null);
  };
  const publish = async () => {
    if (publishInFlight.current) return;
    if (!title.trim()) { setComposerValidation("title"); toast("请先填写标题"); document.querySelector<HTMLTextAreaElement>(".composer-title-field textarea")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (!body.trim()) { setComposerValidation("body"); toast("请先填写正文"); document.querySelector<HTMLTextAreaElement>(".composer-body-field textarea")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    setComposerValidation("");
    const pollDraft = writeChannel === "community" ? { question: pollQuestion.trim(), options: pollOptions.map((option) => option.trim()).filter(Boolean) } : { question:"", options:[] as string[] };
    if ((pollDraft.question || pollDraft.options.length) && (!pollDraft.question || pollDraft.options.length < 2 || pollDraft.options.length > 4)) return toast("投票需要填写问题，并设置 2–4 个选项");
    if (composerMediaLoadFailed) return toast("附件列表尚未恢复，请先重试读取附件");
    if (!writeTag.trim()) return toast("请选择内容分类");
    if (!accountId) { await flushComposerDraft.current().catch(()=>{}); return toast("请先在消息页面登录，当前输入会保留"); }
    if (composerImages.some(image=>!image.external&&!image.path&&!image.file)) return toast("有图片文件未恢复，请替换后再提交");
    if (composerImages.some((image) => image.status === "uploading" || draftMediaBusy.current.has(image.id))) return toast("图片正在同步，请稍后发布");
    if (composerVideo?.status === "compressing") return toast("视频正在优化，请稍后发布");
    if (composerVideo?.status === "uploading") return toast("视频正在上传，请稍后发布");
    if (composerVideo && composerImages.length) return toast("视频 Beta 暂不与图片混发，请移除其中一种媒体");
    if (draftSaveTimer.current !== null) {
      window.clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = null;
    }
    if (draftSaving) return toast("草稿正在同步，请稍后发布");
    publishInFlight.current = true;
    setIsPublishing(true);
    try {
      const old = state.own.find((p) => p.id === editing);
      const resourceData = Object.fromEntries(Object.entries(aiResourceFields).map(([key, value]) => [key, value.trim()]).filter(([, value]) => Boolean(value)));
      const draft = composerEditingPublished && old?.cloudId ? old : writeChannel === "ai"
        ? await cloudRequest("/api/v1/ai-space", { action: "draft", id: old?.cloudId, title, body, category: writeTag, contentType: writeContentType, resourceData, topics: writeTopics, coverUrl: composerImages[coverIndex]?.external ? composerImages[coverIndex].url : null }) as Post | null
        : await cloudRequest("/api/v1/library-state", { action: "draft", id: old?.cloudId ? old.id : undefined, title, body, tag: writeTag, topics: writeTopics, seriesId: writeSeriesId || null, poll: pollDraft.question ? pollDraft : null, coverUrl: composerImages[coverIndex]?.external ? composerImages[coverIndex].url : null }) as Post | null;
      if (!draft?.cloudId) throw new Error("草稿保存失败，请重试");
      const cover = composerImages[coverIndex];
      const storageImages = composerImages.filter((image) => !image.external);
      const orderedImages = cover?.external ? storageImages : storageImages.length ? [storageImages.find((image) => image.id === cover?.id), ...storageImages.filter((image) => image.id !== cover?.id)].filter((image): image is ComposerImage => Boolean(image)) : [];
      const uploaded: ComposerImage[] = [];
      setUploadingImages(true);
      for (const [index, image] of orderedImages.entries()) {
        draftMediaBusy.current.add(image.id);
        setComposerImages((items) => items.map((item) => item.id === image.id ? { ...item, status: "uploading" } : item));
        try {
          const current = await uploadImageToPost(image, draft.cloudId, index);
          uploaded.push(current);
          setComposerImages((items) => items.map((item) => item.id === image.id ? current : item));
        } catch (error) {
          setComposerImages((items) => items.map((item) => item.id === image.id ? { ...item, status: "failed" } : item));
          throw error;
        } finally { draftMediaBusy.current.delete(image.id); }
      }
      let uploadedVideo: ComposerVideo | null = null;
      if (composerVideo) {
        setComposerVideo((current) => current ? { ...current, status: "uploading", progress: current.path ? 100 : 0 } : current);
        try {
          uploadedVideo = await uploadVideoToPost({ ...composerVideo, status: "uploading" }, draft.cloudId, uploaded.length);
          setComposerVideo(uploadedVideo);
        } catch (error) {
          setComposerVideo((current) => current ? { ...current, status: "failed" } : current);
          throw error;
        }
      }
      setUploadingImages(false);
      const mediaPaths = [...uploaded.map((image) => image.path!), ...(uploadedVideo?.path ? [uploadedVideo.path] : [])];
      const item = writeChannel === "ai"
        ? await cloudRequest("/api/v1/ai-space", { action: "submit", id: draft.cloudId, title, body, category: writeTag, topics: writeTopics, contentType: writeContentType, resourceData, mediaPaths, coverUrl: cover?.external ? cover.url : null })
        : await cloudRequest("/api/v1/library-state", { action: "publish", id: draft.id, title, body, tag: writeTag, topics: writeTopics, seriesId: writeSeriesId || null, poll: pollDraft.question ? pollDraft : null, mediaPaths, coverUrl: cover?.external ? cover.url : null });
      if (!item) return;
      update((s) => ({
        ...s,
        own: [
          item,
          ...s.own.filter((p) => p.id !== editing && p.id !== item.id),
        ],
        cardIds: item.status === "published" ? [...new Set([...s.cardIds, item.id])] : s.cardIds,
      }));
      setModal(null);
      setTitle("");
      setBody("");
      setPollQuestion("");
      setPollOptions(["", ""]);
      composerImages.forEach((image) => { if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url); });
      setComposerImages([]);
      if (composerVideo?.url.startsWith("blob:")) URL.revokeObjectURL(composerVideo.url);
      setComposerVideo(null);
      setCoverIndex(0);
      setEditing(null);
      setComposerEditingPublished(false);
      setComposerRevisionMode(false);
      setWriteChannel("community");
      setWriteContentType("knowledge_article");
      setAiResourceFields({});
      setComposerValidation("");
      const owner = accountId || "guest";
      if (writeChannel === "community") localStorage.removeItem(`heika-compose-${owner}`);
      localStorage.removeItem(`heika-compose-${writeChannel}-${owner}`);
      await clearDraftFiles(`${owner}:${writeChannel}`).catch(() => {});
      if (accountId) {
        if (writeChannel === "community") localStorage.removeItem("heika-compose-guest");
        localStorage.removeItem(`heika-compose-${writeChannel}-guest`);
        await clearDraftFiles(`guest:${writeChannel}`).catch(() => {});
      }
      composerCloudDrafts.current.delete(`${owner}:${writeChannel}`); composerDraftRef.current = null;
      lastDraftPayload.current = "";
      toast(composerRevisionMode ? "修改已提交审核，通过后将更新公开内容" : "内容已提交人工审核，通过后将公开展示");
    } catch (e) {
      setUploadingImages(false);
      toast(e instanceof Error ? e.message : "发布失败，请重试");
    } finally {
      publishInFlight.current = false;
      setIsPublishing(false);
    }
  };
  const composerMediaUrl = async (path:string) => {
    try { const db=await browserDb();const result=await db.storage.from(mediaBucketForPath(path)).createSignedUrl(path,3600);return result.data?.signedUrl || ""; } catch { return ""; }
  };
  const openComposer = async (post?: Post, requestedChannel: "community" | "ai" = "community") => {
    composerImages.forEach(image=>{if(image.url.startsWith("blob:"))URL.revokeObjectURL(image.url);});
    composerSession.current += 1; setComposerPanel(null); setComposerMediaId(null); setDraftSyncError(""); setDraftCloudSynced(false); setDraftSaving(false); setComposerMediaLoadFailed(false);
    videoCompressionAbort.current?.abort();
    videoCompressionAbort.current = null;
    videoCompressionSequence.current += 1;
    if (composerVideo?.url.startsWith("blob:")) URL.revokeObjectURL(composerVideo.url);
    const stored = !post ? state.own.find((item) => item.status === "draft" && (item.channel || "community") === requestedChannel) : undefined;
    const initialPost = post || stored;
    composerDraftRef.current = initialPost || null;
    if (initialPost?.status === "draft") composerCloudDrafts.current.set(`${accountId || "guest"}:${requestedChannel}`,initialPost);
    const revisionPayload = initialPost?.pendingRevision?.payload;
    const channel = initialPost?.channel === "ai" ? "ai" : initialPost ? "community" : requestedChannel;
    const initialResourceData = revisionPayload?.resourceData || initialPost?.resourceData || {};
    setWriteChannel(channel);
    setWriteContentType(channel === "ai" && initialPost?.contentType && initialPost.contentType !== "community_post" ? initialPost.contentType : "knowledge_article");
    setAiResourceFields(Object.fromEntries(Object.entries(initialResourceData).map(([key, value]) => [key, Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value : ""]).filter(([, value]) => Boolean(value))));
    setEditing(initialPost?.id ?? null);
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
    setComposerVideo(null);
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
          const imageMedia = orderedMedia.filter((item) => !isVideoMediaPath(item.storage_path));
          const videoMedia = orderedMedia.find((item) => isVideoMediaPath(item.storage_path));
          const images = await Promise.all(imageMedia.map(async (item, index) => {
            const url = await composerMediaUrl(item.storage_path);
            return {id:`saved-${index}-${item.storage_path}`,path:item.storage_path,url:url || "/image-not-loaded.svg",status:"ready" as const,sortOrder:index};
          }));
          if (videoMedia) {
            const url = await composerMediaUrl(videoMedia.storage_path);
            {
              const extension = videoMedia.storage_path.toLowerCase().split(".").pop();
              setComposerVideo({ id: videoMedia.storage_path.split("/").pop()!.replace(/\.(?:mp4|webm)$/i, ""), path: videoMedia.storage_path, url, name: `已上传视频.${extension}`, size: 0, type: extension === "webm" ? "video/webm" : "video/mp4", status: "ready", progress: 100, existing: true });
            }
          }
          const externalCover = revisionPayload ? revisionPayload.coverUrl : data?.image_url;
          const external = externalCover ? [{ id: "legacy-cover", url: externalCover, status: "ready" as const, external: true }] : [];
          setComposerImages([...external, ...images.filter((image): image is NonNullable<typeof image> => Boolean(image))]);
        }
      } catch { setComposerMediaLoadFailed(true);toast("已恢复草稿文字，附件列表读取失败，请重试读取后提交"); }
    }
    const owner = accountId || "guest";
    if (!initialPost || initialPost.status === "draft") {
      try {
        const ownRaw = localStorage.getItem(`heika-compose-${channel}-${owner}`);
        const legacyRaw = channel === "community" ? localStorage.getItem(`heika-compose-${owner}`) : null;
        const raw = ownRaw || legacyRaw || (accountId && channel === "community" ? localStorage.getItem("heika-compose-guest") : null);
        const fileOwner = ownRaw || legacyRaw || !accountId ? owner : "guest";
        if (raw) {
          const saved = JSON.parse(raw) as { title?: string; body?: string; tag?: string; topics?: string[]; seriesId?: string | null; poll?: { question?: string; options?: string[] }; channel?: "community" | "ai"; contentType?: AiContentType; resourceData?: Record<string,string>; coverIndex?: number; images?: { id: string; path?: string; url?: string; external?: boolean }[]; video?: { id: string; path?: string; name?: string; size?: number; type?: string; existing?: boolean } };
          setTitle(saved.title || "");
          setBody(saved.body || "");
          setWriteTag(saved.tag || (channel === "ai" ? aiCategories[0]?.name || "AI 知识" : communityCategories[0] || tags[0]));
          setWriteTopics(saved.topics || []);
          setWriteContentType(saved.contentType || "knowledge_article");
          setAiResourceFields(saved.resourceData || {});
          setWriteSeriesId(saved.seriesId || "");
          setPollQuestion(saved.poll?.question || "");
          setPollOptions(saved.poll?.options?.length ? [...saved.poll.options, "", ""].slice(0, 4) : ["", ""]);
          if (saved.images?.length || saved.video) {
            const files = await loadDraftFiles(`${fileOwner}:${channel}`).then(async files => files.length ? files : loadDraftFiles(fileOwner)).catch(()=>[]);
            if (saved.video) {
              const videoFile = files.find((item) => item.id === saved.video!.id)?.file;
              if (saved.video.path) {
                const signedUrl = await composerMediaUrl(saved.video.path);
                if (signedUrl || !videoFile) setComposerVideo({ id: saved.video.id, path: saved.video.path, url: signedUrl, name: saved.video.name || "已上传视频", size: saved.video.size || videoFile?.size || 0, type: saved.video.type || videoFile?.type || "video/mp4", status: "ready", progress: 100, existing: saved.video.existing });
                else if (videoFile) setComposerVideo({ id: saved.video.id, file: videoFile, url: URL.createObjectURL(videoFile), name: videoFile.name, size: videoFile.size, type: videoFile.type, status: "ready", progress: 0 });
              } else if (videoFile) setComposerVideo({ id: saved.video.id, file: videoFile, url: URL.createObjectURL(videoFile), name: videoFile.name, size: videoFile.size, type: videoFile.type, status: "ready", progress: 0 });
            }
            if (saved.images?.length) {
              const restored = await Promise.all(saved.images.map(async (image, index) => {
              if (image.path) {
                const signedUrl = await composerMediaUrl(image.path);
                const file = files.find((item) => item.id === image.id)?.file;
                return { id:image.id,path:image.path,file,url:signedUrl || (file?URL.createObjectURL(file):"/image-not-loaded.svg"),status:"ready" as const,sortOrder:index };
              }
              if (image.external && image.url) return { id: image.id, url: image.url, status: "ready" as const, external: true };
              const file = files.find((item) => item.id === image.id)?.file;
              if (file) return { id: image.id, file, url: URL.createObjectURL(file), status: "ready" as const };
              return {id:image.id,url:image.url || "/image-not-loaded.svg",status:"failed" as const};
            }));
            setComposerImages(restored.filter((image): image is NonNullable<typeof image> => Boolean(image?.url)));
            }
          }
          setCoverIndex(Math.min(saved.coverIndex || 0, Math.max(0, (saved.images?.length || 1) - 1)));
          toast("已恢复上次保存的草稿");
        }
      } catch { toast("草稿恢复失败，可继续新建内容"); }
    }
    setDraftSaved(false);
    setModal("write");
  };
  useEffect(() => {
    if (modal !== "write") return;
    const generation = composerSession.current;
    const revision = ++draftRevision.current;
    const currentSession = () => composerSession.current === generation;
    setDraftCloudSynced(false);
    const persist = async () => {
      if (publishInFlight.current || !currentSession() || (!title && !body && !composerImages.length && !composerVideo && !pollQuestion && !pollOptions.some(Boolean))) return;
      const owner = accountId || "guest";
      const poll = { question: pollQuestion.trim(), options: pollOptions.map((option) => option.trim()).filter(Boolean) };
      const draftData = { title, body, tag: writeTag, topics: writeTopics, channel: writeChannel, contentType: writeContentType, resourceData: aiResourceFields, seriesId: writeSeriesId || null, poll: poll.question || poll.options.length ? poll : null, coverIndex, images: composerImages.map(({ id, path, url, external }) => ({ id, path, url, external })), video: composerVideo ? { id: composerVideo.id, path: composerVideo.path, name: composerVideo.name, size: composerVideo.size, type: composerVideo.type, existing: composerVideo.existing } : null, savedAt: Date.now() };
      localStorage.setItem(`heika-compose-${writeChannel}-${owner}`, JSON.stringify(draftData));
      if (writeChannel === "community") localStorage.setItem(`heika-compose-${owner}`, JSON.stringify(draftData));
      await saveDraftFiles(`${owner}:${writeChannel}`, [...composerImages.map(({ id, file }) => ({ id, file })), ...(composerVideo ? [{ id: composerVideo.id, file: composerVideo.file }] : [])]);
      if (!currentSession()) return;
      setDraftSaved(true); setDraftSyncError("");
      if (!accountId || composerEditingPublished || composerMediaLoadFailed) return;
      // Serialize snapshots: an older response cannot finish after a newer save.
      draftCloudQueue.current = draftCloudQueue.current.catch(() => {}).then(async () => {
        if (!currentSession() || publishInFlight.current || draftRevision.current !== revision) return;
        setDraftSaving(true);
        try {
        if (accountId && !composerEditingPublished) {
          const signature = JSON.stringify({ accountId, title, body, writeTag, writeTopics, writeSeriesId, poll, coverIndex, writeChannel, writeContentType, aiResourceFields });
          let cloudDraft = composerDraftRef.current || composerCloudDrafts.current.get(`${owner}:${writeChannel}`) || state.own.find((item) => item.id === editing && item.status === "draft" && (item.channel || "community") === writeChannel);
          if (lastDraftPayload.current !== signature || !cloudDraft) {
            setDraftSaving(true);
            try {
              const cover = composerImages[coverIndex];
              const saved = writeChannel === "ai"
                ? await cloudRequest("/api/v1/ai-space", { action: "draft", id: cloudDraft?.cloudId, title, body, category: writeTag, topics: writeTopics, contentType: writeContentType, resourceData: aiResourceFields, coverUrl: cover?.external ? cover.url : null }) as Post | null
                : await cloudRequest("/api/v1/library-state", { action: "draft", id: cloudDraft?.cloudId ? cloudDraft.id : undefined, title, body, tag: writeTag, topics: writeTopics, seriesId: writeSeriesId || null, ...(poll.question && poll.options.length >= 2 && poll.options.length <= 4 ? { poll } : {}), coverUrl: cover?.external ? cover.url : null }) as Post | null;
              if (saved?.cloudId) composerCloudDrafts.current.set(`${owner}:${writeChannel}`,saved);
              if (!currentSession()) return;
              if (!saved?.cloudId) throw new Error("云端草稿暂时不可用");
              cloudDraft = saved; composerDraftRef.current = saved; lastDraftPayload.current = signature; setEditing(saved.id); update((current) => ({ ...current, own: [saved, ...current.own.filter((item) => item.id !== saved.id)] }));
            } catch { throw new Error("同步失败，本机草稿已保留"); }
            finally { /* The queue clears saving after all media has settled. */ }
          }
          if (cloudDraft?.cloudId) {
            const cover = composerImages[coverIndex];
            const storageImages = composerImages.filter((image) => !image.external);
            const ordered = cover?.external ? storageImages : storageImages.length ? [storageImages.find((image) => image.id === cover?.id), ...storageImages.filter((image) => image.id !== cover?.id)].filter((image): image is ComposerImage => Boolean(image)) : [];
            for (const [index, image] of ordered.entries()) {
              if (!currentSession()) return;
              if (image.external) continue;
              const needsUpload = Boolean(image.file && !image.path);
              const needsReorder = Boolean(image.path && image.sortOrder !== index);
              if ((!needsUpload && !needsReorder) || image.status === "failed" || draftMediaBusy.current.has(image.id)) continue;
              draftMediaBusy.current.add(image.id);
              setComposerImages((items) => items.map((item) => item.id === image.id ? { ...item, status: "uploading" } : item));
              try {
                const synced = await uploadImageToPost(image, cloudDraft.cloudId, index);
                if (currentSession()) setComposerImages((items) => items.map((item) => item.id === image.id ? synced : item));
              } catch (error) {
                if (currentSession()) setComposerImages((items) => items.map((item) => item.id === image.id ? { ...item, status: "failed" } : item));
                throw error;
              } finally { draftMediaBusy.current.delete(image.id); }
            }
          }
        }
          if (currentSession() && draftRevision.current === revision && !composerEditingPublished && !composerVideo && !composerImages.some(image=>image.status !== "ready" || (!image.external && !image.path))) setDraftCloudSynced(true);
        } catch (error) { if (currentSession()) setDraftSyncError(error instanceof Error ? error.message : "同步失败，本机草稿已保留"); }
        finally { if (currentSession()) setDraftSaving(false); }
      });
    };
    flushComposerDraft.current = persist;
    const save = () => { void persist().catch(() => { if (currentSession()) setDraftSyncError("本机保存失败，请重试"); }); };
    const timer = window.setTimeout(save, 500);
    draftSaveTimer.current = timer;
    window.addEventListener("pagehide",save);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide",save); if (draftSaveTimer.current === timer) draftSaveTimer.current = null; };
  // UI-only panels are excluded so opening a sheet does not restart autosave.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, editing, accountId, title, body, writeTag, writeTopics, writeSeriesId, pollQuestion, pollOptions, coverIndex, composerImages, composerVideo, composerEditingPublished, writeChannel, writeContentType, aiResourceFields, draftRetry, composerMediaLoadFailed]);
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
      const video=media.find(item=>isVideoMediaPath(item.storage_path));
      if(video)setComposerVideo({id:video.storage_path,path:video.storage_path,url:await composerMediaUrl(video.storage_path),name:"已上传视频",size:0,type:video.storage_path.endsWith("webm")?"video/webm":"video/mp4",status:"ready",progress:100,existing:true});
      setComposerMediaLoadFailed(false);
    } catch(error) { toast(error instanceof Error?error.message:"附件读取失败，请重试"); } finally {setUploadingImages(false);}
  };
  const changeComposerTitle = useCallback((value: string) => { setTitle(value); setDraftSaved(false); setDraftCloudSynced(false); if(value.trim()) setComposerValidation(""); }, []);
  const changeComposerBody = useCallback((value: string) => { setBody(value); setDraftSaved(false); setDraftCloudSynced(false); if(value.trim()) setComposerValidation(""); }, []);
  const closeComposer = async () => {
    if (isPublishing) return toast("内容正在提交，请稍候");
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
  const switchComposerChannel = async (channel: "community" | "ai") => {
    if (channel === writeChannel || isPublishing) return;
    if (draftSaving || uploadingImages || composerVideo?.status === "uploading" || composerVideo?.status === "compressing") return toast("媒体正在同步，请稍后切换");
    const targetRaw = localStorage.getItem(`heika-compose-${channel}-${accountId || "guest"}`);
    const hasTargetDraft = Boolean(targetRaw && (()=>{try{const draft=JSON.parse(targetRaw);return draft.title || draft.body || draft.images?.length || draft.video;}catch{return false;}})());
    if ((title || body || writeTopics.length || composerImages.length || composerVideo || Object.values(aiResourceFields).some(Boolean)) && !await confirmInApp(hasTargetDraft ? "目标下已有草稿，切换后将恢复它。当前内容会先保留在原目标，不会被清空。" : "切换会保留标题、正文和附件。分类与话题需要重新选择，原目标的草稿会保留。", { title:"切换发布目标", confirmLabel:"切换目标" })) return;
    try { await flushComposerDraft.current(); } catch { toast("请先重试保存草稿，再切换目标"); return; }
    await draftCloudQueue.current;
    if (hasTargetDraft) { await openComposer(undefined,channel); return; }
    // Storage paths cannot belong to two posts. Re-upload a copied file under a fresh ID.
    let images: ComposerImage[] = composerImages, video = composerVideo;
    setUploadingImages(true);
    try {
      const clone = async (url:string,file:File|undefined,name:string,type:string) => { if(file) return file; const response=await fetch(url); if(!response.ok) throw new Error("附件复制失败，请检查网络后重试"); return new File([await response.blob()],name,{type}); };
      images=await Promise.all(composerImages.map(async image=>image.external?image:{id:crypto.randomUUID(),url:image.url,file:await clone(image.url,image.file,"draft-image.jpg",image.file?.type || "image/jpeg"),status:"ready" as const}));
      if(composerVideo) video={...composerVideo,id:crypto.randomUUID(),file:await clone(composerVideo.url,composerVideo.file,composerVideo.name,composerVideo.type),path:undefined,existing:false,status:"ready",progress:0};
    } catch(error) { toast(error instanceof Error?error.message:"附件复制失败"); return; } finally { setUploadingImages(false); }
    setComposerImages(images); setComposerVideo(video);
    composerSession.current += 1; composerDraftRef.current = null; lastDraftPayload.current = "";
    setEditing(null); setWriteChannel(channel); setWriteTag(channel === "ai" ? aiCategories.find(item=>item.kind === "category")?.name || "AI 知识" : communityCategories[0] || tags[0]); setWriteTopics([]); setDraftSaved(false); setDraftCloudSynced(false); setDraftSyncError("");
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
      const replacement: ComposerImage={id:crypto.randomUUID(),file:compressed,url:URL.createObjectURL(compressed),status:"ready"};
      setComposerImages(items=>items.map(item=>item.id===id?replacement:item)); setComposerMediaId(replacement.id);
      if(image.url.startsWith("blob:")) URL.revokeObjectURL(image.url);
    } catch(error) { toast(error instanceof Error?error.message:"图片替换失败，请重试"); } finally { setUploadingImages(false); }
  };

  const chooseComposerImages = async (files: FileList | null) => {
    if (!files?.length || uploadingImages || isPublishing) return;
    if (composerVideo) return toast("视频 Beta 暂不与图片混发，请先移除视频");
    const validation = validateComposerFiles(Array.from(files), composerImages.length);
    if (validation.error) toast(validation.error);
    if (!validation.accepted.length) return;
    setUploadingImages(true);
    const next: ComposerImage[] = [];
    let failureMessage = "";
    try {
      for (const file of validation.accepted) {
        try {
          const compressed = await compressUploadImage(file);
          next.push({ id: crypto.randomUUID(), file: compressed, url: URL.createObjectURL(compressed), status: "ready" });
        } catch (error) {
          failureMessage ||= error instanceof Error ? error.message : "有图片压缩失败，请重新选择";
        }
      }
      if (failureMessage) toast(failureMessage);
      setComposerImages((current) => [...current, ...next]);
      if (!composerImages.length && next.length) setCoverIndex(0);
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
    if (image.path && old?.cloudId && !composerRevisionMode) {
      try { await cloudRequest(`/api/v1/posts/${old.cloudId}/media`, { path: image.path }, "DELETE"); }
      catch (error) { toast(error instanceof Error ? error.message : "图片移除失败"); return; }
    } else if (image.file && accountId && old?.cloudId) {
      try { await cloudRequest("/api/v1/media", { upload_id: image.id, file_type: image.file.type, post_id: old.cloudId }, "DELETE"); }
      catch (error) { toast(error instanceof Error ? error.message : "图片移除失败"); return; }
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
    setUploadingImages(true);
    setComposerImages((items) => items.map((item) => item.id === imageId ? { ...item, status: "uploading" } : item));
    try {
      const old = state.own.find((item) => item.id === editing);
      const draft = composerEditingPublished && old?.cloudId ? old : writeChannel === "ai" ? await cloudRequest("/api/v1/ai-space", { action: "draft", id: old?.cloudId, title, body, category: writeTag, topics: writeTopics, contentType: writeContentType, resourceData: aiResourceFields }) as Post | null : await cloudRequest("/api/v1/library-state", { action: "draft", id: old?.cloudId ? old.id : undefined, title, body, tag: writeTag }) as Post | null;
      if (!draft?.cloudId) throw new Error("草稿保存失败");
      const synced = await uploadImageToPost(image, draft.cloudId, composerImages.indexOf(image));
      setEditing(draft.id); update((current) => ({ ...current, own: [draft, ...current.own.filter((item) => item.id !== draft.id)] }));
      setComposerImages((items) => items.map((item) => item.id === imageId ? synced : item));
      toast("图片已上传");
    } catch (error) { setComposerImages((items) => items.map((item) => item.id === imageId ? { ...item, status: "failed" } : item)); toast(error instanceof Error ? error.message : "图片上传失败"); }
    finally { draftMediaBusy.current.delete(imageId); setUploadingImages(false); }
  };
  const discardComposerDraft = async () => {
    if (draftSaving || composerImages.some((image) => draftMediaBusy.current.has(image.id)) || composerVideo?.status === "uploading" || composerVideo?.status === "compressing") return toast("媒体正在处理，请稍后再删除");
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
          if (composerVideo?.path && !composerVideo.existing) await cloudRequest("/api/v1/media", { upload_id: composerVideo.id, file_type: composerVideo.type, post_id: draft.cloudId }, "DELETE");
          if (writeChannel === "ai") await cloudRequest(`/api/v1/posts/${draft.cloudId}`, {}, "DELETE"); else await cloudRequest("/api/v1/library-state", { action: "delete", id: draft.id });
          update((current) => ({ ...current, own: current.own.filter((item) => item.id !== draft.id) }));
        }
      } catch (error) { toast(error instanceof Error ? error.message : "草稿删除失败"); setDraftRetry(value=>value+1); return; }
    }
    const owner = accountId || "guest";
    localStorage.removeItem(`heika-compose-${writeChannel}-${owner}`); if (writeChannel === "community") localStorage.removeItem(`heika-compose-${owner}`); await clearDraftFiles(`${owner}:${writeChannel}`).catch(() => {});
    composerImages.forEach((image) => { if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url); });
    if (composerVideo?.url.startsWith("blob:")) URL.revokeObjectURL(composerVideo.url);
    videoCompressionAbort.current?.abort();
    videoCompressionAbort.current = null;
    videoCompressionSequence.current += 1;
    composerSession.current += 1; composerDraftRef.current = null; composerCloudDrafts.current.delete(`${owner}:${writeChannel}`);
    setComposerVideo(null); setComposerImages([]); setTitle(""); setBody(""); setPollQuestion(""); setPollOptions(["", ""]); setEditing(null); setModal(null); toast("草稿已删除");
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
  const switchDiscoverChannel = (next: "community" | "ai") => {
    if (next === discoverChannel) return;
    discoverScrollPositions.current[discoverChannel] = window.scrollY;
    setDiscoverChannel(next);
    requestAnimationFrame(() => window.scrollTo({ top: discoverScrollPositions.current[next], behavior: "instant" }));
  };
  const openAiPost = (item: Post, source: Element | null) => {
    setPublicFeed((current) => current.some((post) => post.id === item.id) ? current : [...current, item]);
    setFeedPostIds((current) => current.includes(item.id) ? current : [...current, item.id]);
    requestAnimationFrame(() => requestAnimationFrame(() => openPost(item.id, "discover", source)));
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
    setAiWorkbenchBusy(true); setAiWorkbenchOutput(""); setAiResultApplied(false);
    try {
      setAiWorkbenchOutput("");
      const result = await cloudRequest("/api/v1/ai/workbench", { mode: aiWorkbenchMode, title, content: body, category: writeTag }) as { output?: unknown } | null;
      if (typeof result?.output !== "string" || !result.output.trim()) throw new Error("登录状态已失效或 AI 没有返回内容，请重试");
      setAiWorkbenchOutput(result.output);
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
    } else if (aiWorkbenchMode === "polish") setBody(aiWorkbenchOutput.trim());
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
  const refreshFeed = async () => {
    if (tab === "today") {
      try {
        const response = await cloudFetch("/api/demo/cards", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.data)) throw new Error();
        setState((current) => ({ ...current, cardIds: result.data.map((item: { id: number }) => item.id) }));
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
      const marker = document.getElementById("detail-comments");
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
  const isImmersive = (tab === "messages" && (chatConversationOpen || messagePeer !== null)) || detail !== null || transitionPhase !== null;
  const candidatePost = detail === null ? null : all.find((p) => p.id === detail);
  const post = detail !== null && detailPostOverride?.id === detail ? detailPostOverride : candidatePost;
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
    return <button
      className={`post-card editorial-post${discoveryFeed ? " discover-content-card" : ""}`}
      key={p.id}
      data-discover-id={p.id}
      onClick={(event) => own && p.status === "draft" ? void openComposer(p) : openPost(p.id, source, event.currentTarget)}
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
    </button>;
  };
  const feed = (items: Post[]) => (
    <>
      <button
        className="text-button feed-refresh"
        onClick={() => void refreshFeed()}
      >
        刷新内容 ↻
      </button>
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

  const renderNavButton = ([id, label, Icon]: (typeof nav)[number]) => (
    <button
      key={id}
      className={tab === id || (tab === "settings" && id === "mine") || ((tab === "topic" || tab === "shared-collection") && id === "discover") || ((tab === "exploration-center" || tab === "co-explore" || tab === "monthly-recap" || tab === "card-chain") && id === "mine") || (tab === "notifications" && id === "messages") ? "active" : ""}
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
        requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[id] || 0, behavior: "instant" }));
      }}
    >
      <span className="bottom-nav-icon">
        {id === "messages" && <InboxBadge enabled={state.notifications.messages} inAppEnabled={tab !== "messages"} onNotice={toast} onOpenConversationPeer={(peerId) => { setMessagePeer(peerId); setTab("messages"); }} />}
        <Icon size={21} strokeWidth={1.8} />
      </span>
      <span>{label}</span>
    </button>
  );

  const renderCandidate = (p: Post, deckPosition = candidates.findIndex((candidate) => candidate.id === p.id), showHistoricalReveal = false) => {
    const historical = showHistoricalReveal || (deckPosition < 0 && Boolean(state.revealed[p.id]));
    const unlocked = historical || opened.includes(p.id),
      revealed = unlocked ? state.revealed[p.id] : undefined,
      rarityTier = unlocked ? state.rarityTiers[p.id] || revealed?.rarityTier || p.rarityTier : undefined,
      rarityLabel = rarityTier === "ordinary" ? "普通" : rarityTier === "pending" || !rarityTier ? "" : rarityTier,
      rareTier = rarityTier === "S" || rarityTier === "SS" || rarityTier === "SSS" ? rarityTier : null;
    return (
      <button
        key={p.id}
        data-card-id={p.id}
        className={`candidate-feed-card flip-in-place${unlocked ? " is-unlocked" : ""}${justFlippedId === p.id ? " just-flipped" : ""}${detail === p.id ? " is-detail-source" : ""}`}
        onClick={() => historical ? openPost(p.id, "today") : flip(p.id)}
        aria-label={unlocked ? `阅读 ${revealed?.title || "已翻开的卡片"}${rareTier ? `，${rareTier}级稀有卡` : ""}` : opened.length >= dailyAllowance ? `今日 ${dailyAllowance} 张已翻完，点击查看提示` : "选择并翻开一张未知卡片"}
      >
        <span className="card-flip-inner">
          <span className="card-flip-face card-flip-front">
            <span className="card-number">{deckPosition >= 0 ? String(deckPosition + 1).padStart(2, "0") : "—"}</span>
            {rarityLabel && <i className={`candidate-rarity-chip rarity-tier-${rarityTier}`} aria-label={`${rarityLabel}稀有卡`}>{rarityLabel}</i>}
            <span className="card-brand">黑卡 · HEIKA</span>
            <span className="card-prompt">轻触翻开</span>
          </span>
          <span
            className="card-flip-face card-flip-back"
            style={{
              background: revealed ? coverColor(revealed.tag) : "#e7e4dd",
            }}
          >
            {rarityLabel && <i className={`candidate-rarity-chip rarity-tier-${rarityTier}`} aria-label={`${rarityLabel}稀有卡`}>{rarityLabel}</i>}
            {revealed?.image && (
              <img
                src={revealed.image}
                alt=""
                loading="lazy"
                onError={(e) => {
                  if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = "true"; e.currentTarget.src = "/image-not-loaded.svg"; }
                }}
              />
            )}
            <span className="card-back-copy">
              <small>{revealed?.tag}</small>
              <strong>{revealed?.title}</strong>
              <em>阅读 ↗</em>
            </span>
          </span>
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
          if (!user) {
            setIsStaff(false);
            setAdminRole("member");
            setPublicBookmarks(false);
            setPublicBookmarksLoaded(true);
            setExperienceSummary({ total: 0, membershipTier: "free", events: [], claimedLevels: [] });
            setStorageKey("heika-demo-v1");
            if (restoredUserId === null) return;
            restoredUserId = null;
            try {
              const guest = JSON.parse(
                localStorage.getItem("heika-demo-v1") || "null",
              );
              setState((s) => ({ ...initial, ...guest, comments: [], cardIds: s.cardIds }));
            } catch { setState((s) => ({ ...initial, cardIds: s.cardIds })); }
            return;
          }
          setIsStaff(false);
          setAdminRole("member");
          setPublicBookmarks(false);
          setExperienceSummary({ total: 0, membershipTier: "free", events: [], claimedLevels: [] });
          restoredUserId = user.id;
          setStorageKey(`heika-user-${user.id}`);
          setState((previous) => {
            let local;
            try { local = JSON.parse(localStorage.getItem(`heika-user-${user.id}`) || "null"); } catch {}
            return { ...initial, ...local, comments: [], cardIds: previous.cardIds };
          });
          void cloudRequest("/api/v1/progression").then((summary) => {
            if (isCurrent() && summary && Number.isFinite(summary.total)) setExperienceSummary(summary);
          }).catch(() => {});
          try {
            const data = await cloudRequest("/api/v1/library-state");
            if (!isCurrent() || !data) return;
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
              return {
                ...s,
                onboardingDone:
                  previous.onboardingDone || Boolean(data.interests.length),
                name: data.profile.nickname,
                bio: data.profile.bio,
                avatar: data.profile.avatar_url,
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
          const version = ++generation;
          clearTimeout(hydrationTimer);
          // Defer beyond the auth lock; microtasks can run while it is still held.
          hydrationTimer = setTimeout(() => { void hydrate(user, version); }, 0);
        };
        const { data } = db.auth.onAuthStateChange((event, session) => {
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
      const detail = (event as CustomEvent<{ id?: string; nickname?: string; bio?: string; avatar?: string }>).detail;
      if (!detail || detail.id !== accountId) return;
      setState((current) => ({ ...current, name: detail.nickname || current.name, bio: detail.bio ?? current.bio, avatar: detail.avatar || undefined, comments: current.comments.map((comment) => comment.authorId === accountId ? { ...comment, name: detail.nickname || comment.name, avatar: detail.avatar || undefined } : comment) }));
    };
    window.addEventListener("heika-profile-updated", syncProfile);
    return () => window.removeEventListener("heika-profile-updated", syncProfile);
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
  if (!state.onboardingDone)
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
  const detailArticleContent = post ? (
    <Suspense fallback={<div className="detail-article-loading" aria-live="polite">正在加载正文…</div>}>
      <EditorialArticle post={post} />
    </Suspense>
  ) : null;
  return (
    <main className={`app${tab === "discover" ? " app-discover" : ""}${secondaryTitle ? " has-secondary-header" : ""}${isImmersive ? " app-immersive" : ""}${tab === "search" || (tab === "settings" && settingsDetail !== null) ? " app-nav-hidden-mobile" : ""}`}>
      <header className={`topline${secondaryTitle ? " secondary-topline" : ""}${tab === "mine" && !secondaryTitle ? " mine-topline" : ""}${tab === "discover" && !secondaryTitle ? " is-discover-topline" : ""}`}>
        {secondaryTitle ? <button type="button" className="topline-back" onClick={handleSecondaryBack} aria-label={`返回，当前页面：${secondaryTitle}`}><ArrowLeft size={19}/><strong>{secondaryTitle}</strong></button> : <span className="brand"><span>黑卡</span><i>HEIKA</i></span>}
        {tab === "discover" && !secondaryTitle ? <div className="discover-top-actions">
          <button type="button" className={`topline-action${discoverSearchOpen ? " selected" : ""}`} aria-label={discoverSearchOpen ? "关闭搜索" : "搜索内容或用户"} aria-expanded={discoverSearchOpen} onClick={() => { setSearchDraft(searchTerm); setDiscoverSearchOpen((open) => !open); setDiscoverSettingsOpen(false); }}><Search size={19} strokeWidth={1.8}/></button>
          <button type="button" className={`topline-action${discoverSettingsOpen ? " selected" : ""}`} aria-label="更多" aria-expanded={discoverSettingsOpen} aria-controls="discover-quick-settings" onClick={() => { setDiscoverSettingsOpen((open) => !open); setDiscoverSearchOpen(false); }}><MoreHorizontal size={21} strokeWidth={1.8}/></button>
          {discoverSettingsOpen && <div className="discover-quick-settings" id="discover-quick-settings" role="group" aria-label="发现页浏览设置">
            <span>浏览方式</span>
            <button type="button" aria-pressed={state.discoverLayout === "waterfall"} className={state.discoverLayout === "waterfall" ? "selected" : ""} onClick={() => { update((current) => ({ ...current, discoverLayout: "waterfall" })); setDiscoverSettingsOpen(false); }}><LayoutGrid size={16}/><span>双列瀑布流</span></button>
            <button type="button" aria-pressed={state.discoverLayout === "single"} className={state.discoverLayout === "single" ? "selected" : ""} onClick={() => { update((current) => ({ ...current, discoverLayout: "single" })); setDiscoverSettingsOpen(false); }}><List size={16}/><span>单列浏览</span></button>
            <RecommendationControls accountId={accountId} onLogin={() => { setDiscoverSettingsOpen(false); setTab("messages"); }} onNotice={toast} onChange={() => void loadPublicFeed(1, true, category)} />
          </div>}
        </div> : tab === "today" && !secondaryTitle ? <div className="discover-top-actions today-top-actions">
          <button type="button" className="topline-action" aria-label="搜索内容或用户" onClick={() => { setSearchReturnTab("today"); setSearchDraft(searchTerm); setTab("search"); }}><Search size={19} strokeWidth={1.8}/></button>
          <button type="button" className="topline-action" aria-label="打开通知" onClick={() => openNotifications("today")}><Bell size={19} strokeWidth={1.8}/></button>
        </div> : tab === "mine" && !secondaryTitle ? <div className="mine-topline-actions"><button type="button" className="mine-membership-button" aria-label={`会员中心，当前${membershipTier === "pro" ? "Pro" : membershipTier === "plus" ? "Plus" : "免费版"}`} onClick={() => openSettingsDetail("membership", "mine")}><Crown size={16}/><span>会员中心</span></button><button type="button" className="mine-settings-button" aria-label="打开设置" onClick={openMineSettings}><Settings size={19}/></button></div> : null}
      </header>
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
                <div className="eyebrow">LUCENT // BLACK CARD</div>
                <h1>精选</h1>
                <p className="lead">轻触菱面 · 翻开今日黑卡</p>
              </div>
            </div>
          ) : (
            <div className="daily-quota-summary" role="status" aria-live="polite">
              <strong>今日已翻开 {Math.min(opened.length, dailyAllowance)} / {dailyAllowance} 张</strong>
              <span>{opened.length >= dailyAllowance ? "今日额度已用完，已解锁卡片仍可查看" : `还可翻开 ${dailyAllowance - opened.length} 张`}</span>
            </div>
          )}
          {state.homeMode === "waterfall" ? (
            <>
              <div className="candidate-feed waterfall-card-feed">
                {visibleCandidates.map((candidate, index) => renderCandidate(candidate, index))}
              </div>
              <p className="daily-deck-caption">今日卡池 · 50 张 · 翻卡次数将在明日自动重置</p>
            </>
          ) : (
            <>
              <div className="black-facet-card" aria-label="黑卡菱形切面选择区">
                <span className="black-facet-brand">HEIKA · BLACK CARD</span>
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
      {tab === "search" && (
        <section className="page search-page" aria-label="搜索结果">
          <form className="search-page-form" role="search" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
            <label className="search-page-field">
              <Search size={18} aria-hidden="true" />
              <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜内容、昵称或兴趣" aria-label="搜索内容或用户" maxLength={60} autoComplete="off" />
              {searchDraft && <button type="button" aria-label="清除搜索词" onClick={() => { setSearchDraft(""); setSearchTerm(""); setSearchPosts([]); setSearchPeople([]); setSearchTotal(0); setSearchHasMore(false); searchCursorRef.current = null; }}><X size={16}/></button>}
            </label>
            <button className="search-page-submit" type="submit" disabled={!searchDraft.trim()}>搜索</button>
          </form>
          {searchTerm ? <>
            <div className="search-result-toolbar">
              <div className="search-result-tabs" role="tablist" aria-label="搜索范围">
                {([ ["content", "内容"], ["people", "用户"] ] as const).map(([kind, label]) => <button key={kind} role="tab" aria-selected={searchKind === kind} className={searchKind === kind ? "selected" : ""} onClick={() => { setSearchKind(kind); setSearchPage(1); searchCursorRef.current = null; setSearchTotal(0); setSearchHasMore(false); setSearchPosts([]); setSearchPeople([]); setSearchError(""); }}>{label}</button>)}
              </div>
              <small>{searchLoading && searchPage === 1 ? "正在搜索" : searchKind === "content" ? `已加载 ${searchPosts.length} 条${searchHasMore ? "" : "结果"}` : `${searchTotal} 条结果`}</small>
            </div>
            {searchError && <div className="search-state search-error"><span>{searchError}</span><button onClick={() => setSearchRetry((n) => n + 1)}>重试</button></div>}
            {searchKind === "content" ? <div className="search-post-results" role="tabpanel">
              {searchPosts.map((item) => <button className="search-post-result" key={item.id} onClick={(event) => openPost(item.id, "discover", event.currentTarget)}>
                <span className="search-post-thumbnail">{item.image && <img src={item.image} srcSet={item.imageRetina ? `${item.image} 480w, ${item.imageRetina} 960w` : undefined} sizes="72px" alt="" loading="lazy" decoding="async" onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "true"; event.currentTarget.src = "/image-not-loaded.svg"; } }}/>}<small>{item.tag}</small></span>
                <span className="search-post-copy"><strong>{item.title}</strong><span>{markdownToText(item.body).slice(0, 96)}</span><small>{item.author} · {item.date}</small></span>
                <ChevronRight size={17}/>
              </button>)}
              {!searchLoading && !searchError && !searchPosts.length && <div className="search-state">没有找到相关内容，试试更短的关键词。</div>}
              {searchLoading && searchPage === 1 && <div className="search-skeleton-list"><i/><i/><i/></div>}
              {searchHasMore && <button className="search-more-button" disabled={searchLoading} onClick={() => setSearchPage((page) => page + 1)}>{searchLoading ? "正在加载…" : "加载更多内容"}</button>}
            </div> : <div className="search-people-results" role="tabpanel">
              {searchPeople.map((person) => <button className="search-person-result" key={person.id} onClick={() => setAuthorProfile(person.id)}>
                <span className="search-person-avatar"><span>{(person.nickname || "探").slice(0, 1)}</span>{person.avatar_url && <img src={person.avatar_url} alt="" loading="lazy" onError={(event) => { event.currentTarget.dataset.failed = "true"; }}/>}</span>
                <span className="search-person-copy"><strong>{person.nickname || "探索者"}</strong><small>{person.bio || "还没有填写简介"}</small></span>
                <ChevronRight size={17}/>
              </button>)}
              {!searchLoading && !searchError && !searchPeople.length && <div className="search-state">没有找到相关用户，试试昵称或兴趣关键词。</div>}
              {searchLoading && searchPage === 1 && <div className="search-skeleton-list"><i/><i/><i/></div>}
              {searchPeople.length < searchTotal && <button className="search-more-button" disabled={searchLoading} onClick={() => setSearchPage((page) => page + 1)}>{searchLoading ? "正在加载…" : "加载更多用户"}</button>}
            </div>}
          </> : <div className="search-suggestions">
            {!!searchRecent.length && <section><div className="search-suggestion-heading"><strong>最近搜索</strong><button onClick={() => { setSearchRecent([]); localStorage.removeItem("heika-search-recent"); }}>清除</button></div><div className="search-suggestion-chips">{searchRecent.map((term) => <button key={term} onClick={() => { setSearchDraft(term); submitSearch(term); }}>{term}</button>)}</div></section>}
            <section><div className="search-suggestion-heading"><strong>热门话题</strong><span>精选</span></div><div className="search-suggestion-chips topic-suggestions">{topicChoices.slice(0, 8).map((topic) => <button key={topic.id} onClick={() => { setSearchDraft(topic.name); submitSearch(topic.name); }}>#{topic.name}</button>)}</div></section>
            <p>搜索内容标题、正文，也可以查找用户昵称和兴趣。</p>
          </div>}
        </section>
      )}
      {tab === "discover" && (
        <section className="page editorial-home discover-page">
          <div className="discover-channel-tabs" role="tablist" aria-label="发现频道">
            <button type="button" role="tab" aria-selected={discoverChannel === "community"} className={discoverChannel === "community" ? "selected" : ""} onClick={() => switchDiscoverChannel("community")}><span>社区</span></button>
            <button type="button" role="tab" aria-selected={discoverChannel === "ai"} className={discoverChannel === "ai" ? "selected ai-channel-active" : ""} onClick={() => switchDiscoverChannel("ai")}><span>AI 空间</span></button>
          </div>
          {discoverSearchOpen && <form className="discover-inline-search" role="search" onSubmit={(event) => { event.preventDefault(); setSearchReturnTab("discover"); submitSearch(searchDraft); setDiscoverSearchOpen(false); setTab("search"); }}>
            <Search size={17} aria-hidden="true" />
            <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜索标题、作者或内容" aria-label="搜索内容或用户" autoFocus maxLength={60} />
            {searchDraft && <button type="button" aria-label="清除搜索内容" onClick={() => setSearchDraft("")}><X size={15}/></button>}
            <button type="submit" className="discover-inline-search-submit" disabled={!searchDraft.trim()}>搜索</button>
          </form>}
          <div className="discover-community-channel" hidden={discoverChannel !== "community"}>
          <div className="discover-category-nav" role="tablist" aria-label="发现内容分类">
            {["全部", ...(communityCategories.length ? communityCategories : tags)].map((t) => (
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
          </div>
          {sort === "精选" && category === "全部" && latestOpenedPost && (
            <section className="recent-flip-section" aria-labelledby="recent-flip-title">
              <div className="recent-flip-heading">
                <div><small>RECENTLY REVEALED</small><h2 id="recent-flip-title">最近翻开的卡</h2></div>
                <span>随时回来继续阅读</span>
              </div>
              {renderCandidate(latestOpenedPost, -1, true)}
            </section>
          )}
          <div className="discover-topic-list" aria-label="精选话题">
            {topicChoices.slice(0, 8).map((topic) => <button key={topic.id} className="discover-topic-chip" onClick={() => void openTopic(topic.name)}>#{topic.name}<small>{topic.postCount}</small></button>)}
          </div>
          {topicEvents.length > 0 && <section className="topic-events-section" aria-labelledby="topic-events-title"><div className="topic-events-heading"><div><small>COMMUNITY / OPEN CALL</small><h2 id="topic-events-title">本期话题共创</h2></div><span>{topicEvents.length} 个进行中</span></div><div className="topic-event-list">{topicEvents.map((event) => <article className="topic-event-card" key={event.id}><div className="topic-event-mark">#{event.topic}</div><div className="topic-event-copy"><h3>{event.title}</h3><p>{event.description}</p><small>{event.participantCount} 人参与 · {event.postCount} 篇内容 · 截止 {new Date(event.ends_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></div><button type="button" className={event.joined ? "joined" : ""} onClick={() => void joinTopicEvent(event)}>{event.joined ? "继续创作" : "加入共创"}</button></article>)}</div></section>}
          <div className="discover-sort" role="group" aria-label="发现排序">
            {["精选", "最新", "高分", "关注"].map((option) => <button key={option} type="button" className={sort === option ? "selected" : ""} aria-pressed={sort === option} onClick={() => { if (sort !== option) { setPublicFeed([]); setFeedPostIds([]); setFeedPage(0); setFeedTotal(0); setFeedHasMore(false); feedCursor.current = null; setFeedLoadedTag(null); setFeedLoadedSort(null); setPage(12); setSort(option); } }}>{option === "精选" ? "为你推荐" : option === "高分" ? "高评分" : option}</button>)}
          </div>
          {sort === "关注" && !accountId && <p className="fineprint follow-feed-hint">登录并关注创作者后，这里会集中显示他们的新内容。</p>}
          <div className="section-head editorial-section-head discover-feed-heading">
            <h2>{category === "全部" ? "为你推荐" : category}</h2>
            <span>{Math.max(filtered.length, feedTotal)} 篇内容</span>
          </div>
          {feed(list)}
          </div>
          <AISpace hidden={discoverChannel !== "ai"} accountId={accountId} onOpen={openAiPost} onLogin={() => setTab("messages")} onNotice={toast}/>
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
          <div className="eyebrow">TOPIC / HEIKA</div>
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
          bottomNavStyle={bottomNavStyle}
          homeMode={state.homeMode}
          readingMode={state.readingMode}
          detailTransition={detailTransition}
          discoverLayout={state.discoverLayout}
          profileLayout={profileLayout}
          messagesEnabled={state.notifications.messages}
          accountId={accountId}
          isStaff={isStaff}
          onOpenDetail={openSettingsDetail}
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
          {settingsDetail !== "membership" && <><div className="eyebrow">HEIKA / SETTINGS</div><h1>{({theme:"主题外观",font:"字体设置",bottomNav:"底部导航",discoverLayout:"发现页布局",profileLayout:"他人主页布局",homeMode:"首页浏览方式",reading:"阅读模式",detailTransition:"详情过渡效果",notifications:"通知与提醒",profile:"个人资料",interests:"兴趣与话题",security:"隐私与安全",membership:"会员中心",progression:"等级与奖励",creator:"创作者中心",cache:"缓存管理",feedback:"意见反馈",feedbackAdmin:"反馈管理"})[settingsDetail]}</h1><p className="lead">{settingsDetail === "profile" ? "完善公开资料，让其他探索者更好地认识你。" : settingsDetail === "interests" ? "选择感兴趣的方向，帮助黑卡整理每日探索内容。" : settingsDetail === "security" ? "管理笔记可见范围、私聊接收范围、黑名单和账号安全。" : settingsDetail === "progression" ? "翻开卡片、认真评分，积累经验解锁探索者等级奖励。" : "预览效果并选择偏好，设置会自动保存。"}</p></>}
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
          {settingsDetail === "profile" && <AccountProfile mode="page" name={state.name} bio={state.bio} avatar={state.avatar} details={state.profileDetails} onSave={(name,bio,avatar,profileDetails)=>{update(current=>({...current,name,bio,avatar,profileDetails}));window.dispatchEvent(new CustomEvent("heika-profile-updated",{detail:{id:accountId,nickname:name,bio,avatar}}));}} onClose={closeSettingsDetail}/>}
          {settingsDetail === "security" && <><MessagingPreferences accountId={accountId} onLogin={() => { closeSettingsDetail(); setTab("messages"); }} publicBookmarks={publicBookmarks} publicBookmarksLoaded={publicBookmarksLoaded} bookmarkVisibilityBusy={bookmarkVisibilityBusy} onBookmarkVisibilityChange={updateBookmarkVisibility} onNotice={toast}/><AppealCenter accountId={accountId} onLogin={() => { closeSettingsDetail(); setTab("messages"); }} onNotice={toast}/></>}
          {settingsDetail === "membership" && <MembershipCenter tier={membershipTier} dailyAllowance={dailyAllowance} usedFlips={opened.length} onNotice={toast} /> }
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
              {([['oppo','OPPO Sans 4.0','已随应用提供；字体版权归 OPPO，未选中时使用系统字体'],['system','系统字体','跟随设备默认字体']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={fontChoice===value} className={`preference-option${fontChoice===value?' selected':''}`} onClick={()=>setFontChoice(value)}>{renderPreferencePreview('font',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{fontChoice===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "bottomNav" && (
            <div className="preference-options" role="radiogroup" aria-label="底部导航样式">
              {([['glass','悬浮玻璃','轻透悬浮，保留页面呼吸感'],['fixed','固定底栏','贴合屏幕底部，稳定易触达']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={bottomNavStyle===value} className={`preference-option${bottomNavStyle===value?' selected':''}`} onClick={()=>{localStorage.setItem("heika-bottom-nav-style-explicit","1");setBottomNavStyle(value)}}>{renderPreferencePreview('bottomNav',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{bottomNavStyle===value?'✓':''}</i></button>)}
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
      {tab === "moderation" && isStaff && <AdminModeration role={adminRole as "admin" | "content_manager" | "reviewer"} onBack={() => { setTab("settings"); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.settings || 0, behavior: "instant" })); }} />}
      {tab === "about" && <AboutHeika onBack={closeAboutPage} onFeedback={openFeedbackFromAbout} />}
      {tab === "debug" && (
        <section className="page debug-page">
          <div className="eyebrow">DEVELOPER TOOLS</div>
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
          <section className="mine-profile-hero" aria-label="个人资料">
            <div className="profile-card mine-profile-card">
              <div className="avatar">{state.avatar ? <img src={state.avatar} alt="头像" /> : state.name[0]}</div>
              <div className="mine-profile-copy"><div className="mine-profile-name-row"><h2>{state.name}</h2><button className="mine-level-tag" type="button" aria-label={`探索等级 LV.${currentExperience.current.level}，查看经验详情`} onClick={() => openSettingsDetail("progression", "mine")}>LV.{currentExperience.current.level}</button></div><p>{state.bio || "记录生活，继续探索。"}</p>{accountId && <small className="mine-account-id">HEIKA ID · {accountId.slice(0, 8).toUpperCase()}</small>}</div>
              <button type="button" aria-label="编辑资料" onClick={() => openSettingsDetail("profile", "mine")}><PenLine size={18} /></button>
            </div>
            <div className="stats exploration-stats mine-profile-stats"><div><strong>{openedIds.length}</strong><span>累计翻卡</span></div><div><strong>{streak}</strong><span>连续探索</span></div><div><strong>{state.saved.length}</strong><span>我的收藏</span></div></div>
          </section>
          <section className="mine-exploration-hub" aria-label="探索功能">
            <DailyMissions accountId={accountId} onNotice={toast}/>
            <button type="button" className="mine-exploration-entry" onClick={openExplorationCenter}>
              <span className="mine-exploration-entry-icon"><Compass size={18}/></span>
              <span><strong>探索中心</strong><small>好友探索 · 月报 · 接龙 · 日历 · 最近发现</small></span>
              <ChevronRight size={18}/>
            </button>
          </section>
          <div className="mine-tabs-shell">
            <div className="mine-tabs" role="tablist" aria-label="个人内容分类">
              {([
                ["works", "我的作品"],
                ["favorites", "我的收藏"],
                ["liked", "我的点赞"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  id={`mine-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={mineSection === id}
                  aria-controls="mine-category-panel"
                  tabIndex={mineSection === id ? 0 : -1}
                  className={mineSection === id ? "active" : ""}
                  onClick={() => setMineSection(id)}
                >
                  {label}
                </button>
              ))}
              <span className="mine-tab-indicator" style={{ transform: `translateX(${["works", "favorites", "liked"].indexOf(mineSection) * 100}%)` }} />
            </div>
          </div>
          <div id="mine-category-panel" className="mine-category-panel" role="tabpanel" aria-labelledby={`mine-tab-${mineSection}`} key={mineSection}>
            {mineSection === "works" && (
              <div className="mine-tab-content">
                <div className="mine-works-heading"><div><span>共 {state.own.filter((post) => post.status === "published" || !post.status).length} 篇作品</span></div><button type="button" className="mine-works-manage-button" onClick={() => openMyContent("mine")}>作品管理 <ChevronRight size={15}/></button></div>
                {selectedSeriesId && <button type="button" className="series-filter-reset" onClick={() => setSelectedSeriesId("")}>查看全部作品</button>}
                {visibleOwnPosts.length ? <div className="masonry mine-works-masonry">{visibleOwnPosts.map((post) => <article className="mine-work-card" key={post.id}>
                  {postCard(post, "discover", true)}
                  <div className="mine-work-actions"><span>{post.pendingRevision?.status === "pending" ? "修改审核中 · 当前版本正常展示" : post.pendingRevision?.status === "rejected" ? "修改未通过 · 当前版本正常展示" : post.status === "draft" ? "草稿" : post.status === "pending_review" ? "审核中" : post.status === "hidden" ? "审核未通过" : "已发布"}</span><button type="button" aria-label={`编辑${post.title || "未命名内容"}`} onClick={() => void openComposer(post)}><PenLine size={14}/><span>{post.pendingRevision?.status === "pending" ? "编辑待审修改" : "编辑"}</span></button><button type="button" aria-label={`删除${post.title || "未命名内容"}`} onClick={() => void deleteOwn(post)}><Trash2 size={14}/><span>删除</span></button></div>
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
        <section className="page exploration-center-page">
          <div className="exploration-center-intro"><span>HEIKA / EXPLORE</span><h1>探索中心</h1><p>和朋友一起发现，也回看自己的探索轨迹。</p></div>
          <div className="exploration-center-actions" aria-label="探索功能">
            <button type="button" onClick={() => openCoExplore("exploration-center")}><span><UsersRound size={18}/></span><span><strong>和朋友一起探索</strong><small>共同翻卡，分享发现</small></span><ChevronRight size={17}/></button>
            <button type="button" onClick={() => openMineFeature("monthly-recap", "exploration-center")}><span><Sparkles size={18}/></span><span><strong>探索月报</strong><small>回看本月发现与稀有卡</small></span><ChevronRight size={17}/></button>
            <button type="button" onClick={() => openMineFeature("card-chain", "exploration-center")}><span><GitBranch size={18}/></span><span><strong>卡片接龙</strong><small>从一张卡片续写故事</small></span><ChevronRight size={17}/></button>
          </div>
          <section className="exploration-center-section">
            <div className="section-head exploration-calendar-heading"><button type="button" className="collapsible-panel-toggle" aria-expanded={explorationCalendarOpen} aria-controls="exploration-calendar-content" onClick={() => setExplorationCalendarOpen((open) => !open)}><h2><CalendarDays size={17}/>探索日历</h2><span>最近 28 天 <ChevronDown size={16}/></span></button></div>
            {explorationCalendarOpen && <div id="exploration-calendar-content"><div className="exploration-calendar" role="group" aria-label="最近 28 天的翻卡记录">
              {calendarDays.map(({ key, count }) => <button key={key} type="button" className={`calendar-day level-${Math.min(count, 5)}${selectedDay === key ? " selected" : ""}`} aria-label={`${key}，翻开 ${count} 张`} aria-pressed={selectedDay === key} onClick={() => setSelectedCalendarDate(key)} title={`${key} · ${count} 张`} />)}
            </div>
            <div className="calendar-day-detail">
              <div><strong>{(() => { const [year, month, day] = selectedDay.split("-"); return `${year}年${Number(month)}月${Number(day)}日`; })()}</strong><span>探索：{selectedDayIds.length} 张</span></div>
              {selectedDayIds.length ? <div className="calendar-posts">{selectedDayIds.map((id) => {
                const item = state.revealed[id] || all.find((post) => post.id === id);
                const tier = state.rarityTiers[id] || state.revealed[id]?.rarityTier;
                const rareTier = tier === "S" || tier === "SS" || tier === "SSS" ? tier : null;
                return item ? <button key={id} onClick={() => openPost(id, "today")}><span>{item.tag}</span>{rareTier && <i className={`rarity-history-chip rarity-tier-${rareTier}`}>{rareTier}</i>}<strong>{item.title}</strong><ChevronRight size={15}/></button> : <div key={id} className="calendar-missing">已翻开的内容当前不可用</div>;
              })}</div> : <p className="fineprint">这一天还没有翻开新卡片。</p>}
            </div></div>}
          </section>
          <section className="exploration-center-section">
            <div className="section-head exploration-center-subhead"><h2><History size={17}/>最近发现</h2><span>最近 8 条</span></div>
            {recentDiscoveries.length ? <div className="recent-discoveries">{recentDiscoveries.map(({ date, post }) => {
              const tier = state.rarityTiers[post.id] || state.revealed[post.id]?.rarityTier;
              const rareTier = tier === "S" || tier === "SS" || tier === "SSS" ? tier : null;
              return <button key={`${date}-${post.id}`} onClick={() => setRecentPreview({ post, source: state.revealed[post.id] ? "today" : "discover" })}><span>{post.tag} · {date.slice(5).replace("-", ".")}</span>{rareTier && <i className={`rarity-history-chip rarity-tier-${rareTier}`}>{rareTier}</i>}<strong>{post.title}</strong><small>点按预览</small></button>;
            })}</div> : <div className="empty">翻开第一张卡片后，这里会留下你的近期发现。</div>}
            <div id="flip-history" className="section-head exploration-history-heading"><button type="button" className="collapsible-panel-toggle" aria-expanded={explorationHistoryOpen} onClick={() => setExplorationHistoryOpen((open) => !open)}><h2>探索记录</h2><span>{Object.keys(state.opened).length} 天 <ChevronDown size={16}/></span></button></div>
            {explorationHistoryOpen && Object.entries(state.opened).sort(([a], [b]) => b.localeCompare(a)).map(([day, values]) => <div className="history" key={day}><strong>{day}</strong>{values.map((id) => {
              const tier = state.rarityTiers[id] || state.revealed[id]?.rarityTier;
              const rareTier = tier === "S" || tier === "SS" || tier === "SSS" ? tier : null;
              return <button key={id} onClick={() => openPost(id)}>{rareTier && <i className={`rarity-history-chip rarity-tier-${rareTier}`}>{rareTier}</i>}{all.find((post) => post.id === id)?.title || "已移除内容"}</button>;
            })}</div>)}
            {explorationHistoryOpen && !Object.keys(state.opened).length && <div className="empty">翻开第一张卡，开始记录。</div>}
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
          <div className="eyebrow">CREATOR CENTER / HEIKA</div>
          <h1>创作者中心<span className="red-dot">.</span></h1>
          <p className="lead">查看公开内容表现与本周成长任务。</p>
          <section className="creator-center" aria-label="创作者数据与成长任务">
            <div className="creator-center-heading"><div><small>CREATOR / INSIGHTS</small><h2>创作数据</h2></div><span>{creatorCenter?.weekStart ? `本周任务 · ${creatorCenter.weekStart}` : "数据仅统计已公开内容"}</span></div>
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
          <div className="eyebrow">MY CONTENT / HEIKA</div>
          <h1>作品管理<span className="red-dot">.</span></h1>
          <p className="lead">整理系列、查看内容状态并管理草稿。</p>
          <div className="series-manager"><div className="series-manager-heading"><strong>作品系列</strong><span>把有关联的内容整理成专栏</span></div><div className="series-create-form"><input aria-label="系列名称" maxLength={48} placeholder="例如：一周城市观察" value={seriesName} onChange={(event) => setSeriesName(event.target.value)}/><input aria-label="系列简介" maxLength={240} placeholder="一句话介绍（可选）" value={seriesDescription} onChange={(event) => setSeriesDescription(event.target.value)}/><button type="button" disabled={!accountId || seriesName.trim().length < 2} onClick={() => void createPostSeries()}><Plus size={15}/>新建</button></div>{creatorSeries.length > 0 && <div className="series-list">{creatorSeries.map((series) => <button type="button" className={selectedSeriesId === series.id ? "active" : ""} key={series.id} onClick={() => setSelectedSeriesId((current) => current === series.id ? "" : series.id)}><strong>{series.title}</strong><span>{series.description || "持续更新中"}</span><small>{series.postCount || 0} 篇</small></button>)}</div>}</div>
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
      <div className={`bottom-nav-shell${bottomNavStyle === "glass" ? " floating-glass" : " fixed-bar"}`}>
        <nav className="bottom-nav" aria-label="主导航">
          {nav.slice(0, 2).map(renderNavButton)}
          {nav.slice(2).map(renderNavButton)}
        </nav>
        <button type="button" className="compose" aria-label="发布内容" onClick={() => void openComposer()}>
          <span className="bottom-nav-icon"><Plus size={25} strokeWidth={1.8} /></span>
          <span>发布</span>
        </button>
      </div>
      {viewerId !== null && (
        <div
          className="flip-overlay"
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
                      <button
                        className="flip-button"
                        disabled={flippingId === viewerId}
                        onClick={completeFlip}
                      >
                        {flippingId === viewerId ? "正在翻开…" : "确认翻开"}
                      </button>
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
                      <p>{hasRevealImage ? revealBody.slice(0, 220) : revealBody.slice(0, 2400)}</p>
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
      {post && (
        <div
          className={`overlay ${viewerId === post.id ? "from-flip-window " : ""}${detailReady ? "detail-ready" : transitionPhase ? `detail-${transitionPhase}` : "detail-preparing"}`}
          inert={!detailReady}
          aria-hidden={!detailReady}
        >
          <div className="detail">
            <header className="detail-header">
              <button className="detail-back" aria-label="返回" onClick={() => closeDetail()}>
                <ArrowLeft size={21} />
              </button>
              <span>精选 <i>· HEIKA</i></span>
              <div className="detail-more-wrap">
                <button className="detail-more-button" aria-label="更多操作" aria-expanded={detailMoreOpen} onClick={() => setDetailMoreOpen((open) => !open)}>
                  <MoreHorizontal size={22} />
                </button>
                {detailMoreOpen && (
                  <div className="detail-more-menu">
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
                    <button onClick={() => {
                      const url = `${location.origin}/?post=${post.id}`;
                      void navigator.clipboard?.writeText(url).then(() => toast("链接已复制")).catch(() => toast("复制失败"));
                      setDetailMoreOpen(false);
                    }}><Share2 size={16} /> 复制链接</button>
                    {post.cloudId && post.status === "published" && <button onClick={() => {
                      if (!accountId) { setDetailMoreOpen(false); toast("登录后可以举报内容"); return; }
                      setReportPostId(post.cloudId!); setReportCommentId(null); setReportReason(""); setReportNote(""); setDetailMoreOpen(false); setModal("report");
                    }}><Flag size={16} /> 举报内容</button>}
                  </div>
                )}
              </div>
            </header>
            <div className="detail-scroll" key={post.id}>
              <div className={`detail-body reading-${state.readingMode}${readingTransition ? ` reading-${readingTransition}` : ""}`}>
                <div className="detail-article-column">
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
                      return <ProgressiveImage
                        key={`${lowSrc}:${highSrc}`}
                        lowSrc={lowSrc}
                        src={highSrc}
                        alt={`${post.title}，第 ${index + 1} 张`}
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
                <h1>{post.title}</h1>
                <p className="byline">
                  {post.authorId ? <button className="text-button" onClick={() => setAuthorProfile(post.authorId!)}>{post.author} ↗</button> : post.author}
                  <span> · {post.date}</span>
                </p>
                <button className="detail-reading-setting" onClick={() => setModal("reading")}>
                  阅读模式 · {{ standard: "标准", focus: "专注", night: "夜间" }[state.readingMode]} <ChevronRight size={14} />
                </button>
                {post.seriesTitle && <div className="detail-series-badge"><span>系列</span><strong>{post.seriesTitle}</strong>{post.seriesId && <SeriesSubscription seriesId={post.seriesId} accountId={accountId} onLogin={() => setTab("messages")} onNotice={toast} />}</div>}
                {post.topics?.length ? <div className="detail-topic-list" aria-label="内容话题">{post.topics.map((topic) => <button key={topic} className="detail-topic-chip" onClick={() => void openTopic(topic)}>#{topic}</button>)}</div> : null}
                {post.cloudId ? <PrivateHighlights postId={post.cloudId} accountId={accountId} onLogin={() => setTab("messages")} onNotice={toast}>{detailArticleContent}</PrivateHighlights> : detailArticleContent}
                {post.channel === "ai" && post.cloudId && <Suspense fallback={<div className="detail-article-loading" aria-live="polite">正在加载 AI 资源详情…</div>}><AIResourceDetails postId={post.cloudId} contentType={post.contentType || "knowledge_article"} resourceData={post.resourceData || {}} accountId={accountId} onLogin={() => setTab("messages")} onNotice={toast}/></Suspense>}
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
                <section id="detail-comments" className="detail-comments">
                  <div className="comments-heading">
                    <h2>评论 <span>· {commentTotal}</span></h2>
                    <div role="group" aria-label="评论排序" className="comment-sort">
                      <button className={detailSort === "热度" ? "selected" : ""} onClick={() => setDetailSort("热度")}>最热</button>
                      <button className={detailSort === "最新" ? "selected" : ""} onClick={() => setDetailSort("最新")}>最新</button>
                    </div>
                  </div>
                  {commentsError && <div className="comments-state"><span>评论加载失败</span><button onClick={() => { setCommentsError(false); setCommentsLoading(true); void fetch(`/api/library-comments?id=${post.id}&offset=${commentOffset}&limit=40&sort=${detailSort === "最新" ? "new" : "hot"}`, { cache: "no-store" }).then((r) => r.json()).then((result) => { if (!Array.isArray(result.data?.items)) throw new Error(); const items = result.data.items as Comment[]; setState((s) => ({ ...s, comments: [...s.comments.filter((c) => c.post !== post.id || !c.cloudId), ...items] })); setCommentTotal(result.data.total || 0); setCommentOffset(items.length); setCommentHasMore(items.length < (result.data.total || 0)); }).catch(() => setCommentsError(true)).finally(() => setCommentsLoading(false)); }}>重试</button></div>}
                  {commentsLoading && commentOffset === 0 && <div className="comments-loading" aria-label="正在加载评论"><i/><i/></div>}
                  {(() => {
                    const comments = state.comments.filter((c) => c.post === post.id);
                    const roots = comments.filter((c) => !c.parent).sort((a, b) => detailSort === "最新" ? b.time - a.time : b.likes - a.likes || b.time - a.time);
                    return roots.length ? roots.map((c) => {
                      const children = comments.filter((item) => item.parent === c.id).sort((a, b) => a.time - b.time);
                      const displayBody = expandedComments[c.id] || c.body.length <= 280 ? c.body : `${c.body.slice(0, 280)}…`;
                      const renderReply = (child: Comment) => <div className="comment-reply" key={child.id}>
                        <div className="comment-avatar small" aria-hidden="true"><span>{(child.name || "探").slice(0, 1)}</span>{child.avatar && <img src={child.avatar} alt="" loading="lazy" onError={(event) => { event.currentTarget.dataset.failed = "true"; }} />}</div>
                        <div className="comment-reply-content"><div className="comment-reply-heading"><strong title={child.name || "探索者"}>{child.name || "探索者"}</strong><span>回复</span><strong title={child.replyToName || c.name || "探索者"}>{child.replyToName || c.name || "探索者"}</strong></div><p>{child.body}</p><div className="comment-meta comment-reply-meta"><time>{relativeTime(child.time)}</time><button className="comment-reply-action" onClick={() => focusReply(child.id, child.name)}>回复</button><button type="button" className={`comment-reply-like${child.liked ? " selected" : ""}`} aria-label={`${child.liked ? "取消点赞" : "点赞回复"}，${child.likes}`} aria-pressed={!!child.liked} onClick={() => void toggleCommentLike(child)}><Heart size={14} fill={child.liked ? "currentColor" : "none"}/><span>{child.likes}</span></button><details className="comment-actions-menu"><summary aria-label="回复操作"><MoreHorizontal size={16}/></summary><div className="comment-actions-panel"><button onClick={() => void copyComment(child)}>复制</button>{(!child.cloudId || child.authorId === accountId) && <button onClick={() => void deleteComment(child)}>删除回复</button>}{child.cloudId && accountId && child.authorId !== accountId && <button onClick={() => { setReportCommentId(child.cloudId!); setReportPostId(null); setReportReason(""); setReportNote(""); setModal("report"); }}>举报回复</button>}</div></details></div></div>
                      </div>;
                      return <article className="comment" id={`comment-${c.id}`} data-comment-id={c.id} key={c.id}>
                        <div className="comment-avatar" aria-hidden="true"><span>{(c.name || "探").slice(0, 1)}</span>{c.avatar && <img src={c.avatar} alt="" loading="lazy" onError={(event) => { event.currentTarget.dataset.failed = "true"; }} />}</div>
                        <div className="comment-content">
                          <div className="comment-heading"><strong className="comment-author" title={c.name || "探索者"}>{c.name || "探索者"}</strong>{post.authorId && c.authorId === post.authorId && <span className="comment-author-badge">作者</span>}</div>
                          <p className={expandedComments[c.id] ? "comment-body expanded" : "comment-body"}>{displayBody}</p>
                          {c.body.length > 280 && <button className="comment-expand" onClick={() => setExpandedComments((current) => ({ ...current, [c.id]: !current[c.id] }))}>{expandedComments[c.id] ? "收起" : "展开全文"}</button>}
                          <div className="comment-meta"><time dateTime={new Date(c.time).toISOString()}>{relativeTime(c.time)}</time><button className="comment-reply-action" onClick={() => focusReply(c.id, c.name)}>回复</button><details className="comment-actions-menu"><summary aria-label="评论操作"><MoreHorizontal size={18}/></summary><div className="comment-actions-panel"><button onClick={() => void copyComment(c)}>复制</button><button onClick={() => focusReply(c.id, c.name)}>回复</button>{(!c.cloudId || c.authorId === accountId) && <button onClick={() => void deleteComment(c)}>删除评论</button>}{c.cloudId && accountId && c.authorId !== accountId && <button onClick={() => { setReportCommentId(c.cloudId!); setReportPostId(null); setReportReason(""); setReportNote(""); setModal("report"); }}>举报评论</button>}</div></details></div>
                          {children.length > 0 && <div className="comment-replies">{children.slice(0, 2).map(renderReply)}<div className={`comment-replies-extra${expandedReplies[c.id] ? " is-expanded" : ""}`} aria-hidden={!expandedReplies[c.id]} inert={!expandedReplies[c.id]}><div>{children.slice(2).map(renderReply)}</div></div></div>}
                          {children.length > 2 && <button className="expand-replies" aria-expanded={!!expandedReplies[c.id]} onClick={() => setExpandedReplies((s) => ({ ...s, [c.id]: !s[c.id] }))}>{expandedReplies[c.id] ? "收起回复" : `展开 ${children.length - 2} 条回复`}</button>}
                        </div>
                        <button className={`comment-like${c.liked ? " selected" : ""}`} aria-label={`${c.liked ? "取消点赞" : "点赞评论"}，${c.likes}`} aria-pressed={!!c.liked} onClick={() => void toggleCommentLike(c)}><Heart size={18} fill={c.liked ? "currentColor" : "none"} /><span>{c.likes}</span></button>
                      </article>;
                    }) : !commentsLoading && !commentsError && <p className="comments-empty">还没有评论，来聊聊你的想法。</p>;
                  })()}
                  {commentHasMore && <button className="comments-load-more" disabled={commentsLoading} onClick={() => void loadMoreComments()}>{commentsLoading ? "正在加载…" : "更多评论"}</button>}
                </section>
              </div>
            </div>
            <form className="detail-action-bar" onSubmit={(event) => { event.preventDefault(); void addComment(); }}>
              <div className={`detail-comment-input${reply ? " replying" : ""}${commentInputExpanded || draft ? " expanded" : ""}`}>
                <span className="comment-compose-avatar" aria-hidden="true"><span>{(state.name || "探").slice(0, 1)}</span>{state.avatar && <img src={state.avatar} alt="" onError={(event) => { event.currentTarget.dataset.failed = "true"; }} />}</span>
                {reply && <span className="reply-label">回复 @{replyTargetName || state.comments.find((c) => c.id === reply)?.name || "评论"}<button type="button" aria-label="取消回复" onClick={() => { setReply(undefined); setReplyTargetName(undefined); }}><X size={13} /></button></span>}
                <textarea ref={commentInputRef} value={draft} onFocus={() => setCommentInputExpanded(true)} onBlur={(event) => { if (!draft.trim() && !reply && !event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) setCommentInputExpanded(false); }} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void addComment(); } }} placeholder="说说你的想法…" rows={commentInputExpanded || draft ? 3 : 1} maxLength={1000} aria-label="评论内容" />
                {draft.trim() && <button type="button" className="comment-clear" aria-label="清除输入" onClick={() => setDraft("")}><X size={14} /></button>}
                {draft.trim() && <button type="submit" className="comment-send" disabled={commentSending} aria-label="发送评论"><Send size={17} /></button>}
              </div>
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
              <button type="button" className="bar-icon" aria-label="分享内容" onClick={() => {
                const shareData = { title: post.title, text: post.body, url: `${location.origin}/?post=${post.id}` };
                if (navigator.share) void navigator.share(shareData).catch(() => {});
                else void navigator.clipboard?.writeText(shareData.url).then(() => toast("链接已复制")).catch(() => toast("复制失败"));
              }}><Share2 size={20} /></button>
            </form>
          </div>
          {previewImage && detailImages[displayedImageIndex] && <div className="detail-image-preview" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setPreviewImage(false)}><button aria-label="关闭图片预览" onClick={() => setPreviewImage(false)}><X size={23} /></button><img src={detailImages[displayedImageIndex]} alt={post.title} onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "true"; event.currentTarget.src = "/image-not-loaded.svg"; } }} /></div>}
        </div>
      )}
      {authorProfile && (
        <PublicProfile
          id={authorProfile}
          layout={profileLayout}
          onClose={() => setAuthorProfile(null)}
          onSelectPost={(id) => {
            setAuthorProfile(null);
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
            setAuthorProfile(null);
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
              <button type="button" className="composer-preview-button" onClick={() => setComposerPanel("preview")}>预览</button>
            </header> : <button
              className="close"
              aria-label="关闭"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>}
            {modal === "report" ? (
              <div className="report-dialog">
                <div className="eyebrow">COMMUNITY / REPORT</div>
                <h2>举报内容</h2>
                <p>举报信息仅用于平台安全与人工复核，不会公开举报者身份。</p>
                <fieldset className="report-reasons"><legend>选择原因</legend>{REPORT_REASONS.map((reason) => <label key={reason} className={reportReason === reason ? "selected" : ""}><input type="radio" name="report-reason" value={reason} checked={reportReason === reason} onChange={() => setReportReason(reason)} />{reason}</label>)}</fieldset>
                <label className="report-note-label">补充说明 <span>选填</span><textarea value={reportNote} maxLength={300} onChange={(event) => setReportNote(event.target.value)} placeholder="可简要说明你认为不合适的部分" /></label>
                <button className="primary-button full" disabled={!reportReason || reportSubmitting} onClick={() => void submitContentReport()}>{reportSubmitting ? "正在提交…" : "提交举报"}</button>
              </div>
            ) : modal === "browsing" ? (
              <>
                <div className="eyebrow">BROWSING / PREFERENCES</div>
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
                <div className="eyebrow">YOUR INTERESTS</div>
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
                <div className="eyebrow">PREFERENCES</div>
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
                <div className="eyebrow">READING / APPEARANCE</div>
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
                {!composerEditingPublished && <section className="composer-channel-picker" role="group" aria-label="发布内容类型"><strong>发布到</strong><div>{([["community", "社区作品"], ["ai", "AI 空间"]] as const).map(([value, label]) => <button type="button" key={value} className={writeChannel === value ? "selected" : ""} aria-pressed={writeChannel === value} onClick={() => void switchComposerChannel(value)}>{label}</button>)}</div></section>}
                {writeChannel === "ai" && <section className="composer-ai-type"><label>AI 内容类型<ChoiceSelect label="AI 内容类型" value={writeContentType} onChange={(value) => setWriteContentType(value as AiContentType)} options={([["knowledge_article", "AI 知识文章"], ["agent", "Agent 智能体"], ["skill", "Skills 技能"], ["prompt", "Prompt 提示词"], ["ai_tool", "AI 工具"], ["tutorial", "实战教程"]] as const).map(([value,label]) => ({value,label}))}/></label><small>{writeContentType === "knowledge_article" ? "使用标准图文文章格式，支持 Markdown。" : "按类型填写结构化字段；发布后由管理员审核，并保留已发布版本。"}</small></section>}
                <ComposerTextEditor title={title} body={body} error={composerValidation} onTitle={changeComposerTitle} onBody={changeComposerBody}/>
                {writeChannel === "ai" && AI_EDITOR_FIELDS[writeContentType].length > 0 && <section className="composer-ai-resource-fields" aria-label="AI 资源信息"><div className="composer-section-heading"><span><strong>资源信息</strong><small>代码、安装命令和 Prompt 仅展示与复制，不会在服务器执行</small></span><span>{AI_EDITOR_FIELDS[writeContentType].filter((field) => field.required).length} 项必填</span></div>{AI_EDITOR_FIELDS[writeContentType].map((field) => <label key={field.key}>{field.label}{field.required && <i>必填</i>}{field.multiline ? <textarea value={aiResourceFields[field.key] || ""} maxLength={12000} onChange={(event) => setAiResourceFields((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.hint} rows={field.key === "prompt" || field.key === "installation" || field.key === "steps" ? 6 : 3}/> : <input type={field.key.endsWith("_url") ? "url" : "text"} value={aiResourceFields[field.key] || ""} maxLength={1200} onChange={(event) => setAiResourceFields((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.hint}/>}</label>)}</section>}
                <section className="composer-media-picker" aria-label="选择图片或视频">
                  <div className="composer-media-choices" role="group" aria-label="媒体类型">
                    <label className={`composer-media-choice${composerImages.length ? " selected" : ""}${composerVideo || composerImages.length >= 9 ? " disabled" : ""}`}>
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploadingImages || Boolean(composerVideo) || composerImages.length >= 9} onChange={(event) => { void chooseComposerImages(event.target.files); event.currentTarget.value = ""; }} />
                      <span className="composer-media-choice-icon"><ImagePlus size={20}/></span>
                      <span className="composer-media-choice-copy"><strong>图片</strong><small>{composerImages.length >= 9 ? "已达最多 9 张" : composerImages.length ? `已选 ${composerImages.length}/9 张 · 点此继续添加` : "JPG、PNG、WebP · 最多 9 张"}</small></span>
                      <span className="composer-media-choice-mark">{composerImages.length ? `${composerImages.length}/9` : "选择"}</span>
                    </label>
                    {VIDEO_UPLOAD_BETA_ENABLED && <label className={`composer-media-choice video${composerVideo ? " selected" : ""}${composerImages.length ? " disabled" : ""}`}>
                      <input type="file" accept="video/mp4,video/webm" disabled={Boolean(composerImages.length)} onChange={(event) => { chooseComposerVideo(event.target.files?.[0] || null); event.currentTarget.value = ""; }}/>
                      <span className="composer-media-choice-icon"><VideoIcon size={20}/></span>
                      <span className="composer-media-choice-copy"><strong>视频 <i>Beta</i></strong><small>MP4、WebM · 最大 50 MB</small></span>
                      <span className="composer-media-choice-mark">{composerVideo ? "已选" : "选择"}</span>
                    </label>}
                  </div>
                  <p className="composer-media-hint">{VIDEO_UPLOAD_BETA_ENABLED ? "图片与视频可选其一 · 视频 Beta 最大 50 MB" : "最多 9 张图片 · 自动优化上传"}</p>
                  {composerVideo && <section className="composer-video-section" aria-label="视频 Beta" aria-busy={composerVideo.status === "compressing" || composerVideo.status === "uploading"}>
                    <div className="composer-video-card">
                      <video src={composerVideo.url || undefined} controls playsInline preload="metadata" aria-label="视频预览" />
                      <div className="composer-video-info"><strong>{composerVideo.name}</strong><small>{composerVideo.status === "compressing" ? `正在优化视频 ${composerVideo.compressionProgress || 0}%` : composerVideo.status === "failed" ? "上传失败，重新发布可重试" : composerVideo.status === "uploading" ? `正在上传 ${composerVideo.progress}%` : composerVideo.size ? `${(composerVideo.size / 1024 / 1024).toFixed(1)} MB · ${composerVideo.compressionNote || (composerVideo.path ? "已同步到草稿" : "等待上传")}` : "已同步到草稿"}</small></div>
                      <button type="button" className="composer-video-remove" onClick={() => void removeComposerVideo()}>{composerVideo.status === "compressing" ? "取消" : "移除"}</button>
                      {(composerVideo.status === "compressing" || composerVideo.status === "uploading") && <progress max={100} value={composerVideo.status === "compressing" ? composerVideo.compressionProgress || 0 : composerVideo.progress} aria-label={composerVideo.status === "compressing" ? `视频优化 ${composerVideo.compressionProgress || 0}%` : `视频上传 ${composerVideo.progress}%`} />}
                    </div>
                  </section>}
                </section>
                {composerImages.length > 0 && <><ComposerMediaStrip images={composerImages} coverIndex={coverIndex} busy={isPublishing} onSelect={setComposerMediaId} onRetry={(id) => void retryComposerImage(id)} onMove={reorderComposerImages} onAdd={(files) => void chooseComposerImages(files)}/><p className="composer-media-tip">长按或拖动排序 · 点击图片管理封面</p></>}
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
                  <ChoiceSelect label={writeChannel === "ai" ? "AI 分类" : "分类"} value={writeTag} onChange={setWriteTag} options={(writeChannel === "ai" ? aiCategories.filter((item) => item.kind === "category").map((item) => item.name) : communityCategories).map((tag) => ({value:tag,label:tag}))}/>
                </label>
                {accountId && writeChannel === "community" && <label className="composer-series-field">加入作品系列<ChoiceSelect label="加入作品系列" value={writeSeriesId} onChange={setWriteSeriesId} options={[{value:"",label:"暂不加入系列"},...creatorSeries.map((series) => ({value:series.id,label:series.title}))]}/><small>系列可在「我的 → 作品管理」中创建和管理。</small></label>}
                <div className="composer-advanced">
                  <div className="composer-advanced-content">
                {writeChannel === "community" && <section className="composer-poll-editor" aria-label="添加投票">
                  <div className="composer-section-heading"><span><strong>互动投票</strong><small>给帖子增加一个单选问题，读者可查看实时结果</small></span><span>{pollQuestion.trim() ? "已添加" : "可选"}</span></div>
                  <input className="composer-poll-question" value={pollQuestion} maxLength={180} onChange={(event) => setPollQuestion(event.target.value)} placeholder="输入投票问题" aria-label="投票问题" />
                  <div className="composer-poll-options">{pollOptions.map((option, index) => <div key={index}><span>{index + 1}</span><input value={option} maxLength={80} onChange={(event) => setPollOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`选项 ${index + 1}`} aria-label={`投票选项 ${index + 1}`} />{pollOptions.length > 2 && <button type="button" aria-label={`删除选项 ${index + 1}`} onClick={() => setPollOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15}/></button>}</div>)}</div>
                  {pollOptions.length < 4 && <button type="button" className="composer-poll-add" onClick={() => setPollOptions((current) => [...current, ""])}><Plus size={14}/>添加选项</button>}
                </section>}
                <section className={`ai-workbench-demo${aiWorkbenchOpen ? " is-open" : ""}`} aria-label="AI 创作工作台">
                  <button type="button" className="ai-workbench-trigger" aria-expanded={aiWorkbenchOpen} onClick={() => setAiWorkbenchOpen((open) => !open)}><span><Sparkles size={17}/><strong>AI 创作工作台</strong><i>DEEPSEEK</i></span><small>{aiWorkbenchOpen ? "收起工作台" : "标题、提纲、润色与话题建议"}</small><ChevronDown size={17}/></button>
                  {aiWorkbenchOpen && <div className="ai-workbench-body"><div className="ai-workbench-modes">{([["outline", "生成提纲"], ["title", "标题建议"], ["polish", "润色正文"], ["topics", "推荐话题"]] as const).map(([mode, label]) => <button type="button" className={aiWorkbenchMode === mode ? "selected" : ""} key={mode} onClick={() => { setAiWorkbenchMode(mode); setAiWorkbenchOutput(""); setAiResultApplied(false); }}>{label}</button>)}</div><p className="ai-workbench-guidance">生成结果支持 Markdown 预览；采用前可先复制，应用后也能撤回。</p><button type="button" className="primary-button full ai-workbench-generate" disabled={aiWorkbenchBusy || (!title.trim() && !body.trim())} onClick={() => void generateAiWorkbench()}><Sparkles size={15}/>{aiWorkbenchBusy ? "DeepSeek 正在整理…" : "生成建议"}</button>{aiWorkbenchOutput && <><div className="ai-workbench-result"><small>DeepSeek 建议 · 未发布</small><MarkdownContent source={aiWorkbenchOutput} className="ai-workbench-markdown"/></div><div className="ai-workbench-result-actions"><button type="button" className="ai-workbench-apply" onClick={applyAiWorkbenchResult}>{aiWorkbenchMode === "title" ? "使用首条标题" : aiWorkbenchMode === "topics" ? "添加有效话题" : aiWorkbenchMode === "polish" ? "替换正文" : "插入写作提纲"}</button><button type="button" className="soft-button" onClick={() => void copyAiWorkbenchResult()}>复制</button>{aiResultApplied && <button type="button" className="soft-button" onClick={undoAiWorkbenchResult}>撤回</button>}</div></>}{!aiWorkbenchOutput && <div className="ai-workbench-placeholder">{aiWorkbenchMode === "title" ? "填写正文后，生成多个标题方向。" : aiWorkbenchMode === "outline" ? "从你的标题和正文素材中，整理文章结构。" : aiWorkbenchMode === "polish" ? "保留原意与语气，改善正文表达。" : "从内容主题中找出更贴合的社区话题。"}</div>}</div>}
                </section>
                  </div>
                </div>
</> : <article className="composer-preview detail-body"><small>{writeChannel === "ai" ? "AI 空间" : "社区作品"} · {writeTag}</small><h1>{title || "未填写标题"}</h1><div className="composer-preview-media">{[composerImages[coverIndex], ...composerImages.filter((_,index)=>index!==coverIndex)].filter(Boolean).map(image=><img key={image.id} src={image.url} alt="内容图片预览"/>)}{composerVideo && <video src={composerVideo.url || undefined} controls playsInline preload="metadata"/>}</div><MarkdownContent source={body} className="article"/>{writeChannel === "ai" && <AIResourceDetails preview postId="" contentType={writeContentType} resourceData={aiResourceFields} accountId={accountId} onLogin={()=>{}} onNotice={toast}/>}<div className="composer-preview-topics">{writeTopics.map(topic=><span key={topic}>#{topic}</span>)}</div>{pollQuestion.trim() && writeChannel === "community" && <section className="composer-preview-poll"><strong>{pollQuestion}</strong>{pollOptions.filter(option=>option.trim()).map((option,index)=><p key={index}>{option}</p>)}</section>}<p className="fineprint">创作预览 · 提交后进入人工审核</p></article>}
            </ComposerSheet>}
            {modal === "write" && composerMediaId && (() => { const index=composerImages.findIndex(image=>image.id===composerMediaId); const image=composerImages[index]; return image ? <ComposerSheet title="图片管理" full onClose={()=>setComposerMediaId(null)}><div className="composer-media-preview"><img src={image.url} alt={`第 ${index+1} 张图片预览`}/><div className="composer-media-actions"><button type="button" onClick={()=>setCoverIndex(index)}>{coverIndex===index ? "当前封面" : "设为封面"}</button><button type="button" disabled={index===0} onClick={()=>moveComposerImage(index,-1)}>前移</button><button type="button" disabled={index===composerImages.length-1} onClick={()=>moveComposerImage(index,1)}>后移</button><label>替换图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{void replaceComposerImage(image.id,event.target.files?.[0]);event.currentTarget.value="";}}/></label><button type="button" disabled={draftSaving || uploadingImages} onClick={async()=>{await removeComposerImage(index);setComposerMediaId(null);}}>删除</button></div></div></ComposerSheet> : null; })()}
            {modal === "write" && <footer className="composer-footer"><span><strong role="status">{composerMediaLoadFailed ? "附件列表读取失败" : draftSyncError || (draftSaving ? "正在同步…" : draftCloudSynced ? "已同步至账号" : draftSaved ? "已保存至此设备" : "自动保存草稿")}</strong>{composerMediaLoadFailed && <button type="button" className="composer-save-retry" disabled={uploadingImages} onClick={()=>void reloadComposerMedia()}>重试读取附件</button>}{draftSyncError && <button type="button" className="composer-save-retry" onClick={()=>setDraftRetry(value=>value+1)}>重试保存</button>}<small>提交后进入人工审核</small></span><button className="primary-button" disabled={isPublishing || uploadingImages || draftSaving || composerImages.some((image) => image.status === "uploading") || composerVideo?.status === "uploading" || composerVideo?.status === "compressing"} onClick={publish}>{isPublishing ? "正在提交…" : composerVideo?.status === "compressing" ? `优化视频 ${composerVideo.compressionProgress || 0}%` : composerVideo?.status === "uploading" ? `上传视频 ${composerVideo.progress}%` : uploadingImages || composerImages.some((image) => image.status === "uploading") ? "正在上传图片…" : composerEditingPublished ? "保存修改" : "发布内容"}</button></footer>}
          </div>
        </div>
      )}
      {notice && <NoticeBanner key={notice.id} notice={notice} leaving={noticeLeaving} expanded={noticeExpanded} onExpand={expandNotice} onDismiss={dismissNotice} />}
    </main>
  );
}
