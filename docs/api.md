# API v1

All routes return `{ "data": ... }` or `{ "error": "..." }`. Authenticated routes require `Authorization: Bearer <Supabase access_token>`. The server validates the token with Supabase Auth and forwards it to Supabase; RLS is the final authorization boundary. No service role key is used.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/posts?page=1&limit=12&tag=1&q=...` | Published posts, paginated |
| POST | `/api/v1/posts` | Submit `{title,body,tag_id}` to manual review |
| GET/PATCH/DELETE | `/api/v1/posts/:id` | Read or change own post |
| GET/PATCH | `/api/v1/me` | Own profile, interests, bookmarks; edit profile |
| PUT | `/api/v1/me/interests` | Replace 3–8 tag IDs |
| POST/DELETE | `/api/v1/me/bookmarks` | Bookmark `{post_id}` or remove with `?post_id=` |
| GET/POST | `/api/v1/posts/:id/comments` | List or create comment `{body,parent_id?}` |
| DELETE | `/api/v1/comments/:id` | Delete own comment |
| POST/DELETE | `/api/v1/comments/:id/reactions` | `{kind: "like"|"insightful"}`; delete with `?kind=` |
| POST | `/api/v1/reports` | Report `{post_id|comment_id,reason,note?}`; reason must be a fixed option, open duplicate reports are idempotently deduplicated |
| GET/POST | `/api/v1/deck` | Read daily deck; `{action:"open",slot:1}` or `{action:"swap"}` |
| POST | `/api/v1/media` | Multipart `file`, `post_id`, `upload_id`, `sort_order`; validates and links the private image to an owned draft/post |
| DELETE | `/api/v1/media` | `{upload_id,file_type,post_id?}`; clean up an interrupted/unlinked upload |
| POST/DELETE | `/api/v1/posts/:id/media` | Reorder an owned image or remove it from an owned post |
| POST | `/api/v1/library-state` | `{action:"draft",title,body,tag}` autosaves one owned draft; `{action:"publish",id,title,body,tag,mediaPaths,coverUrl}` submits it for manual review |
| GET | `/api/v1/topics?q=...` | List official topics with published-content and unique-author counts |
| GET | `/api/v1/topics/:id?page=1&limit=12` | Paginated public content for one official topic |
| GET/PATCH | `/api/v1/admin/reports?status=open|resolved|dismissed|all` and `/:id` | List paginated reports without reporter identity; process or dismiss with a required review note |
| GET | `/api/v1/admin/posts` | Paginated pending-review content, including signed previews of uploaded images |
| PATCH | `/api/v1/admin/posts/:id` | Approve or reject pending content with a required review note and timestamp |
| PATCH | `/api/v1/admin/comments/:id` | Hide or restore comments |
| GET/PATCH | `/api/v1/admin/settings` | Read and adjust 5 card slot allocation |
| GET | `/api/v1/ai-resource-types` | Enabled AI resource catalog with published counts |
| GET/POST | `/api/v1/ai-space` | Paginated AI resources; supports stable type, usage scenario, search, topic, and category filters; submissions preserve scenario metadata |
| GET/PATCH | `/api/v1/admin/ai-resource-types` | Staff with `ai.review` can edit labels, descriptions, ordering, and enablement without changing stable IDs |
| GET | `/api/v1/admin/ai-space` | Paginated AI review queue including pending revisions and scenario metadata |
| PATCH | `/api/v1/admin/ai-space/:id` | Review AI resources, correct classification and usage scenarios, or feature/unfeature content |

Database migrations are in `supabase/migrations/`. The topic directory reuses the eight curated `interest_tags` values; `post_topics` stores multi-topic associations and never accepts user-created topic names. Seed posts inherit their existing category as a topic. Topic counts come from published records and distinct authors. Daily RPCs persist one deck per user and local date, keep opened cards, and allow one swap. The publishing UI uses the authenticated library-state and media endpoints; the browser autosaves text locally and in the user's draft row, and keeps image file backups in IndexedDB until Storage confirms the association. AI resource types use stable catalog IDs and store usage scenarios separately in `posts.usage_scenarios`; migration `20261113133929_ai_resource_catalog_and_scenarios` was applied to the production Supabase project before these routes are deployed.

## Deployment

1. Create a Supabase project and obtain a database connection URL with migration privileges from its dashboard. Project name or public project URL alone cannot apply schema changes.
2. Set `SUPABASE_DB_URL` securely in the execution environment. Run `npx supabase db push --db-url "$SUPABASE_DB_URL"` from the repository root, then review migration output. Alternatively authenticate the CLI, link with `npx supabase link --project-ref <project-ref>`, and run `npx supabase db push`.
3. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the Next.js server environment. Keep them out of source control. A service role key is not required by these routes.
4. Configure the desired Supabase Auth providers and allowed redirect URLs. Deploy Next.js, then validate an authenticated API request and the daily deck RPC against the deployed project.

The publishing path has no automated image moderation provider. User submissions and edits therefore enter `pending_review`, remain private, and become public only after an administrator approves them. Report and moderation endpoints verify the access token, check the administrator role server-side, and rely on RLS for row access. A partial unique index prevents duplicate open reports by the same user for the same target.

The first administrator must be provisioned by the project owner in the Supabase SQL editor after that person has registered. Run `select public.bootstrap_first_admin((select id from auth.users where email = 'admin@example.com'));` with the intended account email. The function is executable only by the database owner and refuses to run after an administrator exists; regular users and the app cannot call it.
