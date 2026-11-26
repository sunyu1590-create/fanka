/**
 * HEIKA Nexus 共享类型。
 * 服务端只返回可核对的真实指标；取不到的字段必须是 null，并附带 available/stale 说明。
 */

export type NexusSceneKey =
  | "overview"
  | "globe"
  | "server"
  | "storage"
  | "ai"
  | "content"
  | "security"
  | "timeline";

export type NexusNodeKind =
  | "client"
  | "gateway"
  | "server"
  | "database"
  | "storage"
  | "ai"
  | "worker"
  | "auth"
  | "realtime"
  | "monitor"
  | "external";

export type NexusStatus = "healthy" | "degraded" | "down" | "unknown" | "offline";

export type NexusMetric = { label: string; value: number | null; unit: string };

export type NexusNode = {
  id: string;
  label: string;
  kind: NexusNodeKind;
  status: NexusStatus;
  subtitle: string;
  metrics: NexusMetric[];
  /** 该节点的指标是否来自真实采集；false 时前端显示“无数据”。 */
  measured: boolean;
  staleSeconds?: number | null;
};

export type NexusLink = {
  id: string;
  from: string;
  to: string;
  kind: "http" | "api" | "data" | "media" | "ai" | "probe" | "realtime" | "auth";
  label: string;
  /** 每秒请求/事务数；null 表示该链路没有可确认的链路级指标。 */
  rate: number | null;
  bytesPerSecond: number | null;
  latencyMs: number | null;
  errorRate: number | null;
  direction: "one-way" | "two-way";
  measured: boolean;
  note?: string;
};

