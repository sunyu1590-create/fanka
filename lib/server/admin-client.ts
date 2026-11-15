import { client } from "@/lib/server/api";

/** 以服务端（service_role）身份访问数据，绕过 RLS，仅用于后台任务与账号恢复。 */
export function adminClient() {
  return client();
}
