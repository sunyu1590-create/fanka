"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, BellOff, Bookmark, Check, ChevronRight, FileText, Image as ImageIcon,
  Pin, Search, Shield, Trash2, X, Archive, MessageSquare, Users, Palette, MonitorSmartphone,
} from "lucide-react";
import { chatApi, CHAT_THEMES, QUICK_REACTIONS, SAFETY_NOTICE, type ChatSettings, type ChatMessage } from "@/lib/chat-api";
import type { NoticeOptions } from "./NoticeBanner";

type Profile = { id: string; nickname: string; avatar_url?: string | null; bio?: string };

/**
 * 所有聊天二级页统一挂到 body 根节点。
 * 会话窗口 .chat-screen 自带 position/z-index 层叠上下文，面板若留在页面树里
 * 会被它整片盖住（表现为"点了没反应"），因此必须脱离父级层叠上下文渲染。
 */
function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="chat-panel-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="chat-panel" onClick={(e) => e.stopPropagation()}>
        <header className="chat-panel-head">
          <button type="button" className="chat-panel-back" onClick={onClose} aria-label="返回"><ArrowLeft size={20} /></button>
          <h2>{title}</h2>
          <button type="button" className="chat-panel-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </header>
        <div className="chat-panel-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function Toggle({ checked, onChange, label, icon, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; icon?: ReactNode; hint?: string }) {
  return (
    <div className="chat-setting-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`chat-setting-toggle${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
        aria-label={label}
      >
        <span className="chat-setting-toggle-label">{icon}{label}</span>
        <span className="chat-switch"><i /></span>
      </button>
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** 独立聊天详情设置页：四组功能，统一图标/开关/细分割线。 */
export function ChatSettingsPanel({
  conversation,
  peer,
  onClose,
  onNotice,
  onOpenMedia,
  onOpenFavorites,
  onOpenSearch,
  onOpenPrivacy,
  onOpenRequests,
  onCleared,
}: {
  /** 缺省表示从收件箱进入，只展示全局项（会话级设置需要具体会话）。 */
  conversation?: string;
  peer?: Profile;
  onClose: () => void;
  onNotice?: (m: string, o?: NoticeOptions) => void;
  onOpenMedia: () => void;
  onOpenFavorites: () => void;
  onOpenSearch: () => void;
  onOpenPrivacy: () => void;
  onOpenRequests?: () => void;
  onCleared: () => void;
}) {
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!conversation) { setSettings(null); return; }
    let alive = true;
    void chatApi.settings(conversation).then((s) => { if (alive) setSettings(s); }).catch(() => {});
    return () => { alive = false; };
  }, [conversation]);
  const update = async (patch: Partial<ChatSettings>) => {
    if (!conversation) return;
    setSettings((s) => (s ? { ...s, ...patch } : s));
    try {
      const next = await chatApi.updateSettings(conversation, patch);
      setSettings(next);
    } catch (e) {
      onNotice?.(e instanceof Error ? e.message : "设置保存失败");
    }
  };

  // 收件箱入口：没有具体会话时只给全局项，避免出现"点了没反应"的空面板。
  if (!conversation) {
    return (
      <Panel title="聊天设置" onClose={onClose}>
        <section className="chat-settings-group">
          <h3>消息与隐私</h3>
          {onOpenRequests && <button type="button" className="chat-setting-link" onClick={onOpenRequests}><Users size={16} />陌生人消息请求<ChevronRight size={16} /></button>}
          <button type="button" className="chat-setting-link" onClick={onOpenSearch}><Search size={16} />查找聊天记录<ChevronRight size={16} /></button>
          <button type="button" className="chat-setting-link" onClick={onOpenFavorites}><Bookmark size={16} />收藏的消息<ChevronRight size={16} /></button>
          <button type="button" className="chat-setting-link" onClick={onOpenPrivacy}><Shield size={16} />隐私与已读设置<ChevronRight size={16} /></button>
        </section>
        <p className="chat-panel-hint">置顶、免打扰、归档、聊天主题与字号属于单个会话：进入会话后点右上角 ⋯ 设置。</p>
      </Panel>
    );
  }

  return (
    <Panel title="聊天设置" onClose={onClose}>
      <div className="chat-settings-peer">
        <span className="conversation-avatar">{(peer?.nickname || "探").slice(0, 1)}{peer?.avatar_url && <img src={peer.avatar_url} alt="" />}</span>
        <strong>{peer?.nickname || "探索者"}</strong>
      </div>
      <section className="chat-settings-group">
        <h3>会话管理</h3>
        {settings && <>
          <Toggle checked={settings.pinned} onChange={(v) => void update({ pinned: v })} label="置顶聊天" icon={<Pin size={16} />} />
          <Toggle checked={settings.muted} onChange={(v) => void update({ muted: v })} label="消息免打扰" icon={<BellOff size={16} />} />
          <Toggle checked={settings.manual_unread} onChange={(v) => void (v ? chatApi.markUnread(conversation, true).then(() => setSettings((s) => s && ({ ...s, manual_unread: true }))) : chatApi.markRead(conversation).then(() => setSettings((s) => s && ({ ...s, manual_unread: false }))))} label="标记未读" icon={<MessageSquare size={16} />} />
          <Toggle checked={settings.archived} onChange={(v) => void update({ archived: v, pinned: v ? false : settings.pinned })} label="归档聊天" icon={<Archive size={16} />} hint="归档后从主列表移出，收到新消息默认自动恢复。" />
        </>}
      </section>
      <section className="chat-settings-group">
        <h3>消息与资源</h3>
        <button type="button" className="chat-setting-link" onClick={onOpenSearch}><Search size={16} />查找聊天记录<ChevronRight size={16} /></button>
        <button type="button" className="chat-setting-link" onClick={onOpenMedia}><ImageIcon size={16} />聊天图片与视频<ChevronRight size={16} /></button>
        <button type="button" className="chat-setting-link" onClick={onOpenFavorites}><Bookmark size={16} />收藏的消息<ChevronRight size={16} /></button>
      </section>
      <section className="chat-settings-group">
        <h3>隐私与个性化</h3>
        <button type="button" className="chat-setting-link" onClick={onOpenPrivacy}><Shield size={16} />隐私与已读设置<ChevronRight size={16} /></button>
        <div className="chat-theme-picker">
          <span><Palette size={15} />聊天主题</span>
          <div className="chat-theme-swatches">
            {CHAT_THEMES.map((t) => (
              <button
                type="button"
                key={t.id}
                title={t.name}
                aria-label={`主题 ${t.name}`}
                className={`chat-theme-swatch${settings?.theme === t.id ? " selected" : ""}`}
                style={{ background: t.swatch }}
                onClick={() => void update({ theme: t.id })}
              >{settings?.theme === t.id && <Check size={14} />}</button>
            ))}
            {settings?.theme && <button type="button" className="text-button" onClick={() => void update({ theme: null })}>恢复默认</button>}
          </div>
        </div>
        <div className="chat-font-row">
          <span><MonitorSmartphone size={15} />字体大小</span>
          <input type="range" min={0.85} max={1.4} step={0.05} value={settings?.font_scale ?? 1}
            onChange={(e) => void update({ font_scale: Number(e.target.value) })} aria-label="聊天字体大小" />
        </div>
      </section>
      <section className="chat-settings-group">
        <h3>安全与清理</h3>
        <button type="button" className="chat-setting-link danger" onClick={() => setConfirmClear(true)}><Trash2 size={16} />清空自己的聊天记录<ChevronRight size={16} /></button>
        {confirmClear && (
          <div className="chat-confirm-clear">
            <p>仅清除你自己看到的聊天记录，不会删除对方保存的消息。此操作不可撤销。</p>
            <button type="button" className="danger-button" onClick={() => { setConfirmClear(false); onCleared(); }}>确认清空</button>
            <button type="button" className="text-button" onClick={() => setConfirmClear(false)}>取消</button>
          </div>
        )}
      </section>
    </Panel>
  );
}

