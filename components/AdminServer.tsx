"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Power, RotateCw } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { privilegedRequest } from "@/lib/reauth-client";
import { confirmInApp } from "@/lib/in-app-dialog";
import { Empty, fmtBytes, fmtNum, fmtTime, Group } from "./admin/AdminUIKit";

type Service = { key: string; label: string; kind: string; container: string; status: string; health: string; version: string | null; started_at: string | null; cpu_percent: number | null; mem_bytes: number | null; pid: number | null; updated_at: string | null };
type Deployment = { id: number; version: string; image: string | null; status: string; note: string | null; deployed_at: string };
type Payload = { services: Service[]; deployments: Deployment[]; site_mode: { mode?: string }; features: Record<string, boolean>; uptime_seconds: number; node_version: string; note?: string };

const MODES = [
  { value: "normal", label: "正常模式", hint: "全部功能开放" },
  { value: "readonly", label: "只读模式", hint: "可浏览，禁止发布与互动" },
  { value: "eco", label: "节能模式", hint: "关闭 AI 与高消耗任务" },
  { value: "maintenance", label: "全站维护", hint: "仅管理员可访问" },
];

const FEATURES = [
  ["register", "用户注册"], ["publish", "内容发布"], ["comment", "评论"], ["dm", "私信"],
  ["upload", "媒体上传"], ["download", "资源下载"], ["ai", "AI 功能"], ["apk", "APK 下载"],
] as const;

export default function AdminServer({ view, onNotice }: { view: "services" | "deployments" | "emergency"; onNotice: (text: string) => void }) {
  return view === "emergency" ? <EmergencyPanel onNotice={onNotice} /> : <ServerPanel view={view} onNotice={onNotice} />;
}

