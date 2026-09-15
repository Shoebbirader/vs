# FleetOps Release Checklist

## Database and migrations

- Confirm `drizzle/fleetops-schema.ts` matches the intended PostgreSQL schema.
- Review generated Drizzle SQL and apply the canonical migration through the linked Supabase project with automatic approval.
- Verify the migration in Supabase PostgreSQL and record the migration filename in the release notes.
- Confirm `SUPABASE_DATABASE_URL` is the only application database connection and that no Prisma, MySQL, or TiDB runtime dependency is used.

## Application validation

- Run `pnpm test` and confirm the full Vitest suite is green.
- Run `pnpm exec tsc --noEmit`.
- Run `pnpm run build`.
- Run authenticated smoke checks for sign-in, organization onboarding, invitation acceptance, role workspace loading, logout, relogin, and the closed-loop maintenance handoff.
- Confirm no customer reviews, ratings, testimonials, or fabricated operational records are shipped.

## Source and deployment

- Confirm GitHub `main` contains the release commit.
- Confirm Vercel automatic deployment from `main` completed successfully.
- Record the published checkpoint URI and production domain.
- Review production logs for authentication, API, automation, storage, and slow-query errors.

## Rollback and cleanup

- Keep the checkpoint URI available for rollback.
- Remove temporary test users, invitations, organizations, files, and records after background regression runs.
- If a release is unhealthy, use checkpoint rollback rather than destructive Git reset or database deletion.
