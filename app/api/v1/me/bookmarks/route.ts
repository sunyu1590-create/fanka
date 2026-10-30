import {NextRequest} from 'next/server';
import {context,jsonBody,uuid,dbError,respond} from '@/lib/server/api';
export async function POST(req:NextRequest){return respond(async()=>{const {db,user}=await context(req),body=await jsonBody(req);const {data,error}=await db.from('bookmarks').upsert({user_id:user!.id,post_id:uuid(body.post_id)},{onConflict:'user_id,post_id'}).select().single();dbError(error);return data})}
export async function DELETE(req:NextRequest){return respond(async()=>{const {db,user}=await context(req);const id=uuid(req.nextUrl.searchParams.get('post_id'));const {error}=await db.from('bookmarks').delete().eq('user_id',user!.id).eq('post_id',id);dbError(error);return {removed:true}})}
