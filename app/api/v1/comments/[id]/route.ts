import {NextRequest} from 'next/server';
import {context,uuid,dbError,respond} from '@/lib/server/api';
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){return respond(async()=>{const {db,user}=await context(req);const {data,error}=await db.from('comments').delete().eq('id',uuid((await params).id)).eq('author_id',user!.id).select('id').single();dbError(error);return data})}
