/**
 * HEIKA 创作与发布系统 2.0 — 编辑模式与四类独立标识（网页端）。
 *
 * 目标：把「编辑归编辑、草稿归草稿、发布归发布」做成显式状态，
 * 普通发布入口永远是干净的新建会话，杜绝历史草稿/任务状态串场。
 */

/** 三种完全独立的编辑模式。禁止用「是否存在全局草稿对象/标题」等隐式条件推断。 */
export type EditorMode = "CREATE" | "DRAFT_EDIT" | "POST_EDIT";

export type EditorSession = {
  /** 创作会话：区分每一次独立创作；页面重渲染/旋转/预览不换，用户主动新创作才换。 */
  sessionId: string;
  mode: EditorMode;
  /** 草稿 ID：DRAFT_EDIT 时指向明确选中的草稿；CREATE 时为 null。 */
  draftId: string | null;
  /** 作品 ID：POST_EDIT 时绑定现有作品；其余为 null。 */
  postId: string | null;
  /** 幂等请求 ID：同一次正式发布重试复用，新创作/新提交重新生成。 */
  idempotencyKey: string;
  accountId: string | null;
  createdAt: number;
};

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 新建一次创作会话。只有用户主动开启新创作时才调用。
 * 注意：普通页面重渲染、旋转、选图、预览、AI 辅助都不得调用此函数。
 */
export function createEditorSession(input: {
  mode: EditorMode;
  draftId?: string | null;
  postId?: string | null;
  accountId?: string | null;
  /** 已存在的幂等 key（重新提交同一任务时复用）；传入则沿用，不新生成。 */
  idempotencyKey?: string | null;
}): EditorSession {
  return {
    sessionId: uuid(),
    mode: input.mode,
    draftId: input.mode === "DRAFT_EDIT" ? (input.draftId ?? null) : null,
    postId: input.mode === "POST_EDIT" ? (input.postId ?? null) : null,
    idempotencyKey: input.idempotencyKey || uuid(),
    accountId: input.accountId ?? null,
    createdAt: Date.now(),
  };
}

/** 同一次发布请求重试：沿用幂等 key；内容变化时应显式调用 rotateIdempotency。 */
export function rotateIdempotency(session: EditorSession): EditorSession {
  return { ...session, idempotencyKey: uuid() };
}

/** 判断一个请求/响应是否属于当前会话，用于丢弃迟到的旧请求结果。 */
export function isCurrentSession(session: EditorSession | null, check: {
  sessionId?: string | null;
  accountId?: string | null;
}): boolean {
  if (!session) return false;
  if (check.sessionId && check.sessionId !== session.sessionId) return false;
  if (check.accountId && session.accountId && check.accountId !== session.accountId) return false;
  return true;
}

export const EDITOR_MODE_LABEL: Record<EditorMode, string> = {
  CREATE: "新建创作",
  DRAFT_EDIT: "草稿编辑",
  POST_EDIT: "修改作品",
};
