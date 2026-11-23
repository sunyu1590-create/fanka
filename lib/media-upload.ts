/**
 * 图片上传：XHR 直传，按真实字节数回报进度。
 *
 * 之前用的是 fetch + 一串定时器模拟的进度条：上传 9 张图时既看不到真实进度，
 * 请求也没有超时与重试，弱网下单张卡住就会拖死整次发布。这里统一收口：
 * - `upload.onprogress` 给出真实已发送字节；
 * - 上传结束到服务端处理完之间单独标记 `processing`，不再冒充 99%；
 * - 网络错误、5xx、429 自动重试一次，4xx 直接返回可读错误。
 */

export type MediaUploadPhase = "uploading" | "processing" | "done";

export type MediaUploadProgress = {
  /** 0–100，按已发送字节计算；processing 阶段保持 100。 */
  percent: number;
  phase: MediaUploadPhase;
};

export type MediaUploadResult = {
  path: string;
  thumbnail_path?: string | null;
  retina_thumbnail_path?: string | null;
  width?: number | null;
  height?: number | null;
  staged?: boolean;
};

export type MediaUploadTarget =
  | { kind: "post"; postId: string }
  | { kind: "revision"; postId: string }
  | { kind: "staging" };

export class MediaUploadError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status: number, retryable = false) {
    super(message);
    this.name = "MediaUploadError";
    this.status = status;
    this.retryable = retryable;
  }
}

const RETRYABLE_STATUS = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

function parseResponse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    /* 非 JSON 响应按空对象处理，由状态码决定错误文案。 */
  }
  return {};
}

export function uploadMediaFile(input: {
  file: File;
  token: string;
  uploadId: string;
  sortOrder: number;
  target: MediaUploadTarget;
  onProgress?: (progress: MediaUploadProgress) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<MediaUploadResult> {
  const { file, token, uploadId, sortOrder, target, onProgress, timeoutMs = 180_000, signal } = input;
  const form = new FormData();
  form.set("file", file);
  form.set("upload_id", uploadId);
  form.set("sort_order", String(sortOrder));
  if (target.kind === "post") form.set("post_id", target.postId);
  if (target.kind === "revision") form.set("revision_post_id", target.postId);
  if (target.kind === "staging") form.set("staging", "1");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => {
      try { xhr.abort(); } catch { /* 已结束的请求忽略。 */ }
      finish(() => reject(new MediaUploadError("上传已取消", 0, false)));
    };

    xhr.open("POST", "/api/v1/media");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.({ percent: Math.min(100, Math.round((event.loaded / event.total) * 100)), phase: "uploading" });
    };
    xhr.upload.onload = () => {
      // 字节已经发完，接下来是服务端生成缩略图与写库。
      onProgress?.({ percent: 100, phase: "processing" });
    };
    xhr.onload = () => {
      const payload = parseResponse(xhr.responseText || "{}");
      const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
      const path = typeof data.path === "string" ? data.path : "";
      if (xhr.status >= 200 && xhr.status < 300 && path) {
        onProgress?.({ percent: 100, phase: "done" });
        finish(() => resolve({
          path,
          thumbnail_path: typeof data.thumbnail_path === "string" ? data.thumbnail_path : null,
          retina_thumbnail_path: typeof data.retina_thumbnail_path === "string" ? data.retina_thumbnail_path : null,
          width: typeof data.width === "number" ? data.width : null,
          height: typeof data.height === "number" ? data.height : null,
          staged: data.staged === true,
        }));
        return;
      }
      const message = typeof payload.error === "string" && payload.error
        ? payload.error
        : xhr.status === 413 ? "图片超过服务器限制，请压缩后重试" : `图片上传失败（${xhr.status || "网络异常"}）`;
      finish(() => reject(new MediaUploadError(message, xhr.status, RETRYABLE_STATUS.has(xhr.status))));
    };
    xhr.onerror = () => finish(() => reject(new MediaUploadError("网络异常，上传未完成，请检查网络后重试", 0, true)));
    xhr.ontimeout = () => finish(() => reject(new MediaUploadError("上传超时，请检查网络后重试", 0, true)));
    xhr.onabort = () => finish(() => reject(new MediaUploadError("上传已取消", 0, false)));

    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(form);
  });
}

/** 失败重试：只重试网络、超时与 5xx/429，业务校验错误立即抛给界面。 */
export async function uploadMediaWithRetry(
  input: Parameters<typeof uploadMediaFile>[0],
  attempts = 2,
): Promise<MediaUploadResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await uploadMediaFile(input);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof MediaUploadError ? error.retryable : true;
      if (!retryable || attempt === attempts - 1) break;
      input.onProgress?.({ percent: 0, phase: "uploading" });
      await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new MediaUploadError("图片上传失败", 0, true);
}

/**
 * 限制并发地处理一组任务：按输入顺序返回结果，异常继续向上抛。
 * `limit` 取 3：两张手机原图并发压缩已能跑满主流浏览器，再多只会抢内存。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  // 一旦有任务失败就不再领取新任务，但要等已在途的任务收尾再抛出：
  // 直接让 Promise.all 抢先 reject 会把其余在途请求变成未处理的 rejection。
  let failure: unknown = null;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      if (failure) return;
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        failure ??= error;
        return;
      }
    }
  });
  await Promise.all(runners);
  if (failure) throw failure;
  return results;
}
