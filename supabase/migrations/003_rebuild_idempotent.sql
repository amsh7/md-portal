-- ============================================================
-- MD Portal — Migration 003: full idempotent rebuild
-- Consolidates 001 + 002 into ONE script that is SAFE TO RUN
-- ON ANY STATE of the database: empty, partial, or complete.
-- Every statement is guarded (if not exists / or replace /
-- drop-then-create). Running it twice changes nothing.
-- Run in Supabase Dashboard → SQL Editor as one script.
-- ============================================================

-- ---------- Enums ----------
do $$ begin create type user_role as enum ('admin','manager','sales_rep','warehouse','hr','employee'); exception when duplicate_object then null; end $$;
do $$ begin create type department_t as enum ('Sales','Regulatory','Warehouse','Finance','Admin','Collections','Drivers','Office'); exception when duplicate_object then null; end $$;
do $$ begin create type hospital_sector as enum ('government','private','university','military'); exception when duplicate_object then null; end $$;
do $$ begin create type hospital_status as enum ('active','prospect','dormant'); exception when duplicate_object then null; end $$;
do $$ begin create type deal_stage as enum ('lead','qualified','tender_quotation','won','lost'); exception when duplicate_object then null; end $$;
do $$ begin create type activity_type as enum ('call','meeting','note','visit'); exception when duplicate_object then null; end $$;
do $$ begin create type location_type as enum ('warehouse','hospital'); exception when duplicate_object then null; end $$;
do $$ begin create type movement_type as enum ('receive','transfer','usage','return','adjustment'); exception when duplicate_object then null; end $$;
do $$ begin create type shelf_count_status as enum ('draft','submitted','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type po_status as enum ('draft','approved','sent','partially_received','received','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type quotation_status as enum ('draft','sent','accepted','rejected','expired'); exception when duplicate_object then null; end $$;
do $$ begin create type leave_type as enum ('annual','sick','casual','unpaid','mission'); exception when duplicate_object then null; end $$;
do $$ begin create type leave_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type attendance_type as enum ('check_in','check_out'); exception when duplicate_object then null; end $$;
do $$ begin create type visit_purpose as enum ('shelf_count','sales_call','collection_follow_up','delivery','other'); exception when duplicate_object then null; end $$;

-- ---------- profiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  full_name_ar text,
  role user_role not null default 'employee',
  department department_t,
  phone text,
  active boolean not null default true,
  lang text not null default 'en' check (lang in ('en','ar')),
  created_at timestamptz not null default now()
);
alter table profiles add column if not exists lang text not null default 'en';

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any auth users created while the trigger was missing.
insert into profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1))
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);

-- ---------- Role helpers ----------
create or replace function public.my_role()
returns user_role
language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select public.my_role() = 'admin' $$;

create or replace function public.is_admin_or_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select public.my_role() in ('admin','manager') $$;

create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.department is distinct from old.department then
      raise exception 'Only admin can change role, department or active status';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_profile_fields on profiles;
create trigger trg_protect_profile_fields
  before update on profiles
  for each row execute function public.protect_profile_fields();

-- ---------- CRM ----------
create table if not exists hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  governorate text,
  sector hospital_sector,
  status hospital_status not null default 'prospect',
  assigned_rep_id uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  name text not null,
  role_title text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  title text not null,
  stage deal_stage not null default 'lead',
  expected_value numeric(14,2),
  currency text not null default 'EGP',
  expected_close date,
  owner_id uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Inventory ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  name_ar text,
  manufacturer text,
  category text,
  unit text not null default 'unit',
  price_egp numeric(14,2) not null default 0,
  price_foreign numeric(14,2),
  currency text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  type location_type not null,
  hospital_id uuid unique references hospitals(id) on delete cascade,
  name text not null,
  constraint hospital_loc_needs_hospital
    check ((type = 'hospital') = (hospital_id is not null))
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  type movement_type not null,
  product_id uuid not null references products(id),
  lot_no text not null,
  expiry_date date not null,
  qty numeric(12,2) not null check (qty > 0),
  from_location_id uuid references locations(id),
  to_location_id uuid references locations(id),
  ref_type text,
  ref_id uuid,
  reason text,
  created_by uuid not null references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  voided_by uuid references profiles(id),
  voided_at timestamptz,
  void_reason text,
  constraint movement_direction check (
    (type = 'receive'    and from_location_id is null and to_location_id is not null) or
    (type = 'transfer'   and from_location_id is not null and to_location_id is not null) or
    (type = 'usage'      and from_location_id is not null and to_location_id is null) or
    (type = 'return'     and from_location_id is not null and to_location_id is not null) or
    (type = 'adjustment' and (from_location_id is not null or to_location_id is not null) and reason is not null)
  )
);

