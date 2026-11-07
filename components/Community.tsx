Warning: truncated output (original token count: 56633)
Total output lines: 4042

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
  ChevronRight,
  X,
  Check,
  ArrowRight,
  MessageSquare,
  Share2,
  MessageCircle,
  ThumbsDown,
  MoreHorizontal,
  Flag,
  Sparkles,
  Crown,
  ShieldCheck,
} from "lucide-react";
import dynamic from "next/dynamic";
const Messages = dynamic(() => import("./Messages"), {
  loading: () => <div className="empty">正在加载消息…</div>,
});
const AdminModeration = dynamic(() => import("./AdminModeration"), {
  loading: () => <div className="empty">正在加载审核队列…</div>,
});
import EditorialArticle from "./EditorialArticle";
import AccountProfile from "./AccountProfile";
import type { ProfileDetails } from "./AccountProfile";
import PublicProfile from "./PublicProfile";
import MessagingPreferences from "./MessagingPreferences";
import InboxBadge from "./InboxBadge";
import { cloudRequest } from "@/lib/cloud";
import { browserDb } from "@/lib/browser-db";
import { clearDraftFiles, loadDraftFiles, saveDraftFiles } from "@/lib/draft-files";
import { validateComposerFiles } from "@/lib/composer-validation";
import type { TopicSummary } from "@/lib/topics";
import { tags, dayKey, coverColor, type Post } from "@/lib/content";
import { dailyCandidates, openDailyCard } from "@/lib/daily";
import { rankRecommendations, type CommunityRating } from "@/lib/recommendations";
import { cardRarity, cardRarityLabel, cardRarityTier, EXPERIENCE_LEVELS, experienceProgress, type CardRarityTier } from "@/lib/progression";
import { REPORT_REASONS } from "@/lib/report-validation";
import {
  announceNativeReady,
  hasNativeBridge,
  installNativeBridge,
  requestNativeNotificationPermission,
  subscribeNativeEvent,
} from "@/lib/native-bridge";

