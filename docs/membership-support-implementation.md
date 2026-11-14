# HEIKA membership and support setup

## Implemented flow

- Membership plans and daily allowances live in `membership_plans`; the flip transaction reads the enabled plan and derives the caller's active tier from membership periods. The browser and Android clients do not grant themselves quota.
- Existing Plus/Pro profile tiers are migrated to non-expiring `legacy` periods. They remain intact; an equal or lower card is rejected without consuming it. A higher card can temporarily upgrade that account and the legacy entitlement resumes afterwards.
- Admins create Plus/Pro batches in the existing moderation console. Each batch is reserved to one named product/channel. Codes use a 100-bit cryptographic random body, a keyed HMAC lookup value, and AES-GCM encrypted export copy. Plaintext is only returned once at generation or when an authorized administrator re-exports the same reserved batch. Do not use a different product label to redistribute a batch.
- Redemption preview and activation run in service-side database functions. Per-user rate limits, profile-row serialization, code-row locking, request-ID idempotency, expiry checks, one-use constraints, and membership event records protect the operation. Code lookup and ciphertext are not accessible to ordinary clients.
- The admin console includes plan configuration, user lookup/adjustment, batch and code status, masked codes, redemptions, and an order review view. The order view is deliberately empty until a verifiable order intake exists; it does not treat a client-submitted order as paid.
- A daily Vercel Cron refreshes the compatibility snapshot in `profiles`. Expiry itself is enforced synchronously by the membership-period resolver, so a delayed cron cannot extend a member's actual quota.

## Required server configuration

Keep the existing `SUPABASE_SERVICE_ROLE_KEY` (or the server-side `SUPABASE_SECRET_KEY`) only in protected server environments. Set these additional Vercel server environment variables before using voucher issuance:

```sh
openssl rand -base64 32  # set the output as HEIKA_REDEEM_CODE_KEY
openssl rand -hex 32     # set the output as CRON_SECRET
```

`HEIKA_REDEEM_CODE_KEY` must remain stable. It derives both the voucher lookup HMAC and export encryption key; changing it without a planned re-key migration makes existing vouchers unredeemable and exported ciphertext unreadable. Never place these values in a `NEXT_PUBLIC_*` variable, client bundle, source control, or support message. Configure the same `CRON_SECRET` in Vercel; Vercel Cron sends it as a Bearer token.

## Database rollout

The additive migration is `supabase/migrations/20261114120000_membership_support_redemption.sql`. It must be applied to a reviewed staging database first, then production through the project's established Supabase migration process. It preserves user, EXP, flip, and legacy membership data. Do not run ad-hoc SQL that truncates or rewrites existing profile/interaction tables.

This workspace does not contain a linked Supabase project or production credentials. The migration has not been applied to staging or production here. After `supabase link` to the intended project, review the migration and use the project's normal migration command (`supabase db push`) with a database backup and a post-migration verification of the plan rows, RLS, functions, and representative legacy profiles.

## Afdian phase one

The configured destination is `https://afdian.com/a/heikaka`. For each product, create a distinct batch in the admin console, download the one-time text file, and configure those codes in that product's Afdian random-reply setting. Keep product name, tier, and duration consistent with the batch label. Test a code with a controlled account before announcing the product. The app only claims an entitlement after the user redeems the code successfully.

Automatic order ingestion, signed webhook verification, refunds, and automatic card delivery are not enabled. An official Afdian API/webhook spec and credentials have not been validated in this environment, so no endpoint pretends that an incoming request proves payment. Implement that phase only after validating current official signing and order-query rules and configuring secrets in the server environment.

## Checks still requiring configured infrastructure

Production/staging redemption, two-user race tests, cross-device sync, Vercel Cron execution, Afdian random replies, and live quota enforcement require a migrated Supabase project, server secrets, and test accounts. These are not represented as completed by local source tests or an APK build.
