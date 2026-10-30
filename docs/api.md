# API v1

All routes return `{ "data": ... }` or `{ "error": "..." }`. Authenticated routes require `Authorization: Bearer <Supabase access_token>`. The server validates the token with Supabase Auth and forwards it to Supabase; RLS is the final authorization boundary. No service role key is used.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/posts?page=1&limit=12&tag=1&q=...` | Published posts, paginated |
| POST | `/api/v1/posts` | Publish `{title,body,tag_id}` |
| GET/PATCH/DELETE | `/api/v1/posts/:id` | Read or change own post |
| GET/PATCH | `/api/v1/me` | Own profile, interests, bookmarks; edit profile |
| PUT | `/api/v1/me/interests` | Replace 3–8 tag IDs |
| POST/DELETE | `/api/v1/me/bookmarks` | Bookmark `{post_id}` or remove with `?post_id=` |
| GET/POST | `/api/v1/posts/:id/comments` | List or create comment `{body,parent_id?}` |
| DELETE | `/api/v1/comments/:id` | Delete own comment |
| POST/DELETE | `/api/v1/comments/:id/reactions` | `{kind: "like"|"insightful"}`; delete with `?kind=` |
| POST | `/api/v1/reports` | Report `{post_id|comment_id,reason}` |
| GET/POST | `/api/v1/deck` | Read daily deck; `{action:"open",slot:1}` or `{action:"swap"}` |
| POST | `/api/v1/media` | Multipart `file`; private bucket upload, returns path |
| GET/PATCH | `/api/v1/admin/reports` and `/:id` | List and resolve reports |
| PATCH | `/api/v1/admin/posts/:id`, `/api/v1/admin/comments/:id` | Moderate content |
| GET/PATCH | `/api/v1/admin/settings` | Read and adjust 5 card slot allocation |

Database migrations are in `supabase/migrations/`. Seed posts are tagged `is_demo=true`. Daily RPCs persist one deck per user and local date, keep opened cards, and allow one swap. These endpoints are implemented but have not been connected to the demo UI or tested against a live Supabase project.

## Deployment

1. Create a Supabase project and obtain a database connection URL with migration privileges from its dashboard. Project name or public project URL alone cannot apply schema changes.
2. Set `SUPABASE_DB_URL` securely in the execution environment. Run `npx supabase db push --db-url "$SUPABASE_DB_URL"` from the repository root, then review migration output. Alternatively authenticate the CLI, link with `npx supabase link --project-ref <project-ref>`, and run `npx supabase db push`.
3. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the Next.js server environment. Keep them out of source control. A service role key is not required by these routes.
4. Configure the desired Supabase Auth providers and allowed redirect URLs. Deploy Next.js, then validate an authenticated API request and the daily deck RPC against the deployed project.

The current browser demo does not switch to these endpoints automatically. Authentication screens and the production client data adapter remain to be built before public launch.
