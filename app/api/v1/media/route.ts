import {NextRequest,NextResponse} from 'next/server';
import {context,respond,ApiError,dbError,uuid} from '@/lib/server/api';
import {createFeedThumbnail} from '@/lib/server/feed-thumbnail';

export const runtime = 'nodejs';

export async function GET(req:NextRequest){
  if(req.nextUrl.searchParams.get('redirect')==='1'){
    try{
      const {db}=await context(req,false);
      const path=req.nextUrl.searchParams.get('path');
      if(!path||path.length>300||path.includes('..'))throw new ApiError(400,'图片路径无效');
      const variant=req.nextUrl.searchParams.get('variant');
      if(variant&&variant!=='feed'&&variant!=='card')throw new ApiError(400,'图片尺寸无效');
      let mediaQuery=db.from('post_media').select('post_id,posts!inner(status)').eq('storage_path',path);
      if(variant==='feed'||variant==='card')mediaQuery=mediaQuery.eq('posts.status','published');
      const {data:media,error:mediaError}=await mediaQuery.single();
      dbError(mediaError);
      if(!media)throw new ApiError(404,'图片不存在');
      const {data,error}=await db.storage.from('post-covers').createSignedUrl(path,600);
      dbError(error);
      if(!data?.signedUrl)throw new ApiError(404,'图片不存在');
      if(variant==='feed'||variant==='card'){
        try{
          const original=await fetch(data.signedUrl,{signal:AbortSignal.timeout(10000)});
          if(!original.ok)throw new Error('原图读取失败');
          const contentLength=Number(original.headers.get('content-length')||0);
          if(contentLength>5*1024*1024)throw new Error('原图超过处理限制');
          const bytes=Buffer.from(await original.arrayBuffer());
          if(bytes.byteLength>5*1024*1024)throw new Error('原图超过处理限制');
          const contentType=(original.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
          if(!['image/jpeg','image/png','image/webp'].includes(contentType))throw new Error('图片格式无效');
          let output=new Uint8Array(bytes.byteLength),outputType=contentType;
          output.set(bytes);
          try{const thumbnail=await createFeedThumbnail(bytes);output=new Uint8Array(thumbnail.byteLength);output.set(thumbnail);outputType='image/webp'}
          catch(error){console.warn('[media] card thumbnail fallback',error instanceof Error?error.name:'unknown')}
          const responseBytes=new Uint8Array(output.byteLength);
          responseBytes.set(output);
          const cacheControl=variant==='card'
            ? 'public, max-age=86400, stale-while-revalidate=604800, s-maxage=86400'
            : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
          return new NextResponse(responseBytes,{headers:{'Content-Type':outputType,'Cache-Control':cacheControl,'X-Content-Type-Options':'nosniff'}});
        }catch(error){
          if(variant==='card')throw new ApiError(502,'图片暂时无法读取');
          // Keep published feed images visible if optimization fails for an unusual or legacy file.
          console.warn('[media] feed thumbnail fallback',error instanceof Error?error.name:'unknown');
          return NextResponse.redirect(data.signedUrl,302);
        }
      }
      return NextResponse.redirect(data.signedUrl,302);
    }catch(error){return NextResponse.json({error:error instanceof ApiError?error.message:'图片加载失败'},{status:error instanceof ApiError?error.status:500})}
  }
  return respond(async()=>{const {db}=await context(req,false);const path=req.nextUrl.searchParams.get('path');if(!path||path.length>300||path.includes('..'))throw new ApiError(400,'图片路径无效');const {data:media,error:mediaError}=await db.from('post_media').select('post_id,posts!inner(status)').eq('storage_path',path).single();dbError(mediaError);if(!media)throw new ApiError(404,'图片不存在');const {data,error}=await db.storage.from('post-covers').createSignedUrl(path,600);dbError(error);return {url:data?.signedUrl,expires_in:600}})
}
export async function POST(req:NextRequest){return respond(async()=>{const {db,user}=await context(req);const form=await req.formData();const file=form.get('file');if(!(file instanceof File))throw new ApiError(400,'请选择图片');if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024||file.size===0)throw new ApiError(400,'仅支持不超过 5 MB 的 JPG、PNG、WebP 图片');const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());const jpg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;const png=bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';if(!(file.type==='image/jpeg'&&jpg||file.type==='image/png'&&png||file.type==='image/webp'&&webp))throw new ApiError(400,'图片内容与格式不符');const postId=uuid(form.get('post_id'),'草稿'),uploadId=uuid(form.get('upload_id'),'上传编号');const sortOrder=Number(form.get('sort_order')||0);if(!Number.isInteger(sortOrder)||sortOrder<0||sortOrder>8)throw new ApiError(400,'图片顺序无效');const {data:post,error:postError}=await db.from('posts').select('id,status').eq('id',postId).eq('author_id',user!.id).single();dbError(postError);if(!post||!['draft','pending_review','published'].includes(post.status))throw new ApiError(403,'无权为此内容上传图片');const ext=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp',path=`${user!.id}/${uploadId}.${ext}`;const {data:linked,error:linkedError}=await db.from('post_media').select('post_id').eq('storage_path',path).maybeSingle();dbError(linkedError);if(linked?.post_id&&linked.post_id!==postId)throw new ApiError(409,'该图片已关联其他内容');if(linked?.post_id===postId){const {error}=await db.from('post_media').update({sort_order:sortOrder}).eq('post_id',postId).eq('storage_path',path);dbError(error);return {path}}const {count,error:countError}=await db.from('post_media').select('id',{count:'exact',head:true}).eq('post_id',postId);dbError(countError);if((count||0)>=9)throw new ApiError(400,'一篇内容最多添加 9 张图片');const folder=await db.storage.from('post-covers').list(user!.id,{search:`${uploadId}.${ext}`,limit:10});dbError(folder.error);const exists=(folder.data||[]).some(item=>item.name===`${uploadId}.${ext}`);if(!exists){const {error:uploadError}=await db.storage.from('post-covers').upload(path,file,{contentType:file.type,upsert:false});if(uploadError)dbError(uploadError)}const {error:linkError}=await db.from('post_media').insert({post_id:postId,storage_path:path,sort_order:sortOrder});if(linkError){const {data:retryLink}=await db.from('post_media').select('post_id').eq('storage_path',path).maybeSingle();if(retryLink?.post_id===postId)return {path};dbError(linkError)}return {path}})}
export async function DELETE(req:NextRequest){return respond(async()=>{const {db,user}=await context(req);let body:Record<string,unknown>;try{body=await req.json()}catch{throw new ApiError(400,'请求内容无效')}const uploadId=uuid(body.upload_id,'上传编号'),type=String(body.file_type||''),ext=type==='image/jpeg'?'jpg':type==='image/png'?'png':type==='image/webp'?'webp':null;if(!ext)throw new ApiError(400,'图片格式无效');const path=`${user!.id}/${uploadId}.${ext}`;const postId=body.post_id?uuid(body.post_id,'草稿'):null;const {data:linked,error:linkedError}=await db.from('post_media').select('post_id').eq('storage_path',path).maybeSingle();dbError(linkedError);if(linked?.post_id&&postId!==linked.post_id)throw new ApiError(403,'图片与草稿不匹配');if(postId&&!linked){const {data:post,error}=await db.from('posts').select('id').eq('id',postId).eq('author_id',user!.id).maybeSingle();dbError(error);if(!post)throw new ApiError(403,'无权清理此草稿图片')}const {error:storageError}=await db.storage.from('post-covers').remove([path]);dbError(storageError);if(linked){const {error}=await db.from('post_media').delete().eq('post_id',linked.post_id).eq('storage_path',path);dbError(error)}return {removed:true}})}
