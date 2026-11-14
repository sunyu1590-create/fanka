"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock3, TicketCheck } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { browserDb } from "@/lib/browser-db";

type Item = { tier: "plus" | "pro"; duration_days: number; activation_state: "active" | "queued"; starts_at: string | null; expires_at: string | null; created_at: string };
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : "—";

export default function MembershipRedemptionHistory() {
  const [items, setItems] = useState<Item[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("登录后可查看当前账号的兑换记录。");
  useEffect(() => {
    let active = true;
    void browserDb().then(async (db) => {
      const { data } = await db.auth.getSession();
      if (!data.session) { if (active) setLoading(false); return; }
      const result = await cloudRequest("/api/v1/membership/redeem/history") as { items?: Item[] } | null;
      if (active) { setItems(result?.items || []); setError(""); setLoading(false); }
    }).catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : "兑换记录暂时不可用"); setLoading(false); } });
    return () => { active = false; };
  }, []);
  return <main className="page membership-history-page"><Link href="/membership/redeem" className="membership-route-back"><ArrowLeft size={17}/>激活码兑换</Link><header><span>HEIKA / REDEMPTION</span><h1><TicketCheck size={24}/>兑换历史</h1><p>这里只显示当前账号的会员激活记录。</p></header>
    {loading ? <p className="membership-auth-state">正在读取兑换记录…</p> : error ? <p className="membership-redeem-error" role="alert">{error}</p> : items.length ? <div className="membership-history-list">{items.map((item) => <article key={`${item.created_at}-${item.tier}`}><div><strong>{item.tier.toUpperCase()}</strong><span>{item.duration_days} 天 · {item.activation_state === "queued" ? "到期后生效" : "已生效"}</span></div><small><Clock3 size={13}/>{dateLabel(item.created_at)}</small><p>{item.activation_state === "queued" ? `预计于 ${dateLabel(item.starts_at)} 开始` : `${dateLabel(item.starts_at)} — ${dateLabel(item.expires_at)}`}</p></article>)}</div> : <p className="membership-history-empty">暂无兑换记录</p>}
  </main>;
}
