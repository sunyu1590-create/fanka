import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {NextRequest,NextResponse} from 'next/server';

export class ApiError extends Error {constructor(public status:number,message:string){super(message)}}
export function config(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)throw new ApiError(503,'Supabase 未配置');return {url,key}}
export function client(token?:string):SupabaseClient {const {url,key}=config();return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:token?{Authorization:`Bearer ${token}`}:{}}})}
export async function context(req:NextRequest,required=true){const match=/^Bearer (.+)$/i.exec(req.headers.get('authorization')||'');const token=match?.[1];if(required&&!token)throw new ApiError(401,'请先登录');const db=client(token);if(!token)return {db,user:null};const {data,error}=await db.auth.getUser(token);if(error||!data.user)throw new ApiError(401,'登录状态已失效');return {db,user:data.user}}
export async function jsonBody(req:NextRequest){try{return await req.json() as Record<string,unknown>}catch{throw new ApiError(400,'请求内容不是有效 JSON')}}
export function textField(value:unknown,name:string,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new ApiError(400,`${name}长度须为 ${min}-${max}`);return value.trim()}
export function uuid(value:unknown,name='id'){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new ApiError(400,`${name}无效`);return value}
export function dbError(error:{message:string;code?:string}|null){if(!error)return;const status=error.code==='23505'?409:error.code==='42501'?403:400;throw new ApiError(status,error.message)}
export function respond(fn:()=>Promise<unknown>){return fn().then(data=>NextResponse.json({data})).catch(error=>NextResponse.json({error:error instanceof ApiError?error.message:'服务器内部错误'},{status:error instanceof ApiError?error.status:500}))}
