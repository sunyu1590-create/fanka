import {NextRequest} from 'next/server';
import {context,dbError,respond,ApiError} from '@/lib/server/api';
export async function GET(req:NextRequest){return respond(async()=>{const {db,user}=await context(req);const check=await db.from('profiles').select('role').eq('id',user!.id).single();dbError(check.error);if(check.data?.role!=='admin')throw new ApiError(403,'需要管理员权限');const {data,error}=await db.from('reports').select('*').eq('status','open').order('created_at',{ascending:false}).limit(100);dbError(error);return data})}
