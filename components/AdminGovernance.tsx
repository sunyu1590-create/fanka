"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Edit3, Plus, RefreshCw, ShieldAlert, Trash2, X } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { userMessage } from "@/lib/user-message";
import ChoiceSelect from "./ChoiceSelect";
import { confirmInApp } from "@/lib/in-app-dialog";

type Mode = "keywords" | "comments" | "audit";
type Scope = "post" | "comment" | "message" | "profile";
type Rule = { id: string; keyword: string; scopes: Scope[]; enabled: boolean; created_at: string; updated_at: string };
type CommentItem = { id: string; post_id: string; author_id: string; parent_id: string | null; body: string; status: "visible" | "hidden"; created_at: string; author: string; post_title: string };
type AuditItem = { id: number; actor_id: string | null; actor: string; action: string; target_type: string; target_id: string | null; reason: string | null; details: Record<string, unknown>; created_at: string };
type Props = { mode: Mode };

const scopeOptions: Array<[Scope, string]> = [["post", "作品"], ["comment", "评论"], ["message", "私信"], ["profile", "昵称与简介"]];
const actionLabels: Record<string, string> = {
  keyword_rule_created: "新增关键词规则", keyword_rule_updated: "修改关键词规则", keyword_rule_deleted: "删除关键词规则",
  post_revision_approved: "通过作品修改", post_revision_rejected: "驳回作品修改", post_approved: "作品审核通过", post_hidden: "隐藏作品",
  comment_hidden: "隐藏评论", comment_restored: "恢复评论", community_restriction_set: "限制账号发言", community_restriction_removed: "解除账号限制",
  admin_role_granted: "授予管理员权限", admin_role_removed: "移除管理员权限", membership_tier_changed: "调整会员等级",
  report_resolved: "处理举报", report_dismissed: "驳回举报", dm_report_resolved: "处理私信举报", dm_report_dismissed: "驳回私信举报",
};
const targetLabels: Record<string, string> = { post: "作品", comment: "评论", keyword_rule: "关键词规则", user: "账号", report: "举报" };

