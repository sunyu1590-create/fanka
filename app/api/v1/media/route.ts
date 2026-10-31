import {NextRequest,NextResponse} from 'next/server';
import {context,respond,ApiError,dbError} from '@/lib/server/api';
export async function GET(req:NextRequest){
  if(req.nextUrl.searchParams.get('redirect')==='1'){
    try{
      const {db}=await context(req,false);
      const path=req.nextUrl.searchParams.get('path');
      if(!path||path.length>300||path.includes('..'))throw new ApiError(400,'图片路径无效');
      const {data:media,error:mediaError}=await db.from('post_media').select('post_id,posts!inner(status)').eq('storage_path',path).eq('posts.status','published').single();
      dbError(mediaError);
      if(!media)throw new ApiError(404,'图片不存在');
      const {data,error}=await db.storage.from('post-covers').createSignedUrl(path,600);
      dbError(error);
      if(!data?.signedUrl)throw new ApiError(404,'图片不存在');
      return NextResponse.redirect(data.signedUrl,302);
    }catch(error){return NextResponse.json({error:error instanceof ApiError?error.message:'图片加载失败'},{status:error instanceof ApiError?error.status:500})}
  }
  return respond(async()=>{const {db}=await context(req,false);const path=req.nextUrl.searchParams.get('path');if(!path||path.length>300||path.includes('..'))throw new ApiError(400,'图片路径无效');const {data:media,error:mediaError}=await db.from('post_media').select('post_id,posts!inner(status)').eq('storage_path',path).eq('posts.status','published').single();dbError(mediaError);if(!media)throw new ApiError(404,'图片不存在');const {data,error}=await db.storage.from('post-covers').createSignedUrl(path,600);dbError(error);return {url:data?.signedUrl,expires_in:600}})
}
export async function POST(req:NextRequest){return respond(async()=>{const {db,user}=await context(req);const form=await req.formData();const file=form.get('file');if(!(file instanceof File))throw new ApiError(400,'请选择图片');if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024||file.size===0)throw new ApiError(400,'仅支持不超过 5 MB 的 JPG、PNG、WebP 图片');const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());const jpg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;const png=bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';if(!(file.type==='image/jpeg'&&jpg||file.type==='image/png'&&png||file.type==='image/webp'&&webp))throw new ApiError(400,'图片内容与格式不符');const ext=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp';const path=`${user!.id}/${crypto.randomUUID()}.${ext}`;const {error}=await db.storage.from('post-covers').upload(path,file,{contentType:file.type,upsert:false});dbError(error);return {path}})}