/** 聊天记录搜索：全局/会话内，服务端分页。 */
export function ChatSearchPanel({
  conversation,
  onClose,
  onJump,
}: {
  conversation?: string;
  onClose: () => void;
  onJump?: (messageId: string, fromConversation: string) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Array<ChatMessage & { peer_name?: string; peer_avatar?: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const run = async (value: string) => {
    setQ(value);
    if (value.trim().length < 1) return;
    setBusy(true);
    setSearched(true);
    try {
      const res = await chatApi.search(value.trim(), conversation);
      setItems(res.items || []);
    } catch {
      setItems([]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="查找聊天记录" onClose={onClose}>
      <form className="chat-search-form" onSubmit={(e) => { e.preventDefault(); void run(q); }}>
        <Search size={17} />
        <input value={q} onChange={(e) => void run(e.target.value)} placeholder="输入关键词搜索消息" autoFocus />
      </form>
      <div className="chat-search-results">
        {busy && <p className="chat-panel-hint">正在搜索…</p>}
        {!busy && searched && items.length === 0 && <p className="chat-panel-hint">没有找到相关消息</p>}
        {items.map((m) => (
          <button key={m.id} type="button" className="chat-search-result" onClick={() => onJump?.(m.id, m.conversation_id)}>
            {m.peer_avatar && <img className="chat-search-avatar" src={m.peer_avatar} alt="" />}
            <span>
              <strong>{m.peer_name || "会话"}</strong>
              <em>{highlight(m.body, q)}</em>
              <small>{new Date(m.created_at).toLocaleString("zh-CN")}</small>
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function highlight(body: string, q: string) {
  if (!q.trim()) return body;
  const idx = body.toLowerCase().indexOf(q.trim().toLowerCase());
  if (idx < 0) return body;
  return <>{body.slice(0, idx)}<mark>{body.slice(idx, idx + q.trim().length)}</mark>{body.slice(idx + q.trim().length)}</>;
}

/** 聊天媒体资源库：按类型筛选，点击定位原消息。 */
export function ChatMediaPanel({
  conversation,
  onClose,
  onJump,
}: {
  conversation: string;
  onClose: () => void;
  onJump?: (messageId: string) => void;
}) {
  const [kind, setKind] = useState("all");
  const [items, setItems] = useState<Array<ChatMessage & { url: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    void chatApi.media(conversation, kind).then((res) => { if (alive) setItems(res.items || []); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [conversation, kind]);
  const kinds = [
    ["all", "全部"], ["image", "图片"], ["video", "视频"], ["file", "文件"], ["work", "作品"], ["collection", "合集"],
  ];
  return (
    <Panel title="聊天资源库" onClose={onClose}>
      <div className="chat-media-tabs">
        {kinds.map(([id, label]) => <button type="button" key={id} className={kind === id ? "selected" : ""} onClick={() => setKind(id)}>{label}</button>)}
      </div>
      {busy && <p className="chat-panel-hint">正在加载…</p>}
      {!busy && items.length === 0 && <p className="chat-panel-hint">这个会话还没有相关资源</p>}
      <div className={`chat-media-grid${kind === "image" || kind === "video" ? " grid-media" : ""}`}>
        {items.map((m) => (
          <button type="button" key={m.id} className="chat-media-item" onClick={() => onJump?.(m.id)}>
            {(kind === "image" || kind === "video") && m.url ? (
              <img src={m.url} alt="" loading="lazy" />
            ) : (
              <><FileText size={18} /><span>{m.body}</span></>
            )}
            <small>{new Date(m.created_at).toLocaleDateString("zh-CN")}</small>
          </button>
        ))}
      </div>
    </Panel>
  );
}

/** 陌生人消息请求。 */
export function ChatRequestsPanel({ onClose, onNotice, onOpened }: { onClose: () => void; onNotice?: (m: string) => void; onOpened?: (id: string) => void }) {
  const [data, setData] = useState<{ received: Array<Record<string, unknown>>; sent: Array<Record<string, unknown>>; pending_count: number } | null>(null);
  const load = () => void chatApi.requests().then(setData).catch(() => {});
  useEffect(load, []);
  const act = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); onNotice?.(msg); load(); } catch (e) { onNotice?.(e instanceof Error ? e.message : "操作失败"); }
  };
  const peerOf = (row: Record<string, unknown>) => (row.peer as Profile) || { id: "", nickname: "探索者" };
  return (
    <Panel title="消息请求" onClose={onClose}>
      <h3 className="chat-requests-sub">待处理 {data?.pending_count ?? 0}</h3>
      {(data?.received || []).map((row) => {
        const peer = peerOf(row);
        return (
          <div key={String(row.id)} className="chat-request-row">
            <span className="conversation-avatar">{(peer.nickname || "探").slice(0, 1)}</span>
            <div>
              <strong>{peer.nickname}</strong>
              <p>{String(row.body || "")}</p>
              <small>{new Date(String(row.created_at)).toLocaleString("zh-CN")}</small>
              <div className="chat-request-actions">
                {row.status === "pending" ? <>
                  <button type="button" className="primary-button" onClick={() => void act(String(row.id), () => chatApi.acceptRequest(String(row.id)).then((r) => { onOpened?.(r.conversation_id); }), "已接受请求")}>接受</button>
                  <button type="button" className="soft-button" onClick={() => void act(String(row.id), () => chatApi.updateRequest(String(row.id), "ignored"), "已忽略")}>忽略</button>
                </> : <em>已处理</em>}
                <button type="button" className="text-button" onClick={() => void act(String(row.id), () => chatApi.updateRequest(String(row.id), "deleted"), "已删除请求")}>删除</button>
              </div>
            </div>
            {Boolean(row.safety_flag) && <div className="chat-safety-note"><Shield size={12} />{SAFETY_NOTICE}</div>}
          </div>
        );
      })}
      {data && data.received.length === 0 && <p className="chat-panel-hint">暂无陌生人消息请求</p>}
      {(data?.sent || []).length > 0 && <h3 className="chat-requests-sub">我发出的</h3>}
      {(data?.sent || []).map((row) => <div key={String(row.id)} className="chat-request-row sent">
        <div><strong>{peerOf(row).nickname}</strong><p>{String(row.body || "")}</p><small>{String(row.status) === "accepted" ? "对方已接受" : "等待对方接受"}</small></div>
      </div>)}
    </Panel>
  );
}

/** 隐私与已读设置。 */
export function ChatPrivacyPanel({ onClose, onNotice }: { onClose: () => void; onNotice?: (m: string) => void }) {
  const [privacy, setPrivacy] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { void chatApi.privacy().then(setPrivacy).catch(() => {}); }, []);
  const update = async (patch: Record<string, unknown>) => {
    setPrivacy((p) => (p ? { ...p, ...patch } : p));
    try { await chatApi.updatePrivacy(patch); } catch (e) { onNotice?.(e instanceof Error ? e.message : "保存失败"); }
  };
  const permission = String(privacy?.dm_permission ?? "everyone");
  return (
    <Panel title="隐私与已读" onClose={onClose}>
      <section className="chat-settings-group">
        <h3>谁可以私信我</h3>
        {[["everyone", "所有用户"], ["mutual", "仅互相关注的用户"], ["nobody", "不接收陌生人私信"]].map(([id, label]) => (
          <button type="button" key={id} className={`chat-setting-link${permission === id ? " selected" : ""}`} onClick={() => void update({ dm_permission: id })}>
            {label}{permission === id && <Check size={16} />}
          </button>
        ))}
      </section>
      <section className="chat-settings-group">
        <h3>状态与同步</h3>
        <Toggle checked={privacy?.read_receipt !== false} onChange={(v) => void update({ read_receipt: v })} label="发送已读回执" hint="关闭后对方看不到你的已读状态，但你在多个设备间的未读同步不受影响。" />
        <Toggle checked={privacy?.typing_indicator !== false} onChange={(v) => void update({ typing_indicator: v })} label="正在输入提示" />
      </section>
    </Panel>
  );
}

/** 消息操作面板：表情横排 + 两列动作网格，整体控制在约 300px，不产生滚动。 */
export function MessageActionSheet({
  message,
  mine,
  canRecall,
  canEdit,
  onClose,
  onAction,
  onReact,
}: {
  message: { body: string; recalled?: boolean | null };
  mine: boolean;
  canRecall: boolean;
  canEdit: boolean;
  onClose: () => void;
  onAction: (action: "copy" | "quote" | "edit" | "recall" | "favorite" | "forward" | "multi" | "report") => void;
  onReact: (emoji: string) => void;
}) {
  const [confirmRecall, setConfirmRecall] = useState(false);
  const expired = mine && !canRecall && !canEdit;
  return createPortal(
    <div className="chat-panel-backdrop chat-sheet-backdrop" role="dialog" aria-modal="true" aria-label="消息操作" onClick={onClose}>
      <div className="chat-action-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="msg-action-preview">{message.recalled ? "撤回了一条消息" : (message.body || "（非文字消息）")}</p>
        <div className="msg-react-row">
          {QUICK_REACTIONS.map((emoji) => (
            <button type="button" key={emoji} onClick={() => onReact(emoji)} aria-label={`回应 ${emoji}`}>{emoji}</button>
          ))}
        </div>
        <div className="msg-action-grid">
          <button type="button" onClick={() => onAction("copy")}>复制文字</button>
          <button type="button" onClick={() => onAction("quote")}>引用回复</button>
          <button type="button" onClick={() => onAction("favorite")}>收藏消息</button>
          <button type="button" onClick={() => onAction("forward")}>转发消息</button>
          <button type="button" onClick={() => onAction("multi")}>多选</button>
          {canEdit && <button type="button" onClick={() => onAction("edit")}>编辑消息</button>}
          {canRecall && (confirmRecall
            ? <button type="button" className="danger" onClick={() => onAction("recall")}>确认撤回</button>
            : <button type="button" className="danger" onClick={() => setConfirmRecall(true)}>撤回消息</button>)}
          <button type="button" className="danger" onClick={() => onAction("report")}>举报</button>
        </div>
        {confirmRecall && <p className="msg-action-hint">撤回后对话双方都看不到这条消息，且无法恢复。</p>}
        {expired && <p className="msg-action-hint">已超过 3 分钟撤回 / 15 分钟编辑时限</p>}
        <button type="button" className="chat-action-cancel" onClick={onClose}>取消</button>
      </div>
    </div>,
    document.body,
  );
}

/** 会话更多操作：不进入会话也能置顶/免打扰/标记未读/归档。 */
export function ConversationActionSheet({
  nickname,
  settings,
  onClose,
  onPatch,
  onMarkUnread,
  onOpenSettings,
}: {
  nickname: string;
  settings: ChatSettings | null;
  onClose: () => void;
  onPatch: (patch: Partial<ChatSettings>) => void;
  onMarkUnread: () => void;
  onOpenSettings: () => void;
}) {
  const row = (label: string, onClick: () => void, active = false) => (
    <button type="button" className={`chat-action-row${active ? " is-on" : ""}`} onClick={onClick}>
      <span>{label}</span>{active && <Check size={15} />}
    </button>
  );
  return createPortal(
    <div className="chat-panel-backdrop chat-sheet-backdrop" role="dialog" aria-modal="true" aria-label="会话操作" onClick={onClose}>
      <div className="chat-action-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="msg-action-preview">{nickname}</p>
        <div className="chat-action-list">
          {row(settings?.pinned ? "取消置顶" : "置顶聊天", () => onPatch({ pinned: !settings?.pinned }), Boolean(settings?.pinned))}
          {row(settings?.muted ? "关闭免打扰" : "消息免打扰", () => onPatch({ muted: !settings?.muted }), Boolean(settings?.muted))}
          {row("标记为未读", onMarkUnread)}
          {row(settings?.archived ? "取消归档" : "归档会话", () => onPatch({ archived: !settings?.archived }), Boolean(settings?.archived))}
          <button type="button" className="chat-action-row" onClick={onOpenSettings}><span>聊天设置</span><ChevronRight size={15} /></button>
        </div>
        <button type="button" className="chat-action-cancel" onClick={onClose}>取消</button>
      </div>
    </div>,
    document.body,
  );
}
