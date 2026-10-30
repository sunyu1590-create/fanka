import {createClient,type SupabaseClient} from '@supabase/supabase-js';
let pending:Promise<SupabaseClient>|undefined;
export function browserDb(){return pending??=(async()=>{const response=await fetch('/api/client-config');const data=await response.json();if(!response.ok)throw new Error(data.error);return createClient(data.url,data.key)})().catch(error=>{pending=undefined;throw error})}
