"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  Sparkles,
  Crown,
} from "lucide-react";
import dynamic from "next/dynamic";
const Messages = dynamic(() => import("./Messages"), {
  loading: () => <div className="empty">正在加载消息…</div>,
});
import EditorialArticle from "./EditorialArticle";
import AccountProfile from "./AccountProfile";
import PublicProfile from "./PublicProfile";
import InboxBadge from "./InboxBadge";
import { cloudRequest } from "@/lib/cloud";
import { browserDb } from "@/lib/browser-db";
import { tags, dayKey, coverColor, type Post } from "@/lib/content";
import { dailyCandidates, openDailyCard } from "@/lib/daily";
import { rankRecommendations, type CommunityRating } from "@/lib/recommendations";

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
type State = {
  avatar?: string;
  liked?: number[];
  dismissed?: number[];
  homeMode: "waterfall" | "blackcard";
  dailyCount: number;
  luckyBonus: Record<string, number>;
  interests: string[];
  onboardingDone?: boolean;
  cardIds: number[];
  revealed: Record<number, Post>;
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
  viewed: number[];
};
const initial: State = {
  homeMode: "waterfall",
  dailyCount: 5,
  luckyBonus: {},
  interests: [],
  onboardingDone: false,
  cardIds: [],
  revealed: {},
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
  viewed: [],
};
const membershipPlans = [
  { id: "plus", name: "Plus", price: 12, dailyFlips: 9 },
  { id: "pro", name: "Pro", price: 16, dailyFlips: 13 },
] as const;
const extraFlipPacks = [3, 5, 10] as const;

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
  const flipBusy = useRef(false),
    transitionBusy = useRef(false),
    viewerStageRef = useRef<HTMLDivElement | null>(null),
    loadMoreRef = useRef<HTMLDivElement | null>(null),
    scrollPositions = useRef<Record<string, number>>({});
  const sharedPostHandled = useRef<string | null>(null);
  const [authorProfile, setAuthorProfile] = useState<string | null>(null);
  const [messagePeer, setMessagePeer] = useState<string | null>(null);
  const [storageKey, setStorageKey] = useState("heika-demo-v1");
  const [accountId, setAccountId] = useState<string | null>(null);
  const cloudHydrated = useRef(false);
  const pullStart = useRef<number | null>(null);
  const [facetIndex, setFacetIndex] = useState(0);
  const [communityRatings, setCommunityRatings] = useState<Record<number, CommunityRating>>({});
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
  const flipRainTimer = useRef<number | null>(null);
  const [flipRainId, setFlipRainId] = useState<number | null>(null);
  const [dayTick, setDayTick] = useState(0),
    [viewerId, setViewerId] = useState<number | null>(null),
    [viewerRect, setViewerRect] = useState<DOMRect | null>(null),
    [viewerPhase, setViewerPhase] = useState<"opening" | "closing" | null>(
      null,
    ),
    [viewerFlipped, setViewerFlipped] = useState(false),
    [flippingId, setFlippingId] = useState<number | null>(null),
    [publicFeed, setPublicFeed] = useState<Post[]>([]),
    publicFeedLoading = useRef(false),
    detailSource = useRef<"today" | "discover">("today");
  const [favoriteSource, setFavoriteSource] = useState("全部"),
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
    [tab, setTab] = useState("today"),
    [detail, setDetail] = useState<number | null>(null),
    [detailReady, setDetailReady] = useState(false),
    [transitionPhase, setTransitionPhase] = useState<
      "opening" | "closing" | null
    >(null),
    [justFlippedId, setJustFlippedId] = useState<number | null>(null),
    [category, setCategory] = useState("全部"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(12),
    [sort, setSort] = useState("精选"),
    [draft, setDraft] = useState(""),
    [reply, setReply] = useState<number | undefined>(),
    [modal, setModal] = useState<
      | "write"
      | "profile"
      | "interests"
      | "notifications"
      | "reading"
      | "browsing"
      | "subscription"
      | null
    >(null),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [writeTag, setWriteTag] = useState<string>(tags[0]),
    [editing, setEditing] = useState<number | null>(null),
    [notice, setNotice] = useState("");
  const [detailSort, setDetailSort] = useState<"热度" | "最新">("最新");
  const [commentSending, setCommentSending] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [previewImage, setPreviewImage] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const imageTouchStart = useRef<number | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<number, boolean>>({});
  const [detailMoreOpen, setDetailMoreOpen] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
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
  const all = [
    ...new Map(
      [...publicFeed, ...Object.values(state.revealed), ...state.own].map(
        (post) => [post.id, post],
      ),
    ).values(),
  ];
  const opened = state.opened[today] || [];
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
            dailyCount: 5,
            revealed: saved.revealed || {},
            notifications: saved.notifications || initial.notifications,
            readingMode:
              saved.readingMode ||
              (saved.compactReading ? "focus" : "standard"),
          };
          const legacyOpened = [
            ...new Set<number>(Object.values(loaded.opened).flat()),
          ].filter((id) => !loaded.revealed[id]);
          if (legacyOpened.length) {
            const results = await Promise.all(
              legacyOpened.map(async (id) => {
                const response = await fetch("/api/demo/cards", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id }),
                });
                const result = await response.json();
                return response.ok ? (result.data as Post) : undefined;
              }),
            );
            loaded = {
              ...loaded,
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
    if (ready) localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, ready, storageKey]);
  useEffect(() => () => {
    readingTimer.current.forEach(window.clearTimeout);
    if (ratingPulseTimer.current !== null) window.clearTimeout(ratingPulseTimer.current);
    if (luckyRewardTimer.current !== null) window.clearTimeout(luckyRewardTimer.current);
    if (flipRainTimer.current !== null) window.clearTimeout(flipRainTimer.current);
  }, []);
  useEffect(() => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);
  useEffect(() => {
    if (
      !["today", "discover", "mine"].includes(tab) ||
      publicFeed.length ||
      publicFeedLoading.current
    )
      return;
    let cancelled = false;
    publicFeedLoading.current = true;
    fetch("/api/demo/cards?mode=discover", { cache: "no-store" })
      .then((r) => r.json())
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data)) setPublicFeed(data);
      })
      .catch(() => {})
      .finally(() => {
        publicFeedLoading.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [tab, publicFeed.length]);
  useEffect(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = window.setTimeout(
      () => setDayTick((n) => n + 1),
      next.getTime() - now.getTime() + 100,
    );
    return () => window.clearTimeout(timer);
  }, [dayTick]);
  const update = (fn: (s: State) => State) => setState((s) => fn({ ...s }));
  const submitRating = async (postId: number, score: number) => {
    if (ratingBusy.current) return;
    ratingBusy.current = true;
    update((s) => ({ ...s, ratings: { ...s.ratings, [postId]: score } }));
    setRatingPulse({ postId, score });
    if (ratingPulseTimer.current !== null) window.clearTimeout(ratingPulseTimer.current);
    ratingPulseTimer.current = window.setTimeout(() => setRatingPulse(null), 1100);
    try {
      if (!accountId) {
        toast("评分已保存在本机；登录后可计入社区均分与推荐");
        return;
      }
      const result = await cloudRequest(`/api/v1/posts/${postId}/rating`, { rating: score });
      setCommunityRatings((current) => ({ ...current, [postId]: { average: result.average, count: result.count } }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "评分暂未同步，请稍后重试");
    } finally {
      ratingBusy.current = false;
    }
  };
  const toast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3000);
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
      setState({ ...initial, cardIds: state.cardIds });
      setTheme("dark");
      setFontChoice("oppo");
      setSelectedCalendarDate("");
      setTab("today");
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
    setDetailImageTransition(
      sourceImage && sourceRect && sourceImageUrl && sourceRect.width && sourceRect.height
        ? { rect: sourceRect, src: sourceImageUrl, sourceImage }
        : null,
    );
    if (viewerId === id) {
      cancelFlipRain(id);
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
  useEffect(() => {
    const sharedId = new URLSearchParams(location.search).get("post");
    if (!ready || !sharedId || detail !== null || sharedPostHandled.current === sharedId) return;
    const id = Number(sharedId);
    if (!Number.isFinite(id) || !all.some((item) => item.id === id)) return;
    sharedPostHandled.current = sharedId;
    openPost(id, "discover");
  }, [ready, detail, publicFeed, state.own, state.revealed]);
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
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animation: Animation | undefined;
    let imageAnimation: Animation | undefined;
    let imageClone: HTMLImageElement | null = null;
    let imageTarget: HTMLImageElement | null = null;
    let cancelled = false;
    let finished = false;
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
    const detailNode = document.querySelector<HTMLElement>(".overlay .detail");
    if (!detailNode || reduced) {
      finish();
      return;
    }
    animation = detailNode.animate(
      opening
        ? [
            { opacity: 1, transform: "translate3d(0,24px,0)" },
            { opacity: 1, transform: "translate3d(0,0,0)" },
          ]
        : [
            { opacity: 1, transform: "translate3d(0,0,0)" },
            { opacity: 1, transform: "translate3d(0,18px,0)" },
          ],
      { duration: opening ? 430 : 300, easing: "cubic-bezier(.2,.78,.18,1)", fill: "both" },
    );
    animation.onfinish = finish;
    const transitionImage = detailImageTransition;
    if (transitionImage) {
      imageTarget = document.querySelector<HTMLImageElement>(".overlay .detail-image-button img");
      if (imageTarget) {
        const animateImage = async () => {
          imageTarget?.style.setProperty("visibility", "hidden");
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
            left: `${to.left}px`,
            top: `${to.top}px`,
            width: `${to.width}px`,
            height: `${to.height}px`,
            objectFit: "cover",
            objectPosition: "center",
            zIndex: "120",
            pointerEvents: "none",
            willChange: "left,top,width,height,border-radius",
          });
          document.body.appendChild(imageClone);
          imageAnimation = imageClone.animate(
            [
              { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: "6px" },
              { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: "0px" },
            ],
            { duration: opening ? 430 : 300, easing: "cubic-bezier(.2,.78,.18,1)", fill: "both" },
          );
          imageAnimation.onfinish = () => {
            imageTarget?.style.removeProperty("visibility");
            imageClone?.remove();
            imageClone = null;
          };
        };
        void animateImage();
      }
    }
    return () => {
      cancelled = true;
      animation?.cancel();
      imageAnimation?.cancel();
      imageTarget?.style.removeProperty("visibility");
      imageClone?.remove();
    };
  }, [transitionPhase, detailImageTransition]);
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
    if (state.revealed[id]) {
      setViewerRect(origin?.getBoundingClientRect() || findVisibleCard(id));
      setViewerId(id);
      setViewerFlipped(true);
      setViewerPhase("opening");
      return;
    }
    if (opened.length >= dailyAllowance) {
      toast(`今天的 ${dailyAllowance} 张卡片已经选完，已解锁内容仍可查看。`);
      return;
    }
    setViewerFlipped(false);
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
      (candidate) => !state.revealed[candidate.id] && !opened.includes(candidate.id),
    );
    const unlocked = candidates.filter((candidate) => Boolean(state.revealed[candidate.id]));
    const pool = opened.length < dailyAllowance ? [...available, ...unlocked] : unlocked;
    if (!pool.length) {
      toast(`今天的 ${dailyAllowance} 张卡片已经选完，已解锁内容仍可查看。`);
      return;
    }
    const assigned = candidates.find((candidate, candidatePosition) =>
      Boolean(state.revealed[candidate.id]) &&
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
      const response = await fetch("/api/demo/cards", {
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
      const next = {
        ...state,
        luckyBonus: nextLuckyBonus,
        revealed: { ...state.revealed, [id]: result.data },
        opened: {
          ...state.opened,
          [today]: openDailyCard(used, id, dailyAllowance),
        },
      };
      localStorage.setItem(storageKey, JSON.stringify(next));
      setState(next);
      setViewerFlipped(true);
      if (lucky) {
        if (luckyRewardTimer.current !== null) window.clearTimeout(luckyRewardTimer.current);
        setLuckyReward({ postId: id, amount: lucky });
        luckyRewardTimer.current = window.setTimeout(() => setLuckyReward(null), 2800);
      }
      void cloudRequest("/api/v1/library-state", { action: "open", id }).catch(
        () => toast("阅读记录云端同步失败，本地已保留"),
      );
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
      setDraft("");
      setReply(undefined);
      toast("评论已发布");
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
        comments: s.comments.filter((x) => x.id !== c.id && x.parent !== c.id),
      }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败");
    }
  };
  const publish = async () => {
    if (!title.trim() || !body.trim()) return toast("请填写标题和正文");
    if (!accountId) return toast("请先在消息页面登录，当前输入会保留");
    try {
      const old = state.own.find((p) => p.id === editing);
      const item = await cloudRequest("/api/v1/library-state", {
        action: "publish",
        id: old?.cloudId ? editing : undefined,
        title,
        body,
        tag: writeTag,
      });
      if (!item) return;
      update((s) => ({
        ...s,
        own: [
          item,
          ...s.own.filter((p) => p.id !== editing && p.id !== item.id),
        ],
        cardIds: [...new Set([...s.cardIds, item.id])],
      }));
      setPublicFeed((s) => [item, ...s.filter((p) => p.id !== item.id)]);
      setModal(null);
      setTitle("");
      setBody("");
      setEditing(null);
      toast("内容已保存到云端");
    } catch (e) {
      toast(e instanceof Error ? e.message : "发布失败，请重试");
    }
  };
  useEffect(() => {
    if (detail === null) return;
    setActiveImageIndex(0);
    setPreviewImage(false);
    let alive = true;
    void fetch(`/api/library-comments?id=${detail}`)
      .then((r) => r.json())
      .then((result) => {
        if (alive && Array.isArray(result.data))
          setState((s) => ({
            ...s,
            comments: [
              ...s.comments.filter((c) => c.post !== detail || !c.cloudId),
              ...result.data,
            ],
          }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [detail]);
  const [feedError, setFeedError] = useState("");
  const refreshFeed = async () => {
    setFeedError("");
    try {
      const response = await fetch("/api/demo/cards?mode=discover", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const { data } = await response.json();
      setPublicFeed(data);
      setPage(12);
    } catch {
      setFeedError("内容加载失败，请重试");
    }
  };
  const ratingIdsKey = [...new Set(all.map((post) => post.id))].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!ready || !ratingIdsKey) return;
    const controller = new AbortController();
    fetch(`/api/v1/ratings?ids=${ratingIdsKey}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (!controller.signal.aborted && result.data && typeof result.data === "object")
          setCommunityRatings(result.data as Record<number, CommunityRating>);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [ready, ratingIdsKey]);
  const filtered = useMemo(
    () => rankRecommendations(
      publicFeed.filter(
        (p) =>
          !state.dismissed?.includes(p.id) &&
          (category === "全部" || p.tag === category) &&
          (!query || `${p.title}${p.body}`.includes(query)),
      ),
      state.interests,
      state.viewed,
      state.ratings,
      communityRatings,
    ),
    [
      publicFeed,
      category,
      query,
      state.dismissed,
      state.interests,
      state.viewed,
      state.ratings,
      communityRatings,
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
    if (page >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setPage((n) => n + 12);
      },
      { rootMargin: "400px" },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [ready, tab, page, filtered.length, candidates.length, detail, viewerId]);
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
  const post = detail === null ? null : all.find((p) => p.id === detail);
  const detailImages = post
    ? (post.images?.filter(Boolean).length ? post.images.filter(Boolean) : post.image ? [post.image] : [])
    : [];
  const postCard = (p: Post, source: "today" | "discover" = "discover") => (
    <button
      className="post-card editorial-post"
      key={p.id}
      data-discover-id={p.id}
      onClick={(event) => openPost(p.id, source, event.currentTarget)}
    >
      <div
        className="post-cover editorial-cover"
        style={{ background: coverColor(p.tag) }}
      >
        {p.image && (
          <img
            src={p.image}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.dataset.failed = "true";
            }}
          />
        )}
        <span>{p.cover}</span>
      </div>
      <div className="post-meta">
        <small>{p.tag}</small>
        <b>{p.title}</b>
        <p className="post-summary">{p.body.slice(0, 100)}</p>
        <div>
          <span>{p.author}</span>
          <span>{state.saved.includes(p.id) ? "♥ 已收藏" : "阅读 ↗"}</span>
        </div>
      </div>
    </button>
  );
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
        <div className="masonry editorial-feed">
          {items.map((item) => postCard(item))}
        </div>
      ) : (
        <div className="empty">这里暂时没有内容，试试其他话题。</div>
      )}
      {items.length < filtered.length && (
        <div ref={loadMoreRef} className="feed-sentinel">
          <span>正在发现更多内容…</span>
          <button onClick={() => setPage((n) => n + 12)}>加载更多</button>
        </div>
      )}
    </>
  );

  const renderCandidate = (p: Post) => {
    const revealed = state.revealed[p.id],
      unlocked = Boolean(revealed);
    return (
      <button
        key={p.id}
        data-card-id={p.id}
        className={`candidate-feed-card flip-in-place${unlocked ? " is-unlocked" : ""}${justFlippedId === p.id ? " just-flipped" : ""}${detail === p.id ? " is-detail-source" : ""}`}
        onClick={() => flip(p.id)}
        aria-label={unlocked ? `阅读 ${revealed.title}` : opened.length >= dailyAllowance ? `今日 ${dailyAllowance} 张已翻完，点击查看提示` : "选择并翻开一张未知卡片"}
      >
        <span className="card-flip-inner">
          <span className="card-flip-face card-flip-front">
            <span className="card-number">{String(p.id).padStart(2, "0")}</span>
            <span className="card-brand">黑卡 · HEIKA</span>
            <span className="card-prompt">轻触翻开</span>
          </span>
          <span
            className="card-flip-face card-flip-back"
            style={{
              background: revealed ? coverColor(revealed.tag) : "#e7e4dd",
            }}
          >
            {revealed?.image && (
              <img
                src={revealed.image}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.dataset.failed = "true";
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
    if (!ready) return;
    let alive = true;
    let cleanup = () => {};
    void browserDb()
      .then(async (db) => {
        const hydrate = async () => {
          cloudHydrated.current = false;
          const {
            data: { user },
          } = await db.auth.getUser();
          if (!alive) return;
          setAccountId(user?.id || null);
          if (!user) {
            setStorageKey("heika-demo-v1");
            try {
              const guest = JSON.parse(
                localStorage.getItem("heika-demo-v1") || "null",
              );
              if (guest)
                setState((s) => ({ ...initial, ...guest, cardIds: s.cardIds }));
            } catch {}
            return;
          }
          try {
            const data = await cloudRequest("/api/v1/library-state");
            if (!alive || !data) return;
            setStorageKey(`heika-user-${user.id}`);
            setState((previous) => {
              let local;
              try {
                local = JSON.parse(
                  localStorage.getItem(`heika-user-${user.id}`) || "null",
                );
              } catch {}
              const s: State = {
                ...initial,
                ...local,
                cardIds: previous.cardIds,
              };
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
              for (const row of data.interactions) {
                if (row.opened_at && row.posts) {
                  const day = row.opened_at.slice(0, 10);
                  opened[day] = [
                    ...new Set([
                      ...(opened[day] || []),
                      Number(row.posts.client_id),
                    ]),
                  ];
                }
              }
              return {
                ...s,
                onboardingDone:
                  previous.onboardingDone || Boolean(data.interests.length),
                name: data.profile.nickname,
                bio: data.profile.bio,
                avatar: data.profile.avatar_url,
                saved,
                opened,
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
            toast(e instanceof Error ? e.message : "云端同步失败");
          }
        };
        await hydrate();
        const { data } = db.auth.onAuthStateChange(() =>
          queueMicrotask(() => void hydrate()),
        );
        cleanup = () => data.subscription.unsubscribe();
      })
      .catch(() => {});
    return () => {
      alive = false;
      cleanup();
    };
  }, [ready]);
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
    <main className="app">
      <div className="topline">
        <span className="brand">
          黑卡 <i>HEIKA</i>
        </span>
        <span className="demo-pill">
          {accountId ? "已登录 · 云端同步" : "访客探索 · 登录后同步"}
        </span>
      </div>
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
              <button className="quota-plan-link" onClick={() => setModal("subscription")}><Crown size={14}/> 翻卡方案</button>
            </div>
          )}
          {state.homeMode === "waterfall" ? (
            <>
              <div className="candidate-feed waterfall-card-feed">
                {visibleCandidates.map(renderCandidate)}
              </div>
              {visibleCandidates.length < candidates.length && (
                <div ref={loadMoreRef} className="feed-sentinel">
                  <span>继续浏览未解锁的卡片</span>
                  <button onClick={() => setPage((count) => count + 12)}>加载更多</button>
                </div>
              )}
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
                      Boolean(state.revealed[candidate.id]) &&
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
                <button className="quota-plan-link" onClick={() => setModal("subscription")}><Crown size={14}/> 翻卡方案</button>
              </div>
            </>
          )}
        </section>
      )}
      {tab === "discover" && (
        <section className="page editorial-home">
          <div className="search">
            <Search size={18} />
            <input
              aria-label="搜索内容"
              placeholder="搜索标题或内容"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(12);
              }}
            />
          </div>
          <div className="filters editorial-filters">
            {["全部", ...tags].map((t) => (
              <button
                key={t}
                className={category === t ? "selected" : ""}
                onClick={() => {
                  setCategory(t);
                  setPage(12);
                }}
              >
                {t === "全部" ? "推荐" : t}
              </button>
            ))}
          </div>
          <div className="section-head editorial-section-head">
            <h2>{category === "全部" ? "为你推荐" : category}</h2>
            <span>{filtered.length} 篇内容</span>
          </div>
          {feed(list)}
        </section>
      )}

      {tab === "messages" && (
        <Messages
          initialPeer={messagePeer}
          onPeerOpened={() => setMessagePeer(null)}
        />
      )}
      {tab === "settings" && (
        <section className="page settings-page">
          <button className="back settings-back" onClick={() => {
            setTab("mine");
            requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.mine || 0, behavior: "instant" }));
          }}><ArrowLeft size={18} /> 我的</button>
          <h1>设置<span className="red-dot">.</span></h1>
          <p className="lead">按模块管理你的黑卡体验。</p>
                  <div className="settings-module">
            <div className="settings-module-heading"><strong>外观</strong><small>主题</small></div>
            <div className="theme-options" role="radiogroup" aria-label="外观主题">
              {([['dark','深色'],['light','浅色'],['system','跟随系统']] as const).map(([value,label])=><button key={value} role="radio" aria-checked={theme===value} className={`theme-option${theme===value?' selected':''}`} onClick={()=>setTheme(value)}><span className={`theme-swatch ${value}`} /><span>{label}</span><i>{theme===value?'✓':''}</i></button>)}
            </div>
          </div>
          <div className="settings-module">
            <div className="settings-module-heading"><strong>字体</strong><small>全局字体</small></div>
            <div className="font-options" role="radiogroup" aria-label="字体选择">
              {([['oppo', 'OPPO Sans 4.0', '优先使用 OPPO 字体'], ['system', '系统字体', '跟随设备默认字体']] as const).map(([value, label, description]) => (
                <button key={value} role="radio" aria-checked={fontChoice === value} className={`font-option${fontChoice === value ? " selected" : ""}`} onClick={() => setFontChoice(value)}>
                  <span><strong>{label}</strong><small>{description}</small></span>
                  <i>{fontChoice === value ? "✓" : ""}</i>
                </button>
              ))}
            </div>
          </div>
          <div className="settings-module">
            <div className="settings-module-heading"><strong>浏览与阅读</strong></div>
            <div className="settings-list">
              <button onClick={() => setModal("browsing")}><span>首页浏览模式</span><small>{state.homeMode === "waterfall" ? "瀑布流" : "黑卡"}</small><ChevronRight size={16}/></button>
              <button onClick={() => setModal("reading")}><span>阅读模式</span><small>{{standard:"标准模式",focus:"沉浸模式",night:"夜间模式"}[state.readingMode]}</small><ChevronRight size={16}/></button>
            </div>
          </div>
          <div className="settings-module">
            <div className="settings-module-heading"><strong>消息与隐私</strong></div>
            <div className="settings-list">
              <button onClick={() => setModal("notifications")}><span>通知设置</span><small>{Object.values(state.notifications).some(Boolean)?"已开启":"已关闭"}</small><ChevronRight size={16}/></button>
              <button onClick={() => setTab("messages")}><span>私聊权限与黑名单</span><small>在消息页管理</small><ChevronRight size={16}/></button>
            </div>
          </div>
          <div className="settings-module">
            <div className="settings-module-heading"><strong>账号</strong></div>
            <div className="settings-list">
              <button onClick={() => setModal("profile")}><span>个人资料</span><ChevronRight size={16}/></button>
              <button onClick={() => setModal("interests")}><span>兴趣偏好</span><ChevronRight size={16}/></button>
              <button onClick={() => setTab("about")}><span>关于黑卡</span><small>版本 1.19</small><ChevronRight size={16}/></button>
            </div>
          </div>
          {accountId && <p className="fineprint">当前账号数据会同步至云端。</p>}
        </section>
      )}
      {tab === "about" && (
        <section className="page about-page">
          <button className="back settings-back" onClick={() => setTab("settings")}><ArrowLeft size={18} /> 设置</button>
          <div className="eyebrow">HEIKA / RELEASE NOTES</div>
          <h1>关于黑卡<span className="red-dot">.</span></h1>
          <p className="lead">黑卡 HEIKA · 版本 1.19</p>
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
          <button className="primary-button full debug-reset-button" disabled={resetBusy} onClick={() => void resetToFreshStart()}>
            <RefreshCw size={17} /> {resetBusy ? "正在重置…" : "一键重置，重新开始"}
          </button>
        </section>
      )}
      {tab === "mine" && (
        <section className="page mine-page">
          <h1 className="mine-title">我</h1>
          <div className="profile-card">
            <div className="avatar">
              {state.avatar ? (
                <img src={state.avatar} alt="头像" />
              ) : (
                state.name[0]
              )}
            </div>
            <div>
              <h2>{state.name}</h2>
              <p>{state.bio}</p>
            </div>
            <button aria-label="编辑资料" onClick={() => setModal("profile")}>
              <PenLine size={18} />
            </button>
          </div>
          <div className="stats exploration-stats">
            <div>
              <strong>{openedIds.length}</strong>
              <span>累计翻卡</span>
            </div>
            <div>
              <strong>{streak}</strong>
              <span>连续探索</span>
            </div>
            <div>
              <strong>{state.saved.length}</strong>
              <span>我的收藏</span>
            </div>
          </div>
          <div className="mine-membership-section">
            <div className="section-head"><h2>会员与翻卡额度</h2><span>PLUS / PRO</span></div>
            <button className="mine-membership-card" onClick={() => setModal("subscription")}>
              <span className="mine-membership-mark"><Crown size={19}/></span>
              <span className="mine-membership-copy"><strong>订阅方案 · 额外翻卡</strong><small>Plus 每日 +4 次 · Pro 每日 +8 次</small></span>
              <span className="mine-membership-count">今日 {dailyAllowance} 次</span>
              <ChevronRight size={17}/>
            </button>
          </div>
          <div className="section-head exploration-calendar-heading">
            <h2>我的探索日历</h2>
            <span>最近 28 天</span>
          </div>
          <div
            className="exploration-calendar"
            role="group"
            aria-label="最近 28 天的翻卡记录"
          >
            {calendarDays.map(({ key, count }) => (
              <button
                key={key}
                type="button"
                className={`calendar-day level-${Math.min(count, 5)}${selectedDay === key ? " selected" : ""}`}
                aria-label={`${key}，翻开 ${count} 张`}
                aria-pressed={selectedDay === key}
                onClick={() => setSelectedCalendarDate(key)}
                title={`${key} · ${count} 张`}
              />
            ))}
          </div>
          <div className="calendar-day-detail">
            <div>
              <strong>
                {(() => {
                  const [year, month, day] = selectedDay.split("-");
                  return `${year}年${Number(month)}月${Number(day)}日`;
                })()}
              </strong>
              <span>今日探索：{selectedDayIds.length} 张</span>
            </div>
            {selectedDayIds.length ? (
              <div className="calendar-posts">
                {selectedDayIds.map((id) => {
                  const item =
                    state.revealed[id] || all.find((p) => p.id === id);
                  return item ? (
                    <button key={id} onClick={() => openPost(id, "today")}>
                      <span>{item.tag}</span>
                      <strong>{item.title}</strong>
                      <ChevronRight size={15} />
                    </button>
                  ) : (
                    <div key={id} className="calendar-missing">
                      已翻开的内容当前不可用
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="fineprint">这一天还没有翻开新卡片。</p>
            )}
          </div>
          <div className="section-head">
            <h2>最近的发现</h2>
            <button
              className="text-button"
              onClick={() =>
                document
                  .getElementById("flip-history")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              全部记录 <ChevronRight size={15} />
            </button>
          </div>
          {recentDiscoveries.length ? (
            <div className="recent-discoveries">
              {recentDiscoveries.map(({ date, post }) => (
                <button
                  key={`${date}-${post.id}`}
                  onClick={() =>
                    openPost(
                      post.id,
                      state.revealed[post.id] ? "today" : "discover",
                    )
                  }
                >
                  <span>
                    {post.tag} · {date.slice(5).replace("-", ".")}
                  </span>
                  <strong>{post.title}</strong>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">
              翻开第一张卡片后，这里会留下你的近期发现。
            </div>
          )}
          <div className="section-head">
            <h2>我的收藏</h2>
          </div>
          <div className="filters favorite-filters">
            {["全部", "今日翻卡", "发现"].map((source) => (
              <button
                key={source}
                className={favoriteSource === source ? "selected" : ""}
                onClick={() => setFavoriteSource(source)}
              >
                {source}
              </button>
            ))}
          </div>
          {state.saved.length ? (
            <div className="masonry">
              {all
                .filter(
                  (p) =>
                    state.saved.includes(p.id) &&
                    (favoriteSource === "全部" ||
                      (state.savedFrom?.[p.id] ||
                        (state.revealed[p.id] ? "today" : "discover")) ===
                        (favoriteSource === "今日翻卡" ? "today" : "discover")),
                )
                .map((p) =>
                  postCard(p, state.revealed[p.id] ? "today" : "discover"),
                )}
            </div>
          ) : (
            <div className="empty">遇到喜欢的内容，点一下收藏。</div>
          )}
          <div className="section-head">
            <h2>我的内容</h2>
            <button
              className="text-button"
              onClick={() => {
                setEditing(null);
                setTitle("");
                setBody("");
                setModal("write");
              }}
            >
              发布 <Plus size={15} />
            </button>
          </div>
          {state.own.length ? (
            state.own.map((p) => (
              <div className="own-row" key={p.id}>
                <button onClick={() => openPost(p.id)}>{p.title}</button>
                <button
                  aria-label="编辑"
                  onClick={() => {
                    setEditing(p.id);
                    setTitle(p.title);
                    setBody(p.body);
                    setWriteTag(p.tag);
                    setModal("write");
                  }}
                >
                  <PenLine size={16} />
                </button>
                <button aria-label="删除" onClick={() => void deleteOwn(p)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <div className="empty">分享你认真观察过的事物。</div>
          )}
          <div id="flip-history" className="section-head">
            <h2>探索记录</h2>
          </div>
          {Object.entries(state.opened)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([day, values]) => (
              <div className="history" key={day}>
                <strong>{day}</strong>
                {values.map((id) => (
                  <button key={id} onClick={() => openPost(id)}>
                    {all.find((p) => p.id === id)?.title || "已移除内容"}
                  </button>
                ))}
              </div>
            ))}
          {!Object.keys(state.opened).length && (
            <div className="empty">翻开第一张卡，开始记录。</div>
          )}
          <div className="section-head profile-settings-entry">
            <h2>设置</h2>
          </div>
          <button className="settings-entry-card" onClick={() => {
            scrollPositions.current.mine = window.scrollY;
            setTab("settings");
            requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
          }}>
            <span><strong>个人设置</strong><small>外观、浏览、阅读与隐私偏好</small></span>
            <ChevronRight size={18} />
          </button>
          <button className="settings-entry-card debug-entry-card" onClick={() => {
            setTab("debug");
            requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
          }}>
            <span><strong>调试模式</strong><small>重置为新人开始界面</small></span>
            <ChevronRight size={18} />
          </button>
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
      <button
        className="compose"
        aria-label="发布内容"
        onClick={() => {
          setEditing(null);
          setTitle("");
          setBody("");
          setModal("write");
        }}
      >
        <Plus size={22} />
      </button>
      <nav className="bottom-nav" aria-label="主导航">
        {nav.map(([id, label, Icon]) => (
          <button
            key={id}
            className={tab === id || (tab === "settings" && id === "mine") ? "active" : ""}
            onClick={() => {
              scrollPositions.current[tab] = window.scrollY;
              const next = id;
              setTab(next);
              setDetail(null);
              setDetailReady(false);
              requestAnimationFrame(() =>
                window.scrollTo({
                  top: scrollPositions.current[next] || 0,
                  behavior: "instant",
                }),
              );
            }}
          >
            {id === "messages" && (
              <>
                <span className="sr-only">私聊</span>
                <InboxBadge enabled={state.notifications.messages} />
              </>
            )}
            <Icon size={21} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
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
                const sway = ((index * 19) % 17) - 8;
                const duration = FLIP_RAIN_DURATION_MIN_MS + ((index * 97) % (FLIP_RAIN_DURATION_SPREAD_MS + 1));
                const stagger = ((index * 37) % FLIP_RAIN_PARTICLES) / (FLIP_RAIN_PARTICLES - 1);
                const delay = FLIP_RAIN_LEAD_MS + Math.round(stagger * FLIP_RAIN_STAGGER_WINDOW_MS) + ((index * 13) % FLIP_RAIN_JITTER_MS);
                return <i key={index} style={{
                  left: `${startX}%`,
                  animationDelay: `${delay}ms`,
                  "--rain-duration": `${duration}ms`,
                  "--sway-x": `${sway}vw`,
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
                    className="flip-face flip-back flip-window-revealed"
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
                          e.currentTarget.dataset.failed = "true";
                        }}
                      />
                    )}
                    <div className="window-reveal-copy">
                      <small>{revealed?.tag || "HEIKA"}</small>
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
                        disabled={!viewerFlipped || viewerPhase !== null}
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
                  </div>
                )}
              </div>
            </header>
            <div className="detail-scroll" key={post.id}>
              <div className={`detail-body reading-${state.readingMode}${readingTransition ? ` reading-${readingTransition}` : ""}`}>
                {detailImages.length > 0 && (
                  <div className="detail-gallery" onTouchStart={(event) => { imageTouchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
                    const start = imageTouchStart.current;
                    const end = event.changedTouches[0]?.clientX;
                    imageTouchStart.current = null;
                    if (start === null || end === undefined || detailImages.length < 2 || Math.abs(end - start) < 40) return;
                    setActiveImageIndex((index) => (index + (end < start ? 1 : -1) + detailImages.length) % detailImages.length);
                  }}>
                  <button className="detail-image-button" onClick={() => setPreviewImage(true)} aria-label="查看大图">
                    <img src={detailImages[activeImageIndex]} alt={`${post.title}，第 ${activeImageIndex + 1} 张`} loading="eager" fetchPriority="high" />
                    <span>查看大图</span>
                  </button>
                  {detailImages.length > 1 && <div className="detail-gallery-controls" aria-label="图片切换">
                    <button aria-label="上一张图片" onClick={() => setActiveImageIndex((index) => (index - 1 + detailImages.length) % detailImages.length)}><ArrowLeft size={15} /></button>
                    <span>{activeImageIndex + 1} / {detailImages.length}</span>
                    <button aria-label="下一张图片" onClick={() => setActiveImageIndex((index) => (index + 1) % detailImages.length)}><ArrowRight size={15} /></button>
                  </div>}
                  </div>
                )}
                {!detailImages.length && (
                  <div className="detail-metal-art" aria-hidden="true">
                    <svg viewBox="0 0 100 100" role="presentation">
                      <defs>
                        <linearGradient id="detail-metal-one" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d3dcdf"/><stop offset="1" stopColor="#485960"/></linearGradient>
                        <linearGradient id="detail-metal-two" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#aebdc2"/><stop offset="1" stopColor="#26353c"/></linearGradient>
                        <linearGradient id="detail-metal-three" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#778a92"/><stop offset="1" stopColor="#d0d9db"/></linearGradient>
                        <linearGradient id="detail-metal-four" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#394a52"/><stop offset="1" stopColor="#aebcc1"/></linearGradient>
                      </defs>
                      <rect width="100" height="100" fill="#172126"/>
                      <path d="M50 10 90 50 50 50Z" fill="url(#detail-metal-one)"/>
                      <path d="M50 10 50 50 10 50Z" fill="url(#detail-metal-two)"/>
                      <path d="M10 50 50 50 50 90Z" fill="url(#detail-metal-three)"/>
                      <path d="M50 50 90 50 50 90Z" fill="url(#detail-metal-four)"/>
                      <path d="M50 10 90 50 50 90 10 50Z" fill="none" stroke="#121a1e" strokeWidth=".8"/>
                      <path d="M50 10V90M10 50H90" fill="none" stroke="#e0e7e8" strokeOpacity=".28" strokeWidth=".35"/>
                      <rect x="2" y="2" width="96" height="96" fill="none" stroke="#c0cdd0" strokeOpacity=".42" strokeWidth=".45"/>
                    </svg>
                    <span>{post.tag} <i>· LUCENT</i></span>
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
                <EditorialArticle post={post} />
                <section className={`detail-rating${ratingPulse?.postId === post.id ? " rating-pulse" : ""}`} aria-label="内容评分">
                  <span>给这篇内容评分</span>
                  <div>{[1, 2, 3, 4, 5].map((n) => (
                    <button className={`rating-star${ratingPulse?.postId === post.id && n <= ratingPulse.score ? " is-pulsing" : ""}`} key={n} style={{ animationDelay: `${(n - 1) * 58}ms` }} aria-label={`${n} 星`} aria-pressed={(state.ratings[post.id] || 0) === n} onClick={() => submitRating(post.id, n)}>
                      <Star size={18} fill={(state.ratings[post.id] || 0) >= n ? "currentColor" : "none"} />
                    </button>
                  ))}</div>
                  {communityRatings[post.id]?.count ? (
                    <small className="community-rating" aria-live="polite">
                      <Star size={12} fill="currentColor" /> 社区均分 {communityRatings[post.id].average.toFixed(1)} · {communityRatings[post.id].count} 人
                    </small>
                  ) : <small className="community-rating">社区评分形成中</small>}
                  {ratingPulse?.postId === post.id ? <small className="rating-feedback" key={ratingPulse.score} aria-live="polite">信号已校准 · {ratingPulse.score} 星</small> : state.ratings[post.id] ? <small>已评 {state.ratings[post.id]} 星</small> : null}
                </section>
                <section id="detail-comments" className="detail-comments">
                  <div className="comments-heading">
                    <h2>评论 <span>· {state.comments.filter((c) => c.post === post.id).length}</span></h2>
                    <div role="group" aria-label="评论排序" className="comment-sort">
                      <button className={detailSort === "热度" ? "selected" : ""} onClick={() => setDetailSort("热度")}>最热</button>
                      <button className={detailSort === "最新" ? "selected" : ""} onClick={() => setDetailSort("最新")}>最新</button>
                    </div>
                  </div>
                  {(() => {
                    const comments = state.comments.filter((c) => c.post === post.id);
                    const roots = comments.filter((c) => !c.parent).sort((a, b) => detailSort === "最新" ? b.time - a.time : b.likes - a.likes || b.time - a.time);
                    return roots.length ? roots.map((c) => {
                      const children = comments.filter((item) => item.parent === c.id).sort((a, b) => a.time - b.time);
                      const visibleChildren = expandedReplies[c.id] ? children : children.slice(0, 2);
                      return <article className="comment" key={c.id}>
                        <div className="comment-avatar" aria-hidden="true">{c.avatar ? <img src={c.avatar} alt="" loading="lazy" /> : (c.name || "探").slice(0, 1)}</div>
                        <div className="comment-content">
                          <strong className="comment-author">{c.name || "探索者"}</strong>
                          <p>{c.body}</p>
                          <div className="comment-meta"><time>{new Date(c.time).toLocaleDateString("zh-CN")}</time>
                            <button onClick={() => { setReply(c.id); commentInputRef.current?.focus(); }}>回复</button>
                            {(!c.cloudId || c.authorId === accountId) && <button aria-label="删除评论" onClick={() => void deleteComment(c)}><Trash2 size={14} /></button>}
                          </div>
                          <button className={`comment-like${c.liked ? " selected" : ""}`} aria-label="点赞评论" onClick={() => {
                            if (!accountId) return toast("登录后可点赞");
                            const next = !c.liked;
                            void cloudRequest("/api/library-comments", { action: "like", post: c.post, id: c.id, value: next }).then(() => update((s) => ({ ...s, comments: s.comments.map((x) => x.id === c.id ? { ...x, liked: next, likes: x.likes + (next ? 1 : -1) } : x) }))).catch(() => toast("点赞失败"));
                          }}><Heart size={14} fill={c.liked ? "currentColor" : "none"} />{c.likes}</button>
                          {visibleChildren.length > 0 && <div className="comment-replies">{visibleChildren.map((child) => <div className="comment-reply" key={child.id}>
                            <div className="comment-avatar small" aria-hidden="true">{child.avatar ? <img src={child.avatar} alt="" loading="lazy" /> : (child.name || "探").slice(0, 1)}</div><div><strong>{child.name || "探索者"}</strong>{child.parent ? <span> 回复 </span> : null}<p>{child.body}</p><div className="comment-meta"><time>{new Date(child.time).toLocaleDateString("zh-CN")}</time><button onClick={() => { setReply(c.id); commentInputRef.current?.focus(); }}>回复</button></div></div>
                          </div>)}</div>}
                          {children.length > 2 && <button className="expand-replies" onClick={() => setExpandedReplies((s) => ({ ...s, [c.id]: !s[c.id] }))}>{expandedReplies[c.id] ? "收起回复" : `展开更多回复（${children.length - 2}）`}</button>}
                        </div>
                      </article>;
                    }) : <p className="comments-empty">还没有评论，来聊聊你的想法。</p>;
                  })()}
                </section>
              </div>
            </div>
            <form className="detail-action-bar" onSubmit={(event) => { event.preventDefault(); void addComment(); }}>
              <div className={`detail-comment-input${reply ? " replying" : ""}`}>
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
        <div className="modal-backdrop">
          <div
            className={`modal ${modal === "subscription" ? "subscription-dialog" : ""} ${readingTransition ? `reading-${readingTransition}` : ""}`}
          >
            <button
              className="close"
              aria-label="关闭"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "subscription" ? (
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
                onSave={(name, bio, avatar) =>
                  update((s) => ({ ...s, name, bio, avatar }))
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
              <>
                <div className="eyebrow">CREATE / STORY</div>
                <h2>{editing ? "编辑内容" : "分享一篇内容"}</h2>
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
                  <select
                    value={writeTag}
                    onChange={(e) => setWriteTag(e.target.value)}
                  >
                    {tags.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
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
                <div className="preview">
                  <strong>预览 · {title || "未命名内容"}</strong>
                  <p>{body || "正文预览将显示在这里"}</p>
                </div>
                <button className="primary-button full" onClick={publish}>
                  {editing ? "保存修改" : "发布内容"}
                </button>
                <p className="fineprint">
                  登录后发布的内容保存在云端，并显示在公开主页。
                </p>
              </>
            )}
          </div>
        </div>
      )}
      {notice && (
        <div role="status" className="toast">
          {notice}
        </div>
      )}
    </main>
  );
}
