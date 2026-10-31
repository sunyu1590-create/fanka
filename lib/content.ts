export const tags=['生活','摄影','设计','科技','游戏','情感','知识','艺术'] as const;
export type Post={id:number;cloudId?:string;authorId?:string;isDemo?:boolean;tag:string;title:string;body:string;cover:string;author:string;date:string;image?:string;images?:string[]};
const hues=['#d8d8cc','#d3d9d8','#dcd6cf','#d2d6df','#d8d1dd','#ded3d3','#d7dbce','#d8d4df'];
export function coverColor(tag:string){return hues[Math.max(0,tags.indexOf(tag as typeof tags[number]))]}
export function dayKey(date=new Date(),zone='Asia/Shanghai'){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
