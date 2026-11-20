import { createHash } from "node:crypto";
import { adminClient } from "@/lib/server/admin-client";
import { completeAiChat } from "@/lib/server/ai-provider";
import type { AiMessage } from "@/lib/server/ai-provider";
import { validateAiReview } from "@/lib/ai-review-validation.mjs";
import { validateAiClassification } from "@/lib/ai-classification-validation.mjs";
import { validateSummary } from "@/lib/summary-validation.mjs";

type ClaimedTask = {
  batchId: string; itemId: string; postId: string; title: string; body: string; channel: string;
  postStatus: string; taskType: "summary_all" | "summary_incremental" | "review_pending" | "classification";
  contentHash: string; config?: { model?: string };
  taxonomySnapshot?: { tagId?: number | null; topicIds?: number[] };
};

function cleanSummaryText(value: string) {
  return value
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\*\*|__/g, "")
    .replace(/\s*\n+\s*/g, " ")
    .trim()
    .replace(/^["“]([\s\S]*)["”]$/, "$1")
    .trim();
}

function contentHash(title: string, body: string) {
  return createHash("md5").update(`${title}\n${body}`).digest("hex");
}

export async function processNextAiTask() {
  const admin = adminClient();
  const claimed = await admin.rpc("claim_ai_task_item", { p_batch_id: null });
  if (claimed.error) throw new Error("AI task queue unavailable");
  const task = claimed.data as ClaimedTask | null;
  if (!task?.itemId || !task.postId) return { processed: false };

  try {
    if (task.taskType === "review_pending" && task.postStatus !== "pending_review") {
      await finish(admin, task, "skipped", { reason: "作品不再处于待审核状态，保留管理员最新处理结果" }, "作品审核状态已变化");
      return { processed: true, status: "skipped", taskId: task.batchId, itemId: task.itemId };
    }
    const purpose = task.taskType === "review_pending" ? "review" : task.taskType === "classification" ? "classification" : "summary";
    const model = typeof task.config?.model === "string" ? task.config.model : "deepseek-chat";
    const system = task.taskType === "review_pending"
      ? "你是 HEIKA 内容安全审核辅助器。只依据给出的原文和现行内容审核规则，审核色情、赌博、毒品等高风险内容及明显违法有害内容。你不拥有最终审核权。输出 JSON 对象：decision(approve/review), riskLevel(clear/low/medium/high/uncertain), riskTypes(string[]), reason(简短说明), evidence(原文中的精确连续摘录数组)。不确定、存在风险、证据不明确或边界模糊必须返回 review。只有完全明确低风险时才返回 approve。evidence 必须是原文中逐字存在的短片段，不能改写或杜撰。不要返回思考过程。"
      : task.taskType === "classification"
        ? "你是 HEIKA 内容分类助手。只能使用用户消息提供的现有分类和标签 ID；不要新建或猜测 ID。结合标题、正文、频道和标签描述进行分类。只有在分类把握高时返回 confidence=high；否则返回 uncertain=true。输出 JSON 对象：confidence(high/medium/low), uncertain(boolean), categoryId(现有分类 ID), tagIds(0 到 5 个现有标签 ID), reason(不超过 120 字的简短依据)。标签应具体且相关，不要仅因正文提到某词就添加。不要返回思考过程。"
      : "你是 HEIKA 的作品摘要助手。用作品原文语言准确概括核心内容：中文摘要控制在 80–140 个汉字，其他语言不超过 50 个单词；不得添加原文没有的事实，不得夸大或改变作者观点。只返回摘要正文，不添加标题、Markdown 标记、前言或英文解释。";
    const messages: AiMessage[] = [
      { role: "system", content: system },
      { role: "user", content: task.taskType === "review_pending"
        ? JSON.stringify({ title: task.title, channel: task.channel, originalText: task.body })
        : task.taskType === "classification"
          ? await classificationInput(admin, task)
          : JSON.stringify({ title: task.title, originalText: task.body }) },
    ];
    const completion = await completeAiChat({
      purpose,
      model,
      messages,
      maxTokens: task.taskType === "review_pending" ? 900 : task.taskType === "classification" ? 700 : 360,
      temperature: task.taskType === "review_pending" || task.taskType === "classification" ? 0 : 0.2,
      jsonObject: task.taskType === "review_pending" || task.taskType === "classification",
      taskId: task.batchId,
      taskItemId: task.itemId,
    });
    const latest = await admin.from("posts").select("title,body,status,channel").eq("id", task.postId).maybeSingle();
    if (latest.error || !latest.data || contentHash(latest.data.title, latest.data.body) !== task.contentHash || (task.taskType === "review_pending" && latest.data.status !== "pending_review")) {
      await finish(admin, task, "skipped", { reason: "处理期间作品内容或审核状态发生变化，本次结果未应用" }, "作品内容已变化");
      return { processed: true, status: "skipped", taskId: task.batchId, itemId: task.itemId };
    }
    if (task.taskType === "review_pending") {
      const result = validateAiReview(completion.output, task.body);
      const status = result.decision === "approve" ? "completed" : "review";
      await finish(admin, task, status, result, null, completion);
      return { processed: true, status: result.decision === "approve" ? "approved" : "review", taskId: task.batchId, itemId: task.itemId };
    }
    if (task.taskType === "classification") {
      const taxonomy = await approvedTaxonomy(admin, task.channel);
      const result = validateAiClassification(completion.output, taxonomy.categories.map((row) => row.id), taxonomy.tags.map((row) => row.id));
      if (!result.applicable || !result.categoryId) {
        await finish(admin, task, "skipped", { applied: false, reason: result.reason }, null, completion);
        return { processed: true, status: "skipped", taskId: task.batchId, itemId: task.itemId };
      }
      await finish(admin, task, "completed", {
        categoryId: Number(result.categoryId), tagIds: result.tagIds.map(Number), reason: result.reason,
        categoryName: taxonomy.categories.find((row) => String(row.id) === result.categoryId)?.name || null,
        tagNames: result.tagIds.map((id) => taxonomy.tags.find((row) => String(row.id) === id)?.name).filter((name): name is string => Boolean(name)),
        taxonomySnapshot: task.taxonomySnapshot || {},
      }, null, completion);
      return { processed: true, status: "completed", taskId: task.batchId, itemId: task.itemId };
    }
    let summary = cleanSummaryText(completion.output);
    let summaryCompletion = completion;
    if (!validateSummary(summary)) {
      // 模型偶尔仍会写成两三段长摘要；再做一次强约束压缩，避免整条任务直接失败。
      const retry = await completeAiChat({
        purpose, model,
        messages: [...messages, { role: "assistant", content: completion.output }, { role: "user", content: "上面的摘要超出长度限制。请压缩成 100 个汉字以内（英文不超过 40 个单词），保留最关键的信息，只输出摘要正文。" }],
        maxTokens: 220, temperature: 0,
        taskId: task.batchId, taskItemId: task.itemId,
      });
      summary = cleanSummaryText(retry.output);
      summaryCompletion = retry;
      if (!validateSummary(summary)) throw new Error("AI 摘要长度仍不符合要求（中文不超过 160 字）");
    }
    await finish(admin, task, "completed", { summary }, null, summaryCompletion);
    return { processed: true, status: "completed", taskId: task.batchId, itemId: task.itemId };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "AI task failed";
    await finish(admin, task, "failed", null, message);
    return { processed: true, status: "failed", taskId: task.batchId, itemId: task.itemId };
  }
}

