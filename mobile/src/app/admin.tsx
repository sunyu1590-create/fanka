import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { Action, Metric, Notice, PageFrame, SectionTitle, palette, ui } from "../components/MobileUi";
import { api, useMobileSession } from "../lib/mobile-api";

type Overview = { usersToday?: number; postsToday?: number; pending?: number; pendingReports?: number; views?: number; likes?: number; saves?: number; comments?: number; recent?: Array<{ action: string; reason?: string; created_at: string }> };
type Submission = { id: string; title: string; body: string; author: string; status: string; kind: "new" | "revision"; created_at: string; originalTitle?: string | null };
type Rule = { id: string; keyword: string; scopes: string[]; enabled: boolean };
type Scope = "post" | "comment" | "message" | "profile";
const scopeNames: Record<Scope, string> = { post: "作品", comment: "评论", message: "私信", profile: "资料" };

export default function AdminScreen() {
  const { session, loading: authLoading } = useMobileSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [tab, setTab] = useState<"review" | "rules">("review");
  const [keyword, setKeyword] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["post", "comment"]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rulesError, setRulesError] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError("");
    try {
      const [summary, queue] = await Promise.all([
        api<Overview>("/api/v1/admin/overview", session),
        api<{ items: Submission[] }>("/api/v1/admin/posts?limit=12", session),
      ]);
      setOverview(summary); setSubmissions(queue.items || []);
      try { const result = await api<{ items: Rule[] }>("/api/v1/admin/moderation-rules", session); setRules(result.items || []); setRulesError(""); }
      catch (cause) { setRulesError(cause instanceof Error ? cause.message : "当前权限不能管理关键词规则。"); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "管理员数据读取失败"); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { void load(); }, [load]);

  const review = (item: Submission, approved: boolean) => {
    Alert.alert(approved ? "通过审核" : "隐藏作品", approved ? `确认公开「${item.title}」？` : `确认隐藏「${item.title}」？`, [
      { text: "取消", style: "cancel" },
      { text: approved ? "通过" : "隐藏", style: approved ? "default" : "destructive", onPress: () => void (async () => {
        setBusy(item.id); setError("");
        try {
          await api(`/api/v1/admin/posts/${item.id}`, session, { method: "PATCH", body: JSON.stringify({ status: approved ? "published" : "hidden", review_note: approved ? "符合社区内容规范" : "未符合社区内容规范" }) });
          setSubmissions((current) => current.filter((row) => row.id !== item.id));
          setOverview((current) => current ? { ...current, pending: Math.max(0, (current.pending || 0) - 1) } : current);
        } catch (cause) { setError(cause instanceof Error ? cause.message : "审核操作未完成"); }
        finally { setBusy(""); }
      })() },
    ]);
  };

  const addRule = async () => {
    const value = keyword.trim();
    if (!value || !scopes.length || !session) { setRulesError("请输入关键词并选择拦截范围。"); return; }
    setBusy("new-rule"); setRulesError("");
    try {
      const rule = await api<Rule>("/api/v1/admin/moderation-rules", session, { method: "POST", body: JSON.stringify({ keyword: value, scopes, enabled: true }) });
      setRules((current) => [rule, ...current]); setKeyword("");
    } catch (cause) { setRulesError(cause instanceof Error ? cause.message : "关键词规则保存失败"); }
    finally { setBusy(""); }
  };

  const toggleScope = (scope: Scope) => setScopes((current) => current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope]);
  const toggleRule = async (rule: Rule) => {
    setBusy(rule.id); setRulesError("");
    try {
      await api(`/api/v1/admin/moderation-rules/${rule.id}`, session, { method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }) });
      setRules((current) => current.map((row) => row.id === rule.id ? { ...row, enabled: !row.enabled } : row));
    } catch (cause) { setRulesError(cause instanceof Error ? cause.message : "规则更新失败"); }
    finally { setBusy(""); }
  };

  if (authLoading) return <PageFrame title="管理控制台" eyebrow="ADMIN / HEIKA"><ActivityIndicator color={palette.green} /></PageFrame>;
  if (!session) return <PageFrame title="管理控制台" eyebrow="ADMIN / HEIKA"><Text style={ui.muted}>请先使用管理员账号登录。</Text></PageFrame>;

  return <PageFrame title="管理控制台" eyebrow="ADMIN / MODERATION" refreshing={loading} onRefresh={() => void load()}>
    <Text style={ui.rowSubtitle}>审核和关键词规则由服务端权限控制，管理操作会记录审计日志。</Text>
    <Notice>{error}</Notice>
    {loading && !overview ? <ActivityIndicator color={palette.green} style={{ marginTop: 18 }} /> : <>
      <View style={metrics}><Metric label="待处理" value={overview?.pending ?? 0} /><Metric label="待处理举报" value={overview?.pendingReports ?? 0} /></View>
      <View style={metrics}><Metric label="今日用户" value={overview?.usersToday ?? 0} /><Metric label="今日作品" value={overview?.postsToday ?? 0} /><Metric label="公开阅读" value={overview?.views ?? 0} /></View>
      <View style={tabs}>
        <Pressable onPress={() => setTab("review")} style={[tabButton, tab === "review" && selectedTab]}><Text style={[tabText, tab === "review" && selectedTabText]}>作品审核　{submissions.length}</Text></Pressable>
        <Pressable onPress={() => setTab("rules")} style={[tabButton, tab === "rules" && selectedTab]}><Text style={[tabText, tab === "rules" && selectedTab && selectedTabText]}>关键词规则</Text></Pressable>
      </View>
      {tab === "review" ? <>
        {!submissions.length ? <Text style={ui.muted}>当前没有待审核作品。</Text> : null}
        {submissions.map((item) => <View key={`${item.id}-${item.kind}`} style={submission}>
          <Text style={submitTitle}>{item.title}</Text>
          {item.originalTitle ? <Text style={ui.rowSubtitle}>修改原题：{item.originalTitle}</Text> : null}
          <Text style={ui.rowSubtitle}>{item.author} · {new Date(item.created_at).toLocaleDateString("zh-CN")}</Text>
          <Text style={submitBody} numberOfLines={5}>{item.body}</Text>
          <View style={reviewActions}><View style={{ flex: 1 }}><Action title={busy === item.id ? "处理中…" : "通过"} disabled={Boolean(busy)} onPress={() => review(item, true)} /></View><View style={{ flex: 1 }}><Action title="隐藏" subtle disabled={Boolean(busy)} onPress={() => review(item, false)} /></View></View>
        </View>)}
      </> : <>
        <Text style={ui.rowSubtitle}>命中关键词后由现有审核规则处理，范围支持作品、评论、私信和资料。</Text>
        <TextInput value={keyword} onChangeText={setKeyword} style={field} maxLength={80} placeholder="添加拦截关键词" placeholderTextColor={palette.muted} />
        <View style={scopeRow}>{(Object.keys(scopeNames) as Scope[]).map((scope) => <Pressable key={scope} onPress={() => toggleScope(scope)} style={[scopeChip, scopes.includes(scope) && scopeSelected]}><Text style={[scopeText, scopes.includes(scope) && scopeSelectedText]}>{scopeNames[scope]}</Text></Pressable>)}</View>
        <Action title={busy === "new-rule" ? "保存中…" : "添加规则"} disabled={Boolean(busy)} onPress={() => void addRule()} />
        <Notice>{rulesError}</Notice>
        <SectionTitle detail={String(rules.length)}>已配置规则</SectionTitle>
        {rules.map((rule) => <View key={rule.id} style={ruleRow}>
          <View style={{ flex: 1 }}><Text style={submitTitle}>{rule.keyword}</Text><Text style={ui.rowSubtitle}>{rule.scopes.map((scope) => scopeNames[scope as Scope] || scope).join(" · ")}</Text></View>
          <Pressable disabled={Boolean(busy)} onPress={() => void toggleRule(rule)} style={[ruleToggle, rule.enabled && ruleToggleOn]}><Text style={[ruleToggleText, rule.enabled && ruleToggleTextOn]}>{busy === rule.id ? "…" : rule.enabled ? "启用" : "停用"}</Text></Pressable>
        </View>)}
      </>}
    </>}
  </PageFrame>;
}

