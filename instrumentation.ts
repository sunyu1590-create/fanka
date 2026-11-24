/**
 * Next.js 启动钩子：给 Node HTTP 请求挂轻量计时，供系统监控采集真实 API 指标。
 * 只在 Node 运行时生效；Edge/客户端不加载。指标失败不影响请求路径。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const httpModule = await import("node:http");
    // 相对路径导入：standalone 运行时里 @/ 别名在 instrumentation 钩子中不可靠。
    const { recordRequest } = await import("./lib/server/request-metrics");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serverPrototype = (httpModule as any).Server?.prototype;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responsePrototype = (httpModule as any).ServerResponse?.prototype;
    if (!serverPrototype || !responsePrototype) return;

    const originalEmit = serverPrototype.emit;
    serverPrototype.emit = function patchedEmit(this: unknown, event: string, ...args: unknown[]) {
      if (event === "request") {
        const req = args[0] as { __heikaStart?: number } | undefined;
        if (req && !req.__heikaStart) req.__heikaStart = Date.now();
      }
      return originalEmit.apply(this, [event, ...args]);
    };

    const originalEnd = responsePrototype.end;
    responsePrototype.end = function patchedEnd(this: { req?: { __heikaStart?: number; url?: string }; statusCode?: number }, ...args: unknown[]) {
      const started = this.req?.__heikaStart;
      try {
        recordRequest(started ? Date.now() - started : 0, this.statusCode || 0, String(this.req?.url || ""));
      } catch {
        /* 指标失败不影响响应 */
      }
      return originalEnd.apply(this, args);
    };
  } catch (error) {
    // 指标挂载失败要可见：静默吞掉会让监控永远显示 0 请求。
    console.warn("[instrumentation] 请求指标挂载失败：", error instanceof Error ? error.message : error);
  }
}
