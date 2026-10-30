import {NextResponse} from 'next/server';
import {config} from '@/lib/server/api';
export async function GET(){try{const {url,key}=config();if(key.startsWith('sb_secret_'))throw new Error('invalid public key');if(key.split('.').length===3){const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());if(payload.role!=='anon')throw new Error('invalid public key')}return NextResponse.json({url,key},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'账户服务暂不可用'},{status:503})}}
