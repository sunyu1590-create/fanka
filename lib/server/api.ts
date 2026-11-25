import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {NextRequest,NextResponse} from 'next/server';

export class ApiError extends Error {constructor(public status:number,message:string){super(message)}}
export function config(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)throw new ApiError(503,'Supabase 未配置');return {url,key}}
export function client(token?:string):SupabaseClient {const {url,key}=config();return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:token?{Authorization:`Bearer ${token}`}:{}}})}
export async function context(req:NextRequest,required=true){
  // 应用层访问控制在所有业务接口入口生效；管理接口内部会跳过，避免管理员自锁。
  try {
    const { enforceAccess } = await import('./access-control');
    await enforceAccess(req);
  } catch (error) {
    if (error instanceof Error && error.name === 'AccessBlocked') throw new ApiError(429, error.message);
    throw error;
  }
  const match=/^Bearer (.+)$/i.exec(req.headers.get('authorization')||'');const token=match?.[1];if(required&&!token)throw new ApiError(401,'请先登录');const db=client(token);if(!token)return {db,user:null};const {data,error}=await db.auth.getUser(token);if(error||!data.user)throw new ApiError(401,'登录状态已失效');return {db,user:data.user}}
export async function jsonBody(req:NextRequest){try{return await req.json() as Record<string,unknown>}catch{throw new ApiError(400,'请求内容不是有效 JSON')}}
export function textField(value:unknown,name:string,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new ApiError(400,`${name}长度须为 ${min}-${max}`);return value.trim()}
export function uuid(value:unknown,name='id'){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new ApiError(400,`${name}无效`);return value}
export function dbError(error:{message:string;code?:string}|null){if(!error)return;const status=error.code==='23505'?409:error.code==='42501'?403:400;throw new ApiError(status,error.message)}

// 图片统一由站点域名分发：Caddy 把 /storage/* 反向代理到 Supabase Storage，
// 客户端因此不必跨境直连存储节点（这是原生端图片间歇性加载失败的主因）。
const PUBLIC_BASE=(process.env.PUBLIC_BASE_URL||'https://moonclean.shop').replace(/\/$/,'');
function storageOrigin(){return (process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'')}
export function publicStorageUrl(url:string){const from=storageOrigin();if(!from||!url.startsWith(`${from}/storage/v1/object/`))return url;return `${PUBLIC_BASE}${url.slice(from.length)}`}
function rewriteStorage(value:unknown):unknown{
  if(typeof value==='string')return publicStorageUrl(value);
  if(Array.isArray(value))return value.map(rewriteStorage);
  if(value&&typeof value==='object'){const out:Record<string,unknown>={};for(const [key,item] of Object.entries(value as Record<string,unknown>))out[key]=rewriteStorage(item);return out}
  return value;
}
export function respond(fn:()=>Promise<unknown>){return fn().then(data=>NextResponse.json({data:rewriteStorage(data)})).catch(error=>{if(!(error instanceof ApiError))console.error('[api]',error);return NextResponse.json({error:error instanceof ApiError?error.message:'服务器内部错误'},{status:error instanceof ApiError?error.status:500})})}
