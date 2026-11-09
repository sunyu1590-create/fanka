const messageMap: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "邮箱或密码不正确"],
  [/email not confirmed/i, "邮箱尚未完成验证，请先查收验证邮件"],
  [/user already registered/i, "这个邮箱已注册，请直接登录或找回密码"],
  [/password should be at least/i, "密码至少需要 8 位"],
  [/password.*(weak|strength)/i, "密码强度不足，请更换更安全的密码"],
  [/(otp|token).*(expired|invalid)|invalid.*(otp|token)/i, "验证码无效或已过期，请重新获取"],
  [/(email|otp).*(rate limit|too many|rate exceeded)|too many requests/i, "操作过于频繁，请稍后再试"],
  [/failed to fetch|network request failed|fetch failed/i, "网络连接异常，请检查网络后重试"],
  [/row-level security|permission denied|not authorized/i, "当前账号暂无权限完成此操作"],
  [/jwt expired|session.*expired/i, "登录状态已过期，请重新登录"],
  [/duplicate key|already exists/i, "内容已存在，请勿重复提交"],
  [/email.*invalid/i, "邮箱格式不正确"],
  [/email rate limit exceeded|email sending rate limit/i, "邮件发送过于频繁，请稍后再试"],
  [/for security purposes.*request this after/i, "为保障账号安全，请稍后再试"],
  [/email provider.*(disabled|not configured)|smtp.*(not configured|error)/i, "邮件服务暂不可用，请稍后重试"],
];

export function userMessage(value: unknown, fallback = "操作失败，请稍后重试") {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  if (!raw) return fallback;
  for (const [pattern, translation] of messageMap) if (pattern.test(raw)) return translation;
  // Avoid surfacing provider and database implementation details in user notices.
  const remainingLatin = raw.replace(/\b(?:JPG|PNG|WebP|MB|GB|EXP|LV|Plus|Pro|HEIKA|MBTI|URL|ID)\b/gi, "");
  if (/[A-Za-z]{3,}/.test(remainingLatin)) return fallback;
  return raw;
}
