"use client";

import { useEffect, useRef, useState } from "react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import type { NexusSnapshot } from "./types";

export type NexusConnection = "connecting" | "live" | "reconnecting" | "error" | "paused";

type Delta = Partial<NexusSnapshot> & { ts?: string };

/**
 * Nexus 实时数据：优先 SSE（1 秒增量），断线自动重连；
 * 重连期间以 5 秒轮询兜底，并明确显示连接状态与最后更新时间。
 */
export function useNexusStream(paused: boolean) {
  const [snapshot, setSnapshot] = useState<NexusSnapshot | null>(null);
  const [connection, setConnection] = useState<NexusConnection>("connecting");
  const [error, setError] = useState<string>("");
  const [lastAt, setLastAt] = useState<string | null>(null);
  const snapshotRef = useRef<NexusSnapshot | null>(null);
  snapshotRef.current = snapshot;

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let failures = 0;

    const apply = (next: NexusSnapshot) => {
      if (stopped) return;
      setSnapshot(next);
      setLastAt(next.ts);
      setError("");
      setConnection("live");
      failures = 0;
    };

    const applyDelta = (delta: Delta) => {
      if (stopped) return;
      setSnapshot((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          ...delta,
          nodes: delta.nodes || previous.nodes,
          links: delta.links || previous.links,
          events: delta.events || previous.events,
        } as NexusSnapshot;
      });
      setLastAt(delta.ts || new Date().toISOString());
      setConnection("live");
    };

    const poll = async () => {
      try {
        const next = await cloudRequest("/api/v1/admin/nexus") as NexusSnapshot | null;
        if (next) apply(next);
      } catch (cause) {
        if (!stopped) {
          setError(cause instanceof Error ? cause.message : "监控接口暂不可用");
          setConnection("error");
        }
      }
    };

    const startPolling = () => {
      if (pollTimer || stopped) return;
      void poll();
      pollTimer = setInterval(() => { void poll(); }, 5000);
    };

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const parseBlocks = (text: string) => {
      for (const block of text.split("\n\n")) {
        if (!block.trim()) continue;
        let event = "message";
        const dataLines: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        let payload: unknown = null;
        try { payload = JSON.parse(dataLines.join("\n")); } catch { continue; }
        if (event === "snapshot") apply(payload as NexusSnapshot);
        else if (event === "delta") applyDelta(payload as Delta);
        else if (event === "ping" || event === "heartbeat") {
          setLastAt(new Date().toISOString());
          setConnection("live");
        } else if (event === "error") {
          const message = (payload as { message?: string })?.message || "实时通道异常";
          setError(message);
          setConnection("error");
        }
      }
    };

    const connect = async () => {
      if (stopped) return;
      controller?.abort();
      controller = new AbortController();
      setConnection((previous) => (previous === "live" ? "reconnecting" : previous === "connecting" ? "connecting" : "reconnecting"));
      try {
        const response = await cloudFetch("/api/v1/admin/nexus/stream", {
          signal: controller.signal,
          headers: { Accept: "text/event-stream" },
          cache: "no-store",
        });
        if (!response.ok || !response.body) throw new Error(`实时通道不可用（HTTP ${response.status}）`);
        stopPolling();
        failures = 0;
        setConnection("live");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const boundary = buffer.lastIndexOf("\n\n");
          if (boundary >= 0) {
            const ready = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            parseBlocks(ready);
          }
        }
        throw new Error("实时通道已断开");
      } catch (cause) {
        if (stopped || (cause instanceof DOMException && cause.name === "AbortError")) return;
        failures += 1;
        setError(cause instanceof Error ? cause.message : "实时通道已断开");
        setConnection(failures >= 3 ? "error" : "reconnecting");
        startPolling();
        reconnectTimer = setTimeout(() => { void connect(); }, failures >= 3 ? 8000 : 3000);
      }
    };

    if (paused) {
      setConnection("paused");
      return () => { stopped = true; controller?.abort(); };
    }

    // 只开 SSE：服务端在握手阶段立即推送首帧完整快照。
    // 之前的实现同时发起一次 /api/v1/admin/nexus 全量轮询，等于每次进入
    // Nexus 都重复构建一次快照，属于监控自身放大请求，已移除。
    void connect();

    return () => {
      stopped = true;
      controller?.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling();
    };
  }, [paused]);

  return { snapshot, connection, error, lastAt };
}
