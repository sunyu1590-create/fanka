"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Gift, Sparkles } from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";

type Mission = { key: "flip_two" | "rate_one" | "save_one"; title: string; description: string; progress: number; target: number; points: number; claimed: boolean };

export default function DailyMissions({ accountId, onNotice }: { accountId: string | null; onNotice?: (message: string) => void }) {
  const [items, setItems] = useState<Mission[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const refresh = useCallback(async () => {
    if (!accountId) { setItems([]); setBusy(null); return; }
    try { const response = await cloudFetch("/api/v1/daily-missions", { cache: "no-store" }); const result = await response.json(); if (response.ok && Array.isArray(result.data?.missions)) setItems(result.data.missions); } catch {}
  }, [accountId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const claim = async (mission: Mission) => {
    setBusy(mission.key);
    try { await cloudRequest("/api/v1/daily-missions", { missionKey: mission.key }); onNotice?.(`已领取「${mission.title}」奖励 · +${mission.points} EXP`); await refresh(); window.dispatchEvent(new Event("heika-experience-updated")); }
    catch (error) { onNotice?.(error instanceof Error ? error.message : "领取失败"); }
    finally { setBusy(null); }
  };
  const claimedCount = items.filter((item) => item.claimed).length;
  const summary = accountId ? `${claimedCount}/${items.length || 3} 项已领取` : "登录后完成小目标，累计领取经验";

  return (
    <section className={`daily-missions-panel${open ? " is-open" : ""}`}>
      <button type="button" className="daily-missions-toggle" aria-expanded={open} aria-controls="daily-missions-details" onClick={() => setOpen((value) => !value)}>
        <span className="daily-missions-toggle-label"><Gift size={17}/><strong>今日探索任务</strong><small>{summary}</small></span>
        <ChevronDown size={17} aria-hidden="true"/>
      </button>
      <div id="daily-missions-details" className="daily-missions-details" aria-hidden={!open} inert={!open}>
        <div className="daily-missions-details-inner">
          {!accountId ? <p className="daily-missions-login-hint"><Sparkles size={15}/>登录后查看每日任务与经验奖励。</p> : <div className="daily-missions-list">
            {items.map((item) => <article className="daily-mission-row" key={item.key}>
              <div className="daily-mission-mark">{item.claimed ? <Check size={16}/> : <Sparkles size={15}/>}</div>
              <div className="daily-mission-copy"><strong>{item.title}<i>+{item.points} EXP</i></strong><small>{item.description}</small><span className="daily-mission-progress"><i style={{ width: `${Math.min(100, item.progress / item.target * 100)}%` }}/></span></div>
              <button type="button" disabled={busy !== null || item.claimed || item.progress < item.target} onClick={() => void claim(item)}>{item.claimed ? "已领取" : busy === item.key ? "领取中" : item.progress >= item.target ? "领取" : `${item.progress}/${item.target}`}</button>
            </article>)}
            {!items.length && <p className="daily-missions-login-hint">今日任务正在同步。</p>}
          </div>}
        </div>
      </div>
    </section>
  );
}
