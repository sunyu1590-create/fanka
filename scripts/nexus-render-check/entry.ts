/**
 * 三维渲染验收夹具（仅本地测试用，不进入生产构建）。
 *
 * 目的：在没有生产数据库的沙箱里，用一份**固定且显式标注为测试**的快照驱动
 * 真实 NexusEngine，从而对八大场景做几何/材质/光照/粒子/标签的截图验收。
 * 这里的数值只用于驱动渲染，不代表任何线上业务数据。
 */
import { NexusEngine } from "../../lib/nexus/engine";
import type {
  NexusGlobeScene, NexusSnapshot, NexusStorageScene, NexusAiScene, NexusContentScene, NexusSecurityScene,
} from "../../lib/nexus/types";

const now = new Date().toISOString();
const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const series = Array.from({ length: 60 }, (_, index) => ({
  t: Math.floor(Date.now() / 1000) - (59 - index),
  requests: 40 + Math.round(Math.sin(index / 5) * 18) + (index % 7),
  errors: index % 17 === 0 ? 1 : 0,
  ms: 12 + (index % 9),
}));

const snapshot: NexusSnapshot = {
  ts: now,
  revision: 4211,
  sources: { agent: true, db: true, ai: true, geo: true, metricsCapturedAt: now, agentCapturedAt: now, dbCapturedAt: now, agentError: null },
  server: {
    cpuPercent: 27.4, load1: 0.86, memPercent: 61.2, memUsed: 5_120_000_000, memTotal: 8_360_000_000,
    memAvailable: 3_240_000_000, swapUsed: 0, swapTotal: 2_147_483_648, diskPercent: 48.6,
    diskUsed: 81_751_187, diskTotal: 168_000_000_000, netRxRate: 1_840_000, netTxRate: 2_460_000,
    tcpTotal: 142, uptimeSeconds: 1_284_000, capturedAt: now,
  },
  db: {
    available: true, connections: 19, active: 1, idle: 18, idleInTx: 0, longestMs: 12,
    xactPerSecond: 34.2, readPerSecond: 88, writePerSecond: 12, cacheHit: 99.4,
    sizeBytes: 81_751_187, capturedAt: now,
  },
  traffic: {
    available: true, windowSeconds: 60, requests: 214, rps: 3.57, bytesPerSecond: 1_840_000,
    avgMs: 18, successRate: 99.1, errors4xx: 2, errors5xx: 0, byCategory: { api: 120, page: 60, rest: 24, static: 10 },
    byClient: { web: 150, app: 64 }, series, appSeries: series, capturedAt: now,
  },
  ai: {
    available: true, calls1h: 34, calls60s: 2, tokens1h: 88_400, errorRate1h: 0, avgMs1h: 2_530,
    byPurpose: [
      { purpose: "审核", calls: 18, tokens: 42_000, avgMs: 2_100, errors: 0 },
      { purpose: "润色", calls: 9, tokens: 31_000, avgMs: 3_200, errors: 0 },
      { purpose: "总结", calls: 5, tokens: 12_400, avgMs: 1_900, errors: 0 },
      { purpose: "分类", calls: 2, tokens: 3_000, avgMs: 1_200, errors: 0 },
    ],
    byModel: [{ model: "deepseek-chat", calls: 30, tokens: 80_000, avgMs: 2_400 }, { model: "deepseek-reasoner", calls: 4, tokens: 8_400, avgMs: 4_100 }],
    queue: 2, running: 1,
    revision: { approved: 14, rejected: 2, error: 0, queued: 1, running: 1 },
    reviewQueue: 1, revision24h: 16,
  },
  media: {
    active: 0, failed24h: 0, uploadsToday: 6, uploadBytesToday: 24_800_000,
    downloadBytesToday: 210_400_000, downloadRequestsToday: 1_840,
    byKind: [{ kind: "image", bytes: 120_000_000, requests: 1_400 }, { kind: "video", bytes: 90_000_000, requests: 340 }],
  },
  security: { denied1m: 0, blockedRules: 1, activeRules: 2, alertsOpen: 0, recentSecurityEvents: 3 },
  content: { posts: 53, aiPosts: 21, series: 4, tags: 12, views: 5_240, likes: 312, comments: 88 },
  clients: { uniqueToday: 87, onlineEstimate: 4 },
  nodes: [
    { id: "client-web", label: "网页客户端", kind: "client", status: "healthy", subtitle: "React · 浏览器", metrics: [{ label: "在线", value: 3, unit: "人" }], measured: true },
    { id: "client-app", label: "Android 客户端", kind: "client", status: "healthy", subtitle: "WebView · 原生", metrics: [{ label: "在线", value: 1, unit: "人" }], measured: true },
    { id: "edge", label: "网络入口", kind: "gateway", status: "healthy", subtitle: "Caddy 反代 · TLS", metrics: [{ label: "请求", value: 3.57, unit: "/s" }], measured: true },
    { id: "app", label: "业务 API · 计算核心", kind: "server", status: "healthy", subtitle: "Next.js 15 · Node", metrics: [{ label: "CPU", value: 27.4, unit: "%" }, { label: "内存", value: 61.2, unit: "%" }], measured: true },
    { id: "rest", label: "业务 API", kind: "server", status: "healthy", subtitle: "REST 路由", metrics: [{ label: "P95", value: 18, unit: "ms" }], measured: true },
    { id: "auth", label: "身份认证", kind: "auth", status: "healthy", subtitle: "Supabase Auth", metrics: [{ label: "会话", value: 12, unit: "个" }], measured: true },
    { id: "storage", label: "媒体存储", kind: "storage", status: "healthy", subtitle: "对象存储 · CDN", metrics: [{ label: "对象", value: 412, unit: "个" }], measured: true },
    { id: "realtime", label: "实时通信", kind: "realtime", status: "degraded", subtitle: "SSE 通道", metrics: [{ label: "连接", value: 2, unit: "条" }], measured: true },
    { id: "db", label: "数据库", kind: "database", status: "healthy", subtitle: "PostgreSQL 16", metrics: [{ label: "连接", value: 19, unit: "个" }, { label: "TPS", value: 34.2, unit: "" }], measured: true },
    { id: "ai-worker", label: "AI 调度", kind: "ai", status: "healthy", subtitle: "队列工作进程", metrics: [{ label: "队列", value: 2, unit: "个" }], measured: true },
    { id: "ai-provider", label: "外部模型", kind: "external", status: "healthy", subtitle: "DeepSeek API", metrics: [{ label: "调用", value: 34, unit: "次/h" }], measured: true },
    { id: "metrics", label: "监控采集", kind: "monitor", status: "healthy", subtitle: "1s 宿主指标", metrics: [{ label: "间隔", value: 1, unit: "s" }], measured: true },
  ],
  links: [
    { id: "web-edge", from: "client-web", to: "edge", kind: "http", label: "HTTPS", rate: 2.1, bytesPerSecond: 640_000, latencyMs: 22, errorRate: 0.4, direction: "two-way", measured: true },
    { id: "app-edge", from: "client-app", to: "edge", kind: "http", label: "API", rate: 1.4, bytesPerSecond: 420_000, latencyMs: 28, errorRate: 0.2, direction: "two-way", measured: true },
    { id: "edge-app", from: "edge", to: "app", kind: "api", label: "反代", rate: 3.5, bytesPerSecond: 1_200_000, latencyMs: 18, errorRate: 0.1, direction: "two-way", measured: true },
    { id: "app-rest", from: "app", to: "rest", kind: "api", label: "路由分发", rate: 2.4, bytesPerSecond: null, latencyMs: 8, errorRate: 0, direction: "two-way", measured: true },
    { id: "edge-auth", from: "edge", to: "auth", kind: "auth", label: "鉴权", rate: 1.1, bytesPerSecond: null, latencyMs: 12, errorRate: 0, direction: "two-way", measured: true },
    { id: "edge-storage", from: "edge", to: "storage", kind: "media", label: "媒体", rate: 0.8, bytesPerSecond: 1_040_000, latencyMs: 34, errorRate: 0.6, direction: "two-way", measured: true },
    { id: "app-db", from: "app", to: "db", kind: "data", label: "SQL", rate: 34.2, bytesPerSecond: 220_000, latencyMs: 4, errorRate: 0, direction: "two-way", measured: true },
    { id: "app-ai", from: "app", to: "ai-worker", kind: "ai", label: "任务队列", rate: 0.6, bytesPerSecond: null, latencyMs: 2_530, errorRate: 0, direction: "two-way", measured: true },
    { id: "ai-provider-link", from: "ai-worker", to: "ai-provider", kind: "ai", label: "模型调用", rate: 0.5, bytesPerSecond: 12_000, latencyMs: 2_530, errorRate: 0, direction: "two-way", measured: true },
    { id: "app-realtime", from: "app", to: "realtime", kind: "realtime", label: "SSE", rate: 0.3, bytesPerSecond: 8_000, latencyMs: 940, errorRate: 1.2, direction: "two-way", measured: true },
    { id: "app-metrics", from: "app", to: "metrics", kind: "probe", label: "采集", rate: 1, bytesPerSecond: null, latencyMs: 6, errorRate: 0, direction: "one-way", measured: true },
    { id: "metrics-app", from: "metrics", to: "app", kind: "probe", label: "写库", rate: 2, bytesPerSecond: null, latencyMs: 9, errorRate: 0, direction: "one-way", measured: true },
    { id: "storage-db", from: "storage", to: "db", kind: "data", label: "元数据", rate: 0.4, bytesPerSecond: null, latencyMs: 11, errorRate: 0, direction: "two-way", measured: true },
    { id: "rest-db", from: "rest", to: "db", kind: "data", label: "查询", rate: 12.4, bytesPerSecond: null, latencyMs: 6, errorRate: 0, direction: "two-way", measured: true },
    { id: "auth-db", from: "auth", to: "db", kind: "data", label: "会话", rate: 1.2, bytesPerSecond: null, latencyMs: 5, errorRate: 0, direction: "two-way", measured: true },
  ],
  alerts: [],
  processes: [
    { service_key: "app", label: "app", status: "running", pid: 1, process_count: 1, cpu_percent: 18.2, mem_bytes: 420_000_000, started_at: iso(1_400), captured_at: now },
    { service_key: "ai-worker", label: "ai-worker", status: "running", pid: 24, process_count: 1, cpu_percent: 2.4, mem_bytes: 180_000_000, started_at: iso(1_400), captured_at: now },
  ],
  events: [
    { id: "e1", at: now, type: "request", title: "GET /api/v1/posts", detail: "HTTP 200 · 14ms · 内容浏览与交互", source: "内容浏览与交互", target: "app", result: "ok", durationMs: 14, trace: "e1", nodeId: "app", linkId: "edge-app", group: "content" },
    { id: "e2", at: iso(1), type: "ai", title: "版本自动审核 · 通过", detail: "AI 自动决策", source: "AI 审核", target: "AI 调度", result: "ok", durationMs: 2_100, trace: "e2", nodeId: "ai-worker", linkId: "app-ai", group: "ai" },
    { id: "e3", at: iso(2), type: "security", title: "POST /api/v1/admin/login", detail: "HTTP 401 · 8ms · 安全检测与异常", source: "安全检测与异常", target: "app", result: "warn", durationMs: 8, trace: "e3", nodeId: "auth", linkId: "edge-auth", group: "security" },
  ],
  eventsInternal: [
    { id: "i1", at: now, type: "request", title: "GET /api/v1/admin/nexus/stream", detail: "HTTP 200 · 1ms · Nexus 内部监控", source: "Nexus 内部监控", target: "app", result: "ok", durationMs: 1, trace: "i1", nodeId: "app", linkId: null, group: "nexus" },
  ],
  trafficSplit: { windowSeconds: 60, totalRps: 3.6, externalRps: 2.1, adminRps: 0.9, internalRps: 0.6, groups: { content: 120, nexus: 36, admin: 54 } },
};

