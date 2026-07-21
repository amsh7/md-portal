# MD Portal — Build Specification
**Internal operations platform for M.D. for Medical Supplies (Egypt)**
Hand this file to Claude Code as the master brief. Build exactly to this spec, phase by phase, confirming at each checkpoint.

---

## 1. What this is

A multi-user internal web app for an Egyptian medical device distributor (~11–25 staff). Five modules: **Sales CRM, Inventory, Purchasing (POs & Quotations), HR, and Field Attendance.** Each employee gets their own login; role-based permissions control which modules and actions each person can see and execute.

The company's core operating model is **hospital consignment**: products sit on hospital shelves; sales reps visit monthly, count usage, and usage triggers invoices. The inventory and CRM modules must model this natively.

## 2. Hard constraints (do not deviate)

1. **Hosting: GitHub Pages** (user: `amsh7`, new repo, e.g. `md-portal`). Netlify is ISP-blocked across all Egyptian carriers — never use Netlify for hosting. Deploy via GitHub Actions on push to `main`.
2. **Backend: Supabase** (free tier) — Auth, Postgres, Row Level Security, Storage. No custom server. The frontend is a pure static SPA calling Supabase directly.
3. **Bilingual: Arabic + English** with a persistent toggle. Full RTL layout when Arabic is active (not just translated strings — flipped layout, mirrored icons where appropriate). Use `react-i18next`. Arabic font: **Cairo** or **IBM Plex Sans Arabic** via Google Fonts.
4. **SPA routing on GitHub Pages**: use hash routing (`HashRouter`) or the 404.html redirect trick. Hash routing preferred for simplicity.
5. **Secrets**: Supabase URL + anon key go in a `.env` file locally and in GitHub Actions secrets. Never commit keys. (Anon key is public-safe by design; security lives in RLS.)
6. **Security lives in RLS, not the frontend.** Every table gets Row Level Security policies. Frontend permission checks are UX only — the database must independently enforce every rule.

## 3. Stack

