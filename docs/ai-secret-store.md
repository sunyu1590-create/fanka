# AI 密钥存储（腾讯云通道）

AI 工作台的 DeepSeek 密钥不再存在 Vercel Blob，默认存入腾讯云 CloudBase 的私有 bucket。密钥在写入前用 AES-256-GCM 加密，云端只保存密文。

## 数据流

```
后台「AI 工作台」保存密钥
  → POST /api/v1/admin/ai-settings
  → saveAiKey()  加密（AI_SETTINGS_ENCRYPTION_KEY）
  → ai-store.ts  → CloudBase bucket: heika-private / ai/deepseek-key.json

写作页调用 AI
  → POST /api/v1/ai/workbench
  → readAiKey()  下载密文并解密
  → https://api.deepseek.com/chat/completions
```

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `AI_SETTINGS_ENCRYPTION_KEY` | 32 字节 base64，`openssl rand -base64 32` 生成。丢失后已保存的密钥无法解密，只能重新保存 |
| `AI_SECRET_STORE` | `cloudbase`（默认）或 `blob`（回退到 Vercel Blob） |
| `AI_SECRET_BUCKET` | bucket 名，默认 `heika-private` |
| `TCB_ENV_ID` | CloudBase 环境 ID |
| `CLOUDBASE_APIKEY` | 服务端 API Key（JWT 内 `role=service_role`），CloudBase 存储的写入凭证 |

`CLOUDBASE_APIKEY` 缺失时代码会退回 SDK 的默认鉴权（云托管容器自动注入的临时凭证）。但 PG 模式存储的 RLS 要求 `service_role`，临时凭证映射为匿名角色，写入会被拒（403 `STORAGE_ACCESS_DENIED`）。因此云托管环境必须显式配置 `CLOUDBASE_APIKEY`。

## API Key 的创建

```bash
tcb api tcb CreateApiKey --body '{"EnvId":"<envId>","KeyType":"SERVICE"}' --json
```

返回的 `ApiKey` 只在创建时完整返回一次，`DescribeApiKeyList` 只给脱敏值，需要创建后立即保存。

## bucket 与权限

bucket 是 PostgreSQL `storage.buckets` 表中的一行；对象权限由 `storage.objects` 的 RLS 策略控制。`heika-private` 是私有 bucket，只给 `service_role` 开了策略：

```sql
CREATE POLICY heika_private_service_all ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'heika-private')
  WITH CHECK (bucket_id = 'heika-private');
```

匿名与普通登录用户没有任何策略，因此即使拿到 bucket 名也读写不了。

## 验证

后台「AI 工作台」的 `GET /api/v1/admin/ai-settings` 会返回 `store` 字段，值是 `cloudbase:heika-private` 或 `vercel-blob`，可直接确认当前生效的存储通道。
