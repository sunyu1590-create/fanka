import {NextRequest} from 'next/server';
import {context,jsonBody,textField,uuid,dbError,respond,ApiError} from '@/lib/server/api';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){return respond(async()=>{const {db,user}=await context(req),body=await jsonBody(req);const id=uuid((await params).id);const path=textField(body.path,'图片路径',1,300);if(!path.startsWith(`${user!.id}/`))throw new ApiError(403,'图片不属于当前用户');const {data,error}=await db.from('post_media').insert({post_id:id,storage_path:path}).select().single();dbError(error);return data})}
