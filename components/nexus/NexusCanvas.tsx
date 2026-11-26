"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Cpu, Eye, Gauge, Layers, Lightbulb, Minus, Sparkles } from "lucide-react";
import type { NexusEngine, PickResult, ProjectionMode, QualityMode, RenderStats } from "@/lib/nexus/engine";
import type { NexusHistoryPoint, NexusMarker, NexusSceneKey, NexusSnapshot } from "@/lib/nexus/types";
import type { SceneExtras } from "@/lib/nexus/scenes";

type SceneData = SceneExtras | null;

/** 场景内可独立开关的显示项。标签受上层 labelMode 约束，这里只做叠加隐藏。 */
type DisplayToggles = {
  particles: boolean;
  links: boolean;
  labels: boolean;
  shadows: boolean;
  wireframe: boolean;
};

const TOGGLE_META: Array<{ key: keyof DisplayToggles; label: string; icon: typeof Eye }> = [
  { key: "particles", label: "粒子", icon: Sparkles },
  { key: "links", label: "链路", icon: Layers },
  { key: "labels", label: "标签", icon: Eye },
  { key: "shadows", label: "阴影", icon: Lightbulb },
  { key: "wireframe", label: "线框", icon: Minus },
];

const QUALITY_LABEL: Record<RenderStats["quality"], string> = {
  eco: "节能",
  balanced: "均衡",
  ultra: "高质量",
};

function fmtBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "不支持";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function NexusCanvas({
  snapshot, scene, sceneData, dataKey, theme, quality, projection, labels,
  paused, historicalPoint, markers, autoRotate, focusRequest, explode, bottomInset,
  onPick, onNeedFallback,
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
  explode?: boolean;
  bottomInset?: number;
  onPick: (result: PickResult) => void;
  onNeedFallback: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<NexusEngine | null>(null);
  const [stats, setStats] = useState<RenderStats | null>(null);
  const [failed, setFailed] = useState<string>("");
  const [diagOpen, setDiagOpen] = useState(false);
  const [toggles, setToggles] = useState<DisplayToggles>({
    particles: true, links: true, labels: true, shadows: true, wireframe: false,
  });
  // 引擎内部有独立的帧循环，把最新快照留在 ref 里，避免 setScene 后立即被旧闭包覆盖。
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const callbacks = useRef(onPick);
  callbacks.current = onPick;

  // 场景按需数据必须以场景键包裹后下发：buildScene 从 extras[scene] 取值，
  // 之前直接把对象本身当 extras，导致资源城市/内容宇宙拿到空数据、渲染为空场景。
  const sceneExtras = useMemo<SceneExtras>(
    () => (sceneData ? ({ [scene]: sceneData } as SceneExtras) : {}),
    [scene, sceneData],
  );
  const extrasRef = useRef<SceneExtras>(sceneExtras);
  extrasRef.current = sceneExtras;

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
          onStats: (next) => setStats(next),
          onContextLost: () => {
            setFailed("图形上下文已丢失（可能由显卡驱动或显存不足引起）");
            onNeedFallback();
          },
        });
        engineRef.current.setQuality(quality);
        engineRef.current.setScene(scene, snapshot, { rebuild: true, data: extrasRef.current });
        engineRef.current.setProjection(projection);
        engineRef.current.setLabelMode(labels);
        if (historicalPoint) engineRef.current.setHistorical(historicalPoint, markers || []);
        if (bottomInset) engineRef.current.setBottomInset(bottomInset);
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
  useEffect(() => {
    // 诊断面板的标签开关是叠加项：上层设为 none 时不再显示。
    engineRef.current?.setLabelMode(toggles.labels ? labels : "none");
  }, [labels, toggles.labels]);
  useEffect(() => { engineRef.current?.setPaused(paused); }, [paused]);
  useEffect(() => { engineRef.current?.setAutoRotate(Boolean(autoRotate)); }, [autoRotate]);
  useEffect(() => { engineRef.current?.setExplode(Boolean(explode)); }, [explode]);
  useEffect(() => { engineRef.current?.setBottomInset(bottomInset || 0); }, [bottomInset]);
  useEffect(() => { engineRef.current?.setParticlesVisible(toggles.particles); }, [toggles.particles]);
  useEffect(() => { engineRef.current?.setLinksVisible(toggles.links); }, [toggles.links]);
  useEffect(() => { engineRef.current?.setShadows(toggles.shadows); }, [toggles.shadows]);
  useEffect(() => { engineRef.current?.setWireframe(toggles.wireframe); }, [toggles.wireframe]);

  // 场景或按需数据变化才重建几何；每秒快照只做增量更新。
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setScene(scene, snapshotRef.current, { rebuild: true, data: sceneExtras });
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

  const toggle = useCallback((key: keyof DisplayToggles) => {
    setToggles((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  return (
    <div className="nx-canvas" ref={hostRef}>
      <canvas ref={canvasRef} aria-label="HEIKA Nexus 三维场景" />
      {failed ? <div className="nx-canvas__error" role="status">{failed}</div> : null}
      <button
        type="button"
        className={`nx-canvas__stats${diagOpen ? " is-open" : ""}`}
        title="客户端渲染性能（点击展开诊断面板）"
        aria-expanded={diagOpen}
        onClick={() => setDiagOpen((value) => !value)}
      >
        {stats ? <>{stats.fps} FPS · {stats.drawCalls} draw · {stats.points} points</> : "渲染诊断"}
      </button>
      {diagOpen ? (
        <div className="nx-diag" role="dialog" aria-label="渲染诊断面板">
          <div className="nx-diag__head">
            <b><Gauge size={13} />渲染诊断</b>
            <span>{stats ? QUALITY_LABEL[stats.quality] : "初始化中"}</span>
          </div>
          <dl className="nx-diag__grid">
            <div><dt>帧率</dt><dd>{stats ? `${stats.fps} FPS` : "—"}</dd></div>
            <div><dt>帧时间</dt><dd>{stats ? `${stats.frameMs.toFixed(1)} ms` : "—"}</dd></div>
            <div><dt>绘制调用</dt><dd>{stats?.drawCalls ?? "—"}</dd></div>
            <div><dt>三角形</dt><dd>{stats ? stats.triangles.toLocaleString("zh-CN") : "—"}</dd></div>
            <div><dt>粒子</dt><dd>{stats ? `${stats.points} / 上限 ${stats.particleCap}` : "—"}</dd></div>
            <div><dt>几何体</dt><dd>{stats?.geometries ?? "—"}</dd></div>
            <div><dt>纹理</dt><dd>{stats?.textures ?? "—"}</dd></div>
            <div><dt>分辨率</dt><dd>{stats ? `${stats.width}×${stats.height}` : "—"}</dd></div>
            <div><dt>像素比</dt><dd>{stats ? stats.dpr.toFixed(2) : "—"}</dd></div>
            <div><dt>可见标签</dt><dd>{stats?.labels ?? "—"}</dd></div>
            <div><dt>JS 堆占用</dt><dd>{stats ? fmtBytes(stats.heapBytes) : "—"}</dd></div>
            <div><dt>GPU 显存</dt><dd className="is-muted">浏览器不支持读取</dd></div>
          </dl>
          <div className="nx-diag__toggles">
            {TOGGLE_META.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.key} type="button" className={toggles[item.key] ? "is-on" : ""} onClick={() => toggle(item.key)}>
                  <Icon size={12} />{item.label}
                </button>
              );
            })}
          </div>
          <p className="nx-diag__note"><Cpu size={11} />GPU 占用率与显存由浏览器安全策略屏蔽，无法可靠获取，此处不估算。Bloom 在本版本默认关闭，故不提供开关。</p>
          <p className="nx-diag__note"><Activity size={11} />帧率来自引擎实测滑动窗口，非固定值。</p>
        </div>
      ) : null}
      <div className="nx-canvas__hint" aria-hidden="true">拖动旋转 · 滚轮缩放 · 双击聚焦 · 长按管理入口</div>
    </div>
  );
}
