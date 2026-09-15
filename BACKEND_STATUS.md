# FleetOps Backend Status

The exact-stack backend is implemented with Supabase PostgreSQL, Prisma, Supabase Auth, Supabase Realtime, tenant-scoped tRPC procedures, RLS migrations, invitation redemption, component CRUD, operational APIs, trial write-freeze, vehicle/user trial limits, and live dashboard query states.

## Razorpay deployment blocker

Razorpay payment execution is intentionally not enabled in this checkpoint because no Razorpay credentials or webhook secret have been provided. Before enabling checkout and subscription webhooks, configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` through the project’s secure secrets manager, then add the webhook signature verification route and plan-to-tier mapping. The `billing.status` procedure already exposes the current organization tier, trial expiry, limits, and write-lock state.

## Scheduled maintenance deployment blocker

The idempotent `supabase/functions/evaluate-maintenance` Edge Function and setup documentation are included. Supabase Edge Function deployment and production scheduling require the Supabase project’s deployment authorization and a deployed production callback URL. Run `supabase functions deploy evaluate-maintenance --project-ref <project-ref>` after authenticating the Supabase CLI, then schedule the function through Supabase Cron or the platform’s scheduled-job control. The local sandbox cannot prove a production scheduler execution without those deployment credentials and a published callback endpoint.
