import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";
import { buildNexusSnapshot } from "@/lib/server/nexus";
import type { NexusSnapshot } from "@/lib/nexus/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Client = { send: (event: string, data: unknown) => void; close: () => void };
type Hub = {
  clients: Set<Client>;
  timer: ReturnType<typeof setInterval> | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  last: NexusSnapshot | null;
  lastStable: string;
  lastFullAt: number;
};

const holder = globalThis as unknown as { __heikaNexusHub?: Hub };
if (!holder.__heikaNexusHub) {
  holder.__heikaNexusHub = {
    clients: new Set(), timer: null, heartbeat: null, last: null,
    lastStable: "", lastFullAt: 0,
  };
}
const hub = holder.__heikaNexusHub;

function stableSignature(snapshot: NexusSnapshot) {
  return JSON.stringify({
    nodes: snapshot.nodes.map((node) => [node.id, node.status, node.staleSeconds, node.metrics.map((metric) => metric.value)]),
    links: snapshot.links.map((link) => [link.id, link.rate, link.bytesPerSecond, link.measured]),
    processes: snapshot.processes.map((process) => [process.service_key, process.status, process.captured_at]),
    sources: snapshot.sources,
  });
}

function delta(snapshot: NexusSnapshot) {
  // 只发变化频繁且体积可控的字段；静态节点标签由客户端保留，避免每秒重复传输。
  return {
    ts: snapshot.ts,
    revision: snapshot.revision,
    sources: snapshot.sources,
    server: snapshot.server,
    db: snapshot.db,
    traffic: snapshot.traffic,
    ai: snapshot.ai,
    media: snapshot.media,
    security: snapshot.security,
    content: snapshot.content,
    clients: snapshot.clients,
    alerts: snapshot.alerts,
    events: snapshot.events.slice(0, 24),
    eventsInternal: (snapshot.eventsInternal || []).slice(0, 16),
    trafficSplit: snapshot.trafficSplit,
  };
}

async function tick() {
  if (!hub.clients.size) return stop();
  try {
    const snapshot = await buildNexusSnapshot(adminClient());
    const changed = snapshot.revision !== hub.last?.revision;
    const stable = stableSignature(snapshot);
    const stableChanged = stable !== hub.lastStable;
    const full = !hub.last || Date.now() - hub.lastFullAt > 30_000;
    if (full || stableChanged) {
      for (const client of hub.clients) client.send("snapshot", snapshot);
      hub.lastFullAt = Date.now();
      hub.lastStable = stable;
    } else if (changed) {
      const payload = delta(snapshot);
      for (const client of hub.clients) client.send("delta", payload);
    } else {
      // 即使 revision 未变也推进一次轻量时钟，让客户端知道数据仍新鲜。
      for (const client of hub.clients) client.send("ping", { ts: snapshot.ts, sources: snapshot.sources });
    }
    hub.last = snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : "快照生成失败";
    for (const client of hub.clients) client.send("error", { message, at: new Date().toISOString() });
  }
}

function ensureTimer() {
  if (hub.timer) return;
  hub.timer = setInterval(() => { void tick(); }, 1000);
  hub.heartbeat = setInterval(() => {
    for (const client of hub.clients) client.send("heartbeat", { at: new Date().toISOString() });
  }, 15_000);
}

function stop() {
  if (hub.timer) clearInterval(hub.timer);
  if (hub.heartbeat) clearInterval(hub.heartbeat);
  hub.timer = null;
  hub.heartbeat = null;
  hub.last = null;
  hub.lastStable = "";
  hub.lastFullAt = 0;
}

/**
 * Nexus 实时通道。
 *
 * - 仅在有管理员观看时运行；最后一位离开后立即停止采集，避免无人访问时的常驻开销。
 * - 多个管理员共享同一条 1 秒采样，不按连接数放大后端查询。
 * - 首帧发送完整快照，之后发增量；30 秒补发一次完整快照用于纠偏。
 * - 取不到数据时发送 error 事件，不发送看起来正常的假数据。
 */
export async function GET(req: NextRequest) {
  await requirePermission(req, "audit.read");
  const encoder = new TextEncoder();
  let closed = false;
  let client: Client | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { closed = true; }
      };
      client = {
        send(event, data) {
          write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        close() { write("event: closed\ndata: {}\n\n"); },
      };
      const self = client;
      hub.clients.add(self);
      ensureTimer();
      write("retry: 3000\n\n");
      self.send("ready", { at: new Date().toISOString() });
      // 立即推第一帧，用户进入时不用等 1 秒。
      buildNexusSnapshot(adminClient())
        .then((snapshot) => {
          if (!hub.clients.has(self)) return;
          self.send("snapshot", snapshot);
          hub.last = snapshot;
          hub.lastFullAt = Date.now();
          hub.lastStable = stableSignature(snapshot);
        })
        .catch((error) => self.send("error", { message: error instanceof Error ? error.message : "初始快照失败" }));
    },
    cancel() {
      closed = true;
      if (client) hub.clients.delete(client);
      if (!hub.clients.size) stop();
    },
  });

  const abort = () => {
    closed = true;
    if (client) hub.clients.delete(client);
    if (!hub.clients.size) stop();
  };
  req.signal.addEventListener("abort", abort);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
