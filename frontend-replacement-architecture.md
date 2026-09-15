# VahanSync Frontend Replacement Architecture

## Immutable boundary

This rebuild is limited to `client/src/**` presentation code, client-side tests, and frontend documentation. It must not change server procedures, `server/db.ts`, Supabase configuration, database schema or migrations, Auth behavior, environment variables, production data, or RBAC policy. Existing tRPC procedure names, input shapes, query enablement rules, mutations, and invalidation behavior are retained.

## Replacement strategy

The existing authenticated `Home` component currently combines session handling, dashboard summary reads, workspace navigation, the command-center view, and the sign-in surface. The replacement will preserve those hooks and handlers while moving visual composition into purpose-built frontend primitives:

| Replacement layer | Preserved contract | New responsibility |
|---|---|---|
| Application frame | Supabase session and `dashboard.summary` state | Responsive operator rail, context header, mobile navigation, and persistent command affordances |
| Authentication entry | Sign-in, sign-up, recovery, and password-update handlers | Full-bleed operational entry experience with a clear, accessible form flow |
| Role navigation | `workspaceAccess` and existing labels | Role-specific action map with fewer, clearer navigational decisions |
| Command workspace | Existing live query outputs and completion mutation | Exception-first operational overview with intentional hierarchy and record drawers |
| Specialist workspaces | Existing workspace components, mutations, and query states | Fully rebuilt page composition around role decisions, state rails, and field execution |

## Interface principles

The new interface will use a dark operational frame and light work canvas, deliberate status color, large editable action controls, VIN-first vehicle identity, compact decision tables, contextual side panels, and mobile bottom actions for field roles. Presentation components may be replaced or split, but data ownership remains unchanged.

## Release gate

Before release, the final diff must contain no changes under `server/`, `drizzle/`, `supabase/`, `api/`, or configuration/secret files. It must pass existing backend tests, frontend contract tests, TypeScript, production build, and real role workspace smoke checks.
