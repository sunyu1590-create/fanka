-- AI 服务端密钥（如 DeepSeek API Key）改为存放在 Supabase 数据库，
-- 不再依赖 Vercel Blob 或服务器本地文件。
-- 表内只保存 AES-256-GCM 密文，明文仅在应用进程内存中出现。
-- 该表只允许 service_role 访问：应用层用 service role key 读写，RLS 拦截其他角色。

create table if not exists public.app_secrets (
  name text primary key,
  ciphertext text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint app_secrets_name_length check (char_length(name) between 1 and 120),
  constraint app_secrets_ciphertext_length check (char_length(ciphertext) between 1 and 20000)
);

comment on table public.app_secrets is '服务端加密密文仓储（AI 供应商密钥等）。仅 service_role 可读写，禁止暴露给 anon/authenticated。';
comment on column public.app_secrets.name is '密钥名称，例如 ai.deepseek.api_key';
comment on column public.app_secrets.ciphertext is 'AES-256-GCM 密文 JSON（version/iv/tag/ciphertext），不含明文';

alter table public.app_secrets enable row level security;
alter table public.app_secrets force row level security;

revoke all on table public.app_secrets from anon, authenticated;
revoke truncate, references, trigger on table public.app_secrets from service_role;
grant select, insert, update, delete on table public.app_secrets to service_role;

-- 不建立任何 anon/authenticated 策略：除 service_role 外一律拒绝。
