import {NextRequest,NextResponse} from 'next/server';
import {posts} from '@/lib/server/content-data';

export async function GET(){
  return NextResponse.json({data:posts.map(({id})=>({id}))},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(req:NextRequest){
  const body=await req.json().catch(()=>null) as {id?:unknown}|null;
  const id=Number(body?.id);
  if(!Number.isInteger(id))return NextResponse.json({error:'卡片无效'},{status:400});
  const post=posts.find(item=>item.id===id);
  if(!post)return NextResponse.json({error:'卡片不存在'},{status:404});
  return NextResponse.json({data:post},{headers:{'Cache-Control':'no-store'}});
}
