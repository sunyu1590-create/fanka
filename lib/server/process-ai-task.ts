import { createHash } from "node:crypto";
import { adminClient } from "@/lib/server/admin-client";
import { completeAiChat } from "@/lib/server/ai-provider";
import type { AiMessage } from "@/lib/server/ai-provider";
import { validateAiReview } from "@/lib/ai-review-validation.mjs";
import { validateAiClassification } from "@/lib/ai-classification-validation.mjs";
import { validateSummary } from "@/lib/summary-validation.mjs";
import { detectSummaryStyle, summarySystemPrompt } from "@/lib/summary-style.mjs";

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
    .replace(/^(?:摘要|总结|AI\s*摘要)[:：]\s*/i, "")
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
    // 摘要按文章题材与语气选提示词：情感类保留温度，科普类保留准确度，
    // 教程类保留步骤与限制，避免所有文章都被写成同一种通稿腔。
    const summaryStyle = detectSummaryStyle(task.title, task.body);
    const reviewPolicy = task.taskType === "review_pending" ? await loadReviewPolicy(admin) : { version: "3.0", systemPrompt: "" };
    const system = task.taskType === "review_pending"
      ? reviewPolicy.systemPrompt
      : task.taskType === "classification"
        ? "你是 HEIKA 内容分类助手。只能使用用户消息提供的现有分类和标签 ID；不要新建或猜测 ID。结合标题、正文、频道和标签描述进行分类。只有在分类把握高时返回 confidence=high；否则返回 uncertain=true。输出 JSON 对象：confidence(high/medium/low), uncertain(boolean), categoryId(现有分类 ID), tagIds(0 到 5 个现有标签 ID), reason(不超过 120 字的简短依据)。标签应具体且相关，不要仅因正文提到某词就添加。不要返回思考过程。"
      : summarySystemPrompt(summaryStyle);
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
      // deepseek-flash 会先产生推理内容，max_tokens 同时覆盖推理与正文。
      // 之前摘要只给 360，推理刚好把额度吃光，返回 content 为空，任务全部失败。
      maxTokens: task.taskType === "review_pending" ? 2000 : task.taskType === "classification" ? 1600 : 3000,
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
      const result = validateAiReview(completion.output, task.body, { policyVersion: reviewPolicy.version });
      // PASS 自动发布；REVIEW 留在人工队列；REJECT 明确驳回并下架。
      const status = result.decision === "PASS" ? "completed" : "review";
      // 数据库函数沿用 approve/review 两态写作品状态，三态结论放在 verdict 里留档。
      const rpcResult = {
        ...result,
        verdict: result.decision,
        decision: result.decision === "PASS" ? "approve" : "review",
      };
      // 审核决定单独留档，供通过率、推翻率与策略版本统计使用。
      await admin.from("ai_review_decisions").insert({
        task_item_id: task.itemId,
        post_id: task.postId,
        decision: result.decision,
        risk_level: result.riskLevel,
        risk_types: result.riskTypes,
        reason: result.reason,
        reason_code: result.reasonCode,
        evidence: result.evidence,
        policy_version: result.policyVersion,
        model: completion.model,
        input_tokens: completion.inputTokens,
        output_tokens: completion.outputTokens,
        elapsed_ms: completion.elapsedMs,
      }).then(({ error }) => { if (error) console.warn("[review] decision log skipped", error.message); });
      if (result.decision === "REJECT") {
        // 明确违规：先下架，再写审计；管理员仍可在后台恢复或改判。
        const { error: rejectError } = await admin.from("posts")
          .update({
            status: "hidden",
            moderation_review_note: `AI 审核驳回：${result.reason}`.slice(0, 500),
            moderation_reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.postId)
          .eq("status", "pending_review");
        if (rejectError) throw new Error("AI 驳回结果未能写入作品状态");
        await admin.from("moderation_audit_logs").insert({
          actor_id: null,
          action: "ai_review_rejected",
          target_type: "post",
          target_id: task.postId,
          reason: result.reason.slice(0, 500),
          details: {
            task_id: task.batchId,
            task_item_id: task.itemId,
            policy_version: result.policyVersion,
            risk_types: result.riskTypes,
            evidence: result.evidence,
          },
        });
      }
      await finish(admin, task, status, rpcResult, null, completion);
      return { processed: true, status: result.decision === "PASS" ? "approved" : result.decision.toLowerCase(), taskId: task.batchId, itemId: task.itemId };
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
        maxTokens: 1600, temperature: 0,
        taskId: task.batchId, taskItemId: task.itemId,
      });
      summary = cleanSummaryText(retry.output);
      summaryCompletion = retry;
      if (!validateSummary(summary)) throw new Error("AI 摘要长度仍不符合要求（中文不超过 160 字）");
    }
    await finish(admin, task, "completed", { summary, style: summaryStyle.label, styleKey: summaryStyle.key }, null, summaryCompletion);
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

