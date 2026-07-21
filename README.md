# MD Portal

Internal operations platform for **M.D. for Medical Supplies** (Egypt): Sales CRM, Inventory (hospital consignment), Purchasing, HR, and Field Attendance.

- **Frontend:** React 18 + Vite + TypeScript + Tailwind, bilingual (English/Arabic with full RTL), hash routing.
- **Backend:** Supabase (Auth, Postgres + RLS, Storage). No custom server — the SPA calls Supabase directly; all security is enforced by Row Level Security.
- **Hosting:** GitHub Pages via GitHub Actions (Netlify is ISP-blocked in Egypt — do not use).

## One-time setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Open **SQL Editor** and run the whole of [`supabase/migrations/001_phase1_schema.sql`](supabase/migrations/001_phase1_schema.sql).
3. Disable self-signup: **Authentication → Sign In / Up → disable "Allow new users to sign up"**. (Users created by the admin from the dashboard still work.)
4. Create the first (admin) user: **Authentication → Users → Add user** — enter email + password, check "Auto Confirm User". A profile row is created automatically.
5. Promote that user to admin in SQL Editor:
   ```sql
   update profiles set role = 'admin', full_name = 'Your Name' where id = 'THE-USER-UUID';
   ```

### 2. Local development

```bash
cp .env.example .env   # fill in your project URL + publishable (anon) key
npm install
npm run dev
```

Find both values under **Project Settings → API**. The anon/publishable key is public-safe by design; security lives entirely in RLS.

### 3. GitHub Pages deploy

1. Create the repo `amsh7/md-portal`, push this code to `main`.
2. Repo **Settings → Secrets and variables → Actions**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Repo **Settings → Pages → Source: GitHub Actions**.
4. Push to `main` — the workflow builds and deploys to `https://amsh7.github.io/md-portal/`.

## Admin runbook

**Add a user** (self-signup is disabled by design):
1. Supabase Dashboard → Authentication → Users → **Add user** (email + temporary password, Auto Confirm).
2. Tell the person their email + temp password.
3. In MD Portal → **Users**, set their name, role, and department.

**Change a role / deactivate someone:** MD Portal → Users (admin only). Deactivated users keep their history but are blocked at sign-in.

**Reset a password:** Supabase Dashboard → Authentication → Users → user row → **Send password recovery** (or set a new password directly).

**Roles:** `admin` (GM/VP — everything), `manager` (sales manager), `sales_rep`, `warehouse`, `hr`, `employee`. One role per user; the permission matrix is in [`MD_Portal_Build_Spec.md`](MD_Portal_Build_Spec.md) §5 and enforced by RLS policies in the migration file.

## Design-ahead notes

- **Collections/accounting is a future phase** (decided 2026-07-21): `usage_invoices.due_date` exists now (terms nominally 90 days); a future `payments` table will reference `invoice_id` and support partial payments. Outstanding balance per hospital is always *derived* (invoices minus payments) — never stored. Later phases must not break this.
- Sales reps see **all** hospitals/contacts read-only; they can edit only their own assignments. The GM controls rep↔hospital assignment.
- Quotation prices are manager/admin-set only (from Phase 4).

## Project phases

Built phase-by-phase per the [build spec](MD_Portal_Build_Spec.md):

- [x] **Phase 1 — Foundation:** schema + RLS, auth, bilingual RTL shell, role-aware nav, user management, Pages deploy pipeline
- [ ] Phase 2 — CRM + Inventory core
- [ ] Phase 3 — Consignment engine (shelf counts → usage invoices)
- [ ] Phase 4 — Purchasing (POs, quotations, PDFs)
- [ ] Phase 5 — HR + Attendance
- [ ] Phase 6 — Polish
