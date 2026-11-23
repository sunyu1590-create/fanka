/**
 * 摘要风格判定：先看文章写的是什么、用什么语气写，再决定摘要该怎么写。
 *
 * 这里只用可解释的词频与结构特征做轻量判断，不额外调用模型：
 * 摘要任务本来就按篇计费，为了选提示词再跑一次分类会把成本翻倍。
 * 判定结果只影响提示词，不会改写原文，也不会出现在摘要正文里。
 */

const STYLE_RULES = [
  {
    key: "delicate",
    label: "情感随笔",
    instruction:
      "保留原文的情绪温度、节奏与意象；可以留一个具体细节，但不要堆砌形容词，也不要强行升华或替作者抒情。",
    keywords: ["记得", "那天", "眼泪", "想念", "孤独", "温柔", "拥抱", "心里", "情绪", "遗憾", "告别", "思念", "脆弱", "治愈", "喜欢", "爱", "母亲", "父亲", "朋友", "离别", "深夜", "散文", "随笔"],
  },
  {
    key: "science",
    label: "科普知识",
    instruction:
      "用准确、清晰、可验证的科普语气，保留关键概念、数据与因果链；不夸大结论，不煽情，不把推测写成定论。",
    keywords: ["科学", "研究", "原理", "实验", "数据", "理论", "机制", "证明", "观察", "物种", "宇宙", "细胞", "算法", "物理", "化学", "生物", "心理", "认知", "科普", "为什么", "意味着", "结论"],
  },
  {
    key: "tutorial",
    label: "教程实操",
    instruction:
      "按“目标—关键步骤—结果/限制”的顺序概括，保留必要的工具名、参数与前置条件；不要省略会直接影响成败的步骤。",
    keywords: ["步骤", "第一步", "首先", "然后", "接着", "最后", "教程", "指南", "如何", "怎么", "配置", "安装", "代码", "命令", "工具", "流程", "踩坑", "部署", "调试"],
  },
  {
    key: "opinion",
    label: "评论观点",
    instruction:
      "准确复述作者的核心主张与论证依据，区分事实与观点；保留作者的立场强度，不替作者加码，也不把评论写成中立通稿。",
    keywords: ["我认为", "我觉得", "值得", "问题在于", "本质", "说到底", "争议", "观点", "评论", "反思", "批判", "其实", "并不意味着", "更重要的是"],
  },
  {
    key: "story",
    label: "叙事故事",
    instruction:
      "保持原文的叙事视角与时间线，点出人物处境与关键转折；不要写成剧情梗概清单，也不要提前抖出原文刻意保留的信息。",
    keywords: ["他说", "她说", "后来", "那年", "当时", "故事", "小说", "结局", "主角", "夜里", "门外", "第一次", "从此", "终于"],
  },
  {
    key: "news",
    label: "资讯报道",
    instruction:
      "用中性、克制的新闻语气交代主体、事件、时间与结果；只写原文提供的信息，不添加评论、背景推测或情绪判断。",
    keywords: ["据悉", "宣布", "发布", "记者", "报道", "消息", "今日", "昨日", "官方", "数据显示", "召开", "上线", "获批"],
  },
  {
    key: "business",
    label: "商业产品",
    instruction:
      "说清对象、做法与结果，保留关键数字、约束与取舍；不要写成宣传稿，也不要把推测当成已验证的增长结论。",
    keywords: ["用户", "产品", "增长", "转化", "市场", "商业", "营收", "成本", "品牌", "运营", "策略", "团队", "客户", "定价", "渠道"],
  },
  {
    key: "life",
    label: "生活记录",
    instruction:
      "保留生活感与具体场景，语气自然、松弛；可以留一个可感知的细节，但不要写成攻略清单或广告文案。",
    keywords: ["咖啡", "餐厅", "食谱", "旅行", "城市", "散步", "早餐", "探店", "周末", "家常", "烘焙", "菜谱", "露营", "花", "天气"],
  },
];

const FALLBACK = {
  key: "general",
  label: "通用",
  instruction: "沿用原文的用词习惯与语气，不要统一成公文腔；原文克制就克制，原文轻快就轻快。",
};

function scoreStyle(text, keywords) {
  let score = 0;
  for (const keyword of keywords) {
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(keyword, from);
      if (index < 0) break;
      score += 1;
      from = index + keyword.length;
      if (score > 40) return score;
    }
  }
  return score;
}

/**
 * @param {string} title
 * @param {string} body
 * @returns {{ key: string, label: string, instruction: string, score: number }}
 */
export function detectSummaryStyle(title, body) {
  const safeTitle = typeof title === "string" ? title : "";
  const safeBody = typeof body === "string" ? body : "";
  if (!safeTitle.trim() && !safeBody.trim()) return { ...FALLBACK, score: 0 };
  const sample = safeBody.slice(0, 6000);
  let best = { ...FALLBACK, score: 0 };
  for (const rule of STYLE_RULES) {
    // 标题权重更高：标题往往直接点明体裁，正文则可能顺带提到别的领域。
    const score = scoreStyle(safeTitle, rule.keywords) * 2 + scoreStyle(sample, rule.keywords);
    if (score > best.score) best = { ...rule, score };
  }
  if (best.score < 2) return { ...FALLBACK, score: best.score };
  return best;
}

export function summarySystemPrompt(style) {
  const chosen = style && typeof style === "object" ? style : { ...FALLBACK, score: 0 };
  return [
    "你是 HEIKA 的作品摘要助手。先判断这篇作品的题材与语气（只在心里判断，不要输出判断过程），再用与原文一致的语气写摘要。",
    `本文的写作风格：${chosen.label}。${chosen.instruction}`,
    "通用要求：",
    `- 用原文语言写作；中文摘要 80–140 个汉字，其他语言不超过 50 个单词。`,
    "- 忠于原文事实与作者立场，不添加原文没有的信息，不夸大、不改变观点。",
    "- 语气必须匹配原文：原文细腻就写得细腻，原文克制就保持克制，原文是科普就保持准确清晰。",
    "- 只输出摘要正文，不加标题、序号、Markdown、引号，也不要“总结：”“本文讲述了”之类的前缀。",
  ].join("\n");
}
