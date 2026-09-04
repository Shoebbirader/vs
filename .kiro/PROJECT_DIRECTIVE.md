# VahanSync Project Directive

**Read this file ONLY when explicitly requested. Do NOT auto-load or assume context.**

## What We're Building

**VahanSync** - A multi-tenant SaaS platform for Indian fleet operators (buses and commercial vehicles).

### Core Purpose
Help fleet teams act before breakdowns through coordinated workflows:
- **Drivers** submit inspections, issues, fuel logs, odometer readings
- **Fleet Managers** maintain vehicle register, create/assign work orders
- **Mechanics** execute work with checklists, labor tracking, parts usage, evidence
- **Inventory Managers** manage parts, vendors, purchase orders
- **Accountants** maintain INR-native financial ledger
- **Superadmins** govern team membership, permissions, billing, compliance

### Tech Stack
- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Radix UI
- **Backend:** Node.js, Express, tRPC, Drizzle ORM
- **Database:** Supabase PostgreSQL
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage (NOT AWS S3)
- **Deployment:** Vercel
- **Payments:** Razorpay (test mode)
- **SMS/WhatsApp:** Twilio

---

## Existing Codebase Structure

### Frontend
```
client/src/
├── App.tsx (main routing)
├── pages/
│   ├── Home.tsx (dashboard/workspaces)
│   └── MarketingPages.tsx
├── components/
│   ├── workspaces/ (7 role-specific workspaces)
│   ├── ui/ (53 Radix UI primitives)
│   └── operations/
├── hooks/
│   ├── useFleetOpsAuth.ts
│   └── useFleetOpsRealtime.ts
└── lib/
    └── trpc.ts
```

### Backend
```
server/
├── routers.ts (all tRPC procedures)
├── db.ts (Drizzle query builder)
├── supabase.ts (auth & provisioning)
├── storage.ts (Supabase Storage)
├── billing-plans.ts (subscription logic)
├── role-policy.ts (RBAC rules)
├── razorpay.ts (payment webhooks)
└── _core/
    ├── index.ts (Express server)
    └── context.ts (request context)
```

### Database
```
drizzle/
├── fleetops-schema.ts (25+ tables)
└── migrations/ (SQL migrations)
```

---

## Golden Rules - ALWAYS FOLLOW

### 1. **CHECK BEFORE CREATING**
- Search for existing files using `file_search` or `grep_search` BEFORE creating new files
- If similar functionality exists, extend it; don't duplicate
- Ask me first: "Should I create `path/to/file.ts` or modify existing file X?"

### 2. **ASK BEFORE CHANGES**
- **NEVER** modify files without explicit permission
- **ALWAYS** ask first: "I propose changing `file.ts` at lines X-Y. Should I proceed?"
- Show me the exact change with before/after code
- Wait for approval ("yes", "go ahead", "please fix") before applying

### 3. **NO AUTO-ACTIONS**
- Don't auto-read files on session start
- Don't auto-scan codebase for "improvements"
- Don't auto-fix bugs unless explicitly asked
- Only act on explicit user commands

### 4. **EXISTING FILE PATTERNS**

**DO NOT create these - they already exist:**
- UI components (use `client/src/components/ui/`)
- Role workspaces (use `client/src/components/workspaces/`)
- tRPC routes (extend `server/routers.ts`)
- Database tables (add to `drizzle/fleetops-schema.ts`)
- Auth logic (modify `server/supabase.ts`)
- Storage operations (modify `server/storage.ts`)

**DO NOT copy files:**
- All 53 UI components are in `client/src/components/ui/`
- All 7 workspaces are in `client/src/components/workspaces/`
- All migrations are in `drizzle/migrations/`

### 5. **CURRENT KNOWN ISSUES**
See `.kiro/CRITICAL_BUGS.md` for 3 remaining critical bugs (webhook validation, JWT bounds check, async handling).

### 6. **ENVIRONMENT VARIABLES**
All credentials are in `.env.local` (pulled from Vercel production environment).
- Do NOT create new env files
- Do NOT commit secrets
- Reference existing vars only

---

## Before You Start Any Task

**Ask yourself:**
1. Does this file or similar already exist? (`file_search`)
2. Should I modify existing code instead of creating new?
3. Have I asked the user for approval?
4. Am I following the exact user request, not "improving" beyond scope?

**If unsure:** Ask the user first. Example:
> "I want to add user notifications. Should I:
> A) Extend the existing notification handler in `server/routers.ts`?
> B) Create a new procedure?
> Which approach do you prefer?"

---

## Key Contacts in Code

- **Authentication:** `server/supabase.ts`
- **Database:** `server/db.ts`
- **API Routes:** `server/routers.ts`
- **Frontend Shell:** `client/src/App.tsx` & `client/src/pages/Home.tsx`
- **Role Access:** `server/role-policy.ts`
- **Billing:** `server/billing-plans.ts`
- **Storage:** `server/storage.ts`

---

## Last Updated
September 4, 2026 - After bug analysis checkpoint

**This file must be manually referenced via: "Use #File/.kiro/PROJECT_DIRECTIVE.md"**
