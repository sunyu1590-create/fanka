# Account recovery setup

The password reset screen accepts a Supabase recovery email OTP. In Supabase Auth, configure the **Reset Password** email template to display `{{ .Token }}` so users receive a code they can enter in the app. Keep the template branding and validity period aligned with the Auth email settings.

Backup recovery codes require the migration `20261102071009_account_recovery_codes.sql` and a server-only `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) on Vercel. Never expose that key with a `NEXT_PUBLIC_` prefix. The codes are generated while signed in, shown once, stored only as SHA-256 digests, and invalidated individually when used. Generating a new set replaces all previously issued codes.
