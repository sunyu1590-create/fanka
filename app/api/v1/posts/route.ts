import {NextRequest} from 'next/server';
import {libraryFields,libraryFeedFields,presentFeedMany,presentMany,type LibraryRow} from '@/lib/server/library';
import {context,jsonBody,textField,dbError,respond,ApiError} from '@/lib/server/api';
type FeedCursor = { created_at: string; id: string };
const cursorPattern = /^[A-Za-z0-9_-]{1,256}$/;
const cursorFor = (row: Pick<LibraryRow, 'created_at' | 'id'>) => Buffer.from(JSON.stringify({ created_at: row.created_at, id: row.id })).toString('base64url');
function decodeCursor(value: string): FeedCursor {
  if (!cursorPattern.test(value)) throw new ApiError(400, '发现页游标无效');
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<FeedCursor>;
    if (typeof cursor.created_at !== 'string' || !Number.isFinite(Date.parse(cursor.created_at)) || typeof cursor.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)) throw new Error('invalid cursor');
    return { created_at: new Date(cursor.created_at).toISOString(), id: cursor.id };
  } catch { throw new ApiError(400, '发现页游标无效'); }
}

export async function GET(req:NextRequest){return respond(async()=>{
  const {db}=await context(req,false);const q=req.nextUrl.searchParams;const limit=Math.max(1,Math.min(24,Number(q.get('limit'))||12));
  const rawTag=q.get('tag');const tag=rawTag?Number(rawTag):null;if(tag!==null&&(!Number.isSafeInteger(tag)||tag<1))throw new ApiError(400,'分类无效');
  if(q.get('cursor_mode')==='1'){
    const rawCursor=q.get('cursor');const cursor=rawCursor?decodeCursor(rawCursor):null;
    const {data,error}=await db.rpc('get_discover_cursor',{p_limit:limit,p_tag:tag,p_cursor_created_at:cursor?.created_at||null,p_cursor_id:cursor?.id||null});dbError(error);
    const result=data as {ids?:string[];total?:number|null;has_more?:boolean};const ids=Array.isArray(result?.ids)?result.ids:[];
    if(!ids.length)return {items:[],total:result?.total??null,has_more:false,next_cursor:null,limit};
    const posts=await db.from('posts').select(libraryFeedFields).in('id',ids).eq('status','published');dbError(posts.error);
    const byId=new Map((await presentFeedMany(db,posts.data as unknown as LibraryRow[])).map((item)=>[item.cloudId,item]));
    const items=ids.flatMap((id)=>byId.has(id)?[byId.get(id)!]:[]);const lastId=ids[ids.length-1];const lastRow=(posts.data as unknown as LibraryRow[]).find((row)=>row.id===lastId);
    return {items,total:result?.total??null,has_more:Boolean(result?.has_more),next_cursor:result?.has_more&&lastRow?cursorFor(lastRow):null,limit};
  }
  const page=Math.max(1,Math.min(1000,Number(q.get('page'))||1));const rawQuery=q.get('q')?.trim().slice(0,80)||null;const query=rawQuery?.replace(/[%_,]/g,'')||null;const {data,error}=await db.rpc('get_recommendation_page',{p_page:page,p_limit:limit,p_tag:tag,p_query:query});dbError(error);const result=data as {ids?:string[];total?:number};const ids=Array.isArray(result?.ids)?result.ids:[];if(!ids.length)return {items:[],total:Number(result?.total)||0,page,limit};const posts=await db.from('posts').select(libraryFields).in('id',ids).eq('status','published');dbError(posts.error);const byId=new Map((await presentMany(db,posts.data as unknown as LibraryRow[])).map((item)=>[item.cloudId,item]));return {items:ids.flatMap((id)=>byId.has(id)?[byId.get(id)!]:[]),total:Number(result?.total)||0,page,limit}
})}
export async function POST(req:NextRequest){return respond(async()=>{const {db,user}=await context(req);const body=await jsonBody(req);const title=textField(body.title,'标题',1,80),content=textField(body.body,'正文',1,5000);const tagId=Number(body.tag_id);if(!Number.isInteger(tagId)||tagId<1)throw new ApiError(400,'分类无效');const {data,error}=await db.from('posts').insert({author_id:user!.id,tag_id:tagId,title,body:content,status:'pending_review'}).select().single();dbError(error);return data})}