const storage: NexusStorageScene = {
  capturedAt: now,
  totalBytes: 163_887_603,
  totalObjects: 412,
  buildings: [
    { key: "image", label: "图片", kind: "image", bytes: 92_400_000, objects: 248, bucket: "media" },
    { key: "video", label: "视频", kind: "video", bytes: 48_200_000, objects: 34, bucket: "media" },
    { key: "bucket", label: "存储桶对象", kind: "object", bytes: 18_600_000, objects: 96, bucket: "post-media" },
    { key: "other", label: "其他", kind: "other", bytes: 4_687_603, objects: 34, bucket: "post-media" },
  ],
  topFiles: [],
  health: { orphans: 0, duplicates: 0, missing: 0, reclaimableBytes: 0 },
  note: "真实对象存储统计",
};

const ai: NexusAiScene = {
  generatedAt: now,
  available: true,
  purposes: snapshot.ai.byPurpose,
  models: snapshot.ai.byModel,
  queue: { batches: 2, revisionQueue: 1, running: 1 },
  revision: {
    approved: 14, rejected: 2, error: 0, queued: 1, running: 1,
    recent: [
      { id: "r1", status: "approved", decision: "auto", createdAt: iso(4), finishedAt: iso(3), model: "deepseek-chat", tokens: 2_400, elapsedMs: 2_100, reason: null },
      { id: "r2", status: "rejected", decision: "auto", createdAt: iso(12), finishedAt: iso(11), model: "deepseek-chat", tokens: 1_800, elapsedMs: 1_900, reason: "含站外导流" },
    ],
  },
  note: "AI 自动审核，无人工复审",
};