export type NexusAlert = {
  id: string;
  level: string;
  title: string;
  detail: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type NexusProcess = {
  service_key: string;
  label: string;
  status: string;
  pid: number | null;
  process_count: number;
  cpu_percent: number | null;
  mem_bytes: number | null;
  started_at: string | null;
  captured_at: string;
};

export type NexusEvent = {
  id: string;
  at: string;
  type: "request" | "security" | "alert" | "ai" | "media" | "service" | "deploy";
  title: string;
  detail: string;
  source: string;
  target: string;
  result: "ok" | "warn" | "error";
  durationMs: number | null;
  trace: string | null;
  nodeId: string | null;
  linkId: string | null;
};

export type NexusScore = {
  requests: number;
  bytes: number;
  errors4xx: number;
  errors5xx: number;
  /** 每秒请求数（按实际窗口换算）。 */
  rps: number;
};

export type NexusSeriesPoint = {
  t: number;
  requests: number;
  errors: number;
  ms: number;
};

export type NexusSnapshot = {
  ts: string;
  revision: number;
  sources: {
    agent: boolean;
    db: boolean;
    ai: boolean;
    geo: boolean;
    metricsCapturedAt: string | null;
    agentCapturedAt: string | null;
    dbCapturedAt: string | null;
    agentError: string | null;
  };
  server: {
    cpuPercent: number | null;
    load1: number | null;
    memPercent: number | null;
    memUsed: number | null;
    memTotal: number | null;
    memAvailable: number | null;
    swapUsed: number | null;
    swapTotal: number | null;
    diskPercent: number | null;
    diskUsed: number | null;
    diskTotal: number | null;
    netRxRate: number | null;
    netTxRate: number | null;
    tcpTotal: number | null;
    uptimeSeconds: number | null;
    capturedAt: string | null;
  };
  db: {
    available: boolean;
    connections: number | null;
    active: number | null;
    idle: number | null;
    idleInTx: number | null;
    longestMs: number | null;
    xactPerSecond: number | null;
    readPerSecond: number | null;
    writePerSecond: number | null;
    cacheHit: number | null;
    sizeBytes: number | null;
    capturedAt: string | null;
  };
  traffic: {
    available: boolean;
    windowSeconds: number;
    requests: number;
    rps: number;
    bytesPerSecond: number | null;
    avgMs: number | null;
    successRate: number | null;
    errors4xx: number;
    errors5xx: number;
    byCategory: Record<string, number>;
    byClient: Record<string, number>;
    series: NexusSeriesPoint[];
    appSeries: NexusSeriesPoint[];
    capturedAt: string | null;
  };
  ai: {
    available: boolean;
    calls1h: number | null;
    calls60s: number | null;
    tokens1h: number | null;
    errorRate1h: number | null;
    avgMs1h: number | null;
    byPurpose: Array<{ purpose: string; calls: number; tokens: number; avgMs: number | null; errors: number }>;
    byModel: Array<{ model: string; calls: number; tokens: number; avgMs: number | null }>;
    queue: number | null;
    running: number | null;
    revision: { approved: number; rejected: number; error: number; queued: number; running: number };
    reviewQueue: number | null;
    revision24h: number | null;
  };
  media: {
    active: number | null;
    failed24h: number | null;
    uploadsToday: number | null;
    uploadBytesToday: number | null;
    downloadBytesToday: number | null;
    downloadRequestsToday: number | null;
    byKind: Array<{ kind: string; bytes: number; requests: number }>;
  };
  security: {
    denied1m: number | null;
    blockedRules: number | null;
    activeRules: number | null;
    alertsOpen: number;
    recentSecurityEvents: number | null;
  };
  content: {
    posts: number | null;
    aiPosts: number | null;
    series: number | null;
    tags: number | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
  };
  clients: { uniqueToday: number | null; onlineEstimate: number | null };
  nodes: NexusNode[];
  links: NexusLink[];
  alerts: NexusAlert[];
  processes: NexusProcess[];
  events: NexusEvent[];
};

export type NexusHistoryPoint = {
  bucketAt: string;
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  netRxRate: number | null;
  netTxRate: number | null;
  apiRequests: number | null;
  apiP95Ms: number | null;
  tcpTotal: number | null;
  aiQueue: number | null;
  mediaActive: number | null;
  samples: number;
};

export type NexusMarker = {
  id: string;
  at: string;
  type: "alert" | "deploy" | "ai" | "media" | "service";
  level: "info" | "warn" | "error";
  title: string;
  detail: string;
};

export type NexusHistoryResponse = {
  from: string;
  to: string;
  bucketSeconds: number;
  points: NexusHistoryPoint[];
  markers: NexusMarker[];
  coverage: { first: string | null; last: string | null; samples: number };
  note?: string;
};

export type NexusStorageBuilding = {
  key: string;
  label: string;
  kind: string;
  bytes: number;
  objects: number;
  bucket?: string | null;
};

export type NexusStorageScene = {
  capturedAt: string;
  totalBytes: number | null;
  totalObjects: number | null;
  buildings: NexusStorageBuilding[];
  topFiles: Array<{
    bucket: string;
    name: string;
    bytes: number;
    kind: string;
    createdAt: string | null;
    state: string;
    refCount: number;
    postId: string | null;
  }>;
  health: { orphans: number; duplicates: number; missing: number; reclaimableBytes: number } | null;
  note: string;
};

export type NexusContentScene = {
  generatedAt: string;
  posts: Array<{
    id: string;
    title: string;
    channel: string;
    views: number;
    likes: number;
    bookmarks: number;
    tagId: number | null;
    seriesId: string | null;
    createdAt: string;
  }>;
  series: Array<{ id: string; title: string; posts: number }>;
  tags: Array<{ id: number; name: string; posts: number }>;
  edges: Array<{ from: string; to: string; kind: "series" | "tag" }>;
  totals: { posts: number; views: number; likes: number; series: number; tags: number };
};

export type NexusGlobeScene = {
  available: boolean;
  geoAvailable: boolean;
  note: string;
  serverNode: { label: string; lat: number | null; lon: number | null } | null;
  countries: Array<{ country: string; requests: number; ips: number }>;
  clients: Array<{ ip: string; country: string | null; requests: number; bytes: number; status4xx: number; lastSeen: string | null; client: string | null }>;
  connections: { tcpTotal: number | null; uniqueIpsToday: number | null };
  http: { byStatus: Record<string, number>; avgMs: number | null } | null;
};

export type NexusAiScene = {
  generatedAt: string;
  available: boolean;
  purposes: Array<{ purpose: string; calls: number; tokens: number; avgMs: number | null; errors: number }>;
  models: Array<{ model: string; calls: number; tokens: number; avgMs: number | null }>;
  queue: { batches: number | null; revisionQueue: number | null; running: number | null };
  revision: {
    approved: number;
    rejected: number;
    error: number;
    queued: number;
    running: number;
    recent: Array<{ id: string; status: string; decision: string | null; createdAt: string; finishedAt: string | null; model: string | null; tokens: number; elapsedMs: number | null; reason: string | null }>;
  };
  note: string;
};

export type NexusSecurityScene = {
  generatedAt: string;
  rules: Array<{ id: string; type: string; value: string; reason: string | null; createdAt: string; expiresAt: string | null; active: boolean }>;
  stats: { activeRules: number; blockedIps: number; denied1m: number | null; denied4xxToday: number | null; alertsOpen: number };
  layers: Array<{ key: string; label: string; count: number | null; description: string }>;
  recent: Array<{ ip: string; requests: number; status4xx: number; lastSeen: string | null; client: string | null }>;
  note: string;
};
