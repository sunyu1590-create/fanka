export const topicDescriptions: Record<string, string> = {
  生活: "从日常经验、空间与习惯中，发现值得留下的细节。",
  摄影: "用影像记录光线、人物与城市里的不同视角。",
  设计: "关注形式、材料与体验背后的设计思考。",
  科技: "了解正在发生的技术变化，以及它如何进入生活。",
  游戏: "记录游戏体验、设计机制与玩家之间的协作。",
  情感: "分享关系、沟通与个人感受中的真实观察。",
  知识: "把有用、有趣的知识整理成容易理解的内容。",
  艺术: "从作品、展览与创作过程里展开更多观看方式。",
};

export type TopicSummary = {
  id: number;
  name: string;
  description: string;
  postCount: number;
  participantCount: number;
  activityScore?: number;
};