-- ---------- Consignment ----------
create table if not exists shelf_counts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id),
  rep_id uuid not null references profiles(id) default auth.uid(),
  status shelf_count_status not null default 'draft',
  counted_at date not null default current_date,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists shelf_count_lines (
  id uuid primary key default gen_random_uuid(),
  shelf_count_id uuid not null references shelf_counts(id) on delete cascade,
  product_id uuid not null references products(id),
  lot_no text not null,
  expected_qty numeric(12,2) not null,
  counted_qty numeric(12,2) not null,
  usage_qty numeric(12,2) not null
);

create table if not exists usage_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  hospital_id uuid not null references hospitals(id),
  shelf_count_id uuid not null references shelf_counts(id),
  invoice_date date not null default current_date,
  total numeric(14,2) not null default 0,
  status text not null default 'issued',
  due_date date,
  created_at timestamptz not null default now()
);
-- Collections design-ahead (safe if the table pre-existed without it):
-- payment terms nominally 90 days; Phase 3 approval fn defaults invoice_date + 90.
alter table usage_invoices add column if not exists due_date date;
create index if not exists usage_invoices_hospital_idx on usage_invoices (hospital_id);
comment on table usage_invoices is
  'Operational invoice record (not the books). Design-ahead for a future '
  'collections phase: a payments table will reference invoice_id with '
  'amount + paid_at rows (partial payments / installments). Outstanding '
  'balance per hospital = sum(usage_invoices.total) - sum(payments.amount), '
  'grouped by hospital_id. Do not store balance columns — always derive.';

create table if not exists usage_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references usage_invoices(id) on delete cascade,
  product_id uuid not null references products(id),
  lot_no text not null,
  qty numeric(12,2) not null,
  unit_price numeric(14,2) not null,
  line_total numeric(14,2) not null
);

-- ---------- Purchasing ----------
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null unique,
  supplier text not null,
  currency text not null default 'EGP',
  status po_status not null default 'draft',
  notes text,
  created_by uuid not null references profiles(id) default auth.uid(),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(12,2) not null check (qty > 0),
  unit_price numeric(14,2) not null,
  received_qty numeric(12,2) not null default 0
);

create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  q_no text not null unique,
  hospital_id uuid not null references hospitals(id),
  valid_until date,
  status quotation_status not null default 'draft',
  terms text,
  created_by uuid not null references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(12,2) not null check (qty > 0),
  unit_price numeric(14,2) not null
);

-- ---------- HR ----------
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) default auth.uid(),
  type leave_type not null,
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  reason text,
  attachment_path text,
  status leave_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  review_comment text,
  created_at timestamptz not null default now(),
  constraint valid_range check (end_date >= start_date)
);

create table if not exists leave_balances (
  employee_id uuid not null references profiles(id) on delete cascade,
  year int not null,
  annual_total numeric(5,1) not null default 21,
  annual_used numeric(5,1) not null default 0,
  primary key (employee_id, year)
);

-- ---------- Attendance ----------
create table if not exists attendance_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) default auth.uid(),
  type attendance_type not null,
  ts timestamptz not null default now(),
  lat double precision,
  lng double precision
);

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references profiles(id) default auth.uid(),
  hospital_id uuid not null references hospitals(id),
  ts timestamptz not null default now(),
  lat double precision,
  lng double precision,
  purpose visit_purpose not null,
  notes text,
  shelf_count_id uuid references shelf_counts(id)
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  visit_id uuid references visits(id) on delete set null,
  type activity_type not null,
  body text not null,
  created_by uuid not null references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Announcements ----------
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_ar text,
  body text not null,
  body_ar text,
  created_by uuid not null references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Document numbering ----------
create table if not exists doc_counters (
  kind text not null,
  year int not null,
  last_seq int not null default 0,
  primary key (kind, year)
);

