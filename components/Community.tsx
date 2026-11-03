"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Home,
  Compass,
  UserRound,
  Bookmark,
  ArrowLeft,
  Search,
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
} from "lucide-react";
import dynamic from "next/dynamic";
const Messages = dynamic(() => import("./Messages"), {
  loading: () => <div className="empty">正在加载消息…</div>,
});
const AdminModeration = dynamic(() => import("./AdminModeration"), {
  loading: () => <div className="empty">正在加载审核队列…</div>,
});
import EditorialArticle from "./EditorialArticle";
const AccountProfile = dynamic(() => import("./AccountProfile"), { loading: () => <div className="empty">正在加载…</div> });
import type { ProfileDetails } from "./AccountProfile";
const PublicProfile = dynamic(() => import("./PublicProfile"), { loading: () => <div className="empty">正在加载…</div> });
const MessagingPreferences = dynamic(() => import("./MessagingPreferences"), { loading: () => <div className="empty">正在加载…</div> });
import InboxBadge from "./InboxBadge";
const DailyMissions = dynamic(() => import("./DailyMissions"), { loading: () => <div className="empty">正在加载…</div> });
const NotificationCenter = dynamic(() => import("./NotificationCenter"), { loading: () => <div className="empty">正在加载…</div> });
const CoExplore = dynamic(() => import("./CoExplore"), { loading: () => <div className="empty">正在加载…</div> });
const SharedCollection = dynamic(() => import("./SharedCollection"), { loading: () => <div className="empty">正在加载…</div> });
const CardChainPanel = dynamic(() => import("./ExplorationFeatures").then((module) => module.CardChainPanel));
const ExplorationRecap = dynamic(() => import("./ExplorationFeatures").then((module) => module.ExplorationRecap));
import type { User } from "@supabase/supabase-js";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import { browserDb } from "@/lib/browser-db";
import { clearDraftFiles, loadDraftFiles, saveDraftFiles } from "@/lib/draft-files";
import { validateComposerFiles } from "@/lib/composer-validation";
import { compressUploadImage } from "@/lib/image-compression";
import type { TopicSummary } from "@/lib/topics";
import { tags, dayKey, coverColor, type Post } from "@/lib/content";
import { dailyCandidates, openDailyCard } from "@/lib/daily";
import { rankRecommendations, type CommunityRating } from "@/lib/recommendations";
import { cardRarity, cardRarityLabel, cardRarityTier, EXPERIENCE_LEVELS, experienceProgress, type CardRarityTier } from "@/lib/progression";
import { REPORT_REASONS } from "@/lib/report-validation";
import { userMessage } from "@/lib/user-message";

const FLIP_RAIN_PARTICLES = 112;
const FLIP_RAIN_DURATION_MIN_MS = 2900;
const FLIP_RAIN_DURATION_SPREAD_MS = 900;
const FLIP_RAIN_LEAD_MS = 240;
const FLIP_RAIN_STAGGER_WINDOW_MS = 900;
const FLIP_RAIN_JITTER_MS = 90;
const FLIP_RAIN_CLEANUP_MS = FLIP_RAIN_LEAD_MS + FLIP_RAIN_STAGGER_WINDOW_MS + FLIP_RAIN_JITTER_MS + FLIP_RAIN_DURATION_MIN_MS + FLIP_RAIN_DURATION_SPREAD_MS + 180;
const RATING_COLORS = ["#ff5d78", "#ff9452", "#edbd36", "#65b95e", "#34aeb5"];

