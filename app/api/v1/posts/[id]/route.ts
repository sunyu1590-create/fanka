import {NextRequest} from 'next/server';
import {createHash} from 'node:crypto';
import {context,jsonBody,textField,uuid,dbError,respond,ApiError} from '@/lib/server/api';
import {detachExplorationAd} from '@/lib/server/detach-ad';
import {removePostAttachments} from '@/lib/server/attachment-cleanup';
import {attachAuthorBadges,libraryFields,presentMany,type LibraryRow} from '@/lib/server/library';
type Params={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Params){return respond(async()=>{const {db}=await context(req,false);const id=uuid((await params).id);const fields=libraryFields.replace('profiles!posts_author_id_fkey(nickname)','profiles!posts_author_id_fkey(nickname,avatar_url)');const {data,error}=await db.from('posts').select(`${fields},updated_at`).eq('id',id).single();dbError(error);if(!data)throw new ApiError(404,'内容不存在');const postRow=data as unknown as {status:string;title:string;body:string};const [presented]=await attachAuthorBadges(db,await presentMany(db,[data as unknown as LibraryRow]));let aiSummary:string|null=null;if(postRow.status==='published'){const currentHash=createHash('md5').update(`${postRow.title||''}\n${postRow.body||''}`).digest('hex');const summary=await db.from('ai_post_summaries').select('summary,content_hash').eq('post_id',id).maybeSingle();if(!summary.error&&summary.data?.content_hash===currentHash)aiSummary=summary.data.summary;}return {...presented,...(data as unknown as Record<string,unknown>),images:presented.images,aiSummary}})}
export async function PATCH(req:NextRequest,{params}:Params){return respond(async()=>{const {db,user}=await context(req);const id=uuid((await params).id),body=await jsonBody(req);const {data:existing,error:existingError}=await db.from('posts').select('status').eq('id',id).eq('author_id',user!.id).single();dbError(existingError);if(!existing)throw new ApiError(404,'内容不存在');const values:Record<string,unknown>={};if(body.title!==undefined)values.title=textField(body.title,'标题',1,80);if(body.body!==undefined)values.body=textField(body.body,'正文',1,5000);if(body.tag_id!==undefined){const tag=Number(body.tag_id);if(!Number.isInteger(tag)||tag<1)throw new ApiError(400,'分类无效');values.tag_id=tag}if(!Object.keys(values).length)throw new ApiError(400,'没有修改内容');if(existing.status!=='draft')values.status='pending_review';values.updated_at=new Date().toISOString();const {data,error}=await db.from('posts').update(values).eq('id',id).eq('author_id',user!.id).select().single();dbError(error);return data})}
export async function DELETE(req:NextRequest,{params}:Params){return respond(async()=>{
  const {db}=await context(req);
  const id=uuid((await params).id);
  // 广告位引用会让外键置空撞上检查约束，先解绑再删。
  await removePostAttachments(db, id);
  await detachExplorationAd(db, id);
  // 作者本人可删自己的作品；管理员与内容管理员可删任意作品（权限在数据库函数内校验）。
  const {data,error}=await db.rpc('delete_post',{p_post_id:id});
  dbError(error);
  return data;
})}
