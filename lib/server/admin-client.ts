import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/api";

export function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new ApiError(503, "账号恢复服务暂不可用");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
