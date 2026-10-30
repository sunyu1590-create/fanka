import type {Post} from './content';

export function dailyCandidates(all:Post[], interests:string[], previousIds:number[]=[]):Post[]{
 const ranked=[...all].sort((a,b)=>Number(interests.includes(b.tag))-Number(interests.includes(a.tag))||a.id-b.id);
 const byId=new Map(all.map(post=>[post.id,post]));
 return [...new Set([...previousIds,...ranked.map(post=>post.id)])].map(id=>byId.get(id)).filter((post):post is Post=>Boolean(post));
}

export function openDailyCard(opened:number[], id:number, limit=5):number[]{
 if(opened.includes(id)||opened.length>=limit)return opened;
 return [...opened,id];
}
