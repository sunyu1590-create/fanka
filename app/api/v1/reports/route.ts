import {NextRequest} from 'next/server';
import {context,jsonBody,textField,uuid,dbError,respond,ApiError} from '@/lib/server/api';
export async function POST(req:NextRequest){return respond(async()=>{const {db,user}=await context(req),body=await jsonBody(req);if(!!body.post_id===!!body.comment_id)throw new ApiError(400,'请选择一个举报对象');const {data,error}=await db.from('reports').insert({reporter_id:user!.id,post_id:body.post_id?uuid(body.post_id):null,comment_id:body.comment_id?uuid(body.comment_id):null,reason:textField(body.reason,'举报理由',3,500)}).select().single();dbError(error);return data})}
