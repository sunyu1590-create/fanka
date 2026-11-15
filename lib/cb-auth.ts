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

const STORAGE_KEY = "heika-cb-session";
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
    const response = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, nickname: options?.data?.nickname }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) return { data: { user: null, session: null }, error: new Error(result.error || "注册失败，请稍后重试。") };
    const signed = await this.signInWithPassword({ email, password });
    return signed;
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

  /** 邮箱验证码相关能力依赖邮件服务商配置，当前未开通，返回明确提示。 */
  async signInWithOtp() {
    return { data: {}, error: new Error("邮箱验证码暂时不可用，请使用密码登录或恢复码找回。") };
  }

  async verifyOtp() {
    return { data: {}, error: new Error("邮箱验证码暂时不可用，请使用密码登录或恢复码找回。") };
  }

  async resend() {
    return { data: {}, error: new Error("邮件服务尚未开通。") };
  }
}
