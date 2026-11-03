import type {Post} from './content';

function seededRank(id:number, seed:string){
 let value=2166136261;
 for(const char of `${seed}:${id}`) value=Math.imul(value^char.charCodeAt(0),16777619);
 return value>>>0;
}

/** A daily deck is fixed for that calendar day, while preserving any stored deck. */
export function dailyCandidates(all:Post[], interests:string[], previousIds:number[]=[], limit=50, seed=''):Post[]{
 const ranked=[...all].sort((a,b)=>
   Number(interests.includes(b.tag))-Number(interests.includes(a.tag)) ||
   seededRank(a.id,seed)-seededRank(b.id,seed),
 );
 const byId=new Map(all.map(post=>[post.id,post]));
 return [...new Set([...previousIds,...ranked.map(post=>post.id)])]
   .slice(0,limit)
   .map(id=>byId.get(id))
   .filter((post):post is Post=>Boolean(post));
}

export function openDailyCard(opened:number[], id:number, limit=5):number[]{
 if(opened.includes(id)||opened.length>=limit)return opened;
 return [...opened,id];
}
