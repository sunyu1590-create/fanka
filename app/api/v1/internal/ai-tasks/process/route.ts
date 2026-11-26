import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, respond } from "@/lib/server/api";
import { processNextAiTask } from "@/lib/server/process-ai-task";
import { processNextRevisionReview } from "@/lib/server/revision-review";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return respond(async () => {
    const expected = process.env.AI_TASK_WORKER_TOKEN || "";
    const provided = /^Bearer (.+)$/i.exec(req.headers.get("authorization") || "")?.[1] || "";
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    if (expectedBuffer.length < 32 || expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
      throw new ApiError(401, "工作进程身份验证失败");
    }
    // 版本更新审核优先处理：任务量小，且用户在前台等待结果。
    const revision = await processNextRevisionReview(`ai-worker-${process.pid}`);
    if (revision.processed) return revision;
    return processNextAiTask();
  });
}