const FLIP_RAIN_PARTICLES = 112;
const FLIP_RAIN_DURATION_MIN_MS = 2900;
const FLIP_RAIN_DURATION_SPREAD_MS = 900;
const FLIP_RAIN_LEAD_MS = 240;
const FLIP_RAIN_STAGGER_WINDOW_MS = 900;
const FLIP_RAIN_JITTER_MS = 90;
const FLIP_RAIN_CLEANUP_MS = FLIP_RAIN_LEAD_MS + FLIP_RAIN_STAGGER_WINDOW_MS + FLIP_RAIN_JITTER_MS + FLIP_RAIN_DURATION_MIN_MS + FLIP_RAIN_DURATION_SPREAD_MS + 180;

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
type ExperienceSummary = { total: number; membershipTier: "free" | "plus" | "pro"; events: { type: "flip" | "rating"; points: number; createdAt: string }[] };
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
  const flipBusy = useRef(false),
    transitionBusy = useRef(false),
    viewerStageRef = useRef<HTMLDivElement | null>(null),
    loadMoreRef = useRef<HTMLDivElement | null>(null),
    scrollPositions = useRef<Record<string, number>>({});
  const sharedPostHandled = useRef<string | null>(null);
  const sharedConversationHandled = useRef<string | null>(null);
  const [authorProfile, setAuthorProfile] = useState<string | null>(null);
  const [messagePeer, setMessagePeer] = useState<string | null>(null);
  const [messageConversation, setMessageConversation] = useState<string | null>(null);
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
  const nativeBackHandler = useRef<() => boolean>(() => false);
  const nativeNavigationHandler = useRef<(payload: Record<string, unknown>) => boolean>(() => false);
  const [facetIndex, setFacetIndex] = useState(0);
  const [communityRatings, setCommunityRatings] = useState<Record<number, CommunityRating>>({});
  const [experienceSummary, setExperienceSummary] = useState<ExperienceSummary>({ total: 0, membershipTier: "free", events: [] });
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
  const [favoriteSource, setFavoriteSource] = useState("全部"),
    [mineSection, setMineSection] = useState<"favorites" | "liked" | "calendar" | "recent">("favorites"),
    [settingsDetail, setSettingsDetailState] = useState<"theme" | "font" | "bottomNav" | "discoverLayout" | "homeMode" | "reading" | "notifications" | "profile" | "interests" | "privacy" | "progression" | null>(null),
    [settingsReturnTab, setSettingsReturnTab] = useState<"settings" | "mine">("settings"),
    [myContentReturnTab, setMyContentReturnTab] = useState<"mine" | "settings">("settings"),
    [selectedCalendarDate, setSelectedCalendarDate] = useState(""),
    [readingTransition, setReadingTransition] = useState<"out" | "in" | null>(
      null,
    ),
    [notificationPermission, setNotificationPermission] = useState<
      "default" | "granted" | "denied" | "unsupported"
    >("default");
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
      | "subscription"
      | "report"
      | null
    >(null),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [writeTag, setWriteTag] = useState<string>(tags[0]),
    [writeTopics, setWriteTopics] = useState<string[]>([]),
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
  const closeSearch = () => setTab(searchReturnTab || "discover");
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
  const imageTouchStart = useRef<number | null>(null);
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
      [...publicFeed, ...topicPosts, ...searchPosts, ...Object.values(state.revealed), ...state.own].map(
        (post) => [post.id, post],
      ),
    ).values(),
  ], [publicFeed, topicPosts, searchPosts, state.revealed, state.own]);
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
  const dailyAllowance = 5 + luckyBonusToday;
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
  );
  const visibleCandidates = candidates.slice(0, page);
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
  const likedPosts = all.filter((post) => state.liked?.includes(post.id));
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let loaded: State = initial;
      try {
        const raw = localStorage.getItem("heika-demo-v1");
        if (raw) {
          const saved = JSON.parse(raw);
          loaded = {
            ...initial,
            ...saved,
            comments: [],
            dailyCount: 5,
            revealed: saved.revealed || {},
            rarityTiers: saved.rarityTiers || {},
            notifications: saved.notifications || initial.notifications,
            readingMode:
              saved.readingMode ||
              (saved.compactReading ? "focus" : "standard"),
          };
          const legacyOpened = [
            ...new Set<number>(Object.values(loaded.opened).flat()),
          ].filter((id) => !loaded.revealed[id]);
          if (legacyOpened.length) {
            const batches = Array.from({ length: Math.ceil(legacyOpened.length / 100) }, (_, index) => legacyOpened.slice(index * 100, (index + 1) * 100));
            const results = (await Promise.all(batches.map(async (ids) => {
              const response = await fetch("/api/demo/cards", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
              });
              const result = await response.json();
              return response.ok && Array.isArray(result.data?.items) ? result.data.items as Post[] : [];
            }))).flat();
            loaded = {
              ...loaded,
              rarityTiers: {
                ...loaded.rarityTiers,
                ...Object.fromEntries(
                  results
                    .filter((post): post is Post => Boolean(post.rarityTier))
                    .map((post) => [post.id, post.rarityTier!]),
                ),
              },
              revealed: {
                ...loaded.revealed,
                ...Object.fromEntries(
                  results
                    .filter((post): post is Post => Boolean(post))
                    .map((post) => [post.id, post]),
                ),
              },
            };
          }
        }
      } catch {}
      if (cancelled) return;
      setState(loaded);
      try {
        const response = await fetch("/api/demo/cards", { cache: "no-store" });
        const { data } = await response.json();
        if (!cancelled && Array.isArray(data))
          setState((current) => ({
            ...current,
            cardIds: data.map((item: { id: number }) => item.id),
          }));
      } catch {}
      if (!cancelled) setReady(true);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      const cachedState: Partial<State> = { ...state };
      delete cachedState.comments;
      localStorage.setItem(storageKey, JSON.stringify(cachedState));
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
    if (hasNativeBridge()) {
      setNotificationPermission("default");
      return;
    }
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
    const params = new URLSearchParams({ mode: "discover", page: String(requestedPage), limit: "24" });
    if (requestedTag !== "全部") params.set("tag", requestedTag);
    try {
      const response = await fetch(`/api/demo/cards?${params}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error("内容加载失败");
      const payload = result.data;
      const items: Post[] | undefined = Array.isArray(payload) ? payload : payload?.items;
      if (!Array.isArray(items)) throw new Error("内容格式无效");
      if (controller.signal.aborted) return;
      setPublicFeed((current) => reset ? items : [...current, ...items.filter((item) =…41633 tokens truncated…slice(0, 280)}…`;
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
          {previewImage && detailImages[activeImageIndex] && <div className="detail-image-preview" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setPreviewImage(false)}><button aria-label="关闭图片预览" onClick={() => setPreviewImage(false)}><X size={23} /></button><img src={detailImages[activeImageIndex]} alt={post.title} /></div>}
        </div>
      )}
      {authorProfile && (
        <PublicProfile
          id={authorProfile}
          onClose={() => setAuthorProfile(null)}
          onMessage={(id) => {
            setAuthorProfile(null);
            setMessagePeer(id);
            setTab("messages");
            setDetail(null);
            setViewerId(null);
          }}
        />
      )}
      {modal && (
        <div className={`modal-backdrop${modal === "write" ? " composer-backdrop" : ""}${modalClosing ? " is-closing" : ""}`} aria-hidden={modalClosing || undefined}>
          <div
            className={`modal ${modal === "subscription" ? "subscription-dialog" : ""} ${modal === "write" ? "composer-modal" : ""} ${readingTransition ? `reading-${readingTransition}` : ""}`}
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
            ) : modal === "subscription" ? (
              <div className="subscription-layout">
                <header className="subscription-header"><h2>翻卡计划</h2></header>
                <div className="subscription-scroll">
                  <div className="subscription-quota" aria-live="polite"><span>当前额度</span><strong>{dailyAllowance} 次</strong></div>
                  <div className="subscription-section-label"><strong>选择套餐</strong></div>
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
                          {extraFlipPacks.map((count) => <button type="button" key={count} className={selectedFlipPack === count ? "selected" : ""} aria-pressed={selectedFlipPack === count} onClick={() => setSelectedFlipPack(count)}>
                            <strong>+{count}</strong><span>次翻卡</span>
                          </button>)}
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
                        <p>每次翻卡的幸运奖励概率：+2 次 10%、+3 次 5%、+5 次 1.5%、+10 次 0.1%；幸运加成每日最多累计 10 次。</p>
                        <p>额外翻卡包为一次性补充。当前页面仅供预览，不会扣款、创建订单或开通权益。</p>
                      </div>
                    </div>
                  </section>
                </div>
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
                    {hasNativeBridge() ? "Android 通知权限已关闭，请在系统设置中重新允许。" : "浏览器通知权限已拒绝，请在站点设置中重新允许。"}
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
                <section className="composer-media-section" aria-label="内容图片">
                  <div className="composer-section-heading"><span><strong>图片</strong><small>最多 9 张 · JPG、PNG、WebP，每张不超过 5 MB</small></span><span>{composerImages.length}/9</span></div>
                  <div className="composer-image-grid">
                    {composerImages.map((image, index) => (
                      <figure className={`composer-image${coverIndex === index ? " is-cover" : ""}`} key={image.id}>
                        <img src={image.url} alt={`第 ${index + 1} 张图片预览`} />
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
