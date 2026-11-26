"use client";

import { useEffect, useRef, useState } from "react";
import type { NexusEngine, PickResult, ProjectionMode, QualityMode } from "@/lib/nexus/engine";
import type { NexusHistoryPoint, NexusMarker, NexusSceneKey, NexusSnapshot } from "@/lib/nexus/types";
import type { SceneExtras } from "@/lib/nexus/scenes";

type SceneData = SceneExtras | null;

export default function NexusCanvas({
  snapshot, scene, sceneData, dataKey, theme, quality, projection, labels,
  paused, historicalPoint, markers, autoRotate, focusRequest, onPick, onNeedFallback,
}: {
  snapshot: NexusSnapshot;
  scene: NexusSceneKey;
  sceneData: SceneData;
  dataKey: string;
  theme: "dark" | "light";
  quality: QualityMode;
  projection: ProjectionMode;
  labels: "all" | "auto" | "none";
  paused: boolean;
  historicalPoint?: NexusHistoryPoint | null;
  markers?: NexusMarker[];
  autoRotate?: boolean;
  focusRequest?: { id: string; seq: number } | null;
  onPick: (result: PickResult) => void;
  onNeedFallback: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<NexusEngine | null>(null);
  const [stats, setStats] = useState<{ fps: number; drawCalls: number; particles: number } | null>(null);
  const [failed, setFailed] = useState<string>("");
  const callbacks = useRef(onPick);
  callbacks.current = onPick;

  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    // WebGL 不可用时不再尝试创建上下文，直接交给二维降级。
    const probe = document.createElement("canvas");
    const supported = Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
    if (!supported) { onNeedFallback(); return; }
    void import("@/lib/nexus/engine").then(({ NexusEngine }) => {
      if (!alive) return;
      try {
        engineRef.current = new NexusEngine({
          canvas, container: host, theme,
          onPick: (result) => callbacks.current(result),
          onContextMenu: (id, x, y) => {
            // 长按/右键只负责定位，具体操作入口交给详情面板，避免在画布上做危险操作。
            callbacks.current({ type: "node", id });
            window.dispatchEvent(new CustomEvent("heika:nexus-context", { detail: { id, x, y } }));
          },
          onStats: (next) => setStats({ fps: next.fps, drawCalls: next.drawCalls, particles: next.particles }),
          onContextLost: () => {
            setFailed("图形上下文已丢失（可能由显卡驱动或显存不足引起）");
            onNeedFallback();
          },
        });
        engineRef.current.setQuality(quality);
        engineRef.current.setScene(scene, snapshot, { rebuild: true, data: sceneData || undefined });
        engineRef.current.setProjection(projection);
        engineRef.current.setLabelMode(labels);
        if (historicalPoint) engineRef.current.setHistorical(historicalPoint, markers || []);
      } catch (error) {
        setFailed(error instanceof Error ? error.message : "三维引擎初始化失败");
        onNeedFallback();
      }
    });
    return () => {
      alive = false;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // 仅初始化一次；后续变更由下面的独立副作用驱动。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engineRef.current?.setTheme(theme, true); }, [theme]);
  useEffect(() => { engineRef.current?.setQuality(quality); }, [quality]);
  useEffect(() => { engineRef.current?.setProjection(projection); }, [projection]);
  useEffect(() => { engineRef.current?.setLabelMode(labels); }, [labels]);
  useEffect(() => { engineRef.current?.setPaused(paused); }, [paused]);
  useEffect(() => { engineRef.current?.setAutoRotate(Boolean(autoRotate)); }, [autoRotate]);

  // 场景或按需数据变化才重建几何；每秒快照只做增量更新。
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setScene(scene, snapshot, { rebuild: true, data: sceneData || undefined });
    engine.setProjection(projection);
    engine.setLabelMode(labels);
  }, [scene, dataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    engineRef.current?.update(snapshot);
  }, [snapshot]);

  useEffect(() => {
    engineRef.current?.setHistorical(historicalPoint ?? null, markers || []);
  }, [historicalPoint, markers]);

  useEffect(() => {
    if (focusRequest?.id) engineRef.current?.focus(focusRequest.id);
  }, [focusRequest?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="nx-canvas" ref={hostRef}>
      <canvas ref={canvasRef} aria-label="HEIKA Nexus 三维场景" />
      {failed ? <div className="nx-canvas__error" role="status">{failed}</div> : null}
      {stats ? (
        <span className="nx-canvas__stats" title="客户端渲染性能">
          {stats.fps} FPS · {stats.drawCalls} draw · {stats.particles} points
        </span>
      ) : null}
      <div className="nx-canvas__hint" aria-hidden="true">拖动旋转 · 滚轮缩放 · 双击聚焦 · 长按管理入口</div>
    </div>
  );
}