create or replace function public.next_doc_number(p_kind text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  seq int;
begin
  insert into doc_counters (kind, year, last_seq) values (p_kind, y, 1)
  on conflict (kind, year) do update set last_seq = doc_counters.last_seq + 1
  returning last_seq into seq;
  return case p_kind
    when 'po' then format('PO-%s-MD-%s', seq, y)
    when 'q' then format('Q-%s-MD-%s', seq, y)
    when 'invoice' then format('INV-%s-MD-%s', seq, y)
  end;
end;
$$;

-- ---------- Auto consignment location per hospital ----------
create or replace function public.create_hospital_location()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into locations (type, hospital_id, name) values ('hospital', new.id, new.name)
  on conflict (hospital_id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_hospital_location on hospitals;
create trigger trg_hospital_location
  after insert on hospitals
  for each row execute function public.create_hospital_location();

create or replace function public.sync_hospital_location_name()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update locations set name = new.name where hospital_id = new.id;
  return new;
end;
$$;
drop trigger if exists trg_sync_hospital_location on hospitals;
create trigger trg_sync_hospital_location
  after update of name on hospitals
  for each row execute function public.sync_hospital_location_name();

insert into locations (type, hospital_id, name)
select 'hospital', h.id, h.name from hospitals h
where not exists (select 1 from locations l where l.hospital_id = h.id);

-- ---------- Stock on hand view ----------
drop view if exists stock_on_hand;
create view stock_on_hand
with (security_invoker = true) as
select
  location_id,
  product_id,
  lot_no,
  max(expiry_date) as expiry_date,
  sum(qty) as qty
from (
  select to_location_id as location_id, product_id, lot_no, expiry_date, qty
    from stock_movements where voided_at is null and to_location_id is not null
  union all
  select from_location_id, product_id, lot_no, expiry_date, -qty
    from stock_movements where voided_at is null and from_location_id is not null
) flows
group by location_id, product_id, lot_no
having sum(qty) <> 0;

-- ============================================================
-- Row Level Security (final state = 001 as amended by 002)
-- ============================================================
alter table profiles enable row level security;
alter table hospitals enable row level security;
alter table contacts enable row level security;
alter table deals enable row level security;
alter table activities enable row level security;
alter table products enable row level security;
alter table locations enable row level security;
alter table stock_movements enable row level security;
alter table shelf_counts enable row level security;
alter table shelf_count_lines enable row level security;
alter table usage_invoices enable row level security;
alter table usage_invoice_lines enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_lines enable row level security;
alter table quotations enable row level security;
alter table quotation_lines enable row level security;
alter table leave_requests enable row level security;
alter table leave_balances enable row level security;
alter table attendance_logs enable row level security;
alter table visits enable row level security;
alter table announcements enable row level security;
alter table doc_counters enable row level security;

-- profiles
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (true);
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create or replace function public.owns_hospital(h_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from hospitals where id = h_id and assigned_rep_id = auth.uid()) $$;

-- hospitals: admin/manager full; reps read ALL (002), edit only their own.
drop policy if exists hospitals_am_all on hospitals;
create policy hospitals_am_all on hospitals for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
drop policy if exists hospitals_rep_select on hospitals;
create policy hospitals_rep_select on hospitals for select to authenticated
  using (public.my_role() = 'sales_rep');
drop policy if exists hospitals_rep_update on hospitals;
create policy hospitals_rep_update on hospitals for update to authenticated
  using (public.my_role() = 'sales_rep' and assigned_rep_id = auth.uid())
  with check (assigned_rep_id = auth.uid());

-- contacts: reps read all (002); write only on own hospitals.
drop policy if exists contacts_am_all on contacts;
create policy contacts_am_all on contacts for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
drop policy if exists contacts_rep_all on contacts;   -- superseded 001 policy
drop policy if exists contacts_rep_select on contacts;
create policy contacts_rep_select on contacts for select to authenticated
  using (public.my_role() = 'sales_rep');
drop policy if exists contacts_rep_insert on contacts;
create policy contacts_rep_insert on contacts for insert to authenticated
  with check (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id));
drop policy if exists contacts_rep_update on contacts;
create policy contacts_rep_update on contacts for update to authenticated
  using (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id))
  with check (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id));
drop policy if exists contacts_rep_delete on contacts;
create policy contacts_rep_delete on contacts for delete to authenticated
  using (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id));

-- deals
drop policy if exists deals_am_all on deals;
create policy deals_am_all on deals for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
drop policy if exists deals_rep_all on deals;
create policy deals_rep_all on deals for all to authenticated
  using (public.my_role() = 'sales_rep' and (owner_id = auth.uid() or public.owns_hospital(hospital_id)))
  with check (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id));

-- activities
drop policy if exists activities_am_all on activities;
create policy activities_am_all on activities for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
drop policy if exists activities_rep_select on activities;
create policy activities_rep_select on activities for select to authenticated
  using (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id));
drop policy if exists activities_rep_insert on activities;
create policy activities_rep_insert on activities for insert to authenticated
  with check (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id) and created_by = auth.uid());

-- products
drop policy if exists products_select on products;
create policy products_select on products for select to authenticated using (true);
drop policy if exists products_write on products;
create policy products_write on products for insert to authenticated with check (public.is_admin_or_manager());
drop policy if exists products_update on products;
create policy products_update on products for update to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());