export default function AdminGovernance({ mode }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"all" | "visible" | "hidden">("all");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [keyword, setKeyword] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["post", "comment", "message", "profile"]);
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [probe, setProbe] = useState("");
  const [probeScope, setProbeScope] = useState<Scope>("post");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (mode === "keywords") {
        const result = await cloudRequest("/api/v1/admin/moderation-rules") as { items: Rule[] };
        setRules(result.items || []);
      } else if (mode === "comments") {
        const params = new URLSearchParams({ status, limit: "30", page: String(page) });
        if (appliedQuery) params.set("q", appliedQuery);
        const result = await cloudRequest(`/api/v1/admin/comments?${params}`) as { items: CommentItem[]; total: number };
        setComments(result.items || []); setTotal(result.total || 0);
      } else {
        const result = await cloudRequest(`/api/v1/admin/audit?limit=50&page=${page}`) as { items: AuditItem[]; total: number };
        setAudit(result.items || []); setTotal(result.total || 0);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "管理数据加载失败"); }
    finally { setLoading(false); }
  }, [mode, status, appliedQuery, page]);

  useEffect(() => { void load(); }, [load]);

  const resetRuleForm = () => { setKeyword(""); setScopes(["post", "comment", "message", "profile"]); setRuleEnabled(true); setEditingId(null); };
  const saveRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!keyword.trim() || !scopes.length) { setError("请填写关键词并选择至少一个范围"); return; }
    setSaving("rule"); setError(""); setNotice("");
    try {
      await cloudRequest(editingId ? `/api/v1/admin/moderation-rules/${editingId}` : "/api/v1/admin/moderation-rules", { keyword: keyword.trim(), scopes, enabled: ruleEnabled }, editingId ? "PATCH" : "POST");
      setNotice(editingId ? "关键词规则已更新，后续提交立即生效。" : "关键词规则已启用，后续提交立即生效。");
      resetRuleForm(); await load();
    } catch (e) { setError(userMessage(e, "保存关键词规则失败，请检查是否已添加过相同词语")); }
    finally { setSaving(null); }
  };

  const editRule = (rule: Rule) => { setEditingId(rule.id); setKeyword(rule.keyword); setScopes(rule.scopes); setRuleEnabled(rule.enabled); setError(""); setNotice(""); };
  const toggleRule = async (rule: Rule) => {
    setSaving(rule.id); setError(""); setNotice("");
    try { await cloudRequest(`/api/v1/admin/moderation-rules/${rule.id}`, { enabled: !rule.enabled }, "PATCH"); setNotice(!rule.enabled ? "关键词规则已启用。" : "关键词规则已暂停。"); await load(); }
    catch (e) { setError(userMessage(e, "规则状态更新失败")); }
    finally { setSaving(null); }
  };
  const deleteRule = async (rule: Rule) => {
    if (!await confirmInApp(`确定删除「${rule.keyword}」这条关键词规则吗？`, {title:"删除规则",confirmLabel:"删除",danger:true})) return;
    setSaving(rule.id); setError(""); setNotice("");
    try { await cloudRequest(`/api/v1/admin/moderation-rules/${rule.id}`, undefined, "DELETE"); setNotice("关键词规则已删除。"); if (editingId === rule.id) resetRuleForm(); await load(); }
    catch (e) { setError(userMessage(e, "删除关键词规则失败")); }
    finally { setSaving(null); }
  };

  const moderateComment = async (comment: CommentItem, next: "visible" | "hidden") => {
    setSaving(comment.id); setError(""); setNotice("");
    try {
      await cloudRequest(`/api/v1/admin/comments/${comment.id}`, { status: next }, "PATCH");
      setNotice(next === "hidden" ? "评论已隐藏，处理记录已保存。" : "评论已恢复显示。"); await load();
    } catch (e) { setError(userMessage(e, "评论操作失败，请刷新后重试")); }
    finally { setSaving(null); }
  };

  return <section className="admin-governance">
    <div className="admin-governance-heading">
      <div><small>COMMUNITY / TRUST & SAFETY</small><h2>{mode === "keywords" ? "关键词规则" : mode === "comments" ? "评论管理" : "操作记录"}</h2>
      <p>{mode === "keywords" ? "拦截作品、评论、私信和公开资料中的指定词语；规则只在服务端执行。" : mode === "comments" ? `统一搜索、隐藏和恢复评论 · 共 ${total} 条` : `记录管理员的内容处置、账号限制和规则变更 · 共 ${total} 条`}</p></div>
      <button type="button" className="moderation-refresh" aria-label="刷新管理数据" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/></button>
    </div>
    {error && <p className="moderation-feedback error animated-notice" role="alert">{userMessage(error, "管理操作失败，请稍后重试")}</p>}
    {notice && <p className="moderation-feedback animated-notice" role="status">{notice}</p>}

    {mode === "keywords" ? <>
      <form className="admin-rule-form" onSubmit={(event) => void saveRule(event)}>
        <div className="admin-rule-form-title"><ShieldAlert size={17}/><strong>{editingId ? "编辑拦截规则" : "添加关键词"}</strong></div>
        <label>关键词或短语<input maxLength={80} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="输入需要拦截的词语" /></label>
        <fieldset><legend>应用范围</legend><div className="admin-rule-scopes">{scopeOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={scopes.includes(value)} onChange={() => setScopes((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])}/>{label}</label>)}</div></fieldset>
        <label className="admin-rule-enabled"><input type="checkbox" checked={ruleEnabled} onChange={(event) => setRuleEnabled(event.target.checked)}/>立即启用这条规则</label>
        <p className="admin-rule-hint">匹配不区分英文大小写；命中后内容不会发布或发送，作者会收到中文提示。管理员不受此规则影响。</p>
        <div className="admin-rule-form-actions"><button className="primary-button" disabled={saving === "rule" || !keyword.trim() || !scopes.length}>{saving === "rule" ? "保存中…" : editingId ? "保存修改" : <><Plus size={15}/> 添加规则</>}</button>{editingId && <button type="button" className="soft-button" onClick={resetRuleForm}>取消编辑</button>}</div>
      </form>
      <div className="admin-rule-probe"><label>测试一段内容<input value={probe} onChange={(event) => setProbe(event.target.value)} placeholder="输入文本，查看当前规则是否会拦截" /></label><label>检查范围<ChoiceSelect label="检查范围" value={probeScope} onChange={(value) => setProbeScope(value as Scope)} options={scopeOptions.map(([value,label]) => ({value,label}))}/></label><span>{probe.trim() ? (rules.some((rule) => rule.enabled && rule.scopes.includes(probeScope) && probe.toLowerCase().includes(rule.keyword.toLowerCase())) ? "命中启用规则" : "未命中当前范围规则") : "本地预览，不会提交内容"}</span></div>
      <div className="admin-rule-list"><div className="creator-subheading"><h3>已配置规则</h3><span>{rules.filter((rule) => rule.enabled).length} 条启用</span></div>
        {loading && !rules.length ? <p className="moderation-empty">正在加载规则…</p> : rules.length ? rules.map((rule) => <article className={`admin-rule-row${rule.enabled ? "" : " is-disabled"}`} key={rule.id}>
          <div className="admin-rule-copy"><strong>{rule.keyword}</strong><small>{rule.scopes.map((scope) => scopeOptions.find(([value]) => value === scope)?.[1]).filter(Boolean).join(" · ")}</small></div>
          <span className={`admin-rule-state${rule.enabled ? " enabled" : ""}`}>{rule.enabled ? "启用中" : "已暂停"}</span>
          <div className="admin-rule-actions"><button type="button" onClick={() => editRule(rule)} aria-label={`编辑 ${rule.keyword}`}><Edit3 size={15}/></button><button type="button" disabled={saving === rule.id} onClick={() => void toggleRule(rule)} aria-label={rule.enabled ? "暂停规则" : "启用规则"}>{rule.enabled ? <X size={15}/> : <Check size={15}/>}</button><button type="button" disabled={saving === rule.id} onClick={() => void deleteRule(rule)} aria-label="删除规则"><Trash2 size={15}/></button></div>
        </article>) : <p className="moderation-empty">还没有关键词规则。添加后，新提交的内容会立即检查。</p>}
      </div>
    </> : mode === "comments" ? <>
      <form className="admin-comment-search" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedQuery(query.trim()); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索评论内容" aria-label="搜索评论内容"/><button className="soft-button">搜索</button></form>
      <div className="moderation-filters" role="group" aria-label="评论状态">{([["all","全部"],["visible","公开"],["hidden","已隐藏"]] as const).map(([value,label]) => <button key={value} className={status === value ? "selected" : ""} onClick={() => { setPage(1); setStatus(value); }}>{label}</button>)}</div>
      {loading && !comments.length ? <p className="moderation-empty">正在加载评论…</p> : comments.length ? <div className="moderation-list">{comments.map((comment) => <article className="moderation-item admin-comment-row" key={comment.id}>
        <div className="moderation-item-heading"><strong>{comment.status === "visible" ? "公开评论" : "已隐藏评论"}{comment.parent_id && <small> · 回复</small>}</strong><time>{new Date(comment.created_at).toLocaleString("zh-CN")}</time></div>
        <p className="moderation-author">{comment.author} · 作品：{comment.post_title}</p>
        <details className="moderation-longtext"><summary>查看评论正文 · {comment.body.length} 字</summary><p className="admin-comment-body">{comment.body}</p></details>
        <div className="moderation-actions"><button disabled={saving === comment.id || comment.status === "hidden"} onClick={() => void moderateComment(comment, "hidden")}><X size={15}/> 隐藏评论</button><button disabled={saving === comment.id || comment.status === "visible"} onClick={() => void moderateComment(comment, "visible")}><Check size={15}/> 恢复显示</button></div>
      </article>)}</div> : <p className="moderation-empty">没有符合条件的评论。</p>}
      {total > 30 && <div className="admin-governance-pagination"><button type="button" className="soft-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button><span>第 {page} 页 · 共 {total} 条</span><button type="button" className="soft-button" disabled={page * 30 >= total || loading} onClick={() => setPage((value) => value + 1)}>下一页</button></div>}
    </> : loading && !audit.length ? <p className="moderation-empty">正在加载操作记录…</p> : audit.length ? <div className="admin-audit-list">{audit.map((entry) => <article className="admin-audit-row" key={entry.id}>
      <div className="admin-audit-main"><strong>{actionLabels[entry.action] || entry.action}</strong><span>{entry.actor} · {targetLabels[entry.target_type] || entry.target_type}{entry.target_id ? ` · ${entry.target_id.slice(0, 8)}` : ""}</span>{entry.reason && <p>{entry.reason}</p>}</div>
      <time>{new Date(entry.created_at).toLocaleString("zh-CN")}</time>
    </article>)}</div> : <p className="moderation-empty">目前没有管理操作记录。</p>}
    {mode === "audit" && total > 50 && <div className="admin-governance-pagination"><button type="button" className="soft-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button><span>第 {page} 页 · 共 {total} 条</span><button type="button" className="soft-button" disabled={page * 50 >= total || loading} onClick={() => setPage((value) => value + 1)}>下一页</button></div>}
  </section>;
}