/** 策略 3.0 默认提示词；管理后台激活新版本时以数据库中的 system_prompt 为准。 */
const DEFAULT_REVIEW_PROMPT = [
  "你是 HEIKA 的内容审核分类器。平台原则是「正常内容默认通过，只有明确违规才介入」。",
  "你必须独立、审慎，但不拥有最终处理权。",
  "",
  "默认通过（decision=pass）：技术教程、编程与代码、AI 知识、开源项目、Prompt / Skill / Agent、文学创作、" +
    "日常分享、工具测评、外部资源链接、普通争议性观点、轻微粗俗表达、历史知识与学术讨论、软件介绍与官网链接。",
  "以下情况明确违规才允许 reject：极端主义或恐怖主义、明确违反平台涉政规则、商业广告与恶意营销、" +
    "恶意引流、诈骗、严重暴力威胁、恶意软件/钓鱼、严重违法（毒品、赌博、色情交易等）、侵犯个人隐私。",
  "review 只用于：确有原文证据、但违规性质需要人工确认的边界内容。",
  "",
  "硬性约束：",
  "1) 不确定一律 pass。riskLevel=uncertain 不构成 review 或 reject 的理由。",
  "2) 不得因专业术语、代码片段、外部链接、模型自身理解能力不足而拒绝或转人工。",
  "3) reject 必须同时满足：riskLevel=high、riskTypes 非空、evidence 至少一条可在原文逐字定位的连续摘录。",
  "4) review 必须同时满足：riskTypes 非空、evidence 可在原文逐字定位、riskLevel 为 medium 或 high。",
  "5) evidence 必须原样摘自原文，不得改写、概括或杜撰；没有证据就不要给出 review/reject。",
  "6) 正常历史、学术、工具与官网链接不得仅因关键词命中而拦截。",
  "",
  "只输出 JSON 对象，不要输出思考过程：",
  '{"decision":"pass|review|reject","riskLevel":"clear|low|medium|high|uncertain",' +
    '"riskTypes":["extremism|political_violation|commercial_spam|malicious_redirect|fraud|violent_threat|malware|serious_illegal|privacy_violation"],' +
    '"evidence":["原文逐字摘录"],"rule":"对应规则名称","reason":"不超过 120 字的判断依据"}',
].join("\n");

async function loadReviewPolicy(admin: ReturnType<typeof adminClient>): Promise<{ version: string; systemPrompt: string }> {
  try {
    const { data } = await admin
      .from("ai_review_policies")
      .select("version,system_prompt")
      .eq("active", true)
      .order("activated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.system_prompt) {
      return { version: String(data.version || "3.0"), systemPrompt: String(data.system_prompt) };
    }
  } catch {
    // 迁移尚未执行或表不可用时使用内置策略，不影响审核链路。
  }
  return { version: "3.0", systemPrompt: DEFAULT_REVIEW_PROMPT };
}
