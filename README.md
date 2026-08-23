# VahanSync

**VahanSync** is a multi-tenant fleet-operations workspace for Indian bus and commercial fleet operators. It connects vehicles, drivers, maintenance, inventory, safety, finance, and organization governance through role-focused workflows and organization-scoped records.

## Product focus

VahanSync helps fleet teams act before breakdowns. Drivers submit inspections, issues, fuel logs, and odometer readings. Fleet Managers maintain the vehicle register, monitor component life, create and assign work orders, and review fleet readiness. Mechanics execute work with checklists, labor, evidence, and parts. Inventory Managers manage parts, vendors, purchase orders, receipts, and reorder risk. Accountants maintain INR-native financial records. Superadmins govern organization membership, permissions, billing, and compliance.

## Architecture

The application uses React 19, Tailwind CSS 4, TypeScript, tRPC 11, Drizzle ORM, Express, Supabase PostgreSQL, Supabase Auth, Supabase Storage, Resend, and Vercel. The API is tenant-scoped and role-aware; operational procedures validate organization membership and role permissions on the server.

## Local development

```bash
pnpm install
pnpm dev
```

Run validation with:

```bash
pnpm test
pnpm check
pnpm build
```

Environment values must be supplied through the deployment environment. Do not commit `.env` files, database credentials, Supabase service keys, or email/API secrets.

## Deployment

Production is deployed to Vercel. The primary product domain is `https://vahansync.com` when the domain is connected; the current Vercel project alias remains `https://fleetops-v2.vercel.app` until the custom domain is assigned. GitHub `main` is the source branch for deployment synchronization.

## Naming note

The public product brand is **VahanSync**. Internal database table names, tRPC procedure namespaces, storage keys, and historical migration identifiers may retain legacy FleetOps identifiers for compatibility and are not customer-facing branding.