const content: NexusContentScene = {
  generatedAt: now,
  posts: Array.from({ length: 24 }, (_, index) => ({
    id: `p${index + 1}`, title: `作品 ${index + 1}`, channel: index % 3 === 0 ? "探索" : "创作",
    views: 40 + ((index * 37) % 420), likes: 3 + ((index * 13) % 60), bookmarks: (index * 7) % 30,
    tagId: 10 + (index % 6), seriesId: index % 4 === 0 ? `s${(index % 4) + 1}` : null,
    createdAt: iso(index * 90),
  })),
  series: [{ id: "s1", title: "合集 A", posts: 6 }, { id: "s2", title: "合集 B", posts: 5 }, { id: "s3", title: "合集 C", posts: 4 }, { id: "s4", title: "合集 D", posts: 3 }],
  tags: Array.from({ length: 6 }, (_, index) => ({ id: 10 + index, name: `标签 ${index + 1}`, posts: 8 - index })),
  edges: Array.from({ length: 18 }, (_, index) => ({
    from: `p${index + 1}`, to: index % 4 === 0 ? `s${(index % 4) + 1}` : `t${10 + (index % 6)}`,
    kind: (index % 4 === 0 ? "series" : "tag") as "series" | "tag",
  })),
  totals: { posts: 24, views: 5_240, likes: 312, series: 4, tags: 6 },
};