-- locations
drop policy if exists locations_select on locations;
create policy locations_select on locations for select to authenticated using (true);
drop policy if exists locations_write on locations;
create policy locations_write on locations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- stock_movements (append-only; void-only updates, admin)
drop policy if exists movements_select_staff on stock_movements;
create policy movements_select_staff on stock_movements for select to authenticated
  using (public.my_role() in ('admin','manager','warehouse'));
drop policy if exists movements_select_rep on stock_movements;
create policy movements_select_rep on stock_movements for select to authenticated
  using (
    public.my_role() = 'sales_rep' and exists (
      select 1 from locations l
      where (l.id = stock_movements.from_location_id or l.id = stock_movements.to_location_id)
        and l.type = 'hospital' and public.owns_hospital(l.hospital_id)
    )
  );
drop policy if exists movements_insert on stock_movements;
create policy movements_insert on stock_movements for insert to authenticated
  with check (public.my_role() in ('admin','warehouse') and created_by = auth.uid());
drop policy if exists movements_void on stock_movements;
create policy movements_void on stock_movements for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.enforce_void_only()
returns trigger language plpgsql
as $$
begin
  if new.type is distinct from old.type or new.product_id is distinct from old.product_id
     or new.lot_no is distinct from old.lot_no or new.expiry_date is distinct from old.expiry_date
     or new.qty is distinct from old.qty
     or new.from_location_id is distinct from old.from_location_id
     or new.to_location_id is distinct from old.to_location_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Stock movements are append-only; only voiding is allowed';
  end if;
  if old.voided_at is not null then
    raise exception 'Movement already voided';
  end if;
  if new.voided_at is null or new.voided_by is distinct from auth.uid() or coalesce(new.void_reason,'') = '' then
    raise exception 'Void requires voided_by = current user, voided_at and a reason';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_movements_void_only on stock_movements;
create trigger trg_movements_void_only
  before update on stock_movements
  for each row execute function public.enforce_void_only();

-- shelf_counts
drop policy if exists counts_am_all on shelf_counts;
create policy counts_am_all on shelf_counts for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
drop policy if exists counts_rep_select on shelf_counts;
create policy counts_rep_select on shelf_counts for select to authenticated
  using (rep_id = auth.uid());
drop policy if exists counts_rep_insert on shelf_counts;
create policy counts_rep_insert on shelf_counts for insert to authenticated
  with check (public.my_role() = 'sales_rep' and rep_id = auth.uid() and public.owns_hospital(hospital_id) and status in ('draft','submitted'));
drop policy if exists counts_rep_update on shelf_counts;
create policy counts_rep_update on shelf_counts for update to authenticated
  using (rep_id = auth.uid() and status = 'draft')
  with check (rep_id = auth.uid() and status in ('draft','submitted'));

create or replace function public.can_edit_count(c_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from shelf_counts c
    where c.id = c_id
      and (public.is_admin_or_manager() or (c.rep_id = auth.uid() and c.status = 'draft'))
  )
$$;
drop policy if exists count_lines_select on shelf_count_lines;
create policy count_lines_select on shelf_count_lines for select to authenticated
  using (exists (select 1 from shelf_counts c where c.id = shelf_count_id));
drop policy if exists count_lines_write on shelf_count_lines;
create policy count_lines_write on shelf_count_lines for insert to authenticated
  with check (public.can_edit_count(shelf_count_id));
drop policy if exists count_lines_update on shelf_count_lines;
create policy count_lines_update on shelf_count_lines for update to authenticated
  using (public.can_edit_count(shelf_count_id)) with check (public.can_edit_count(shelf_count_id));
drop policy if exists count_lines_delete on shelf_count_lines;
create policy count_lines_delete on shelf_count_lines for delete to authenticated
  using (public.can_edit_count(shelf_count_id));

-- usage_invoices: read-only to clients; writes happen only via the
-- Phase 3 approval function (security definer). No insert/update policies.
drop policy if exists invoices_select on usage_invoices;
create policy invoices_select on usage_invoices for select to authenticated
  using (public.is_admin_or_manager() or public.owns_hospital(hospital_id));
drop policy if exists invoice_lines_select on usage_invoice_lines;
create policy invoice_lines_select on usage_invoice_lines for select to authenticated
  using (exists (select 1 from usage_invoices i where i.id = invoice_id));

-- purchase_orders
drop policy if exists po_select on purchase_orders;
create policy po_select on purchase_orders for select to authenticated
  using (public.my_role() in ('admin','manager','warehouse'));
