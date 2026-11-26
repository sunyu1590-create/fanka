/**
 * 版本更新的确定性安全检查。
 *
 * 只做可以直接验证的判断（协议、主机、路径），不猜测内容意图：
 *   - 这些结论可以独立驳回，也可以作为 AI 的参考上下文；
 *   - 附件是否「恶意」无法在服务端静态判定，因此只报告结构异常，不据此驳回；
 *   - 正常技术文档里出现 <script>、curl 命令、APK 附件都不构成违规。
 */

export type SafetyFinding = { code: string; detail: string; field: string };

export type SafetyScan = {
  hard: SafetyFinding[];
  info: SafetyFinding[];
  hardBlock: boolean;
  links: string[];
};

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`）)】]+/gi;
const UNSAFE_SCHEME = /\b(?:javascript|data|vbscript|file)\s*:/gi;
const PRIVATE_HOST = /^(?:localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[::1\]|::1)/i;
const PRIVATE_SUFFIX = /\.(?:local|internal|lan|home\.arpa)$/i;

function hostOf(link: string) {
  try {
    const url = new URL(/^www\./i.test(link) ? `https://${link}` : link);
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function collectStrings(value: unknown, field: string, depth = 0, out: Array<{ field: string; text: string }> = []) {
  if (depth > 4 || value === null || value === undefined) return out;
  if (typeof value === "string") {
    if (value) out.push({ field, text: value.slice(0, 4000) });
    return out;
  }
  if (Array.isArray(value)) {
    value.slice(0, 30).forEach((item, index) => collectStrings(item, `${field}[${index}]`, depth + 1, out));
    return out;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      collectStrings(item, field ? `${field}.${key}` : key, depth + 1, out);
    }
  }
  return out;
}

export function scanRevisionPayload(payload: { title?: unknown; body?: unknown; resourceData?: unknown }): SafetyScan {
  const hard: SafetyFinding[] = [];
  const info: SafetyFinding[] = [];
  const links = new Set<string>();

  const strings = [
    ...collectStrings(typeof payload.title === "string" ? payload.title : "", "title"),
    ...collectStrings(typeof payload.body === "string" ? payload.body : "", "body"),
    ...collectStrings(payload.resourceData ?? {}, "resourceData"),
  ];

  for (const { field, text } of strings) {
    const matches = text.match(URL_PATTERN) || [];
    for (const raw of matches.slice(0, 20)) {
      const link = raw.replace(/[.,;:!?]+$/, "");
      links.add(link.slice(0, 500));
      const host = hostOf(link);
      if (!host) {
        info.push({ code: "link_unparsable", detail: link.slice(0, 200), field });
        continue;
      }
      if (PRIVATE_HOST.test(host) || PRIVATE_SUFFIX.test(host) || host === "localhost") {
        // 教程里出现 localhost/内网地址是正常现象，只作为模型上下文，不据此驳回。
        info.push({ code: "private_host_link", detail: `${host}（${link.slice(0, 120)}）`, field });
      }
    }
    if (UNSAFE_SCHEME.test(text)) {
      const matched = (text.match(UNSAFE_SCHEME)?.[0] || "unsafe_scheme").replace(/\s+/g, "");
      // javascript:/data:/file: 出现在正文里多半是安全教程的示例；只有资源链接字段才是真的可点击入口。
      if (field.startsWith("resourceData")) hard.push({ code: "unsafe_resource_link", detail: matched, field });
      else info.push({ code: "unsafe_scheme_in_text", detail: matched, field });
    }
    UNSAFE_SCHEME.lastIndex = 0;
  }

  const attachments = Array.isArray((payload.resourceData as Record<string, unknown> | undefined)?.attachments)
    ? ((payload.resourceData as Record<string, unknown>).attachments as Array<Record<string, unknown>>)
    : [];
  for (const item of attachments.slice(0, 3)) {
    const path = typeof item?.path === "string" ? item.path : "";
    if (!path) {
      info.push({ code: "attachment_missing_path", detail: "附件缺少存储路径", field: "resourceData.attachments" });
      continue;
    }
    if (path.includes("..") || path.startsWith("/") || !/^[0-9a-f-]{36}\//i.test(path)) {
      hard.push({ code: "attachment_path_invalid", detail: path.slice(0, 120), field: "resourceData.attachments" });
    }
  }

  return { hard, info, hardBlock: hard.length > 0, links: [...links].slice(0, 20) };
}