- **React 18 + Vite + TypeScript**
- **Tailwind CSS** (with `rtl:` variant support / logical properties)
- **react-i18next** (en.json / ar.json translation files — every user-facing string goes through i18n from day one)
- **@supabase/supabase-js**
- **React Router (HashRouter)**
- **TanStack Query** for data fetching/caching
- PDF generation for POs/quotations: **client-side** via `pdf-lib` or `@react-pdf/renderer` (must render Arabic text correctly — test RTL text shaping; if the chosen library can't shape Arabic, generate a print-optimized HTML view with `window.print()` instead. Print-view fallback is acceptable.)

## 4. Branding

- Colors: **black `#1A1718`**, **red `#EE1C25`**, white. Dark sidebar, red accent for primary actions.
- Wordmark: bold **"MD."** — company name "M.D. for Medical Supplies".
- Clean, dense, professional. This is a work tool, not a marketing site: prioritize tables, filters, and fast forms over decoration. Minimal empty-state illustrations.

## 5. Users, roles, permissions

Roles (single role per user, stored in a `profiles` table keyed to `auth.users`):

| Capability | admin | manager | sales_rep | warehouse | hr | employee |
|---|---|---|---|---|---|---|
| Manage users & roles | ✔ | | | | | |
| CRM: view all hospitals/pipeline | ✔ | ✔ | own only | | | |
| CRM: create/edit hospitals, contacts, deals | ✔ | ✔ | own only | | | |
| Inventory: view stock | ✔ | ✔ | consignment of own hospitals | ✔ | | |
| Inventory: stock movements (receive, transfer, adjust) | ✔ | | | ✔ | | |
| Shelf counts: submit monthly count | ✔ | | ✔ (own hospitals) | | | |
| Shelf counts: approve → generate usage invoice record | ✔ | ✔ | | | | |
| Purchasing: create/edit POs & quotations | ✔ | ✔ | quotations only | | | |
| Purchasing: approve POs | ✔ | | | | | |
| HR: view all employees, approve leave, manage balances | ✔ | | | | ✔ | |
| HR: request own leave, view own balance/profile | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Attendance: check in/out, log visits | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Attendance: view team logs & reports | ✔ | ✔ (sales team) | | | ✔ | |

- **admin** = GM and VP. **manager** = sales manager layer (optional to assign).
- "Own only" for sales_rep = rows where `assigned_rep_id = auth.uid()`.
- Account creation: admin invites users (email + temp password via Supabase admin API is not available client-side on free tier — instead: admin creates the auth user from the Supabase dashboard OR use Supabase's invite flow; document the chosen procedure in the README). Self-signup **disabled**.

## 6. Modules

### 6.1 Sales CRM
- **Hospitals (accounts)**: name (en/ar), city/governorate, sector (government / private / university / military), status (active / prospect / dormant), assigned sales rep, payment behavior note. Detail page shows: contacts, consignment shelf stock, visit history, open deals, recent shelf counts.
- **Contacts**: person, role (e.g., cath lab head, purchasing manager, pharmacy director), phone, notes; linked to hospital.
- **Deals/opportunities**: hospital, products of interest, stage (lead → qualified → tender/quotation → won → lost), expected value, expected close, notes. Kanban board + table view.
- **Activities**: calls/meetings/notes logged against hospitals or deals; auto-linked from field visits (module 6.5).

### 6.2 Inventory
- **Products**: SKU/reference, name (en/ar), manufacturer, category, unit, unit price (EGP + optional foreign currency price), active flag.
- **Batches/lots**: every stock movement references product + **lot number + expiry date**. Lot-level traceability is a regulatory requirement (10-year record retention for the manufacturer agreement) — records are never hard-deleted, only voided with an audit trail.
- **Locations**: two company warehouses + every hospital as a consignment location.
- **Stock movements** (append-only ledger): receive (from supplier PO), transfer (warehouse → hospital shelf), usage (from approved shelf count), return (hospital → warehouse), adjustment (with mandatory reason). Current stock per location/product/lot is computed from the ledger.
- **Shelf count workflow**: sales rep opens their hospital, sees expected shelf quantities, enters counted quantities per product/lot → system computes usage (expected − counted) → submits. Manager/admin reviews and approves → approval writes `usage` movements and creates a **usage invoice record** (invoice number, hospital, date, line items, total). Discrepancy flags when usage is negative or unusually large.
- **Alerts dashboard**: lots expiring within 90 days (per location), low warehouse stock, hospitals with no shelf count in >35 days.

### 6.3 Purchasing — POs & Quotations
- **Purchase orders** (to manufacturers): numbering `PO-{seq}-MD-{year}` (matches existing convention, e.g. PO-2-MD-2026). Supplier, currency, incoterms/notes field, line items (product, qty, unit price), totals, status (draft → approved → sent → partially received → received → closed). Receiving a PO creates `receive` stock movements (with lot + expiry entry per line). Printable/PDF output on company letterhead (black/red branding, bilingual labels).
- **Quotations** (to hospitals/tenders): numbering `Q-{seq}-MD-{year}`. Hospital, validity date, line items, terms text block, status (draft → sent → accepted → rejected → expired). Accepted quotation can convert to a CRM deal stage update. Printable/PDF output, bilingual.

### 6.4 HR
- **Employee profiles**: name (en/ar), job title, department (Sales / Regulatory / Warehouse / Finance / Admin / Collections / Drivers / Office), hire date, phone, national ID (visible to hr/admin only), annual leave balance.
- **Leave requests**: type (annual / sick / casual / unpaid / mission), date range, half-day support, reason, attachment (e.g., medical certificate → Supabase Storage). Workflow: employee submits → hr or admin approves/rejects with comment → approved leave deducts from balance. Employee sees own history + remaining balance; HR sees calendar view of who's off.
- **Announcements**: admin/hr can post company announcements visible on everyone's dashboard.

### 6.5 Field Attendance
- **Daily check-in / check-out**: one tap from the dashboard (mobile-first — reps use phones). Captures timestamp + GPS coordinates via browser geolocation (**with permission prompt; if denied, record without location** — never block check-in on GPS).
- **Hospital visits**: rep logs a visit: hospital (from CRM list), check-in time, optional GPS, purpose (shelf count / sales call / collection follow-up / delivery / other), notes. Visit auto-appears in the hospital's CRM activity feed. A shelf count started from a visit links to it.
- **Reports** (admin/manager/hr): daily attendance table, per-rep visit history, visits-per-hospital-per-month (flags hospitals overdue for their monthly count), simple map view of a day's visits is P1 (nice-to-have, not required for launch).

## 7. Data model (Postgres tables)

`profiles` (id → auth.users, full_name, full_name_ar, role, department, phone, active)
`hospitals` (id, name, name_ar, governorate, sector, status, assigned_rep_id, notes, created_at)
`contacts` (id, hospital_id, name, role_title, phone, notes)
`deals` (id, hospital_id, title, stage, expected_value, currency, expected_close, owner_id, notes)
`activities` (id, hospital_id, deal_id?, visit_id?, type, body, created_by, created_at)
`products` (id, sku, name, name_ar, manufacturer, category, unit, price_egp, price_foreign?, currency?, active)
`locations` (id, type: warehouse|hospital, hospital_id?, name)
`stock_movements` (id, type, product_id, lot_no, expiry_date, qty, from_location_id?, to_location_id?, ref_type?, ref_id?, reason?, created_by, created_at, voided_by?, voided_at?, void_reason?)
`shelf_counts` (id, hospital_id, rep_id, status: draft|submitted|approved|rejected, counted_at, approved_by?, approved_at?)
`shelf_count_lines` (id, shelf_count_id, product_id, lot_no, expected_qty, counted_qty, usage_qty)
`usage_invoices` (id, invoice_no, hospital_id, shelf_count_id, invoice_date, total, status)
`usage_invoice_lines` (id, invoice_id, product_id, lot_no, qty, unit_price, line_total)
`purchase_orders` (id, po_no, supplier, currency, status, notes, created_by, approved_by?, dates…)
`purchase_order_lines` (id, po_id, product_id, qty, unit_price, received_qty)
`quotations` (id, q_no, hospital_id, valid_until, status, terms, created_by, dates…)
`quotation_lines` (id, quotation_id, product_id, qty, unit_price)
`leave_requests` (id, employee_id, type, start_date, end_date, half_day, reason, attachment_path?, status, reviewed_by?, review_comment?, created_at)
`leave_balances` (employee_id, year, annual_total, annual_used)
`attendance_logs` (id, employee_id, type: check_in|check_out, ts, lat?, lng?)
`visits` (id, rep_id, hospital_id, ts, lat?, lng?, purpose, notes, shelf_count_id?)
`announcements` (id, title, title_ar?, body, body_ar?, created_by, created_at)

Sequences for document numbers (`po_no`, `q_no`, `invoice_no`) via a `doc_counters` table + Postgres function to avoid race conditions.

## 8. RLS policy summary (implement per table)

- `profiles`: everyone reads basic fields of active colleagues; only admin updates roles; users update own contact info.
- `hospitals`, `deals`, `contacts`, `activities`: admin/manager full; sales_rep full on rows tied to their `assigned_rep_id` / `owner_id`, read-none elsewhere (or read-only elsewhere — decide with user at checkpoint; default: **no access to other reps' accounts**).
- `stock_movements`: insert by warehouse/admin (and system paths for approved counts / PO receiving); no update/delete — void only via flag, admin-only.
- `shelf_counts` + lines: rep inserts/edits own drafts for own hospitals; manager/admin read all + approve.
- `usage_invoices`: read admin/manager (+ rep for own hospitals); write only via approval function (Postgres function `security definer`).
- Purchasing: per matrix in §5; PO approval admin-only.
- `leave_requests`: employee full on own; hr/admin read/decide all. `attendance_logs`/`visits`: insert own; read own; hr/admin/manager read all.
- `announcements`: read all authenticated; write admin/hr.

## 9. App shell & UX requirements

- **Login page** → dashboard. Dashboard is role-aware: everyone sees announcements + their check-in button + own leave balance; reps see their hospitals due for counts; admin sees alerts (expiring lots, overdue counts, pending approvals: shelf counts, leaves, POs).
- **Sidebar** modules filtered by role. Language toggle (EN/عربي) and user menu in the header; language choice persists in `localStorage` and in the profile.
- **Mobile-first for rep flows** (check-in, visit logging, shelf counts): large touch targets, minimal typing, numeric keypads for counts. Desktop-optimized for admin tables.
- All dates displayed in `DD/MM/YYYY`. Currency formatted as EGP with thousands separators; Western numerals in both languages.
- Empty states include a one-line hint + primary action button (bilingual).
- Every destructive/irreversible action (approve count, approve PO, void movement) requires a confirm dialog stating the consequence.

## 10. Build phases & checkpoints

Build in this order; stop after each phase for user review before continuing:

- **Phase 1 — Foundation**: repo scaffold, Supabase schema + RLS + seed script (roles only, no data), auth, app shell, i18n framework with RTL, role-aware navigation, user management page (admin), GitHub Pages deploy pipeline live. *Checkpoint: user logs in on the live URL from Egypt, toggles Arabic, sees role-filtered menu.*
- **Phase 2 — CRM + Inventory core**: hospitals, contacts, deals, products, locations, stock movements, warehouse stock views. *Checkpoint: user enters 2 hospitals, 3 products, a receive + transfer movement.*
- **Phase 3 — Consignment engine**: shelf counts, approval flow, usage invoices, alerts dashboard. *Checkpoint: full monthly cycle simulated end-to-end.*
- **Phase 4 — Purchasing**: POs, quotations, PDFs/print views, PO receiving into stock. 
- **Phase 5 — HR + Attendance**: profiles, leave workflow with balances + attachments, announcements, check-in/out, visit logging, reports.
- **Phase 6 — Polish**: Arabic translation completeness pass (every string), mobile QA on rep flows, performance pass, README with admin runbook (how to add a user, reset a password, backup the database via Supabase dashboard).

## 11. Non-goals (v1)

- **No accounting/P&L/collections module in v1 — but design ahead for it** *(update 2026-07-21, per GM)*: accounting/collections WILL be added as a future phase. `usage_invoices` carries a nullable `due_date` (payment terms nominally 90 days) and is structured so a future `payments` table can reference `invoice_id` with partial payments (hospitals pay in installments). Per-hospital outstanding balance must stay derivable (sum of invoice totals minus sum of payments) — never store balance columns. `usage_invoices` remains an operational record, not the books.
- **No ETA e-invoicing integration** — future phase; keep invoice records exportable (CSV) so this can bolt on later.
- **No payroll** — HR is leave + attendance only.
- **No offline mode** — reps need connectivity to log; acceptable for v1.
- **No historical data migration** — starts empty by user's choice; provide CSV import for `products` and `hospitals` only (P1).

## 12. Open questions to ask the user during Phase 1

1. Can sales reps see other reps' hospitals read-only, or nothing at all? — **ANSWERED: read-only** (edits/activity own-only; GM controls rep↔hospital assignment). Implemented in migration 002.
2. Which email address pattern for logins? — **ANSWERED: both** company-domain and personal emails.
3. Leave types and annual balance defaults — **ANSWERED: 21 annual + 7 sick**; exceptions grantable by GM and VP (Amr Lotfy), both `admin` role. (Phase 5)
4. Should quotation prices be visible to sales_rep role or manager-set only? — **ANSWERED: manager-set only** (sales manager Wael Osman); enforce in RLS in Phase 4.
