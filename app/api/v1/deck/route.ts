import {NextRequest} from 'next/server';
import {context,jsonBody,dbError,respond,ApiError} from '@/lib/server/api';
export async function GET(req:NextRequest){return respond(async()=>{const {db}=await context(req);const {data,error}=await db.rpc('get_daily_deck');dbError(error);return data})}
export async function POST(req:NextRequest){return respond(async()=>{const {db}=await context(req),body=await jsonBody(req);if(body.action==='open'){const slot=Number(body.slot);if(!Number.isInteger(slot)||slot<1||slot>5)throw new ApiError(400,'卡牌序号无效');const {data,error}=await db.rpc('open_daily_card',{card_slot:slot});dbError(error);return data}if(body.action==='swap'){const {data,error}=await db.rpc('swap_daily_card');dbError(error);return data}throw new ApiError(400,'操作无效')})}
