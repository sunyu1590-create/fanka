/**
 * 云开发（CloudBase）身份认证适配层。
 *
 * 该环境的认证接口与 Supabase GoTrue 不同：
 *   - 登录：POST {gateway}/auth/v1/signin  { username, password }
 *   - 刷新：POST {gateway}/auth/v1/token?grant_type=refresh_token
 * 用户主键为数字，应用侧通过 /api/v1/auth/bootstrap 换取 uuid 身份并建立 profile。
 */

export type CbUser = { id: string; email: string; sub: string };
export type CbSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: CbUser;
};
type Listener = (event: string, session: CbSession | null) => void;
type Pending = { email: string; id: string };

const STORAGE_KEY = "heika-cb-session";
const PENDING_KEY = "heika-cb-verify";
const REFRESH_MARGIN = 60_000;

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export class CloudBaseAuth {
  private session: CbSession | null = null;
  private listeners = new Set<Listener>();
  private refreshing: Promise<CbSession | null> | null = null;
  /** 等待校验的邮箱验证码，跨「发送」和「校验」两次调用保留。 */
  private pending: Pending | null = null;

  constructor(private gateway: string) {
    this.session = this.read();
  }

  private read(): CbSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CbSession;
      if (!parsed?.access_token) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private write(session: CbSession | null) {
    this.session = session;
    if (typeof window === "undefined") return;
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
    this.listeners.forEach((fn) => fn(session ? "SIGNED_IN" : "SIGNED_OUT", session));
  }

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onAuthStateChange(cb: Listener) {
    const off = this.onChange(cb);
    return { data: { subscription: { unsubscribe: off } } };
  }

  async getSession(): Promise<{ data: { session: CbSession | null }; error: null }> {
    if (this.session && this.session.expires_at - Date.now() < REFRESH_MARGIN) {
      await this.refresh();
    }
    return { data: { session: this.session }, error: null };
  }

  async getUser(): Promise<{ data: { user: CbUser | null }; error: Error | null }> {
    const { data } = await this.getSession();
    return { data: { user: data.session?.user ?? null }, error: null };
  }

  private persist(payload: { access_token?: string; refresh_token: string; expires_in?: number }, emailHint?: string) {
    const accessToken = payload.access_token ?? "";
    const claims = decodeJwt(accessToken);
    const sub = String(claims.sub ?? "");
    const email = String(claims.email ?? emailHint ?? "");
    const session: CbSession = {
      access_token: accessToken,
      refresh_token: payload.refresh_token,
      expires_at: Date.now() + (payload.expires_in ?? 7200) * 1000,
      user: { id: "", email, sub },
    };
    this.write(session);
    return session;
  }

  async refresh(): Promise<CbSession | null> {
    if (!this.session?.refresh_token) return null;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const response = await fetch(`${this.gateway}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: this.session!.refresh_token }),
        });
        if (!response.ok) throw new Error("refresh failed");
        const data = (await response.json()) as { access_token: string; refresh_token: string; expires_in?: number };
        const session = this.persist(data, this.session?.user.email);
        session.user.id = this.session?.user.id ?? "";
        this.write(session);
        return session;
      } catch {
        this.write(null);
        return null;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** 登录后向业务后端换取 uuid 身份，保证 RLS 能识别当前用户。 */
  private async bootstrap(session: CbSession, nickname?: string) {
    try {
      const response = await fetch("/api/v1/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ nickname }),
      });
      if (!response.ok) return session;
      const result = (await response.json()) as { data?: { uid?: string } };
      if (result.data?.uid) {
        session.user.id = result.data.uid;
        this.write(session);
      }
    } catch {
      // 身份映射失败不阻断登录，后续接口会再次触发。
    }
    return session;
  }

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const response = await fetch(`${this.gateway}/auth/v1/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email.trim(), password }),
    });
    const data = (await response.json()) as { access_token?: string; refresh_token?: string; error_description?: string };
    if (!response.ok || !data.access_token) {
      return { data: { user: null, session: null }, error: new Error(data.error_description || "邮箱或密码不正确。") };
    }
    const session = this.persist({ ...data, refresh_token: data.refresh_token! }, email);
    await this.bootstrap(session);
    return { data: { user: session.user, session }, error: null };
  }

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { nickname?: string } } }) {
    const target = email.trim();
    // 优先走邮箱验证码：云开发邮件代理开通后可用，且完全不依赖服务端密钥。
    // 邮件未开通时自动回退到服务端建号，行为与之前一致。
    const sent = await this.requestCode(target);
    if (!sent.error) return { data: { needsVerification: true, email: target }, error: null };

    const response = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target, password, nickname: options?.data?.nickname }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok)
      return {
        data: { user: null, session: null },
        error: new Error(result.error || sent.error.message || "注册失败，请稍后重试。"),
      };
    const signed = await this.signInWithPassword({ email: target, password });
    return signed;
  }

  /** 用邮箱验证码完成注册（邮件代理已开通时使用）。 */
  async signUpWithCode({
    email,
    code,
    password,
    nickname,
  }: {
    email: string;
    code: string;
    password: string;
    nickname?: string;
  }) {
    const target = email.trim();
    const pending = this.readPending(target);
    if (!pending) return { data: { user: null, session: null }, error: new Error("验证码已失效，请重新获取。") };

    try {
      const verified = await fetch(`${this.gateway}/auth/v1/verification/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification_id: pending.id, verification_code: code.trim() }),
      });
      const result = (await verified.json()) as {
        verification_token?: string;
        error?: string;
        error_description?: string;
      };
      if (!verified.ok || !result.verification_token)
        return {
          data: { user: null, session: null },
          error: new Error(result.error_description || result.error || "验证码不正确或已过期。"),
        };

      const created = await fetch(`${this.gateway}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: target,
          password,
          username: target,
          name: nickname || target.split("@")[0],
          verification_code: code.trim(),
          verification_token: result.verification_token,
        }),
      });
      const payload = (await created.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
        code?: string;
      };
      if (!created.ok)
        return {
          data: { user: null, session: null },
          error: new Error(
            payload.code === "ALREADY_EXISTS"
              ? "这个邮箱已经注册过，请直接登录。"
              : payload.error_description || payload.error || "注册失败，请稍后重试。",
          ),
        };

      this.pending = null;
      if (typeof window !== "undefined") window.sessionStorage.removeItem(PENDING_KEY);

      if (payload.access_token && payload.refresh_token) {
        const session = this.persist(
          payload as { access_token: string; refresh_token: string; expires_in?: number },
          target,
        );
        await this.bootstrap(session, nickname);
        return { data: { user: session.user, session }, error: null };
      }
      return this.signInWithPassword({ email: target, password });
    } catch {
      return { data: { user: null, session: null }, error: new Error("网络异常，注册失败。") };
    }
  }

  async signOut() {
    this.write(null);
    return { error: null };
  }

  async updateUser({ password }: { password?: string }) {
    const session = this.session;
    if (!session) return { data: { user: null }, error: new Error("请先登录。") };
    if (!password) return { data: { user: session.user }, error: null };
    const response = await fetch("/api/v1/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ password }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) return { data: { user: null }, error: new Error(result.error || "密码更新失败。") };
    return { data: { user: session.user }, error: null };
  }

  /** 邮箱验证码：直接调用云开发认证网关。 */
  private mailHint(payload: { code?: string; error?: string; error_description?: string }) {
    const text = `${payload.code || ""} ${payload.error || ""} ${payload.error_description || ""}`.toLowerCase();
    if (text.includes("provider") && text.includes("not found"))
      return "邮箱验证码尚未开通。请在云开发控制台进入「身份认证 → 登录方式 → 邮箱」，启用邮件代理后再试。";
    if (text.includes("rate") || text.includes("frequent"))
      return "发送过于频繁，请稍后再试。";
    return payload.error_description || payload.error || "验证码发送失败，请稍后重试。";
  }

  async signInWithOtp({ email }: { email: string; options?: unknown }) {
    const target = email.trim();
    if (!target) return { data: {}, error: new Error("请填写邮箱。") };
    return this.requestCode(target);
  }

  /** 向云开发申请一封验证码邮件，并记住 verification_id 供后续校验。 */
  private async requestCode(target: string) {
    try {
      const response = await fetch(`${this.gateway}/auth/v1/verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const data = (await response.json()) as {
        verification_id?: string;
        code?: string;
        error?: string;
        error_description?: string;
      };
      if (!response.ok || !data.verification_id)
        return { data: {}, error: new Error(this.mailHint(data)) };
      this.pending = { email: target, id: data.verification_id };
      if (typeof window !== "undefined")
        window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(this.pending));
      return { data: { verificationId: data.verification_id }, error: null };
    } catch {
      return { data: {}, error: new Error("网络异常，验证码发送失败。") };
    }
  }

  /** 取出待校验的验证码记录，邮箱不一致视为无效。 */
  private readPending(target?: string): Pending | null {
    let pending = this.pending;
    if (!pending && typeof window !== "undefined") {
      try {
        pending = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) || "null") as Pending | null;
      } catch {
        pending = null;
      }
    }
    if (!pending?.id) return null;
    if (target && pending.email && pending.email !== target) return null;
    return pending;
  }

  async verifyOtp({ email, token }: { email: string; token: string; type?: string }) {
    const target = email.trim();
    const code = token.trim();
    if (!code) return { data: {}, error: new Error("请输入邮箱验证码。") };

    const pending = this.readPending(target);
    if (!pending) return { data: {}, error: new Error("请先点击「发送验证码」获取邮件验证码。") };

    try {
      const verified = await fetch(`${this.gateway}/auth/v1/verification/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification_id: pending.id, verification_code: code }),
      });
      const result = (await verified.json()) as {
        verification_token?: string;
        error?: string;
        error_description?: string;
      };
      if (!verified.ok || !result.verification_token)
        return {
          data: {},
          error: new Error(
            result.error_description || result.error || "验证码不正确或已过期，请重新获取。",
          ),
        };

      const signed = await fetch(`${this.gateway}/auth/v1/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification_token: result.verification_token }),
      });
      const session = (await signed.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };
      if (signed.status === 404 || !session.access_token)
        return {
          data: {},
          error: new Error(
            session.error_description || session.error || "该邮箱还没有账号，请先注册。",
          ),
        };
      const persisted = this.persist(session as { access_token: string; refresh_token: string; expires_in?: number }, target);
      this.pending = null;
      if (typeof window !== "undefined") window.sessionStorage.removeItem(PENDING_KEY);
      await this.bootstrap(persisted);
      return { data: { user: persisted.user, session: persisted }, error: null };
    } catch {
      return { data: {}, error: new Error("网络异常，验证失败。") };
    }
  }

  async resend({ email }: { type?: string; email: string; options?: unknown }) {
    return this.signInWithOtp({ email });
  }
}