const metrics = { flexDirection: "row", gap: 8 } as const;
const tabs = { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.line, marginTop: 8 } as const;
const tabButton = { flex: 1, minHeight: 43, justifyContent: "center", alignItems: "center" } as const;
const selectedTab = { borderBottomWidth: 2, borderBottomColor: palette.green } as const;
const tabText = { color: palette.muted, fontSize: 12 } as const;
const selectedTabText = { color: palette.green, fontWeight: "700" as const };
const submission = { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: palette.line, gap: 7 } as const;
const submitTitle = { color: palette.ink, fontSize: 14, fontWeight: "700" } as const;
const submitBody = { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 3 } as const;
const reviewActions = { flexDirection: "row", gap: 9, marginTop: 5 } as const;
const field = { minHeight: 48, paddingHorizontal: 13, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, borderRadius: 10, color: palette.ink } as const;
const scopeRow = { flexDirection: "row", flexWrap: "wrap", gap: 7 } as const;
const scopeChip = { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: palette.line, borderRadius: 16, backgroundColor: palette.paper } as const;
const scopeSelected = { borderColor: palette.green, backgroundColor: "#E8EEE9" } as const;
const scopeText = { color: palette.muted, fontSize: 12 } as const;
const scopeSelectedText = { color: palette.green, fontWeight: "700" as const };
const ruleRow = { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.line } as const;
const ruleToggle = { minWidth: 56, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: palette.line, borderRadius: 8 } as const;
const ruleToggleOn = { borderColor: palette.green, backgroundColor: "#E8EEE9" } as const;
const ruleToggleText = { color: palette.muted, fontSize: 11 } as const;
const ruleToggleTextOn = { color: palette.green, fontWeight: "700" as const };