async function approvedTaxonomy(admin: ReturnType<typeof adminClient>, channel: string) {
  const { data, error } = await admin.from("interest_tags")
    .select("id,name,description,aliases,kind,sort_order,parent_id")
    .eq("channel", channel).eq("active", true).eq("moderation_status", "approved")
    .is("merged_into_id", null).order("sort_order").order("id").limit(1000);
  if (error || !data) throw new Error("Approved taxonomy could not be loaded");
  const categories = data.filter((row) => row.kind === "category");
  const tags = data.filter((row) => row.kind === "tag");
  if (!categories.length) throw new Error("No approved categories are available");
  return { categories, tags };
}

async function classificationInput(admin: ReturnType<typeof adminClient>, task: ClaimedTask) {
  const taxonomy = await approvedTaxonomy(admin, task.channel);
  return JSON.stringify({
    title: task.title,
    channel: task.channel,
    originalText: task.body,
    availableCategories: taxonomy.categories.map(({ id, name, description }) => ({ id, name, description })),
    availableTags: taxonomy.tags.map(({ id, name, description, aliases, parent_id }) => ({ id, name, description, aliases, parentId: parent_id })),
  });
}

async function finish(
  admin: ReturnType<typeof adminClient>, task: ClaimedTask, status: "completed" | "review" | "failed" | "skipped",
  result: Record<string, unknown> | null, error: string | null,
  completion?: { model: string; requestId: string; inputTokens: number; outputTokens: number; elapsedMs: number },
) {
  const { error: finishError } = await admin.rpc("finish_ai_task_item", {
    p_item_id: task.itemId, p_status: status, p_result: result, p_error: error,
    p_model: completion?.model || task.config?.model || "deepseek-chat",
    p_input_tokens: completion?.inputTokens || 0, p_output_tokens: completion?.outputTokens || 0,
    p_elapsed_ms: completion?.elapsedMs || 0, p_request_id: completion?.requestId || null,
  });
  if (finishError) throw new Error("AI task result could not be committed");
}