type Comment = {
  id: number;
  cloudId?: string;
  authorId?: string;
  name?: string;
  avatar?: string;
  post: number;
  body: string;
  parent?: number;
  time: number;
  likes: number;
  liked?: boolean;
};
type ComposerImage = { id: string; file?: File; path?: string; url: string; status: "ready" | "uploading" | "failed"; sortOrder?: number; external?: boolean };
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
const membershipPlans = [
  { id: "plus", name: "Plus", price: 12, dailyFlips: 9 },
  { id: "pro", name: "Pro", price: 16, dailyFlips: 13 },
] as const;
const extraFlipPacks = [3, 5, 10] as const;
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
  const [bottomNavStyle, setBottomNavStyle] = useState<"glass" | "fixed">("fixed");
  const [bottomNavStyleReady, setBottomNavStyleReady] = useState(false);
  const [detailTransition, setDetailTransition] = useState<"image-zoom" | "blur-rise">("image-zoom");
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
    if (savedBottomNavStyle === "glass" || savedBottomNavStyle === "fixed")
      setBottomNavStyle(savedBottomNavStyle);
    setBottomNavStyleReady(true);
    const savedDetailTransition = localStorage.getItem("heika-detail-transition");
    if (savedDetailTransition === "image-zoom" || savedDetailTransition === "blur-rise")
      setDetailTransition(savedDetailTransition);
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
    viewerStageRef = useRef<HTMLDivElement | null>(null),
    loadMoreRef = useRef<HTMLDivElement | null>(null),
    scrollPositions = useRef<Record<string, number>>({});
  const sharedPostHandled = useRef<string | null>(null);
  const [authorProfile, setAuthorProfile] = useState<string | null>(null);
  const [publicBookmarks, setPublicBookmarks] = useState(false);
  const [publicBookmarksLoaded, setPublicBookmarksLoaded] = useState(false);
  const [bookmarkVisibilityBusy, setBookmarkVisibilityBusy] = useState(false);
  const [messagePeer, setMessagePeer] = useState<string | null>(null);
  const [chatConversationOpen, setChatConversationOpen] = useState(false);
  const [storageKey, setStorageKey] = useState("heika-demo-v1");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
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
  const [selectedPlan, setSelectedPlan] = useState<"plus" | "pro" | null>(null);
  const [selectedFlipPack, setSelectedFlipPack] = useState<number | null>(null);
  const [extraPacksOpen, setExtraPacksOpen] = useState(false);
  const [subscriptionRulesOpen, setSubscriptionRulesOpen] = useState(false);
  const luckyRewardTimer = useRef<number | null>(null);
  const rarityRevealTimer = useRef<number | null>(null);
  const flipRainTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const noticeExitTimer = useRef<number | null>(null);
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
    [feedError, setFeedError] = useState(""),
    [feedPage, setFeedPage] = useState(0),
    [feedTotal, setFeedTotal] = useState(0),
    [feedHasMore, setFeedHasMore] = useState(false),
    [feedLoading, setFeedLoading] = useState(false),
    [feedLoadedTag, setFeedLoadedTag] = useState<string | null>(null),
    publicFeedLoading = useRef(false),
    feedController = useRef<AbortController | null>(null),
    loadedRatingIds = useRef(new Set<number>()),
    detailSource = useRef<"today" | "discover">("today");
  const [feedLoadedSort, setFeedLoadedSort] = useState<string | null>(null);
  const [favoriteSource, setFavoriteSource] = useState("全部"),
    [mineSection, setMineSection] = useState<"works" | "favorites" | "liked" | "calendar" | "recent" | "rarity">("works"),
    [settingsDetail, setSettingsDetailState] = useState<"theme" | "font" | "bottomNav" | "discoverLayout" | "profileLayout" | "homeMode" | "reading" | "detailTransition" | "notifications" | "profile" | "interests" | "security" | "membership" | "progression" | "creator" | null>(null),
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
  const [explorationCalendarOpen, setExplorationCalendarOpen] = useState(false);
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
    [detailReady, setDetailReady] = useState(false),
    [transitionPhase, setTransitionPhase] = useState<
      "opening" | "closing" | null
    >(null),
    [justFlippedId, setJustFlippedId] = useState<number | null>(null),
    [category, setCategory] = useState("全部"),
    [searchDraft, setSearchDraft] = useState(""),
    [searchTerm, setSearchTerm] = useState(""),
    [searchKind, setSearchKind] = useState<"content" | "people">("content"),
    [searchPeople, setSearchPeople] = useState<SearchPerson[]>([]),
    [searchPosts, setSearchPosts] = useState<Post[]>([]),
    [searchTotal, setSearchTotal] = useState(0),
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
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [aiWorkbenchOpen, setAiWorkbenchOpen] = useState(false),
    [aiWorkbenchMode, setAiWorkbenchMode] = useState<"title" | "outline" | "polish" | "topics">("outline"),
    [aiWorkbenchOutput, setAiWorkbenchOutput] = useState(""),
    [aiWorkbenchBusy, setAiWorkbenchBusy] = useState(false),
    [writeTag, setWriteTag] = useState<string>(tags[0]),
    [writeTopics, setWriteTopics] = useState<string[]>([]),
    [writeSeriesId, setWriteSeriesId] = useState(""),
    [topicSearch, setTopicSearch] = useState(""),
    [topicChoices, setTopicChoices] = useState<TopicSummary[]>([]),
    [creatingTopic, setCreatingTopic] = useState(false),
    [composerImages, setComposerImages] = useState<ComposerImage[]>([]),
    [uploadingImages, setUploadingImages] = useState(false),
    [coverIndex, setCoverIndex] = useState(0),
    [draftSaved, setDraftSaved] = useState(false),
    [composerEditingPublished, setComposerEditingPublished] = useState(false),
    [draftSaving, setDraftSaving] = useState(false),
    [topicSummary, setTopicSummary] = useState<TopicSummary | null>(null),
    [topicPosts, setTopicPosts] = useState<Post[]>([]),
    [topicPage, setTopicPage] = useState(1),
    [topicTotal, setTopicTotal] = useState(0),
    [topicLoading, setTopicLoading] = useState(false),
    [topicReturnPostId, setTopicReturnPostId] = useState<number | null>(null),
    [topicReturnTab, setTopicReturnTab] = useState("discover"),
    [editing, setEditing] = useState<number | null>(null),
    [notice, setNotice] = useState(""),
    [noticeId, setNoticeId] = useState(0),
    [noticeLeaving, setNoticeLeaving] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  const modalCloseTimer = useRef<number | null>(null);
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
      startViewTransition?: (callback: () => void) => unknown;
    };
    if (transitionDocument.startViewTransition) transitionDocument.startViewTransition(updatePage);
    else updatePage();
  };
  const setTab = (next: string) => {
    if (next === tab) return;
    if (next === "messages") setMessagesTabVisited(true);
    startPageTransition(() => setTabState(next));
  };
  const openSearch = () => {
    setSearchReturnTab(tab);
    setSearchDraft(searchTerm);
    setTab("search");
  };
  const openNotifications = () => { setSecondaryReturnTab("messages"); setTab("notifications"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const openCoExplore = () => { setSecondaryReturnTab("mine"); setTab("co-explore"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
  const openMineFeature = (feature: "monthly-recap" | "card-chain") => { scrollPositions.current.mine = window.scrollY; setSecondaryReturnTab("mine"); setTab(feature); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); };
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
    setSearchPosts([]);
    setSearchPeople([]);
    setSearchTotal(0);
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
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentOffset, setCommentOffset] = useState(0);
  const [commentHasMore, setCommentHasMore] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const commentLikeBusy = useRef(new Set<number>());
  const [likeBusy, setLikeBusy] = useState(false);
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
  const [detailMoreOpen, setDetailMoreOpen] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastDraftPayload = useRef("");
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
  const memberFlipAllowance = membershipTier === "pro" ? 13 : membershipTier === "plus" ? 9 : 5;
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
    const controller = new AbortController();
    feedController.current = controller;
    publicFeedLoading.current = true;
    setFeedLoading(true);
    setFeedError("");
    const params = new URLSearchParams({ mode: "discover", page: String(requestedPage), limit: "50" });
    if (requestedTag !== "全部") params.set("tag", requestedTag);
    if (sort === "关注") params.set("following", "1");
    try {
      const response = await cloudFetch(`/api/demo/cards?${params}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error("内容加载失败");
      const payload = result.data;
      const items: Post[] | undefined = Array.isArray(payload) ? payload : payload?.items;
      if (!Array.isArray(items)) throw new Error("内容格式无效");
      if (controller.signal.aborted) return;
      setPublicFeed((current) => reset ? items : [...current, ...items.filter((item) => !current.some((old) => old.id === item.id))]);
      const total = Array.isArray(payload) ? items.length : Number(payload.total) || 0;
      setFeedTotal(Math.min(total, 50));
      setFeedPage(requestedPage);
      setFeedHasMore(false);
      setFeedLoadedTag(requestedTag);
      setFeedLoadedSort(sort);
      setPage((current) => reset ? 12 : current + items.length);
    } catch {
      if (!controller.signal.aborted) setFeedError("内容加载失败，请重试");
    } finally {
      if (feedController.current === controller) {
        publicFeedLoading.current = false;
        setFeedLoading(false);
      }
    }
  }, [category, sort]);
  useEffect(() => {
    if (!ready || tab !== "discover") return;
    const wantedTag = category;
    if (feedLoadedTag === wantedTag && feedLoadedSort === sort && (publicFeed.length || feedPage > 0)) return;
    void loadPublicFeed(1, true, wantedTag);
  }, [ready, tab, category, sort, feedLoadedTag, feedLoadedSort, publicFeed.length, feedPage, loadPublicFeed]);
  useEffect(() => {
    if (tab !== "discover") return;
    let active = true;
    void cloudFetch("/api/v1/topic-events", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      if (active && Array.isArray(result.data?.items)) setTopicEvents(result.data.items as TopicEvent[]);
    }).catch(() => {});
    return () => { active = false; };
  }, [tab]);
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
    const url = `/api/v1/search?q=${encodeURIComponent(searchTerm)}&kind=${searchKind}&page=${searchPage}&limit=12`;
    void fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.data?.items)) throw new Error(result.error || "搜索失败，请重试");
        const items = result.data.items as (Post | SearchPerson)[];
        setSearchTotal(result.data.total || 0);
        if (searchKind === "content") {
          setSearchPosts((current) => searchPage === 1 ? items as Post[] : [...current, ...(items as Post[])]);
        } else {
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
  const openSettingsDetail = (detail: "theme" | "font" | "bottomNav" | "discoverLayout" | "profileLayout" | "homeMode" | "reading" | "detailTransition" | "notifications" | "profile" | "interests" | "security" | "membership" | "progression", returnTab: "settings" | "mine" = "settings") => {
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
  const updateBookmarkVisibility = (value: boolean) => {
    if (!accountId) {
      toast("登录后可管理收藏公开状态");
      setTab("messages");
      return;
    }
    const previous = publicBookmarks;
    setPublicBookmarks(value);
    setPublicBookmarksLoaded(true);
    setBookmarkVisibilityBusy(true);
    void cloudRequest("/api/v1/me", { show_bookmarks: value }, "PATCH")
      .catch(() => {
        setPublicBookmarks(previous);
        toast("收藏公开状态保存失败，请重试");
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
    if (!window.confirm(`删除“${collection.name}”？其中的内容会回到未分类收藏。`)) return;
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
      catch { window.prompt("复制这个协作分享链接", url); }
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
  }, [tab, accountId]);
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
        if (error) toast("本地已保存，云端同步失败");
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
  const toast = (msg: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    if (noticeExitTimer.current !== null) window.clearTimeout(noticeExitTimer.current);
    noticeTimer.current = null;
    noticeExitTimer.current = null;
    setNoticeLeaving(false);
    setNoticeId((id) => id + 1);
    setNotice(userMessage(msg));
    noticeTimer.current = window.setTimeout(() => {
      setNoticeLeaving(true);
      noticeExitTimer.current = window.setTimeout(() => {
        setNotice("");
        setNoticeLeaving(false);
        noticeExitTimer.current = null;
        noticeTimer.current = null;
      }, 330);
    }, 2700);
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
      setState({ ...initial, cardIds: state.cardIds });
      setPublicBookmarks(false);
      setPublicBookmarksLoaded(true);
      setTheme("dark");
      setFontChoice("oppo");
      setBottomNavStyle("fixed");
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
        if (response.ok && result.data) setPublicFeed((current) => current.some((post) => post.id === id) ? current : [result.data as Post, ...current]);
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
    const duration = usesImageZoom ? (opening ? 320 : 240) : (opening ? 240 : 190);
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
              { opacity: .84, filter: "blur(3px)", transform: "translate3d(0,8px,0)" },
              { opacity: 1, filter: "blur(0)", transform: "translate3d(0,0,0)" },
            ]
          : [
              { opacity: 1, filter: "blur(0)", transform: "translate3d(0,0,0)" },
              { opacity: .84, filter: "blur(2px)", transform: "translate3d(0,6px,0)" },
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
    if (state.notifications[key]) {
      update((s) => ({
        ...s,
        notifications: { ...s.notifications, [key]: false },
      }));
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
  };
  const clearTodayFlips = () => {
    if (!opened.length) return toast("今天还没有翻开的卡片");
    if (!confirm("清除今天的翻卡记录？这些卡片会重新锁定。")) return;
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
      if (reply) setExpandedReplies((current) => ({ ...current, [reply]: true }));
      setDraft("");
      setReply(undefined);
      toast("评论已发布");
      if (reply) requestAnimationFrame(() => document.getElementById(`comment-${reply}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "评论保存失败");
    } finally {
      setCommentSending(false);
    }
  };
  const deleteOwn = async (p: Post) => {
    if (!confirm("确定删除这篇内容？")) return;
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
    if (!confirm("删除这条评论？")) return;
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
      await cloudRequest(`/api/v1/posts/${postId}/media`, { path: image.path, sort_order: sortOrder });
      return { ...image, sortOrder };
    }
    if (!image.file || !accountId) throw new Error("登录后可同步草稿图片");
    const db = await browserDb(); const { data: session } = await db.auth.getSession();
    if (!session.session) throw new Error("登录状态已失效，请重新登录");
    const form = new FormData(); form.set("file", image.file); form.set("post_id", postId); form.set("sort_order", String(sortOrder)); form.set("upload_id", image.id);
    const response = await fetch("/api/v1/media", { method: "POST", headers: { Authorization: `Bearer ${session.session.access_token}` }, body: form });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "图片上传失败");
    return { ...image, path: result.data.path, status: "ready", sortOrder };
  };
  const publish = async () => {
    if (!title.trim() || !body.trim()) return toast("请填写标题和正文");
    if (!accountId) return toast("请先在消息页面登录，当前输入会保留");
    if (composerImages.some((image) => image.status === "uploading" || draftMediaBusy.current.has(image.id))) return toast("图片正在同步，请稍后发布");
    try {
      const old = state.own.find((p) => p.id === editing);
      const draft = composerEditingPublished && old?.cloudId ? old : await cloudRequest("/api/v1/library-state", { action: "draft", id: old?.cloudId, title, body, tag: writeTag, topics: writeTopics, seriesId: writeSeriesId || null, coverUrl: composerImages[coverIndex]?.external ? composerImages[coverIndex].url : null }) as Post | null;
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
      setUploadingImages(false);
      const item = await cloudRequest("/api/v1/library-state", {
        action: "publish",
        id: draft.id,
        title,
        body,
        tag: writeTag,
        topics: writeTopics,
        seriesId: writeSeriesId || null,
        mediaPaths: uploaded.map((image) => image.path!),
        coverUrl: cover?.external ? cover.url : null,
      });
      if (!item) return;
      update((s) => ({
        ...s,
        own: [
          item,
          ...s.own.filter((p) => p.id !== editing && p.id !== item.id),
        ],
        cardIds: item.status === "published" ? [...new Set([...s.cardIds, item.id])] : s.cardIds,
      }));
      setPublicFeed((s) => item.status === "published" ? [item, ...s.filter((p) => p.id !== item.id)] : s.filter((p) => p.id !== item.id));
      setModal(null);
      setTitle("");
      setBody("");
      composerImages.forEach((image) => { if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url); });
      setComposerImages([]);
      setCoverIndex(0);
      setEditing(null);
      setComposerEditingPublished(false);
      const owner = accountId || "guest";
      localStorage.removeItem(`heika-compose-${owner}`);
      await clearDraftFiles(owner).catch(() => {});
      if (accountId) { localStorage.removeItem("heika-compose-guest"); await clearDraftFiles("guest").catch(() => {}); }
      toast("内容已提交人工审核，通过后将公开展示");
    } catch (e) {
      setUploadingImages(false);
      toast(e instanceof Error ? e.message : "发布失败，请重试");
    }
  };
  const openComposer = async (post?: Post) => {
    const stored = !post ? state.own.find((item) => item.status === "draft") : undefined;
    const initialPost = post || stored;
    setEditing(initialPost?.id ?? null);
    setComposerEditingPublished(Boolean(post && post.status !== "draft"));
    setTitle(initialPost?.title || "");
    setBody(initialPost?.body || "");
    setWriteTag(initialPost?.tag || tags[0]);
    setWriteTopics(initialPost?.topics?.length ? initialPost.topics : initialPost?.tag ? [initialPost.tag] : [tags[0]]);
    setWriteSeriesId(initialPost?.seriesId || "");
    setTopicSearch("");
    setComposerImages([]);
    setCoverIndex(0);
    lastDraftPayload.current = "";
    if (initialPost?.cloudId) {
      try {
        const data = await cloudRequest(`/api/v1/posts/${initialPost.cloudId}`) as { post_media?: { storage_path: string; sort_order: number }[] } | null;
        if (data?.post_media?.length) {
          const db = await browserDb();
          const images = await Promise.all(data.post_media.sort((a,b) => a.sort_order-b.sort_order).map(async (item, index) => {
            const signed = await db.storage.from("post-covers").createSignedUrl(item.storage_path, 3600);
            return signed.data?.signedUrl ? { id: `saved-${index}-${item.storage_path}`, path: item.storage_path, url: signed.data.signedUrl, status: "ready" as const, sortOrder: index } : null;
          }));
          const external = initialPost.image ? [{ id: "legacy-cover", url: initialPost.image, status: "ready" as const, external: true }] : [];
          setComposerImages([...external, ...images.filter((image): image is NonNullable<typeof image> => Boolean(image))]);
        }
      } catch { toast("已恢复草稿文字，图片列表暂时无法读取"); }
    }
    const owner = accountId || "guest";
    if (!initialPost || initialPost.status === "draft") {
      try {
        const ownRaw = localStorage.getItem(`heika-compose-${owner}`);
        const raw = ownRaw || (accountId ? localStorage.getItem("heika-compose-guest") : null);
        const fileOwner = ownRaw || !accountId ? owner : "guest";
        if (raw) {
          const saved = JSON.parse(raw) as { title?: string; body?: string; tag?: string; topics?: string[]; seriesId?: string | null; coverIndex?: number; images?: { id: string; path?: string; url?: string; external?: boolean }[] };
          setTitle(saved.title || "");
          setBody(saved.body || "");
          setWriteTag(saved.tag || tags[0]);
          setWriteTopics(saved.topics || [saved.tag || tags[0]]);
          setWriteSeriesId(saved.seriesId || "");
          if (saved.images?.length) {
            const db = await browserDb();
            const files = await loadDraftFiles(fileOwner);
              const restored = await Promise.all(saved.images.map(async (image, index) => {
              if (image.path) {
                const { data } = await db.storage.from("post-covers").createSignedUrl(image.path, 3600);
                if (data?.signedUrl) return { id: image.id, path: image.path, url: data.signedUrl, status: "ready" as const, sortOrder: index };
                const file = files.find((item) => item.id === image.id)?.file;
                return file ? { id: image.id, file, url: URL.createObjectURL(file), status: "ready" as const, sortOrder: index } : null;
              }
              if (image.external && image.url) return { id: image.id, url: image.url, status: "ready" as const, external: true };
              const file = files.find((item) => item.id === image.id)?.file;
              if (file) return { id: image.id, file, url: URL.createObjectURL(file), status: "ready" as const };
              return null;
            }));
            setComposerImages(restored.filter((image): image is NonNullable<typeof image> => Boolean(image?.url)));
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
    const timer = window.setTimeout(() => {
      if (!title && !body && !composerImages.length) return;
      const persist = async () => {
        const owner = accountId || "guest";
        await saveDraftFiles(owner, composerImages.map(({ id, file }) => ({ id, file })));
        const draftData = { title, body, tag: writeTag, topics: writeTopics, seriesId: writeSeriesId || null, coverIndex, images: composerImages.map(({ id, path, url, external }) => ({ id, path, url, external })), savedAt: Date.now() };
        localStorage.setItem(`heika-compose-${owner}`, JSON.stringify(draftData)); setDraftSaved(true);
        if (accountId && !composerEditingPublished) {
          const signature = JSON.stringify({ accountId, title, body, writeTag, writeTopics, writeSeriesId, coverIndex });
          let cloudDraft = state.own.find((item) => item.id === editing && item.status === "draft");
          if (lastDraftPayload.current !== signature || !cloudDraft) {
            lastDraftPayload.current = signature; setDraftSaving(true);
            try {
              const cover = composerImages[coverIndex];
              const saved = await cloudRequest("/api/v1/library-state", { action: "draft", id: cloudDraft?.cloudId, title, body, tag: writeTag, topics: writeTopics, seriesId: writeSeriesId || null, coverUrl: cover?.external ? cover.url : null }) as Post | null;
              if (saved) { cloudDraft = saved; setEditing(saved.id); update((current) => ({ ...current, own: [saved, ...current.own.filter((item) => item.id !== saved.id)] })); }
            } catch { setDraftSaved(false); toast("云端草稿保存失败，已保留本机草稿"); }
            finally { setDraftSaving(false); }
          }
          if (cloudDraft?.cloudId) {
            const cover = composerImages[coverIndex];
            const storageImages = composerImages.filter((image) => !image.external);
            const ordered = cover?.external ? storageImages : storageImages.length ? [storageImages.find((image) => image.id === cover?.id), ...storageImages.filter((image) => image.id !== cover?.id)].filter((image): image is ComposerImage => Boolean(image)) : [];
            for (const [index, image] of ordered.entries()) {
              if (image.external) continue;
              const needsUpload = Boolean(image.file && !image.path);
              const needsReorder = Boolean(image.path && image.sortOrder !== index);
              if ((!needsUpload && !needsReorder) || image.status === "failed" || draftMediaBusy.current.has(image.id)) continue;
              draftMediaBusy.current.add(image.id);
              setComposerImages((items) => items.map((item) => item.id === image.id ? { ...item, status: "uploading" } : item));
              try {
                const synced = await uploadImageToPost(image, cloudDraft.cloudId, index);
                setComposerImages((items) => items.map((item) => item.id === image.id ? synced : item));
              } catch (error) {
                setComposerImages((items) => items.map((item) => item.id === image.id ? { ...item, status: "failed" } : item));
                toast(error instanceof Error ? error.message : "图片上传失败，可重试");
              } finally { draftMediaBusy.current.delete(image.id); }
            }
          }
        }
      };
      void persist().catch(() => toast("本机草稿保存失败，请检查设备存储空间"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [modal, editing, accountId, title, body, writeTag, writeTopics, writeSeriesId, coverIndex, composerImages, composerEditingPublished]);
  const chooseComposerImages = async (files: FileList | null) => {
    if (!files?.length) return;
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
    if (image.path && old?.cloudId) {
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
    if (!image?.file || !accountId) return toast("登录后可重试图片上传");
    setUploadingImages(true);
    setComposerImages((items) => items.map((item) => item.id === imageId ? { ...item, status: "uploading" } : item));
    try {
      const old = state.own.find((item) => item.id === editing);
      const draft = composerEditingPublished && old?.cloudId ? old : await cloudRequest("/api/v1/library-state", { action: "draft", id: old?.cloudId, title, body, tag: writeTag }) as Post | null;
      if (!draft?.cloudId) throw new Error("草稿保存失败");
      const synced = await uploadImageToPost(image, draft.cloudId, composerImages.indexOf(image));
      setEditing(draft.id); update((current) => ({ ...current, own: [draft, ...current.own.filter((item) => item.id !== draft.id)] }));
      setComposerImages((items) => items.map((item) => item.id === imageId ? synced : item));
      toast("图片已上传");
    } catch (error) { setComposerImages((items) => items.map((item) => item.id === imageId ? { ...item, status: "failed" } : item)); toast(error instanceof Error ? error.message : "图片上传失败"); }
    finally { setUploadingImages(false); }
  };
  const discardComposerDraft = async () => {
    if (draftSaving || composerImages.some((image) => draftMediaBusy.current.has(image.id))) return toast("草稿正在同步，请稍后再删除");
    if (!confirm("删除这份草稿及其图片？此操作无法撤销。")) return;
    let old = state.own.find((item) => item.id === editing);
    if (accountId && !composerEditingPublished) {
      try {
        const draft = await cloudRequest("/api/v1/library-state", { action: "draft", id: old?.cloudId, title, body, tag: writeTag }) as Post | null;
        if (draft?.cloudId) {
          old = draft;
          for (const image of composerImages) if (image.file && !image.path) await cloudRequest("/api/v1/media", { upload_id: image.id, file_type: image.file.type, post_id: draft.cloudId }, "DELETE");
          await cloudRequest("/api/v1/library-state", { action: "delete", id: draft.id });
          update((current) => ({ ...current, own: current.own.filter((item) => item.id !== draft.id) }));
        }
      } catch (error) { toast(error instanceof Error ? error.message : "草稿删除失败"); return; }
    }
    const owner = accountId || "guest";
    localStorage.removeItem(`heika-compose-${owner}`); await clearDraftFiles(owner).catch(() => {});
    composerImages.forEach((image) => { if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url); });
    setComposerImages([]); setTitle(""); setBody(""); setEditing(null); setModal(null); toast("草稿已删除");
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
  useEffect(() => {
    const isDiscover = tab === "discover" && modal !== "write";
    if (!isDiscover && modal !== "write") return;
    let alive = true;
    const suffix = isDiscover ? "?featured=1" : topicSearch.trim() ? `?q=${encodeURIComponent(topicSearch.trim())}` : "";
    void cloudFetch(`/api/v1/topics${suffix}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "话题读取失败");
      if (alive && Array.isArray(result.data)) setTopicChoices(result.data as TopicSummary[]);
    }).catch(() => {
      if (alive) setTopicChoices(tags.map((name, index) => ({ id: index + 1, name, description: "", postCount: 0, participantCount: 0 })));
    });
    return () => { alive = false; };
  }, [tab, modal, topicSearch]);
  const createTopic = async () => {
    const name = topicSearch.trim().replace(/^#+/, "");
    if (!name) return;
    if (!accountId) return toast("登录后可以创建自定义话题");
    if (writeTopics.length >= 5) return toast("最多选择 5 个话题");
    setCreatingTopic(true);
    try {
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
    setAiWorkbenchBusy(true); setAiWorkbenchOutput("");
    try {
      const result = await cloudRequest("/api/v1/ai/workbench", { mode: aiWorkbenchMode, title, content: body, category: writeTag }) as { output: string };
      setAiWorkbenchOutput(result.output);
    } catch (error) { toast(error instanceof Error ? error.message : "AI 生成失败，请稍后重试"); }
    finally { setAiWorkbenchBusy(false); }
  };
  const secondaryTitle = modal === "write"
    ? "取消"
    : tab === "settings"
      ? settingsDetail ? settingsReturnTab === "mine" ? "我的" : "设置" : settingsPersonalOpen ? "设置" : "我的"
      : tab === "topic" ? "发现"
        : tab === "search" ? "搜索"
        : tab === "notifications" ? "通知"
        : tab === "co-explore" || tab === "monthly-recap" || tab === "card-chain" ? "我的"
        : tab === "shared-collection" ? "分享收藏夹"
        : tab === "about" || tab === "moderation" ? "设置"
          : tab === "debug" ? debugReturnTab === "settings" ? "设置" : "我的"
            : tab === "creator-center" || tab === "my-content" ? myContentReturnTab === "settings" ? "设置" : "我的"
            : null;
  const handleSecondaryBack = () => {
    if (modal === "write") { setModal(null); return; }
    if (tab === "settings" && settingsDetail) { closeSettingsDetail(); return; }
    if (tab === "settings" && settingsPersonalOpen) { setSettingsPersonalOpen(false); return; }
    if (tab === "settings") { setSettingsPersonalOpen(false); setTab("mine"); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.mine || 0, behavior: "instant" })); return; }
    if (tab === "topic") { closeTopicPage(); return; }
    if (tab === "search") { closeSearch(); return; }
    if (tab === "notifications" || tab === "co-explore" || tab === "shared-collection" || tab === "monthly-recap" || tab === "card-chain") { setTab(secondaryReturnTab); return; }
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
      const ranked = rankRecommendations(
      publicFeed.filter(
        (p) =>
          !state.dismissed?.includes(p.id) &&
          (category === "全部" || p.tag === category),
      ),
      state.interests,
      state.viewed,
      state.ratings,
      communityRatings,
      );
      if (sort === "关注") return ranked;
      if (sort === "最新") return ranked.sort((a, b) => b.date.localeCompare(a.date) || a.id - b.id);
      if (sort === "高分") return ranked.sort((a, b) => (communityRatings[b.id]?.average || 0) - (communityRatings[a.id]?.average || 0) || b.date.localeCompare(a.date));
      return ranked;
    },
    [
      publicFeed,
      category,
      state.dismissed,
      state.interests,
      state.viewed,
      state.ratings,
      communityRatings,
      sort,
    ],
  );
  const list = filtered.slice(0, page);
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
  const post = detail === null ? null : all.find((p) => p.id === detail);
  const detailImages = useMemo(() => post
    ? (post.images?.filter(Boolean).length ? post.images.filter(Boolean) : post.image ? [post.image] : [])
    : [], [post]);
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
  const postCard = (p: Post, source: "today" | "discover" = "discover", own = false) => {
    const rating = communityRatings[p.id];
    const rarityTier = p.rarityTier || (rating ? cardRarityTier(rating.average, rating.count) : "pending");
    const rarityLabel = rarityTier === "ordinary" ? "普通" : rarityTier === "pending" ? "待评级" : rarityTier;
    const coverImage = p.image || p.images?.find(Boolean);
    return <button
      className="post-card editorial-post"
      key={p.id}
      data-discover-id={p.id}
      onClick={(event) => own && p.status === "draft" ? void openComposer(p) : openPost(p.id, source, event.currentTarget)}
    >
      {coverImage && <div
        className="post-cover editorial-cover"
        style={{ background: coverColor(p.tag) }}
      >
        <img
            src={coverImage}
            alt=""
            loading="lazy"
            onError={(e) => {
              if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = "true"; e.currentTarget.src = "/image-not-loaded.svg"; }
            }}
          />
        <i className={`post-cover-rarity rarity-tier-${rarityTier}`} aria-label={`${rarityLabel}稀有度`}>{rarityLabel}</i>
        {p.cover && <span>{p.cover}</span>}
      </div>}
      <div className="post-meta">
        <small>{p.tag}</small>
        <b>{p.title}</b>
        <p className="post-summary">{p.body.slice(0, 100)}</p>
        {communityRatings[p.id]?.count ? <span className={`post-card-rarity rarity-${cardRarity(communityRatings[p.id].average, communityRatings[p.id].count).replaceAll(" ", "")}`}><Star size={11} fill="currentColor"/> {cardRarity(communityRatings[p.id].average, communityRatings[p.id].count)} · {communityRatings[p.id].average.toFixed(1)}</span> : null}
        <div>
          <span>{p.author}</span>
          <span>{own && p.status === "draft" ? "编辑草稿" : own && p.status === "pending_review" ? "审核中" : own && p.status === "hidden" ? "审核未通过" : state.saved.includes(p.id) ? "♥ 已收藏" : "阅读 ↗"}</span>
        </div>
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
      {feedError && (
        <button className="soft-button" onClick={() => void refreshFeed()}>
          {feedError}
        </button>
      )}
      {items.length ? (
        <div className={`masonry editorial-feed${state.discoverLayout === "single" ? " single-column" : ""}`}>
          {items.map((item) => postCard(item))}
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
      className={tab === id || (tab === "settings" && id === "mine") || ((tab === "topic" || tab === "shared-collection") && id === "discover") || ((tab === "co-explore" || tab === "monthly-recap" || tab === "card-chain") && id === "mine") || (tab === "notifications" && id === "messages") ? "active" : ""}
      onClick={() => {
        scrollPositions.current[tab] = window.scrollY;
        setTab(id);
        imageSwitchSequence.current += 1;
        setImageLoading(false);
        setDetail(null);
        setDetailReady(false);
        requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[id] || 0, behavior: "instant" }));
      }}
    >
      {id === "messages" && <><span className="sr-only">私聊</span><InboxBadge enabled={state.notifications.messages} /></>}
      <Icon size={21} strokeWidth={1.8} />
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
            setIsAdmin(false);
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
          setIsAdmin(false);
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
            const hasAdminAccess = data.profile?.role === "admin";
            setIsAdmin(hasAdminAccess);
            if (adminEntryPending.current) {
              adminEntryPending.current = false;
              if (hasAdminAccess) setTab("moderation");
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
  }, [ready]);
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
  return (
    <main className={`app${secondaryTitle ? " has-secondary-header" : ""}${isImmersive ? " app-immersive" : ""}`}>
      <header className={`topline${secondaryTitle ? " secondary-topline" : ""}`}>
        {secondaryTitle ? <button type="button" className="topline-back" onClick={handleSecondaryBack} aria-label={`返回，当前页面：${secondaryTitle}`}><ArrowLeft size={19}/><strong>{secondaryTitle}</strong></button> : <span className="brand">黑卡 <i>HEIKA</i></span>}
        <span className="demo-pill">
          {accountId ? "已登录 · 云端同步" : "访客探索 · 登录后同步"}
        </span>
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
              {searchDraft && <button type="button" aria-label="清除搜索词" onClick={() => { setSearchDraft(""); setSearchTerm(""); setSearchPosts([]); setSearchPeople([]); setSearchTotal(0); }}><X size={16}/></button>}
            </label>
            <button className="search-page-submit" type="submit" disabled={!searchDraft.trim()}>搜索</button>
          </form>
          {searchTerm ? <>
            <div className="search-result-toolbar">
              <div className="search-result-tabs" role="tablist" aria-label="搜索范围">
                {([ ["content", "内容"], ["people", "用户"] ] as const).map(([kind, label]) => <button key={kind} role="tab" aria-selected={searchKind === kind} className={searchKind === kind ? "selected" : ""} onClick={() => { setSearchKind(kind); setSearchPage(1); setSearchTotal(0); setSearchPosts([]); setSearchPeople([]); setSearchError(""); }}>{label}</button>)}
              </div>
              <small>{searchLoading && searchPage === 1 ? "正在搜索" : `${searchTotal} 条结果`}</small>
            </div>
            {searchError && <div className="search-state search-error"><span>{searchError}</span><button onClick={() => setSearchRetry((n) => n + 1)}>重试</button></div>}
            {searchKind === "content" ? <div className="search-post-results" role="tabpanel">
              {searchPosts.map((item) => <button className="search-post-result" key={item.id} onClick={(event) => openPost(item.id, "discover", event.currentTarget)}>
                <span className="search-post-thumbnail">{item.image && <img src={item.image} alt="" loading="lazy" onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "true"; event.currentTarget.src = "/image-not-loaded.svg"; } }}/>}<small>{item.tag}</small></span>
                <span className="search-post-copy"><strong>{item.title}</strong><span>{item.body.slice(0, 96)}</span><small>{item.author} · {item.date}</small></span>
                <ChevronRight size={17}/>
              </button>)}
              {!searchLoading && !searchError && !searchPosts.length && <div className="search-state">没有找到相关内容，试试更短的关键词。</div>}
              {searchLoading && searchPage === 1 && <div className="search-skeleton-list"><i/><i/><i/></div>}
              {searchPosts.length < searchTotal && <button className="search-more-button" disabled={searchLoading} onClick={() => setSearchPage((page) => page + 1)}>{searchLoading ? "正在加载…" : "加载更多内容"}</button>}
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
        <section className="page editorial-home">
          <button className="search search-launch" onClick={openSearch}><Search size={18}/><span>搜索内容或用户</span><kbd>⌕</kbd></button>
          <div className="discover-topic-list" aria-label="精选话题">
            {topicChoices.map((topic) => <button key={topic.id} className="discover-topic-chip" onClick={() => void openTopic(topic.name)}>#{topic.name}<small>{topic.postCount}</small></button>)}
          </div>
          <div className="filters editorial-filters">
            {["全部", ...tags].map((t) => (
              <button
                key={t}
                className={category === t ? "selected" : ""}
                onClick={() => {
                  setCategory(t);
                  setPublicFeed([]);
                  setFeedPage(0);
                  setFeedTotal(0);
                  setFeedHasMore(false);
                  setFeedLoadedTag(null);
                  setPage(12);
                }}
              >
                {t === "全部" ? "推荐" : t}
              </button>
            ))}
          </div>
          {topicEvents.length > 0 && <section className="topic-events-section" aria-labelledby="topic-events-title"><div className="topic-events-heading"><div><small>COMMUNITY / OPEN CALL</small><h2 id="topic-events-title">本期话题共创</h2></div><span>{topicEvents.length} 个进行中</span></div><div className="topic-event-list">{topicEvents.map((event) => <article className="topic-event-card" key={event.id}><div className="topic-event-mark">#{event.topic}</div><div className="topic-event-copy"><h3>{event.title}</h3><p>{event.description}</p><small>{event.participantCount} 人参与 · {event.postCount} 篇内容 · 截止 {new Date(event.ends_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></div><button type="button" className={event.joined ? "joined" : ""} onClick={() => void joinTopicEvent(event)}>{event.joined ? "继续创作" : "加入共创"}</button></article>)}</div></section>}
          <div className="discover-sort" role="group" aria-label="发现排序">
            {["精选", "最新", "高分", "关注"].map((option) => <button key={option} type="button" className={sort === option ? "selected" : ""} aria-pressed={sort === option} onClick={() => { if (sort !== option) { setPublicFeed([]); setFeedPage(0); setFeedTotal(0); setFeedLoadedTag(null); setFeedLoadedSort(null); setSort(option); } }}>{option === "精选" ? "为你推荐" : option === "高分" ? "高评分" : option}</button>)}
          </div>
          {sort === "关注" && !accountId && <p className="fineprint follow-feed-hint">登录并关注创作者后，这里会集中显示他们的新内容。</p>}
          {category === "全部" && latestOpenedPost && (
            <section className="recent-flip-section" aria-labelledby="recent-flip-title">
              <div className="recent-flip-heading">
                <div><small>RECENTLY REVEALED</small><h2 id="recent-flip-title">最近翻开的卡</h2></div>
                <span>随时回来继续阅读</span>
              </div>
              {renderCandidate(latestOpenedPost, -1, true)}
            </section>
          )}
          <div className="section-head editorial-section-head">
            <h2>{category === "全部" ? "为你推荐" : category}</h2>
            <span>{Math.min(50, Math.max(filtered.length, feedTotal))} 篇内容</span>
          </div>
          {feed(list)}
        </section>
      )}
      {tab === "co-explore" && <CoExplore accountId={accountId} posts={publicFeed.length ? publicFeed : all} onLogin={() => setTab("messages")} onNotice={toast}/>}
      {tab === "notifications" && <NotificationCenter accountId={accountId} onLogin={() => setTab("messages")} onOpenPost={(item) => {
        const post = item.post_id ? all.find((candidate) => candidate.cloudId === item.post_id || candidate.id.toString() === item.post_id) || item.post : item.post;
        if (post) { setPublicFeed((items) => items.some((candidate) => candidate.id === post.id) ? items : [post, ...items]); requestAnimationFrame(() => openPost(post.id, "discover")); } else toast("这篇内容暂时不可用");
      }}/ >}
      {tab === "shared-collection" && <SharedCollection code={sharedCollectionCode} accountId={accountId} onNotice={toast} onLogin={() => setTab("messages")} onOpenPost={(post) => {
        setPublicFeed((items) => items.some((item) => item.id === post.id) ? items : [post, ...items]);
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
          />
        </div>
      )}
      {tab === "settings" && settingsDetail === null && (
        <section className="page settings-page">
          <button className="back settings-back" onClick={() => {
            if (settingsPersonalOpen) { setSettingsPersonalOpen(false); return; }
            setSettingsPersonalOpen(false);
            setTab("mine");
            requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.mine || 0, behavior: "instant" }));
          }}><ArrowLeft size={18} /> 我的</button>
          <h1>{settingsPersonalOpen ? "个人设置" : "设置"}<span className="red-dot">.</span></h1>
          <p className="lead">{settingsPersonalOpen ? "按你的使用习惯调整黑卡体验。" : "选择要管理的设置模块。"}</p>
          {!settingsPersonalOpen && <div className="settings-category-list">
            <button className="settings-category-card" onClick={() => openSettingsDetail("security")}><span className="settings-category-icon"><ShieldCheck size={19}/></span><span><strong>安全中心</strong><small>隐私、私聊范围与账号安全</small></span><ChevronRight size={18}/></button>
            <button className="settings-category-card" onClick={() => setSettingsPersonalOpen(true)}><span className="settings-category-icon"><Settings size={19}/></span><span><strong>个人设置</strong><small>外观、浏览、阅读与通知偏好</small></span><ChevronRight size={18}/></button>
            <button className="settings-category-card" onClick={() => { setDebugReturnTab("settings"); setTab("debug"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); }}><span className="settings-category-icon"><RefreshCw size={18}/></span><span><strong>调试模式</strong><small>开发工具与重置体验</small></span><ChevronRight size={18}/></button>
            <button className="settings-category-card" onClick={() => openCreatorCenter("settings")}><span className="settings-category-icon"><Sparkles size={19}/></span><span><strong>创作者中心</strong><small>创作数据与成长任务</small></span><ChevronRight size={18}/></button>
            {isAdmin && <button className="settings-category-card" onClick={() => { setTab("moderation"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); }}><span className="settings-category-icon"><ShieldCheck size={18}/></span><span><strong>安全管理</strong><small>举报与内容审核</small></span><ChevronRight size={18}/></button>}
          </div>}
          {settingsPersonalOpen && <button type="button" className="back settings-back settings-category-back" onClick={() => setSettingsPersonalOpen(false)}><ArrowLeft size={18}/> 设置分类</button>}
          {settingsPersonalOpen && <>
          <div className="settings-module">
            <div className="settings-module-heading"><strong>外观</strong></div>
            <div className="settings-list">
              <button onClick={() => openSettingsDetail("theme")}><span>外观主题</span><small>{{dark:"深色",light:"浅色",system:"跟随系统"}[theme]}</small><ChevronRight size={16}/></button>
              <button onClick={() => openSettingsDetail("font")}><span>字体</span><small>{fontChoice === "oppo" ? "OPPO Sans 4.0" : "系统字体"}</small><ChevronRight size={16}/></button>
              <button onClick={() => openSettingsDetail("bottomNav")}><span>底部导航</span><small>{bottomNavStyle === "glass" ? "悬浮玻璃" : "固定底栏"}</small><ChevronRight size={16}/></button>
            </div>
          </div>
          <div className="settings-module">
            <div className="settings-module-heading"><strong>浏览与阅读</strong></div>
            <div className="settings-list">
              <button onClick={() => openSettingsDetail("homeMode")}><span>首页浏览模式</span><small>{state.homeMode === "waterfall" ? "瀑布流" : "黑卡"}</small><ChevronRight size={16}/></button>
              <button onClick={() => openSettingsDetail("reading")}><span>阅读模式</span><small>{{standard:"标准模式",focus:"沉浸模式",night:"夜间模式"}[state.readingMode]}</small><ChevronRight size={16}/></button>
              <button onClick={() => openSettingsDetail("detailTransition")}><span>详情过渡动画</span><small>{detailTransition === "image-zoom" ? "图片展开" : "轻微模糊上浮"}</small><ChevronRight size={16}/></button>
              <button onClick={() => openSettingsDetail("discoverLayout")}><span>发现页布局</span><small>{state.discoverLayout === "waterfall" ? "瀑布流" : "单列阅读"}</small><ChevronRight size={16}/></button>
              <button onClick={() => openSettingsDetail("profileLayout")}><span>他人主页布局</span><small>{profileLayout === "masonry" ? "大图瀑布流" : "列表"}</small><ChevronRight size={16}/></button>
            </div>
          </div>
          <div className="settings-module">
            <div className="settings-module-heading"><strong>消息</strong></div>
            <div className="settings-list">
              <button onClick={() => openSettingsDetail("notifications")}><span>通知设置</span><small>{Object.values(state.notifications).some(Boolean)?"已开启":"已关闭"}</small><ChevronRight size={16}/></button>
            </div>
          </div>
          <div className="settings-module">
            <div className="settings-module-heading"><strong>账号</strong></div>
            <div className="settings-list account-settings-list">
              <button onClick={() => openSettingsDetail("profile")}><span>个人资料</span><ChevronRight size={16}/></button>
              <button onClick={() => openSettingsDetail("interests")}><span>兴趣偏好</span><ChevronRight size={16}/></button>
              <button onClick={() => openMyContent("settings")}><span>我的内容与草稿</span><small>发布内容与草稿箱</small><ChevronRight size={16}/></button>
              <button onClick={() => setTab("about")}><span>关于黑卡</span><small>版本 2.26.0</small><ChevronRight size={16}/></button>
            </div>
          </div>
          </>}
          {accountId && <p className="fineprint">当前账号数据会同步至云端。</p>}
        </section>
      )}
      {tab === "settings" && settingsDetail !== null && (
        <section key={settingsDetail} className="page settings-page settings-detail-page">
          <button className="back settings-back" onClick={closeSettingsDetail}><ArrowLeft size={18} /> {settingsReturnTab === "mine" ? "我的" : "设置"}</button>
          <div className="eyebrow">HEIKA / SETTINGS</div>
          <h1>{({theme:"外观主题",font:"字体",bottomNav:"底部导航",discoverLayout:"发现页布局",profileLayout:"他人主页布局",homeMode:"首页浏览模式",reading:"阅读模式",detailTransition:"详情过渡动画",notifications:"通知设置",profile:"个人资料",interests:"兴趣偏好",security:"安全中心",membership:"会员中心",progression:"等级与奖励",creator:"创作者中心"})[settingsDetail]}</h1>
          <p className="lead">{settingsDetail === "profile" ? "完善公开资料，让其他探索者更好地认识你。" : settingsDetail === "interests" ? "选择感兴趣的方向，帮助黑卡整理每日探索内容。" : settingsDetail === "security" ? "管理笔记可见范围、私聊接收范围、黑名单和账号安全。" : settingsDetail === "membership" ? "查看当前会员等级、每日翻卡额度与可选权益。" : settingsDetail === "progression" ? "翻开卡片、认真评分，积累经验解锁探索者等级奖励。" : "预览效果并选择偏好，设置会自动保存。"}</p>
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
          {settingsDetail === "security" && <MessagingPreferences accountId={accountId} onLogin={() => { closeSettingsDetail(); setTab("messages"); }} publicBookmarks={publicBookmarks} publicBookmarksLoaded={publicBookmarksLoaded} bookmarkVisibilityBusy={bookmarkVisibilityBusy} onBookmarkVisibilityChange={updateBookmarkVisibility}/ >}
          {settingsDetail === "membership" && <div className="membership-center-page">
            <div className="membership-center-summary">
              <span className="membership-center-mark"><Crown size={19}/></span>
              <div><small>当前会员</small><strong>{membershipTier === "pro" ? "Pro" : membershipTier === "plus" ? "Plus" : "免费版"}</strong></div>
              <span className="membership-center-quota">今日 {dailyAllowance} 次</span>
            </div>
            <p className="membership-center-note">免费版每日 5 次 · Plus 每日 9 次 · Pro 每日 13 次；幸运加成会另行计入。</p>
            <div className="subscription-section-label"><strong>会员方案预览</strong></div>
            <div className="subscription-plans" role="group" aria-label="选择会员套餐">
              {membershipPlans.map((plan) => {
                const selected = selectedPlan === plan.id;
                return <button type="button" key={plan.id} className={`subscription-plan${selected ? " selected" : ""}`} aria-pressed={selected} onClick={() => setSelectedPlan(plan.id)}>
                  <span className="subscription-plan-name">{plan.name}</span>
                  <span className="subscription-plan-daily">{plan.dailyFlips} 次 <small>/ 日</small></span>
                  <span className="subscription-plan-price">¥{plan.price}<small> / 月</small></span>
                  <span className="subscription-plan-check" aria-hidden="true">{selected ? <Check size={15}/> : null}</span>
                </button>;
              })}
            </div>
            <button className="primary-button full subscription-continue" type="button" disabled={!selectedPlan} onClick={() => toast("当前仅预览，不会扣款")}>{selectedPlan ? `预览 ${membershipPlans.find((plan) => plan.id === selectedPlan)?.name} 订阅` : "请选择套餐"}</button>
            <p className="subscription-preview-note">当前仅预览 · 不会扣款或开通套餐</p>
            <section className="membership-disclosure-group">
              <button type="button" className="membership-disclosure" aria-expanded={extraPacksOpen} onClick={() => setExtraPacksOpen((open) => !open)}>
                <span><strong>额外翻卡包</strong><small>{selectedFlipPack ? `已选 +${selectedFlipPack} 次` : "一次性补充翻卡机会"}</small></span>
                <ChevronRight size={17}/>
              </button>
              <div className={`membership-collapsible${extraPacksOpen ? " open" : ""}`} aria-hidden={!extraPacksOpen} inert={!extraPacksOpen}>
                <div className="membership-collapsible-inner">
                  <div className="extra-flip-options">
                    {extraFlipPacks.map((count) => <button type="button" key={count} className={selectedFlipPack === count ? "selected" : ""} aria-pressed={selectedFlipPack === count} onClick={() => setSelectedFlipPack(count)}><strong>+{count}</strong><span>次翻卡</span></button>)}
                  </div>
                  {selectedFlipPack && <button className="soft-button full extra-pack-preview" type="button" onClick={() => toast("当前仅预览，不会扣款")}>预览 +{selectedFlipPack} 次卡包</button>}
                  <p className="subscription-preview-note">一次性补充机会；当前仅预览，不会扣款。</p>
                </div>
              </div>
            </section>
            <section className="membership-disclosure-group rules-disclosure-group">
              <button type="button" className="membership-disclosure" aria-expanded={subscriptionRulesOpen} onClick={() => setSubscriptionRulesOpen((open) => !open)}>
                <span><strong>翻卡与订阅规则</strong><small>权益、概率与额度说明</small></span>
                <ChevronRight size={17}/>
              </button>
              <div className={`membership-collapsible${subscriptionRulesOpen ? " open" : ""}`} aria-hidden={!subscriptionRulesOpen} inert={!subscriptionRulesOpen}>
                <div className="membership-collapsible-inner subscription-rules-copy">
                  <p>免费每日 5 次；Plus 每日共 9 次，Pro 每日共 13 次。会员次数按天刷新，幸运加成另行累计。</p>
                  <p>Plus 每日首次翻卡额外 +3 EXP，Pro 额外 +6 EXP。</p>
                  <p>每次翻卡的幸运奖励概率：+2 次 10%、+3 次 5%、+5 次 1.5%、+10 次 0.1%；幸运加成每日最多累计 10 次。</p>
                  <p>额外翻卡包为一次性补充。当前页面仅供预览，不会扣款、创建订单或开通权益。</p>
                </div>
              </div>
            </section>
          </div>}
          {settingsDetail === "interests" && <div className="account-interests-page">
            <div className="interest-page-note"><Sparkles size={16}/><span>偏好会自动保存在你的账号中。</span></div>
            <div className="account-interest-grid" role="group" aria-label="兴趣偏好">
              {tags.map((tag,index)=>{const InterestIcon=[Compass,Heart,Star,Sparkles][index%4];const selected=state.interests.includes(tag);return <button key={tag} className={`account-interest-option${selected?" selected":""}`} aria-pressed={selected} onClick={()=>update(current=>({...current,interests:current.interests.includes(tag)?current.interests.filter(item=>item!==tag):[...current.interests,tag]}))}><span><InterestIcon size={17}/></span><strong>{tag}</strong><i>{selected?<Check size={14}/>:null}</i></button>})}
            </div>
          </div>}
          {settingsDetail === "theme" && (
            <div className="preference-options" role="radiogroup" aria-label="外观主题">
              {([['light','浅色','清爽白底，适合明亮环境'],['dark','深色','降低亮度，适合暗光浏览'],['system','跟随系统','随设备外观自动切换']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={theme===value} className={`preference-option${theme===value?' selected':''}`} onClick={()=>setTheme(value)}>{renderPreferencePreview('theme',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{theme===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "font" && (
            <div className="preference-options" role="radiogroup" aria-label="字体选择">
              {([['oppo','OPPO Sans 4.0','利落清晰，中文阅读更舒展'],['system','系统字体','跟随设备默认字体']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={fontChoice===value} className={`preference-option${fontChoice===value?' selected':''}`} onClick={()=>setFontChoice(value)}>{renderPreferencePreview('font',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{fontChoice===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "bottomNav" && (
            <div className="preference-options" role="radiogroup" aria-label="底部导航样式">
              {([['glass','悬浮玻璃','轻透悬浮，保留页面呼吸感'],['fixed','固定底栏','贴合屏幕底部，稳定易触达']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={bottomNavStyle===value} className={`preference-option${bottomNavStyle===value?' selected':''}`} onClick={()=>setBottomNavStyle(value)}>{renderPreferencePreview('bottomNav',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{bottomNavStyle===value?'✓':''}</i></button>)}
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
            <div className="preference-options" role="radiogroup" aria-label="首页浏览模式">
              {([['waterfall','瀑布流','未翻开前隐藏内容，每日选 5 张'],['blackcard','黑卡','逐张探索，每日最多翻开 5 张']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={state.homeMode===value} className={`preference-option${state.homeMode===value?' selected':''}`} onClick={()=>chooseHomeMode(value)}>{renderPreferencePreview('home',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{state.homeMode===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "reading" && (
            <div className="preference-options" role="radiogroup" aria-label="阅读模式">
              {([['standard','标准模式','舒展排版与清晰层级'],['focus','专注模式','减少干扰，突出正文'],['night','夜间模式','深色背景，适合暗光阅读']] as const).map(([value,label,description])=><button key={value} role="radio" aria-checked={state.readingMode===value} className={`preference-option${state.readingMode===value?' selected':''}`} onClick={()=>chooseReadingMode(value)}>{renderPreferencePreview('reading',value)}<span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{state.readingMode===value?'✓':''}</i></button>)}
            </div>
          )}
          {settingsDetail === "detailTransition" && (
            <div className="preference-options" role="radiogroup" aria-label="详情过渡动画">
              {([
                ["image-zoom", "图片展开", "图片从卡片位置放大进入详情页，保持连贯过渡"],
                ["blur-rise", "轻微模糊上浮", "详情内容轻微模糊并上浮切入，不连贯放大图片"],
              ] as const).map(([value, label, description]) => <button key={value} role="radio" aria-checked={detailTransition === value} className={`preference-option${detailTransition === value ? " selected" : ""}`} onClick={() => setDetailTransition(value)}>
                <span className={`preference-preview preview-transition preview-transition-${value}`} aria-hidden="true"><i/><b/></span><span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{detailTransition === value ? "✓" : ""}</i>
              </button>)}
            </div>
          )}
          {settingsDetail === "notifications" && (
            <div className="preference-notifications">
              <span className="preference-preview preview-notifications"><b>黑卡提醒</b><i/><i/><i/></span>
              <p>开启你关心的提醒。浏览器通知仍需系统许可。</p>
              {([['messages','消息通知','新消息提醒偏好'],['comments','评论回复提醒','有人回复时提醒偏好'],['daily','每日探索提醒','每日探索提醒偏好']] as const).map(([key,label,description])=><div className="switch-row" key={key}><span><strong>{label}</strong><small>{description}</small></span><button type="button" role="switch" aria-checked={state.notifications[key]} aria-label={label} disabled={notificationPermission==='unsupported'} className={`toggle-switch ${state.notifications[key]?'on':''}`} onClick={()=>void toggleNotification(key)}><i/></button></div>)}
              {notificationPermission === "denied" && <div className="permission-state">浏览器通知权限已拒绝，请在站点设置中重新允许。</div>}
            </div>
          )}
        </section>
      )}
      {tab === "moderation" && isAdmin && <AdminModeration onBack={() => { setTab("settings"); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.settings || 0, behavior: "instant" })); }} />}
      {tab === "about" && (
        <section className="page about-page">
          <button className="back settings-back" onClick={() => setTab("settings")}><ArrowLeft size={18} /> 设置</button>
          <div className="eyebrow">HEIKA / RELEASE NOTES</div>
          <h1>关于黑卡<span className="red-dot">.</span></h1>
          <p className="lead">HEIKA · 版本 2.26.0</p>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.26.0</strong><small>2026.11.03</small></div><ul><li>统一亮暗主题的色彩、控件、卡片与页面转场，提升桌面端首屏卡片排布与无图兜底纹理。</li><li>新增月度探索回顾，汇总翻卡、探索日与 S/SS/SSS 稀有卡并可分享。</li><li>新增卡片接龙，从已发布内容发起故事，探索者可续写一段。</li><li>AI 创作工作台接入 DeepSeek，生成建议后可选用或继续编辑。</li><li>管理员可在管理后台加密配置 DeepSeek 密钥，密钥保存在 Vercel 私有云存储。</li><li>双人探索入口移入“我的”，保持首页与发现页内容聚焦。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.23.1</strong><small>2026.11.03</small></div><ul><li>创作者中心与作品草稿管理拆分，入口与页面标题各自独立。</li><li>修正设置分类页的返回层级与重新进入时的状态恢复。</li><li>最近发现恢复卡片预览，再由“查看内容”进入详情。</li><li>评分后渐进展示社区结果，并加入模糊缩放反馈动效。</li><li>管理员可新增、编辑和上下线发现页的话题共创活动。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.12.0</strong><small>2026.11.03</small></div><ul><li>个人设置、调试模式、安全中心和创作者中心统一收纳在右上角设置入口，并按分类进入。</li><li>移除“我的”页底部重复的设置入口，设置不再被挤到页面末尾。</li><li>可以关注创作者，在发现页切换到关注动态。</li><li>支持创建作品系列，并在发布时将内容归入系列。</li><li>发现页上线限时话题共创，可加入后直接带话题创作。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.11.0</strong><small>2026.11.03</small></div><ul><li>发现页新增个性化精选、最新和高评分排序。</li><li>收藏支持创建、重命名、删除收藏夹，按标题、话题和作者搜索并整理内容。</li><li>新增创作者数据面板，统计公开内容阅读、点赞、收藏与评论表现。</li><li>加入每周探索、发布和收藏任务，完成后可领取 EXP 并计入等级奖励。</li><li>收藏夹和任务奖励改由数据库权限与事务校验保护。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.10.0</strong><small>2026.11.03</small></div><ul><li>修复图片加载状态误覆盖和切图卡住的问题，增强多图切换的柔和模糊动效。</li><li>我的作品改用固定双列网格，会员中心入口放到“我”页面设置旁。</li><li>评分星星加入分色反馈、光晕和逐颗跃动效果。</li><li>等级奖励支持解锁后领取，领取记录同步保存到账号。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.09.0</strong><small>2026.11.03</small></div><ul><li>我的作品固定为双列瀑布流，发布入口由底栏中间按钮统一提供。</li><li>他人主页默认使用大图瀑布流，可在设置中切换为列表。</li><li>多图切换即时反馈，目标图片预加载和解码完成后平滑替换；滑动识别更稳定。</li><li>设置入口移到“我”标题旁，安全中心、会员中心和调试模式收进设置。</li><li>最近翻开的卡片只在发现页的推荐分类显示，详情切换动画更轻、更省性能。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.07.0</strong><small>2026.11.03</small></div><ul><li>聊天会话与内容详情进入沉浸状态时隐藏手机底栏，返回后自动恢复。</li><li>安全中心和会员中心移入“我的”设置入口，整理个人设置菜单。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.06.0</strong><small>2026.11.03</small></div><ul><li>支持将 HEIKA 安装到手机主屏幕，并使用新的黑卡应用图标。</li><li>补充独立应用显示模式、启动图标和基础离线页面缓存。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.05.0</strong><small>2026.11.03</small></div><ul><li>消息列表和私聊改为紧凑排版，私聊支持从对话顶部打开全屏个人主页。</li><li>帖子详情进入时预加载前后图片，减少切换时等待。</li><li>“我的”页新增“我的作品”入口，可直接管理发布内容、审核状态和草稿。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.04.0</strong><small>2026.11.03</small></div><ul><li>瀑布流每天固定展示 50 张黑卡，次日自动生成新卡组并重置当日翻卡次数。</li><li>已翻卡片按日期保留在探索历史，可随时回看。</li><li>瀑布流图片加载时由模糊渐清，详情多图支持按滑动方向平滑切换。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 2.03.0</strong><small>2026.11.02</small></div><ul><li>投稿图片在上传后立即显示，并在刷新和重新打开时获取新的图片链接。</li><li>新增安全中心，可设置笔记仅自己可见，并管理私聊范围、黑名单与账号安全。</li><li>消息时间移到气泡外，复制操作收进长按菜单。</li><li>经验记录、探索日历和探索记录支持折叠，收起时不渲染长列表。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 1.42</strong><small>2026.11.02</small></div><ul><li>密码找回支持邮箱一次性验证码与备用恢复码。</li><li>账号安全页可生成一组仅展示一次、单次使用的备用恢复码。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 1.41</strong><small>2026.11.02</small></div><ul><li>发现内容改为分页加载，支持服务端话题筛选，首屏只请求 24 篇。</li><li>评分按批次请求，旧翻卡记录批量恢复。</li><li>本地状态改为延迟保存并排除评论缓存；消息后台暂停轮询，当前会话消息不再重复刷新收件箱。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 1.40</strong><small>2026.11.01</small></div><ul><li>增加平板与桌面端自适应布局，宽屏改用侧边主导航。</li><li>发现、我的、设置和管理后台使用多列内容布局。</li><li>桌面消息改为会话列表与聊天窗口并排，详情页扩展阅读与评论空间。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 1.39</strong><small>2026.11.01</small></div><ul><li>发现页搜索改为独立二级页面，支持搜索内容和公开用户资料。</li><li>内容支持标题、正文搜索；用户支持昵称、简介搜索和分页。</li><li>增加本机最近搜索与精选话题入口，并优化移动端搜索结果布局。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 1.37</strong><small>2026.11.01</small></div><ul><li>经验进度条改为纯深蓝纯色，修正个人页分隔线圆角。</li><li>翻卡图片区域加大，个人设置、调试等二级页面补齐统一入场动画。</li><li>消息页先恢复本地会话再显示登录入口，并保留已加载页面状态。</li><li>统一主按钮为低反光纯色，适配明暗主题。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 1.36</strong><small>2026.11.01</small></div><ul><li>切页使用统一模糊缩放过渡，移除旧页面上浮效果。</li><li>翻卡揭晓 S、SS、SSS 稀有等级，并在探索记录保留等级。</li><li>统一等级与订阅界面的圆角，经验进度条改为纯色。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 1.35</strong><small>2026.11.01</small></div><ul><li>为等级经验、选择菜单和个人资料控件补齐暗色主题样式。</li><li>移除经验等级卡片上多余的圆环装饰。</li></ul></div>
          <div className="settings-module release-note"><div className="settings-module-heading"><strong>版本 1.34</strong><small>2026.11.01</small></div><ul><li>修复账号设置一级列表文字逐字换行与行高错乱。</li><li>增强等级经验、奖励和选择卡片的色彩层级。</li><li>统一页面、弹层、选项和开关的动效与 iOS 风格控件。</li><li>个人资料和管理后台选择器改为统一的质感菜单。</li></ul></div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.31</strong><small>2026.11.01</small></div>
            <ul>
              <li>统一二级页顶栏返回操作，并将发布表单改为全屏编辑界面。</li>
              <li>个人资料新增性别、MBTI、生日与爱好，可分别设置公开状态。</li>
              <li>话题支持发布时自定义，发现页只展示热度靠前的话题。</li>
              <li>私聊接收范围、黑名单和退出账号统一收纳到设置页。</li>
              <li>个人资料与兴趣偏好改为独立二级页面，账号设置行项增加统一图标与排版。</li>
              <li>调试模式新增管理员后台登录入口，并统一账号设置分组与列表样式。</li>
              <li>补齐邮箱注册确认、密码找回与重置流程，注册时可设置昵称。</li>
              <li>新增账号角色管理、用户检索和私信举报队列。</li>
              <li>统一偏好设置二级页面，并新增主题、字体、导航与浏览模式的界面预览。</li>
              <li>“我的”页改为收藏、点赞、探索日历和最近发现四个切换面板。</li>
              <li>设置选项改为统一的二级选择页，个人发布与草稿单独收纳。</li>
              <li>标签栏固定在顶部，切换加入柔和的滑动与内容过渡。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.26</strong><small>2026.11.01</small></div>
            <ul>
              <li>亮色主题切换为纯白底色与冷灰分层。</li>
              <li>底栏发布入口融入中央导航位，并统一设置选项样式。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.25</strong><small>2026.11.01</small></div>
            <ul>
              <li>发布入口改为独立悬浮圆钮，与底部导航分层显示。</li>
              <li>统一卡片、控件与弹层的克制圆角层级。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.24</strong><small>2026.11.01</small></div>
            <ul>
              <li>发现页顶部保留最近翻开的卡，方便随时回看。</li>
              <li>设置中可选择悬浮玻璃或固定底栏，选择会保存在本机。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.23</strong><small>2026.11.01</small></div>
            <ul>
              <li>统一发布、话题、详情、举报与审核页面的浅色和深色主题变量。</li>
              <li>新增发现页瀑布流与单列阅读布局，并保留设备上的用户选择。</li>
              <li>修复内容话题关联查询歧义，补充今日翻卡与主题页面浏览器回归。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.22</strong><small>2026.10.31</small></div>
            <ul>
              <li>举报支持固定原因、补充说明与重复提交保护。</li>
              <li>新增管理员举报与内容人工审核队列，记录处理说明和时间。</li>
              <li>新发布或编辑的内容先保持待审核状态，通过后才公开；图片未启用自动识别。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.21</strong><small>2026.10.31</small></div>
            <ul>
              <li>发布编辑器支持多图预览、排序、封面选择、移除与失败重试。</li>
              <li>新增本机与账号草稿自动保存、恢复；图片关联草稿后再发布。</li>
              <li>删除草稿时同步清理已上传图片，保留现有登录与文章权限校验。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.20</strong><small>2026.10.31</small></div>
            <ul>
              <li>彩带加入长短形态，并改为单段线性落下，减少中途速度变化造成的顿挫。</li>
              <li>提示、错误、评分和幸运奖励统一采用模糊渐入渐出反馈。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.19</strong><small>2026.10.31</small></div>
            <ul>
              <li>翻卡彩带改为从屏幕顶部多点错落飘下，增加数量并放慢速度。</li>
              <li>为彩带加入轻微横向漂移、旋转和不同落速，延长自然飘落层次。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.18</strong><small>2026.10.31</small></div>
            <ul>
              <li>重整翻卡彩带起点与全屏扇形轨迹，按动画时长准确清理粒子。</li>
              <li>避免关闭或跳转后彩带重新出现，并减少重复的幸运加成提示。</li>
              <li>将幸运加成提示上移，降低与卡片内容重叠的情况。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.17</strong><small>2026.10.31</small></div>
            <ul>
              <li>修正黑卡弹层与发现页到详情页的图片来源定位。</li>
              <li>详情返回时固定恢复原页面滚动位置与图片锚点。</li>
              <li>翻卡彩带从顶部单点扇形绽放至全屏，并微调会员页面圆角。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.16</strong><small>2026.10.31</small></div>
            <ul>
              <li>彩带从屏幕上方中心散开，加入多色飘落并移除浅色遮罩。</li>
              <li>详情页采用图片连续扩展与正文上推动效，返回时按原路径收回。</li>
              <li>加入全体用户评分汇总，并将个人评分信号用于内容推荐。</li>
              <li>菱形卡片为已翻开的切面使用独立金属色状态。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.15</strong><small>2026.10.31</small></div>
            <ul>
              <li>精简翻卡方案页面，使用紧凑套餐选择与折叠说明。</li>
              <li>优化浅色和深色主题下的订阅弹窗层级及安全区域适配。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.14</strong><small>2026.10.31</small></div>
            <ul>
              <li>翻卡彩带改为从屏幕顶部向下飘落。</li>
              <li>详情页改为图片淡出、内容从下方自然上推，移除拉伸卡片图的转场。</li>
              <li>在「我的」增加 Plus / Pro 订阅与额外翻卡包入口。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.13</strong><small>2026.10.31</small></div>
            <ul>
              <li>加入每日幸运翻卡加成与 Plus / Pro 方案说明入口。</li>
              <li>翻卡庆祝扩展为全屏金属绽放，评分改为信号校准动效。</li>
              <li>支付入口保持关闭，幸运次数和翻卡进度按每日记录保存。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.12</strong><small>2026.10.31</small></div>
            <ul>
              <li>调整深色模式下已解锁菱面亮度，恢复金属切面的层次与卡面文字对比度。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.11</strong><small>2026.10.31</small></div>
            <ul>
              <li>浅色主题调整为更明亮的冷白底色。</li>
              <li>详情页移除分类示例标签与正文下方分割线，减少阅读干扰。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.10</strong><small>2026.10.31</small></div>
            <ul>
              <li>将冷银金属、细分割线与精密栏目眉题延伸到首页、个人页和详情页。</li>
              <li>黑卡切面加入银蓝渐变，详情无图内容使用同系列菱面视觉。</li>
              <li>保留现有翻卡、收藏、消息、设置与主题交互。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.9</strong><small>2026.10.31</small></div>
            <ul>
              <li>浅色瀑布流卡面提亮，并提升翻卡内容的文字对比度。</li>
              <li>黑卡切面铺满卡面，改为不规则碎片拼接，消除上下空条。</li>
              <li>翻卡背景改用柔和模糊，并加入轻盈彩带动效。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.8</strong><small>2026.10.31</small></div>
            <ul>
              <li>增加黑卡主界面的可选菱面数量，展示更多内容入口。</li>
              <li>统一顶部「黑卡 HEIKA」中英文间距与对齐。</li>
              <li>精简发现页头部，并恢复用户手动确认翻卡。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.7</strong><small>2026.10.31</small></div>
            <ul>
              <li>重构内容详情的阅读层级与底部互动栏。</li>
              <li>新增图片预览、多图切换、评论排序与分层回复。</li>
              <li>改进评论头像、点赞状态和可分享的详情链接。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.6</strong><small>2026.10.31</small></div>
            <ul>
              <li>放大并重新对齐顶部「黑卡 HEIKA」标识。</li>
              <li>移除黑卡菱面卡片的上下内描边与条带纹理。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.5</strong><small>2026.10.31</small></div>
            <ul>
              <li>调试入口移至个人页，可一键重置个人资料、偏好、收藏与翻卡记录。</li>
              <li>个人设置新增 OPPO Sans 4.0 与系统字体选项。</li>
              <li>调整顶部黑卡标识的位置与比例。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.4</strong><small>2026.10.31</small></div>
            <ul>
              <li>移除首页顶栏的浏览模式切换，品牌标题简化为「黑卡」。</li>
              <li>瀑布流明确显示每日翻卡进度，并在额度用完时提示。</li>
              <li>调试模式独立成页，详情操作改为图标按钮。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.3</strong><small>2026.10.31</small></div>
            <ul>
              <li>首页顶部可直接切换瀑布流与黑卡流。</li>
              <li>菱面选择仅保留在首页卡面，翻开后的黑卡移除菱形结构。</li>
              <li>设置中新增调试模式，可重置新人开始界面。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.2</strong><small>2026.10.31</small></div>
            <ul>
              <li>首次进入即可选择瀑布流或黑卡主页样式。</li>
              <li>精简个人页信息，并统一设置项状态的右侧对齐。</li>
              <li>调整浅色模式下的探索日历色阶。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.1</strong><small>2026.10.31</small></div>
            <ul>
              <li>首页标题更新为「保存黑卡」。</li>
              <li>黑卡模式改为由可交互菱形切面组成的固定卡面，点选切面即可自动翻开新内容。</li>
              <li>保留每日最多翻开 5 张的额度与已解锁记录。</li>
            </ul>
          </div>
          <div className="settings-module release-note">
            <div className="settings-module-heading"><strong>版本 1.0</strong><small>初始版本</small></div>
            <ul><li>黑卡内容探索、瀑布流浏览与每日翻卡。</li><li>收藏、消息、私聊及主题设置。</li></ul>
          </div>
        </section>
      )}
      {tab === "debug" && (
        <section className="page debug-page">
          <div className="eyebrow">DEVELOPER TOOLS</div>
          <h1>调试模式<span className="red-dot">.</span></h1>
          <p className="lead">一键清空个人偏好、翻卡与收藏状态，重新开始新人引导。</p>
          <button className="debug-admin-entry" onClick={() => {
            if (accountId) {
              if (isAdmin) { setTab("moderation"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); }
              else toast("当前账号没有管理员权限。");
              return;
            }
            adminEntryPending.current = true;
            setTab("messages");
            requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
          }}>
            <span><ShieldCheck size={19}/></span>
            <span><strong>{isAdmin ? "进入管理后台" : "管理员后台登录"}</strong><small>{isAdmin ? "账号、内容与社区举报管理" : "使用管理员账号登录后进入后台"}</small></span>
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
            <div className="mine-heading"><h1 className="mine-title">我</h1><div className="mine-heading-actions"><button type="button" className="mine-membership-button" aria-label={`会员中心，当前${membershipTier === "pro" ? "Pro" : membershipTier === "plus" ? "Plus" : "免费版"}`} onClick={() => openSettingsDetail("membership", "mine")}><Crown size={16}/><span>会员中心</span></button><button type="button" className="mine-settings-button" aria-label="打开设置" onClick={() => { scrollPositions.current.mine = window.scrollY; setSettingsPersonalOpen(false); setTab("settings"); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })); }}><Settings size={19}/></button></div></div>
            <div className="profile-card mine-profile-card">
              <div className="avatar">{state.avatar ? <img src={state.avatar} alt="头像" /> : state.name[0]}</div>
              <div><h2>{state.name}</h2><p>{state.bio}</p>{accountId && <small className="mine-account-id">HEIKA ID · {accountId.slice(0, 8).toUpperCase()}</small>}</div>
              <button aria-label="编辑资料" onClick={() => openSettingsDetail("profile", "mine")}><PenLine size={18} /></button>
            </div>
            <div className="stats exploration-stats mine-profile-stats"><div><strong>{openedIds.length}</strong><span>累计翻卡</span></div><div><strong>{streak}</strong><span>连续探索</span></div><div><strong>{state.saved.length}</strong><span>我的收藏</span></div></div>
            <div className="mine-quick-links" role="group" aria-label="个人快捷入口">
              <button type="button" onClick={openCoExplore}><span className="mine-quick-icon"><UsersRound size={15}/></span><strong>和朋友一起探索</strong></button>
              <button type="button" onClick={() => openMineFeature("monthly-recap")}><span className="mine-quick-icon"><Sparkles size={15}/></span><strong>探索月报</strong></button>
              <button type="button" onClick={() => openMineFeature("card-chain")}><span className="mine-quick-icon"><GitBranch size={15}/></span><strong>卡片接龙</strong></button>
            </div>
            <button className="experience-summary-card" onClick={() => openSettingsDetail("progression", "mine")}>
              <span className="experience-summary-badge">LV.{experienceProgress(experienceSummary.total).current.level}</span>
              <span className="experience-summary-copy"><strong>探索等级 · {experienceSummary.total} EXP</strong><small>{accountId ? experienceProgress(experienceSummary.total).next ? `距离 LV.${experienceProgress(experienceSummary.total).next!.level} 还差 ${experienceProgress(experienceSummary.total).next!.threshold - experienceSummary.total} EXP` : "已达到当前最高等级" : "登录后同步你的经验与奖励"}</small><i><b style={{ width: `${experienceProgress(experienceSummary.total).percent}%` }} /></i></span>
              <ChevronRight size={17}/>
            </button>
          </section>
          <DailyMissions accountId={accountId} onNotice={toast}/>
          <div className="mine-tabs-shell">
            <div className="mine-tabs" role="tablist" aria-label="个人内容分类">
              {([
                ["works", "我的作品"],
                ["favorites", "我的收藏"],
                ["liked", "我的点赞"],
                ["calendar", "探索日历"],
                ["recent", "最近发现"],
                ["rarity", "稀有图鉴"],
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
              <span className="mine-tab-indicator" style={{ transform: `translateX(${["works", "favorites", "liked", "calendar", "recent", "rarity"].indexOf(mineSection) * 100}%)` }} />
            </div>
          </div>
          <div id="mine-category-panel" className="mine-category-panel" role="tabpanel" aria-labelledby={`mine-tab-${mineSection}`} key={mineSection}>
            {mineSection === "works" && (
              <div className="mine-tab-content">
                <div className="section-head mine-panel-heading"><h2>我的作品</h2><span>{state.own.filter((post) => post.status === "published" || !post.status).length} 篇</span></div>
                <div className="series-manager"><div className="series-manager-heading"><strong>作品系列</strong><span>把有关联的内容整理成专栏</span></div><div className="series-create-form"><input aria-label="系列名称" maxLength={48} placeholder="例如：一周城市观察" value={seriesName} onChange={(event) => setSeriesName(event.target.value)}/><input aria-label="系列简介" maxLength={240} placeholder="一句话介绍（可选）" value={seriesDescription} onChange={(event) => setSeriesDescription(event.target.value)}/><button type="button" disabled={!accountId || seriesName.trim().length < 2} onClick={() => void createPostSeries()}><Plus size={15}/>新建</button></div>{creatorSeries.length > 0 && <div className="series-list">{creatorSeries.map((series) => <button type="button" className={selectedSeriesId === series.id ? "active" : ""} key={series.id} onClick={() => setSelectedSeriesId((current) => current === series.id ? "" : series.id)}><strong>{series.title}</strong><span>{series.description || "持续更新中"}</span><small>{series.postCount || 0} 篇</small></button>)}</div>}</div>
                {selectedSeriesId && <button type="button" className="series-filter-reset" onClick={() => setSelectedSeriesId("")}>查看全部作品</button>}
                {(selectedSeriesId ? state.own.filter((post) => post.seriesId === selectedSeriesId) : state.own).length ? <div className="masonry mine-works-masonry">{(selectedSeriesId ? state.own.filter((post) => post.seriesId === selectedSeriesId) : state.own).map((post) => <article className="mine-work-card" key={post.id}>
                  {postCard(post, "discover", true)}
                  <div className="mine-work-actions"><span>{post.status === "draft" ? "草稿" : post.status === "pending_review" ? "审核中" : post.status === "hidden" ? "审核未通过" : "已发布"}</span><button type="button" aria-label={`编辑${post.title || "未命名内容"}`} onClick={() => void openComposer(post)}><PenLine size={14}/><span>编辑</span></button><button type="button" aria-label={`删除${post.title || "未命名内容"}`} onClick={() => void deleteOwn(post)}><Trash2 size={14}/><span>删除</span></button></div>
                </article>)}</div> : <div className="empty">{selectedSeriesId ? "这个系列还没有内容，发布时可以从系列菜单加入。" : "你发布的内容会以瀑布流卡片显示在这里。"}</div>}
              </div>
            )}
            {mineSection === "favorites" && (
              <div className="mine-tab-content">
                <div className="section-head mine-panel-heading"><h2>我的收藏</h2><span>{favoritePostsForView.length} 篇</span></div>
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
                {organizedFavoritePosts.length ? <div className={`masonry${state.discoverLayout === "single" ? " single-column" : ""}`}>{organizedFavoritePosts.map((post) => <div className="organized-favorite-card" key={post.id}>{postCard(post, state.revealed[post.id] ? "today" : "discover")}{state.saved.includes(post.id) ? <label className="collection-assignment">整理到<select aria-label={`整理《${post.title}》到收藏夹`} value={bookmarkMembership[post.cloudId || ""] || ""} disabled={!accountId || !post.cloudId} onChange={(event) => void assignBookmarkCollection(post, event.target.value)}><option value="">未分类</option>{bookmarkCollections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label> : <small className="collection-assignment shared-bookmark-note">朋友也收藏了这份灵感</small>}</div>)}</div> : <div className="empty">{favoritePostsForView.length ? "没有符合搜索条件的收藏。" : favoriteCollection !== "all" && favoriteCollection !== "uncategorized" ? "这个协作收藏夹还没有内容。" : "收藏的内容会集中保存在这里。"}</div>}
              </div>
            )}
            {mineSection === "liked" && (
              <div className="mine-tab-content">
                <div className="section-head mine-panel-heading"><h2>我的点赞</h2><span>{likedPosts.length} 篇</span></div>
                {likedPosts.length ? <div className={`masonry${state.discoverLayout === "single" ? " single-column" : ""}`}>{likedPosts.map((post) => postCard(post, state.revealed[post.id] ? "today" : "discover"))}</div> : <div className="empty">点过赞的内容会显示在这里。</div>}
              </div>
            )}
            {mineSection === "calendar" && (
              <div className="mine-tab-content">
                <div className="section-head exploration-calendar-heading mine-panel-heading"><button type="button" className="collapsible-panel-toggle" aria-expanded={explorationCalendarOpen} aria-controls="exploration-calendar-content" onClick={() => setExplorationCalendarOpen((open) => !open)}><h2>我的探索日历</h2><span>最近 28 天 <ChevronDown size={16}/></span></button></div>
                {explorationCalendarOpen && <div id="exploration-calendar-content"><div className="exploration-calendar" role="group" aria-label="最近 28 天的翻卡记录">
                  {calendarDays.map(({ key, count }) => <button key={key} type="button" className={`calendar-day level-${Math.min(count, 5)}${selectedDay === key ? " selected" : ""}`} aria-label={`${key}，翻开 ${count} 张`} aria-pressed={selectedDay === key} onClick={() => setSelectedCalendarDate(key)} title={`${key} · ${count} 张`} />)}
                </div>
                <div className="calendar-day-detail">
                  <div><strong>{(() => { const [year, month, day] = selectedDay.split("-"); return `${year}年${Number(month)}月${Number(day)}日`; })()}</strong><span>探索：{selectedDayIds.length} 张</span></div>
                  {selectedDayIds.length ? <div className="calendar-posts">{selectedDayIds.map((id) => {
                    const item = state.revealed[id] || all.find((post) => post.id === id);
                    const tier = state.rarityTiers[id] || state.revealed[id]?.rarityTier;
                    const rareTier = tier === "S" || tier === "SS" || tier === "SSS" ? tier : null;
                    return item ? <button key={id} onClick={() => openPost(id, "today")}><span>{item.tag}</span>{rareTier && <i className={`rarity-history-chip rarity-tier-${rareTier}`}>{rareTier}</i>}<strong>{item.title}</strong><ChevronRight size={15} /></button> : <div key={id} className="calendar-missing">已翻开的内容当前不可用</div>;
                  })}</div> : <p className="fineprint">这一天还没有翻开新卡片。</p>}
                </div></div>}
              </div>
            )}
            {mineSection === "recent" && (
              <div className="mine-tab-content">
                <div className="section-head mine-panel-heading"><h2>最近的发现</h2><span>最近 8 条</span></div>
                {recentDiscoveries.length ? <div className="recent-discoveries">{recentDiscoveries.map(({ date, post }) => {
                  const tier = state.rarityTiers[post.id] || state.revealed[post.id]?.rarityTier;
                  const rareTier = tier === "S" || tier === "SS" || tier === "SSS" ? tier : null;
                  return <button key={`${date}-${post.id}`} onClick={() => setRecentPreview({ post, source: state.revealed[post.id] ? "today" : "discover" })}><span>{post.tag} · {date.slice(5).replace("-", ".")}</span>{rareTier && <i className={`rarity-history-chip rarity-tier-${rareTier}`}>{rareTier}</i>}<strong>{post.title}</strong><small>点按预览</small></button>;
                })}</div> : <div className="empty">翻开第一张卡片后，这里会留下你的近期发现。</div>}
                <div id="flip-history" className="section-head mine-panel-heading"><button type="button" className="collapsible-panel-toggle" aria-expanded={explorationHistoryOpen} onClick={() => setExplorationHistoryOpen((open) => !open)}><h2>探索记录</h2><span>{Object.keys(state.opened).length} 天 <ChevronDown size={16}/></span></button></div>
                {explorationHistoryOpen && Object.entries(state.opened).sort(([a], [b]) => b.localeCompare(a)).map(([day, values]) => <div className="history" key={day}><strong>{day}</strong>{values.map((id) => {
                  const tier = state.rarityTiers[id] || state.revealed[id]?.rarityTier;
                  const rareTier = tier === "S" || tier === "SS" || tier === "SSS" ? tier : null;
                  return <button key={id} onClick={() => openPost(id)}>{rareTier && <i className={`rarity-history-chip rarity-tier-${rareTier}`}>{rareTier}</i>}{all.find((post) => post.id === id)?.title || "已移除内容"}</button>;
                })}</div>)}
                {explorationHistoryOpen && !Object.keys(state.opened).length && <div className="empty">翻开第一张卡，开始记录。</div>}
              </div>
            )}
            {mineSection === "rarity" && (() => {
              const grades = { S: 1, SS: 2, SSS: 3 } as const;
              const rareCards = openedIds.map((id) => state.revealed[id] || all.find((post) => post.id === id)).filter((post): post is Post => Boolean(post)).map((post) => ({ post, tier: state.rarityTiers[post.id] || post.rarityTier })).filter((item): item is { post: Post; tier: keyof typeof grades } => item.tier === "S" || item.tier === "SS" || item.tier === "SSS").sort((a, b) => grades[b.tier] - grades[a.tier]);
              return <div className="mine-tab-content rarity-album"><div className="section-head mine-panel-heading"><h2>稀有图鉴</h2><span>{rareCards.length} 张珍藏</span></div><p className="rarity-album-intro">探索时遇见的稀有卡会自动收录在这里。</p>{rareCards.length ? <div className="rarity-album-grid">{rareCards.map(({ post, tier }) => <button type="button" className={`rarity-album-card rarity-tier-${tier}`} key={post.id} onClick={() => openPost(post.id, state.revealed[post.id] ? "today" : "discover")}><span>{tier}</span>{post.image && <img src={post.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.src = "/image-not-loaded.svg"; }}/>}<strong>{post.title}</strong><small>{post.tag}</small></button>)}</div> : <div className="rarity-album-empty"><Sparkles size={23}/><strong>还没有收录稀有卡</strong><span>继续探索，遇见 S、SS、SSS 级卡片时会自动珍藏。</span></div>}</div>;
            })()}
          </div>
        </section>
      )}
      {tab === "monthly-recap" && <ExplorationRecap opened={state.opened} rarityTiers={state.rarityTiers} posts={all} onNotice={toast} onBack={() => { setTab("mine"); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.mine || 0, behavior: "instant" })); }} />}
      {tab === "card-chain" && <CardChainPanel accountId={accountId} posts={all} onLogin={() => setTab("messages")} onBack={() => { setTab("mine"); requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.mine || 0, behavior: "instant" })); }} onNotice={toast} />}
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
          <h1>我的作品与草稿<span className="red-dot">.</span></h1>
          <p className="lead">管理已发布内容、审核状态和草稿。</p>
          <div className="section-head"><h2>作品列表</h2><span>{state.own.length} 项</span></div>
          <button className="primary-button mine-create-button" onClick={() => void openComposer()}><Plus size={16} /> 发布内容</button>
          {state.own.length ? state.own.map((post) => (
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
      {tab !== "search" && !(tab === "settings" && settingsDetail !== null) && <nav className={`bottom-nav${bottomNavStyle === "glass" ? " floating-glass" : " fixed-bar"}`} aria-label="主导航">
        {nav.slice(0, 2).map(renderNavButton)}
        <button className="compose" aria-label="发布内容" onClick={() => void openComposer()}><Plus size={22} /></button>
        {nav.slice(2).map(renderNavButton)}
      </nav>}
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
                    className={`flip-face flip-back flip-window-revealed${viewerRevealPhase === "rarity" ? " is-rarity-reveal" : ""}`}
                    data-window-card-id={viewerId}
                    style={{ background: coverColor(revealed?.tag || "") }}
                  >
                    <div className="flip-window-visual-fallback">
                      {revealed?.cover || "HEIKA"}
                    </div>
                    {revealed?.image && (
                      <img
                        src={revealed.image}
                        alt=""
                        onError={(e) => {
                          if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = "true"; e.currentTarget.src = "/image-not-loaded.svg"; }
                        }}
                      />
                    )}
                    {viewerRevealPhase === "rarity" && (
                      <div className={`flip-rarity-reveal rarity-tier-${rarityTier}`} aria-live="polite">
                        <small>卡片稀有度</small>
                        <strong>{rarityGrade}</strong>
                        <span>{rarityLabel}</span>
                      </div>
                    )}
                    <div className={`window-reveal-copy${viewerRevealPhase === "rarity" ? " is-rarity-hidden" : ""}`} aria-hidden={viewerRevealPhase === "rarity" || undefined}>
                      <div className="window-reveal-meta"><small>{revealed?.tag || "HEIKA"}</small><i className={`rarity-inline-chip rarity-tier-${rarityTier}`}>{rarityTier === "ordinary" ? "普通" : rarityTier === "pending" ? "待评级" : rarityTier}</i></div>
                      <h2>{revealed?.title || ""}</h2>
                      <p>
                        {revealed?.body?.slice(0, 220)}
                        {(revealed?.body?.length || 0) > 220 ? "…" : ""}
                      </p>
                      <small className="window-quota">
                        今日已翻 {opened.length} / {dailyAllowance} 张 · 还可翻 {Math.max(0, dailyAllowance - opened.length)} 张
                      </small>
                      <button
                        className="window-more"
                        disabled={!viewerFlipped || viewerPhase !== null || viewerRevealPhase === "rarity"}
                        onClick={(event) => openPost(viewerId, "today", event.currentTarget)}
                      >
                        查看更多 <ArrowRight size={17} />
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
                  <button className={`detail-image-button detail-image-frame is-${detailImageDirection}`} onClick={(event) => {
                    if (imageSwipeTriggered.current) { event.preventDefault(); imageSwipeTriggered.current = false; return; }
                    setPreviewImage(true);
                  }} aria-label="查看大图">
                    <img key={detailImages[displayedImageIndex]} src={detailImages[displayedImageIndex]} alt={`${post.title}，第 ${displayedImageIndex + 1} 张`} loading="eager" fetchPriority="high" onLoad={() => { if (activeImageIndex === displayedImageIndex) setImageLoading(false); }} onError={(event) => { if (activeImageIndex === displayedImageIndex) setImageLoading(false); if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "true"; event.currentTarget.src = "/image-not-loaded.svg"; } }} />
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
                <h1>{post.title}</h1>
                <p className="byline">
                  {post.authorId ? <button className="text-button" onClick={() => setAuthorProfile(post.authorId!)}>{post.author} ↗</button> : post.author}
                  <span> · {post.date}</span>
                </p>
                <button className="detail-reading-setting" onClick={() => setModal("reading")}>
                  阅读模式 · {{ standard: "标准", focus: "专注", night: "夜间" }[state.readingMode]} <ChevronRight size={14} />
                </button>
                {post.seriesTitle && <div className="detail-series-badge"><span>系列</span><strong>{post.seriesTitle}</strong></div>}
                {post.topics?.length ? <div className="detail-topic-list" aria-label="内容话题">{post.topics.map((topic) => <button key={topic} className="detail-topic-chip" onClick={() => void openTopic(topic)}>#{topic}</button>)}</div> : null}
                <EditorialArticle post={post} />
                <section className={`detail-rating${ratingPulse?.postId === post.id ? " rating-pulse" : ""}`} aria-label="内容评分">
                  <span>给这篇内容评分</span>
                  <div>{[1, 2, 3, 4, 5].map((n) => (
                    <button className={`rating-star${ratingPulse?.postId === post.id && n <= ratingPulse.score ? " is-pulsing" : ""}`} key={n} style={{ animationDelay: `${(n - 1) * 58}ms`, "--star-delay": `${(n - 1) * 58}ms`, "--rating-color": RATING_COLORS[n - 1] } as CSSProperties} aria-label={`${n} 星`} aria-pressed={(state.ratings[post.id] || 0) === n} onClick={() => submitRating(post.id, n)}>
                      <Star size={18} fill={(state.ratings[post.id] || 0) >= n ? "currentColor" : "none"} />
                    </button>
                  ))}</div>
                  {(state.ratings[post.id] || ratingPulse?.postId === post.id) && (communityRatings[post.id]?.count ? (
                    <small className="community-rating" aria-live="polite">
                      <Star size={12} fill="currentColor" /> 社区均分 {communityRatings[post.id].average.toFixed(1)} · {communityRatings[post.id].count} 人 <i className={`rarity-badge rarity-${cardRarity(communityRatings[post.id].average, communityRatings[post.id].count).replaceAll(" ", "")}`}>{cardRarity(communityRatings[post.id].average, communityRatings[post.id].count)}</i>
                    </small>
                  ) : null)}
                  {ratingPulse?.postId === post.id ? <small className="rating-feedback" key={ratingPulse.score} aria-live="polite">信号已校准 · {ratingPulse.score} 星</small> : state.ratings[post.id] ? <small>已评 {state.ratings[post.id]} 星</small> : null}
                </section>
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
                      const visibleChildren = expandedReplies[c.id] ? children : children.slice(0, 2);
                      const displayBody = expandedComments[c.id] || c.body.length <= 280 ? c.body : `${c.body.slice(0, 280)}…`;
                      return <article className="comment" id={`comment-${c.id}`} data-comment-id={c.id} key={c.id}>
                        <div className="comment-avatar" aria-hidden="true"><span>{(c.name || "探").slice(0, 1)}</span>{c.avatar && <img src={c.avatar} alt="" loading="lazy" onError={(event) => { event.currentTarget.dataset.failed = "true"; }} />}</div>
                        <div className="comment-content">
                          <div className="comment-heading"><strong className="comment-author" title={c.name || "探索者"}>{c.name || "探索者"}</strong>{post.authorId && c.authorId === post.authorId && <span className="comment-author-badge">作者</span>}<button className={`comment-like${c.liked ? " selected" : ""}`} aria-label={`${c.liked ? "取消点赞" : "点赞评论"}，${c.likes}`} aria-pressed={!!c.liked} onClick={() => void toggleCommentLike(c)}><Heart size={17} fill={c.liked ? "currentColor" : "none"} /><span>{c.likes}</span></button></div>
                          <p className={expandedComments[c.id] ? "comment-body expanded" : "comment-body"}>{displayBody}</p>
                          {c.body.length > 280 && <button className="comment-expand" onClick={() => setExpandedComments((current) => ({ ...current, [c.id]: !current[c.id] }))}>{expandedComments[c.id] ? "收起" : "展开全文"}</button>}
                          <div className="comment-meta"><time dateTime={new Date(c.time).toISOString()}>{relativeTime(c.time)}</time><button className="comment-reply-action" onClick={() => { setReply(c.id); commentInputRef.current?.focus(); }}>回复</button><details className="comment-actions-menu"><summary aria-label="评论操作"><MoreHorizontal size={18}/></summary><div className="comment-actions-panel"><button onClick={() => { setReply(c.id); commentInputRef.current?.focus(); }}>回复</button>{(!c.cloudId || c.authorId === accountId) && <button onClick={() => void deleteComment(c)}>删除评论</button>}{c.cloudId && accountId && c.authorId !== accountId && <button onClick={() => { setReportCommentId(c.cloudId!); setReportPostId(null); setReportReason(""); setReportNote(""); setModal("report"); }}>举报评论</button>}</div></details></div>
                          {visibleChildren.length > 0 && <div className="comment-replies">{visibleChildren.map((child) => <div className="comment-reply" key={child.id}>
                            <div className="comment-avatar small" aria-hidden="true"><span>{(child.name || "探").slice(0, 1)}</span>{child.avatar && <img src={child.avatar} alt="" loading="lazy" onError={(event) => { event.currentTarget.dataset.failed = "true"; }} />}</div><div><strong>{child.name || "探索者"}</strong>{child.parent ? <span> 回复 </span> : null}<p>{child.body}</p><div className="comment-meta"><time>{relativeTime(child.time)}</time><button onClick={() => { setReply(c.id); commentInputRef.current?.focus(); }}>回复</button></div></div>
                          </div>)}</div>}
                          {children.length > visibleChildren.length && <button className="expand-replies" onClick={() => setExpandedReplies((s) => ({ ...s, [c.id]: true }))}>展开更多回复（{children.length - visibleChildren.length}）</button>}
                        </div>
                      </article>;
                    }) : !commentsLoading && !commentsError && <p className="comments-empty">还没有评论，来聊聊你的想法。</p>;
                  })()}
                  {commentHasMore && <button className="comments-load-more" disabled={commentsLoading} onClick={() => void loadMoreComments()}>{commentsLoading ? "正在加载…" : "更多评论"}</button>}
                </section>
              </div>
            </div>
            <form className="detail-action-bar" onSubmit={(event) => { event.preventDefault(); void addComment(); }}>
              <div className={`detail-comment-input${reply ? " replying" : ""}`}>
                <span className="comment-compose-avatar" aria-hidden="true"><span>{(state.name || "探").slice(0, 1)}</span>{state.avatar && <img src={state.avatar} alt="" onError={(event) => { event.currentTarget.dataset.failed = "true"; }} />}</span>
                {reply && <span className="reply-label">回复 {state.comments.find((c) => c.id === reply)?.name || "评论"}<button type="button" aria-label="取消回复" onClick={() => setReply(undefined)}><X size={13} /></button></span>}
                <textarea ref={commentInputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void addComment(); } }} placeholder="说说你的想法…" rows={1} maxLength={1000} aria-label="评论内容" />
                {draft.trim() && <button type="button" className="comment-clear" aria-label="清除输入" onClick={() => setDraft("")}><X size={14} /></button>}
                {draft.trim() && <button type="submit" className="comment-send" disabled={commentSending} aria-label="发送评论"><Send size={17} /></button>}
              </div>
              <button type="button" className={`bar-icon${state.liked?.includes(post.id) ? " selected" : ""}`} aria-label={state.liked?.includes(post.id) ? "取消点赞" : "点赞"} aria-pressed={!!state.liked?.includes(post.id)} disabled={likeBusy} onClick={() => {
                if (likeBusy) return;
                const next = !state.liked?.includes(post.id);
                setLikeBusy(true);
                void cloudRequest("/api/v1/library-state", { action: "like", id: post.id, value: next }).then(() => update((s) => ({ ...s, liked: next ? [...(s.liked || []), post.id] : (s.liked || []).filter((id) => id !== post.id) }))).catch(() => toast("点赞同步失败")).finally(() => setLikeBusy(false));
              }}><Heart size={21} fill={state.liked?.includes(post.id) ? "currentColor" : "none"} /></button>
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
                setPublicFeed((current) => [post, ...current.filter((item) => item.id !== post.id)]);
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
            {recentPreview.post.image || recentPreview.post.images?.[0] ? <img className="recent-preview-image" src={recentPreview.post.image || recentPreview.post.images?.[0]} alt="" onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "true"; event.currentTarget.src = "/image-not-loaded.svg"; } }} /> : <div className="recent-preview-image recent-preview-placeholder" style={{ background: coverColor(recentPreview.post.tag) }} aria-hidden="true"><span>{recentPreview.post.tag}</span></div>}
            <div className="recent-preview-copy"><small>{recentPreview.post.tag} · {recentPreview.post.author}</small><h2 id="recent-preview-title">{recentPreview.post.title}</h2><p>{recentPreview.post.body}</p><button type="button" className="recent-preview-open" onClick={() => { const item = recentPreview; setRecentPreview(null); requestAnimationFrame(() => openPost(item.post.id, item.source)); }}>查看内容 <ArrowRight size={17}/></button></div>
          </section>
        </div>
      )}
      {modal && (
        <div className={`modal-backdrop${modal === "write" ? " composer-backdrop" : ""}${modalClosing ? " is-closing" : ""}`} aria-hidden={modalClosing || undefined}>
          <div
            className={`modal ${modal === "write" ? "composer-modal" : ""} ${readingTransition ? `reading-${readingTransition}` : ""}`}
          >
            {modal === "write" ? <header className="composer-topbar">
              <button type="button" className="composer-back" onClick={() => setModal(null)} aria-label="返回"><ArrowLeft size={19}/><span>返回</span></button>
              <strong>{editing ? "编辑内容" : "分享一篇内容"}</strong>
              <span className="composer-topbar-status">{draftSaving ? "保存中" : draftSaved ? "已保存" : "草稿"}</span>
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
              <div className="composer-scroll">
                <div className="eyebrow">CREATE / STORY</div>
                <label>
                  标题
                  <input
                    value={title}
                    maxLength={80}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="给你的发现一个标题"
                  />
                </label>
                <label>
                  分类
                  <select value={writeTag} onChange={(event) => setWriteTag(event.target.value)}>
                    {tags.map((tag) => <option key={tag}>{tag}</option>)}
                  </select>
                </label>
                {accountId && <label className="composer-series-field">加入作品系列<select value={writeSeriesId} onChange={(event) => setWriteSeriesId(event.target.value)}><option value="">暂不加入系列</option>{creatorSeries.map((series) => <option key={series.id} value={series.id}>{series.title}</option>)}</select><small>系列可在「我的 → 我的作品」中创建和管理。</small></label>}
                <section className="composer-topic-section" aria-label="选择话题">
                  <div className="composer-section-heading"><span><strong>话题</strong><small>选择已有话题，也可以创建自己的话题</small></span><span>{writeTopics.length}/5</span></div>
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
                <label>
                  正文
                  <textarea
                    value={body}
                    maxLength={5000}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="写下你的观察、经验或想法"
                    rows={7}
                  />
                </label>
                <section className={`ai-workbench-demo${aiWorkbenchOpen ? " is-open" : ""}`} aria-label="AI 创作工作台">
                  <button type="button" className="ai-workbench-trigger" aria-expanded={aiWorkbenchOpen} onClick={() => setAiWorkbenchOpen((open) => !open)}><span><Sparkles size={17}/><strong>AI 创作工作台</strong><i>DEEPSEEK</i></span><small>{aiWorkbenchOpen ? "收起工作台" : "标题、提纲、润色与话题建议"}</small><ChevronDown size={17}/></button>
                  {aiWorkbenchOpen && <div className="ai-workbench-body"><div className="ai-workbench-modes">{([["outline", "生成提纲"], ["title", "标题建议"], ["polish", "润色正文"], ["topics", "推荐话题"]] as const).map(([mode, label]) => <button type="button" className={aiWorkbenchMode === mode ? "selected" : ""} key={mode} onClick={() => { setAiWorkbenchMode(mode); setAiWorkbenchOutput(""); }}>{label}</button>)}</div><p className="ai-workbench-guidance">AI 只提供可编辑的创作建议，不会自动发布内容。</p><button type="button" className="primary-button full ai-workbench-generate" disabled={aiWorkbenchBusy || (!title.trim() && !body.trim())} onClick={() => void generateAiWorkbench()}><Sparkles size={15}/>{aiWorkbenchBusy ? "DeepSeek 正在整理…" : "生成建议"}</button>{aiWorkbenchOutput && <><div className="ai-workbench-result"><small>DeepSeek 建议 · 未发布</small><p>{aiWorkbenchOutput}</p></div><button type="button" className="ai-workbench-apply" onClick={() => { if (aiWorkbenchMode === "title") setTitle(aiWorkbenchOutput.split("\n").filter(Boolean)[0]?.replace(/^\d+[.、)）]\s*/, "") || aiWorkbenchOutput); else if (aiWorkbenchMode === "polish") setBody(aiWorkbenchOutput); else if (aiWorkbenchMode === "topics") setWriteTopics((items) => [...new Set([...items, ...[...aiWorkbenchOutput.matchAll(/#?([\u4e00-\u9fa5A-Za-z0-9_-]{2,20})/g)].map((match) => match[1])])].slice(0, 5)); else setBody((current) => current.trim() ? `${current.trim()}\n\n${aiWorkbenchOutput}` : aiWorkbenchOutput); toast("建议已放入编辑区，可以继续修改"); }}>{aiWorkbenchMode === "title" ? "使用第一个标题" : aiWorkbenchMode === "topics" ? "添加推荐话题" : aiWorkbenchMode === "polish" ? "使用润色建议" : "插入写作提纲"}</button></>}{!aiWorkbenchOutput && <div className="ai-workbench-placeholder">{aiWorkbenchMode === "title" ? "填写正文后，生成多个标题方向。" : aiWorkbenchMode === "outline" ? "从你的标题和正文素材中，整理文章结构。" : aiWorkbenchMode === "polish" ? "保留原意与语气，改善正文表达。" : "从内容主题中找出更贴合的社区话题。"}</div>}</div>}
                </section>
                <section className="composer-media-section" aria-label="内容图片">
                  <div className="composer-section-heading"><span><strong>图片</strong><small>最多 9 张 · 上传时自动压缩，每张不超过 4 MB</small></span><span>{composerImages.length}/9</span></div>
                  <div className="composer-image-grid">
                    {composerImages.map((image, index) => (
                      <figure className={`composer-image${coverIndex === index ? " is-cover" : ""}`} key={image.id}>
                        <img src={image.url} alt={`第 ${index + 1} 张图片预览`} onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "true"; event.currentTarget.src = "/image-not-loaded.svg"; } }} />
                        {coverIndex === index && <span className="composer-cover-badge">封面</span>}
                        {image.status === "uploading" && <span className="composer-image-state">上传中…</span>}
                        {image.status === "failed" && <button type="button" className="composer-image-retry" disabled={uploadingImages} onClick={() => void retryComposerImage(image.id)}>上传失败 · 重试</button>}
                        <div className="composer-image-tools">
                          {coverIndex !== index && <button type="button" onClick={() => setCoverIndex(index)}>设为封面</button>}
                          <button type="button" aria-label={`第 ${index + 1} 张前移`} disabled={!index} onClick={() => moveComposerImage(index, -1)}>←</button>
                          <button type="button" aria-label={`第 ${index + 1} 张后移`} disabled={index === composerImages.length - 1} onClick={() => moveComposerImage(index, 1)}>→</button>
                          <button type="button" aria-label={`移除第 ${index + 1} 张`} onClick={() => void removeComposerImage(index)}>移除</button>
                        </div>
                      </figure>
                    ))}
                    {composerImages.length < 9 && <label className="composer-image-add">
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { void chooseComposerImages(event.target.files); event.currentTarget.value = ""; }} />
                      <Plus size={22} /><span>添加图片</span>
                    </label>}
                  </div>
                  <p className="composer-draft-status" role="status">{draftSaving ? "正在同步草稿…" : draftSaved ? "草稿已自动保存" : "输入内容后自动保存草稿"}</p>
                </section>
                <div className="preview">
                  <strong>预览 · {title || "未命名内容"}</strong>
                  <p>{body || "正文预览将显示在这里"}</p>
                </div>
                {!composerEditingPublished && (composerImages.length > 0 || title || body || state.own.some((item) => item.id === editing && item.status === "draft")) && <button type="button" className="composer-discard" onClick={() => void discardComposerDraft()}>删除草稿</button>}
                <p className="fineprint">
                  {accountId ? "草稿会自动同步到当前账号，发布后图片与内容一并保存。" : "草稿保存在此设备；登录后可发布并同步到云端。"}
                </p>
              </div>
            )}
            {modal === "write" && <footer className="composer-footer"><span><strong>{draftSaving ? "正在保存草稿" : draftSaved ? "草稿已保存" : "自动保存草稿"}</strong><small>{accountId ? "同步到当前账号" : "保存在此设备"}</small></span><button className="primary-button" disabled={uploadingImages || draftSaving || composerImages.some((image) => image.status === "uploading")} onClick={publish}>{uploadingImages || composerImages.some((image) => image.status === "uploading") ? "正在上传图片…" : composerEditingPublished ? "保存修改" : "发布内容"}</button></footer>}
          </div>
        </div>
      )}
      {notice && (
        <div key={noticeId} role="status" className={`toast${noticeLeaving ? " is-leaving" : ""}`}>
          {notice}
        </div>
      )}
    </main>
  );
}
