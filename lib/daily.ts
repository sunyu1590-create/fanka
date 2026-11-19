import type {Post} from './content';

/** A daily deck is fixed for that calendar day, while preserving any stored deck. */
export function dailyCandidates(all:Post[], _interests:string[], previousIds:number[]=[], limit=50):Post[]{
 const byId=new Map(all.map(post=>[post.id,post]));
 return [...new Set([...previousIds,...all.map(post=>post.id)])]
   .slice(0,limit)
   .map(id=>byId.get(id))
   .filter((post):post is Post=>Boolean(post));
}

export type DailyCandidateSignal={
 id:number;
 channel?:'community'|'ai';
 tag?:string;
 createdAt?:string;
 featuredAt?:string|null;
 viewCount?:number;
 ratingAverage?:number;
 ratingCount?:number;
};

function seededRank(id:number,seed:string){
 let value=2166136261;
 for(const char of `${seed}:${id}`) value=Math.imul(value^char.charCodeAt(0),16777619);
 return value>>>0;
}

/**
 * Rank fresh candidates by account interests, quality and age, then alternate
 * between community and AI so a larger channel cannot crowd the other out.
 * Recently read candidates are only used when the fresh pool is too small.
 */
export function rankBalancedDailyCandidates(
 all:DailyCandidateSignal[],
 interests:string[],
 recentlySeen:number[]=[],
 limit=50,
 seed='',
 now=Date.now(),
):number[]{
 const seen=new Set(recentlySeen);
 const unique=[...new Map(all.filter(item=>Number.isSafeInteger(item.id)&&item.id>0).map(item=>[item.id,item])).values()];
 const score=(item:DailyCandidateSignal)=>{
  const tagScore=item.tag&&interests.includes(item.tag)?0.42:0;
  const confidence=Math.min(1,Math.max(0,item.ratingCount||0)/20);
  const quality=(Math.max(-1,Math.min(1,((item.ratingAverage||0)-3)/2))*confidence)*0.22;
  const ageDays=Math.max(0,(now-(Date.parse(item.createdAt||'')||now))/86_400_000);
  const freshness=0.18*Math.exp(-ageDays/45);
  const featured=item.featuredAt?0.06:0;
  return tagScore+quality+freshness+featured;
 };
 const balance=(items:DailyCandidateSignal[])=>{
  const ranked={community:[] as DailyCandidateSignal[],ai:[] as DailyCandidateSignal[]};
  for(const item of items) ranked[item.channel==='ai'?'ai':'community'].push(item);
  for(const channel of ['community','ai'] as const) ranked[channel].sort((a,b)=>score(b)-score(a)||((seededRank(a.id,seed)>>>0)-(seededRank(b.id,seed)>>>0)));
  const order=(seededRank(0,seed)&1)===0?['community','ai'] as const:['ai','community'] as const;
  const result:number[]=[];
  while(ranked.community.length||ranked.ai.length){
   let added=false;
   for(const channel of order){const item=ranked[channel].shift();if(item){result.push(item.id);added=true;}}
   if(!added)break;
  }
  return result;
 };
 const fresh=unique.filter(item=>!seen.has(item.id));
 const repeated=unique.filter(item=>seen.has(item.id));
 return [...balance(fresh),...balance(repeated)].slice(0,Math.max(0,limit));
}

export function openDailyCard(opened:number[], id:number, limit=5):number[]{
 if(opened.includes(id)||opened.length>=limit)return opened;
 return [...opened,id];
}