drop policy if exists po_write on purchase_orders;
create policy po_write on purchase_orders for insert to authenticated
  with check (public.is_admin_or_manager() and created_by = auth.uid());
drop policy if exists po_update on purchase_orders;
create policy po_update on purchase_orders for update to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());

create or replace function public.guard_po_approval()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'approved' and old.status <> 'approved' and not public.is_admin() then
    raise exception 'Only admin can approve purchase orders';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_po_approval on purchase_orders;
create trigger trg_guard_po_approval
  before update on purchase_orders
  for each row execute function public.guard_po_approval();

drop policy if exists po_lines_select on purchase_order_lines;
create policy po_lines_select on purchase_order_lines for select to authenticated
  using (exists (select 1 from purchase_orders p where p.id = po_id));
drop policy if exists po_lines_write on purchase_order_lines;
create policy po_lines_write on purchase_order_lines for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());

-- quotations
drop policy if exists q_am_all on quotations;
create policy q_am_all on quotations for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
drop policy if exists q_rep_all on quotations;
create policy q_rep_all on quotations for all to authenticated
  using (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id))
  with check (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id) and created_by = auth.uid());

create or replace function public.can_edit_quotation(qid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from quotations q where q.id = qid
      and (public.is_admin_or_manager() or (public.my_role() = 'sales_rep' and public.owns_hospital(q.hospital_id)))
  )
$$;
drop policy if exists q_lines_select on quotation_lines;
create policy q_lines_select on quotation_lines for select to authenticated
  using (exists (select 1 from quotations q where q.id = quotation_id));
drop policy if exists q_lines_write on quotation_lines;
create policy q_lines_write on quotation_lines for all to authenticated
  using (public.can_edit_quotation(quotation_id)) with check (public.can_edit_quotation(quotation_id));

-- leave_requests
drop policy if exists leave_own_select on leave_requests;
create policy leave_own_select on leave_requests for select to authenticated
  using (employee_id = auth.uid() or public.my_role() in ('admin','hr'));
drop policy if exists leave_own_insert on leave_requests;
create policy leave_own_insert on leave_requests for insert to authenticated
  with check (employee_id = auth.uid() and status = 'pending');
drop policy if exists leave_decide on leave_requests;
create policy leave_decide on leave_requests for update to authenticated
  using (public.my_role() in ('admin','hr') or (employee_id = auth.uid() and status = 'pending'))
  with check (public.my_role() in ('admin','hr') or (employee_id = auth.uid() and status = 'pending'));

-- leave_balances
drop policy if exists balances_select on leave_balances;
create policy balances_select on leave_balances for select to authenticated
  using (employee_id = auth.uid() or public.my_role() in ('admin','hr'));
drop policy if exists balances_write on leave_balances;
create policy balances_write on leave_balances for all to authenticated
  using (public.my_role() in ('admin','hr')) with check (public.my_role() in ('admin','hr'));

-- attendance / visits
drop policy if exists att_select on attendance_logs;
create policy att_select on attendance_logs for select to authenticated
  using (employee_id = auth.uid() or public.my_role() in ('admin','manager','hr'));
drop policy if exists att_insert on attendance_logs;
create policy att_insert on attendance_logs for insert to authenticated
  with check (employee_id = auth.uid());

drop policy if exists visits_select on visits;
create policy visits_select on visits for select to authenticated
  using (rep_id = auth.uid() or public.my_role() in ('admin','manager','hr'));
drop policy if exists visits_insert on visits;
create policy visits_insert on visits for insert to authenticated
  with check (rep_id = auth.uid());

-- announcements
drop policy if exists ann_select on announcements;
create policy ann_select on announcements for select to authenticated using (true);
drop policy if exists ann_write on announcements;
create policy ann_write on announcements for insert to authenticated
  with check (public.my_role() in ('admin','hr') and created_by = auth.uid());
drop policy if exists ann_update on announcements;
create policy ann_update on announcements for update to authenticated
  using (public.my_role() in ('admin','hr')) with check (public.my_role() in ('admin','hr'));
drop policy if exists ann_delete on announcements;
create policy ann_delete on announcements for delete to authenticated
  using (public.my_role() in ('admin','hr'));

-- doc_counters: RLS enabled, no policies = clients denied; only the
-- security definer function next_doc_number() touches it.

-- ============================================================
-- After running: if Authentication → Users is ALSO empty, re-create
-- your admin user (Add user, Auto Confirm) and promote it:
--   update profiles set role='admin', full_name='Your Name'
--   where id = (select id from auth.users where email='YOUR-EMAIL');
-- ============================================================