function ServerPanel({ view, onNotice }: { view: "services" | "deployments"; onNotice: (text: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await cloudRequest("/api/v1/admin/services");
      if (result) { setData(result as Payload); setError(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "服务状态读取失败");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const restart = async (service: Service) => {
    const ok = await confirmInApp(`重启 ${service.label}（容器 ${service.container}）会短暂中断该服务，确认继续？`, { title: "重启服务", confirmLabel: "重启", danger: true });
    if (!ok) return;
    setBusy(service.key);
    try {
      await privilegedRequest("/api/v1/admin/services", { action: "restart", key: service.key });
      onNotice(`${service.label} 已重启`);
      await load();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "重启失败");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Group><Empty title="服务数据不可用" hint={error} /></Group>;
  if (!data) return <Group><Empty title="正在读取服务状态" /></Group>;

  if (view === "deployments") {
    return (
      <div className="cc-stack">
        <div className="cc-kv">
          <div><strong>服务版本</strong><span>{data.services.find((service) => service.key === "web")?.version || "由镜像标签决定"}</span></div>
          <div><strong>Node</strong><span>{data.node_version}</span></div>
          <div><strong>进程运行</strong><span>{Math.floor(data.uptime_seconds / 3600)} 小时 {Math.floor((data.uptime_seconds % 3600) / 60)} 分</span></div>
        </div>
        <Group>
          <div className="ab-card__head" style={{ marginBottom: 8 }}><span className="ab-card__title">部署记录</span><span className="ab-card__badge">{data.deployments.length} 条</span></div>
          {!data.deployments.length ? <Empty title="尚无部署记录" hint="部署脚本写入后在此展示" /> : (
            <div className="cc-tablewrap">
              <table className="cc-table">
                <thead><tr><th>版本</th><th>镜像</th><th>状态</th><th>备注</th><th>时间</th></tr></thead>
                <tbody>
                  {data.deployments.map((row) => (
                    <tr key={row.id}>
                      <td>{row.version}</td><td className="cc-mono">{row.image || "—"}</td>
                      <td><span className={`cc-state ${row.status === "success" ? "ok" : "warn"}`}>{row.status === "success" ? "成功" : row.status}</span></td>
                      <td>{row.note || "—"}</td><td>{fmtTime(row.deployed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Group>
      </div>
    );
  }

  return (
    <div className="cc-stack">
      <Group>
        <div className="ab-card__head" style={{ marginBottom: 8 }}>
          <span className="ab-card__title">服务健康</span>
          <span className="ab-card__badge">容器与进程实测</span>
        </div>
        <div className="cc-tablewrap">
          <table className="cc-table">
            <thead><tr><th>服务</th><th>状态</th><th>健康</th><th>CPU</th><th>内存</th><th>PID</th><th>启动</th><th /></tr></thead>
            <tbody>
              {data.services.map((service) => (
                <tr key={service.key}>
                  <td>{service.label}<small> {service.container}</small></td>
                  <td><span className={`cc-state ${service.status === "running" ? "ok" : "warn"}`}>{service.status === "running" ? "运行中" : service.status}</span></td>
                  <td>{service.health === "healthy" ? "正常" : service.health === "unknown" ? "未知" : service.health}</td>
                  <td>{service.cpu_percent == null ? "—" : `${service.cpu_percent.toFixed(1)}%`}</td>
                  <td>{service.mem_bytes == null ? "—" : fmtBytes(service.mem_bytes)}</td>
                  <td className="cc-mono">{service.pid ?? "—"}</td>
                  <td>{service.started_at ? fmtTime(service.started_at) : "—"}</td>
                  <td>{service.key !== "database" && service.key !== "storage" ? (
                    <button type="button" className="cc-btn" disabled={busy === service.key} onClick={() => void restart(service)}>
                      <RotateCw size={13} />{busy === service.key ? "重启中" : "重启"}
                    </button>
                  ) : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cc-note">{data.note} 重启通过宿主机受限代理执行，仅允许白名单容器。</p>
      </Group>
      <Group>
        <div className="ab-card__head"><span className="ab-card__title">当前模式</span><span className="ab-card__badge">{MODES.find((mode) => mode.value === (data.site_mode.mode || "normal"))?.label}</span></div>
        <p className="cc-note" style={{ marginTop: 6 }}>模式与功能开关在「紧急控制」中调整，所有限制由后端业务接口执行。</p>
      </Group>
    </div>
  );
}

function EmergencyPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [mode, setMode] = useState("normal");
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const result = await cloudRequest("/api/v1/admin/services");
    if (result) {
      const payload = result as Payload;
      setData(payload);
      setMode(payload.site_mode?.mode || "normal");
      setFeatures(payload.features || {});
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (reason.trim().length < 4) { onNotice("请填写变更原因（至少 4 个字）"); return; }
    const ok = await confirmInApp(
      mode === "maintenance" ? "全站维护模式下普通用户无法访问，管理员通道保留。确认切换？" : `确认切换到「${MODES.find((item) => item.value === mode)?.label}」并更新功能开关？`,
      { title: "紧急控制", confirmLabel: "确认执行", danger: mode !== "normal" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await privilegedRequest("/api/v1/admin/services", { action: "flags", mode, features, reason });
      onNotice("控制策略已写入并即时生效");
      await load();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "写入失败");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Group><Empty title="正在读取控制状态" /></Group>;

  return (
    <div className="cc-stack">
      <Group>
        <div className="ab-card__head" style={{ marginBottom: 8 }}><span className="ab-card__title">运行模式</span><span className={`cc-state ${mode === "normal" ? "ok" : "warn"}`}>{MODES.find((item) => item.value === mode)?.label}</span></div>
        <div className="cc-form">
          <div className="ab-segment" role="radiogroup" aria-label="运行模式">
            {MODES.map((item) => (
              <button key={item.value} type="button" role="radio" aria-checked={mode === item.value} className={mode === item.value ? "active" : ""} onClick={() => setMode(item.value)}>
                {item.label}<small>{item.hint}</small>
              </button>
            ))}
          </div>
        </div>
      </Group>

      <Group>
        <div className="ab-card__head" style={{ marginBottom: 8 }}><span className="ab-card__title">业务功能</span><span className="ab-card__badge">关闭后前端入口与后端接口同时生效</span></div>
        <div className="cc-featuregrid">
          {FEATURES.map(([key, label]) => {
            return (
              <button key={key} type="button" className={`cc-feature${features[key] === false ? " off" : ""}`} onClick={() => setFeatures((current) => ({ ...current, [key]: current[key] === false }))}>
                <span>{label}</span>
                <i>{features[key] === false ? "关闭" : "开启"}</i>
              </button>
            );
          })}
        </div>
        <p className="cc-note">只读/节能/维护模式会自动覆盖相关能力；单项开关只影响对应业务，不牵连其他功能。</p>
      </Group>

      <Group>
        <div className="cc-form">
          <label>变更原因（写入审计）<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：数据库升级，临时维护 20 分钟" /></label>
          <div className="cc-actions">
            <button type="button" className="cc-btn primary" disabled={busy} onClick={() => void save()}><Power size={14} />{busy ? "写入中…" : "应用控制策略"}</button>
            <span className="cc-note" style={{ margin: 0 }}><AlertTriangle size={12} /> 全站维护保留管理员访问通道。</span>
          </div>
        </div>
      </Group>
    </div>
  );
}