const security: NexusSecurityScene = {
  generatedAt: now,
  rules: [
    { id: "rule1", type: "ip", value: "203.0.113.24", reason: "高频 401", createdAt: iso(180), expiresAt: null, active: true },
    { id: "rule2", type: "rate", value: "60/min", reason: "接口频率限制", createdAt: iso(900), expiresAt: null, active: true },
  ],
  stats: { activeRules: 2, blockedIps: 1, denied1m: 0, denied4xxToday: 12, alertsOpen: 0 },
  layers: [
    { key: "edge", label: "网络入口", count: 142, description: "Caddy 反代与 TLS 终止" },
    { key: "rate", label: "访问频率限制", count: 2, description: "每分钟请求配额" },
    { key: "auth", label: "身份认证", count: 12, description: "Supabase 会话校验" },
    { key: "perm", label: "权限校验", count: 5, description: "管理端角色校验" },
  ],
  recent: [{ ip: "203.0.113.24", requests: 240, status4xx: 86, lastSeen: iso(6), client: "web" }],
  note: "真实访问规则",
};

const globe: NexusGlobeScene = {
  available: true, geoAvailable: true, note: "IP 地理来自真实访问记录",
  serverNode: { label: "生产节点", lat: 31.2, lon: 121.5 },
  countries: [
    { country: "CN", requests: 1_240, ips: 42 }, { country: "US", requests: 320, ips: 12 },
    { country: "JP", requests: 180, ips: 6 }, { country: "DE", requests: 96, ips: 4 },
    { country: "SG", requests: 74, ips: 3 },
  ],
  clients: [{ ip: "203.0.113.24", country: "CN", requests: 240, bytes: 4_200_000, status4xx: 2, lastSeen: now, client: "web" }],
  connections: { tcpTotal: 142, uniqueIpsToday: 87 },
  http: { byStatus: { "2xx": 1_880, "4xx": 12, "5xx": 0 }, avgMs: 18 },
};

const extras = { storage, ai, content, security, globe } as const;

const canvas = document.getElementById("view") as HTMLCanvasElement;
const host = document.getElementById("stage") as HTMLDivElement;

let engine: NexusEngine | null = null;

function boot(theme: "dark" | "light") {
  if (engine) { engine.setTheme(theme, true); return; }
  engine = new NexusEngine({
    canvas, container: host, theme,
    onStats: (stats) => { (window as unknown as Record<string, unknown>).__stats = stats; },
  });
  engine.setQuality("ultra");
}

const api = {
  theme: "dark" as "dark" | "light",
  boot(theme: "dark" | "light") { api.theme = theme; boot(theme); },
  show(key: keyof typeof extras | "overview" | "server" | "timeline", options: { explode?: boolean; labels?: "all" | "auto" | "none" } = {}) {
    if (!engine) boot(api.theme);
    engine!.setTheme(api.theme, true);
    engine!.setScene(key as never, snapshot, { rebuild: true, data: (key in extras ? { [key]: extras[key as keyof typeof extras] } : {}) as never });
    engine!.setLabelMode(options.labels || "auto");
    engine!.setExplode(Boolean(options.explode));
    engine!.setBottomInset(0);
    engine!.setPaused(false);
  },
  stats() { return (window as unknown as Record<string, unknown>).__stats; },
  debug() {
    const built = (engine as unknown as { built: { bounds: unknown } }).built;
    return built?.bounds;
  },
  ready: true,
};

(window as unknown as Record<string, unknown>).nexusShot = api;
boot("dark");
