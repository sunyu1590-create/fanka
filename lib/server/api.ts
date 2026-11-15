import {PostgrestClient} from '@supabase/postgrest-js';
import type {SupabaseClient} from '@supabase/supabase-js';
import {NextRequest,NextResponse} from 'next/server';

export class ApiError extends Error {constructor(public status:number,message:string){super(message)}}

export function gatewayBase(){const explicit=process.env.CLOUDBASE_GATEWAY?.trim();const envId=process.env.TCB_ENV_ID?.trim();if(explicit)return explicit.replace(/\/$/,'');if(!envId)throw new ApiError(503,'云开发环境未配置');return `https://${envId}.api.tcloudbasegateway.com`}

function serviceKey(){const key=process.env.CLOUDBASE_APIKEY?.trim();if(!key)throw new ApiError(503,'云开发服务端密钥未配置');return key}

export function config(){return {gateway:gatewayBase()}}

/**
 * 返回 Supabase 形状的数据客户端，实际指向云开发 PostgREST 兼容层。
 * 带用户 token 时以该用户身份执行（RLS 生效）；不带 token 时以服务端身份执行。
 */
export function client(token?:string):SupabaseClient {
  const rest=new PostgrestClient(`${gatewayBase()}/v1/rdb/rest`,{headers:{Authorization:`Bearer ${token||serviceKey()}`}});
  return {from:rest.from.bind(rest),rpc:rest.rpc.bind(rest),schema:rest.schema.bind(rest)} as unknown as SupabaseClient;
}

type CtxUser={id:string;email?:string;sub:string};

export function claimsFromToken(token:string){try{const p=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8')) as {sub?:unknown;email?:unknown};const sub=String(p.sub??'');if(!sub)throw new Error('missing sub');return {sub,email:typeof p.email==='string'?p.email:undefined}}catch{throw new ApiError(401,'登录状态已失效')}}

export async function context(req:NextRequest,required=true):Promise<{db:SupabaseClient;user:CtxUser|null}> {
  const match=/^Bearer (.+)$/i.exec(req.headers.get('authorization')||'');
  const token=match?.[1];
  if(required&&!token)throw new ApiError(401,'请先登录');
  const db=client(token);
  if(!token)return {db,user:null};
  const {sub,email}=claimsFromToken(token);
  const uid=await client().rpc('ensure_user_identity',{p_sub:sub}) as unknown as {data?:string;error?:{message:string}|null};
  if(uid.error||!uid.data)throw new ApiError(401,'登录状态已失效');
  return {db,user:{id:String(uid.data),email,sub}};
}

export async function jsonBody(req:NextRequest){try{return await req.json() as Record<string,unknown>}catch{throw new ApiError(400,'请求内容不是有效 JSON')}}
export function textField(value:unknown,name:string,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new ApiError(400,`${name}长度须为 ${min}-${max}`);return value.trim()}
export function uuid(value:unknown,name='id'){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new ApiError(400,`${name}无效`);return value}
export function dbError(error:{message:string;code?:string}|null){if(!error)return;const status=error.code==='23505'?409:error.code==='42501'?403:400;throw new ApiError(status,error.message)}
export function respond(fn:()=>Promise<unknown>){return fn().then(data=>NextResponse.json({data})).catch(error=>NextResponse.json({error:error instanceof ApiError?error.message:'服务器内部错误'},{status:error instanceof ApiError?error.status:500}))}
