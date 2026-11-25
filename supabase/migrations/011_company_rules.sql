-- ============================================================
-- MD Portal — Migration 011: company rules update (Nov 2026)
-- Idempotent: safe to run repeatedly in Supabase SQL Editor.
--
--   1) Approver flags: any approval (PO, shelf count, leave
--      exception, office request final step) can be given by ONE
--      of the GM (admin) or anyone with the "approver" flag (Amr).
--      Finance flag marks who does the money check (Bahaa).
--   2) Leave: annual balance 30 (was 21), sick 7; new types
--      'personal' (full days) and 'permission' (time range on one
--      day) — both need approval, neither deducts from a balance.
--      'casual' is retired from the UI (old rows keep working).
--   3) Weekly comings-and-goings reports for sales reps —
--      submitted after the week ends, readable by management,
--      no approval step.
--   4) Office-supply requests: employee → finance check (Bahaa)
--      → final approval (GM or approver).
-- ============================================================

-- ---------- 1. Approver flags ----------
alter table profiles add column if not exists is_approver boolean not null default false;
alter table profiles add column if not exists is_finance_approver boolean not null default false;

create or replace function public.can_approve()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin()
      or coalesce((select is_approver from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_finance()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin()
      or coalesce((select is_finance_approver from profiles where id = auth.uid()), false);
$$;

-- Only admin may change the flags (extends the Phase-5 guard).
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.department is distinct from old.department
       or new.job_title is distinct from old.job_title
       or new.is_approver is distinct from old.is_approver
       or new.is_finance_approver is distinct from old.is_finance_approver then
      raise exception 'Only admin can change role, job title, department, approver flags or active status';
    end if;
  end if;
  return new;
end;
$$;

-- ---------- 2. Approval gates: admin OR approver ----------
create or replace function public.guard_po_approval()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'approved' and old.status <> 'approved' and not public.can_approve() then
    raise exception 'Only the GM or an approver (VP) can approve purchase orders';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.approve_shelf_count(p_count_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_count shelf_counts%rowtype;
  v_loc uuid;
  v_invoice_id uuid := null;
  v_has_usage boolean;
  r record;
begin
  if public.can_approve() is distinct from true then
    raise exception 'Only the GM or an approver (VP) can approve shelf counts';
  end if;

  select * into v_count from shelf_counts where id = p_count_id for update;
  if not found then
    raise exception 'Shelf count not found';
  end if;
  if v_count.status <> 'submitted' then
    raise exception 'Only submitted counts can be approved (current status: %)', v_count.status;
  end if;

  select id into v_loc from locations where hospital_id = v_count.hospital_id;
  if v_loc is null then
    raise exception 'Hospital has no shelf location';
  end if;

  for r in
    select l.* from shelf_count_lines l
    where l.shelf_count_id = p_count_id and l.usage_qty > 0
  loop
    insert into stock_movements
      (type, product_id, lot_no, expiry_date, qty, from_location_id, ref_type, ref_id, created_by)
    values (
      'usage', r.product_id, r.lot_no,
      coalesce(
        (select max(m.expiry_date) from stock_movements m
          where m.product_id = r.product_id and m.lot_no = r.lot_no and m.voided_at is null),
        current_date),
      r.usage_qty, v_loc, 'shelf_count', p_count_id, auth.uid()
    );
  end loop;

  select exists (
    select 1 from shelf_count_lines
    where shelf_count_id = p_count_id and usage_qty > 0
  ) into v_has_usage;

  if v_has_usage then
    insert into usage_invoices
      (invoice_no, hospital_id, shelf_count_id, invoice_date, due_date, total, status)
    select
      public.next_doc_number('invoice'),
      v_count.hospital_id, p_count_id, current_date, current_date + 90,
      coalesce(sum(l.usage_qty * p.price_egp), 0), 'issued'
    from shelf_count_lines l
    join products p on p.id = l.product_id
    where l.shelf_count_id = p_count_id and l.usage_qty > 0
    returning id into v_invoice_id;

    insert into usage_invoice_lines (invoice_id, product_id, lot_no, qty, unit_price, line_total)
    select v_invoice_id, l.product_id, l.lot_no, l.usage_qty, p.price_egp, l.usage_qty * p.price_egp
    from shelf_count_lines l
    join products p on p.id = l.product_id
    where l.shelf_count_id = p_count_id and l.usage_qty > 0;
  end if;

  update shelf_counts
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_count_id;

  return v_invoice_id;
end;
$$;

-- An approver who is not admin/manager still needs to write the rows
-- involved in an approval (PO status, shelf-count rejection).
drop policy if exists po_update on purchase_orders;
create policy po_update on purchase_orders for update to authenticated
  using (public.is_admin_or_manager() or public.can_approve())
  with check (public.is_admin_or_manager() or public.can_approve());

drop policy if exists counts_approver_update on shelf_counts;
create policy counts_approver_update on shelf_counts for update to authenticated
  using (public.can_approve()) with check (public.can_approve());

-- ---------- 3. Leave: new types, new balances ----------
alter type leave_type add value if not exists 'personal';
alter type leave_type add value if not exists 'permission';

alter table leave_requests add column if not exists start_time time;
alter table leave_requests add column if not exists end_time time;

alter table leave_balances alter column annual_total set default 30;
update leave_balances set annual_total = 30 where annual_total = 21;

create or replace function public.decide_leave(
  p_request_id uuid,
  p_approve boolean,
  p_comment text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_req leave_requests%rowtype;
  v_days numeric;
  v_year int;
  v_total numeric;
  v_used numeric;
begin
  if not (public.my_role() = 'hr' or public.can_approve()) then
    raise exception 'Only HR, the GM or an approver (VP) can decide leave requests';
  end if;

  select * into v_req from leave_requests where id = p_request_id for update;
  if not found then
    raise exception 'Leave request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided';
  end if;

  if not p_approve then
    update leave_requests
      set status = 'rejected', reviewed_by = auth.uid(), review_comment = p_comment
      where id = p_request_id;
    return;
  end if;

  v_days := case when v_req.half_day then 0.5
                 else (v_req.end_date - v_req.start_date + 1) end;
  v_year := extract(year from v_req.start_date)::int;

  insert into leave_balances (employee_id, year)
    values (v_req.employee_id, v_year)
    on conflict (employee_id, year) do nothing;

  if v_req.type in ('annual','casual') then
    select annual_total, annual_used into v_total, v_used
      from leave_balances where employee_id = v_req.employee_id and year = v_year for update;
    if v_used + v_days > v_total and not public.can_approve() then
      raise exception 'Exceeds the annual balance — only the GM or VP can approve an exception';
    end if;
    update leave_balances set annual_used = annual_used + v_days
      where employee_id = v_req.employee_id and year = v_year;
  elsif v_req.type = 'sick' then
    select sick_total, sick_used into v_total, v_used
      from leave_balances where employee_id = v_req.employee_id and year = v_year for update;
    if v_used + v_days > v_total and not public.can_approve() then
      raise exception 'Exceeds the sick balance — only the GM or VP can approve an exception';
    end if;
    update leave_balances set sick_used = sick_used + v_days
      where employee_id = v_req.employee_id and year = v_year;
  end if;  -- personal / permission / unpaid / mission: no deduction

  update leave_requests
    set status = 'approved', reviewed_by = auth.uid(), review_comment = p_comment
    where id = p_request_id;
end;
$$;

revoke execute on function public.decide_leave(uuid, boolean, text) from anon;

-- Approvers (VP) can read requests, balances and attachments like HR does.
drop policy if exists leave_approver_select on leave_requests;
create policy leave_approver_select on leave_requests for select to authenticated
  using (public.can_approve());

drop policy if exists balances_approver_select on leave_balances;
create policy balances_approver_select on leave_balances for select to authenticated
  using (public.can_approve());

drop policy if exists leave_docs_approver_read on storage.objects;
create policy leave_docs_approver_read on storage.objects for select to authenticated
  using (bucket_id = 'leave-docs' and public.can_approve());

-- ---------- 4. Weekly comings-and-goings reports (sales reps) ----------
create table if not exists weekly_reports (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references profiles(id) default auth.uid(),
  week_start date not null,              -- Saturday that starts the week
  days jsonb not null default '[]',      -- [{date, time_in, time_out, notes}]
  status text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rep_id, week_start)
);

alter table weekly_reports enable row level security;

drop policy if exists wr_select on weekly_reports;
create policy wr_select on weekly_reports for select to authenticated
  using (rep_id = auth.uid() or public.is_admin_or_manager() or public.my_role() = 'hr');

drop policy if exists wr_insert on weekly_reports;
create policy wr_insert on weekly_reports for insert to authenticated
  with check (rep_id = auth.uid() and public.my_role() = 'sales_rep');

drop policy if exists wr_update on weekly_reports;
create policy wr_update on weekly_reports for update to authenticated
  using (rep_id = auth.uid()) with check (rep_id = auth.uid());

drop policy if exists wr_delete on weekly_reports;
create policy wr_delete on weekly_reports for delete to authenticated
  using (rep_id = auth.uid() and status = 'draft');

create or replace function public.guard_weekly_report()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'submitted' and not public.is_admin() then
    raise exception 'A submitted weekly report can no longer be changed';
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    if new.week_start + 7 > current_date then
      raise exception 'The weekly report can be submitted only after the week ends';
    end if;
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_weekly_report on weekly_reports;
create trigger trg_guard_weekly_report
  before insert or update on weekly_reports
  for each row execute function public.guard_weekly_report();

-- ---------- 5. Office-supply requests (two-step approval) ----------
create table if not exists office_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) default auth.uid(),
  item text not null,
  qty numeric(10,2) not null default 1 check (qty > 0),
  notes text,
  status text not null default 'pending_finance'
    check (status in ('pending_finance','pending_approval','approved','rejected')),
  finance_by uuid references profiles(id),
  finance_at timestamptz,
  finance_comment text,
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decided_comment text,
  created_at timestamptz not null default now()
);

alter table office_requests enable row level security;

drop policy if exists oreq_select on office_requests;
create policy oreq_select on office_requests for select to authenticated
  using (requester_id = auth.uid() or public.can_approve() or public.is_finance());

drop policy if exists oreq_insert on office_requests;
create policy oreq_insert on office_requests for insert to authenticated
  with check (requester_id = auth.uid());

drop policy if exists oreq_delete on office_requests;
create policy oreq_delete on office_requests for delete to authenticated
  using ((requester_id = auth.uid() and status = 'pending_finance') or public.is_admin());

-- No direct updates: decisions go through this function only.
create or replace function public.decide_office_request(
  p_request_id uuid,
  p_approve boolean,
  p_comment text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_req office_requests%rowtype;
begin
  select * into v_req from office_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_req.status = 'pending_finance' then
    if not public.is_finance() then
      raise exception 'This step is the money check — only the Finance approver (or GM) can decide it';
    end if;
    update office_requests
       set status = case when p_approve then 'pending_approval' else 'rejected' end,
           finance_by = auth.uid(), finance_at = now(), finance_comment = p_comment
     where id = p_request_id;
  elsif v_req.status = 'pending_approval' then
    if not public.can_approve() then
      raise exception 'Only the GM or an approver (VP) can give the final approval';
    end if;
    update office_requests
       set status = case when p_approve then 'approved' else 'rejected' end,
           decided_by = auth.uid(), decided_at = now(), decided_comment = p_comment
     where id = p_request_id;
  else
    raise exception 'This request was already decided';
  end if;
end;
$$;

revoke execute on function public.decide_office_request(uuid, boolean, text) from anon;

notify pgrst, 'reload schema';

-- ---------- Confirmation (you should see one row, all true) ----------
select
  exists (select 1 from information_schema.columns
          where table_name = 'profiles' and column_name = 'is_approver')      as approver_flags_added,
  exists (select 1 from information_schema.tables
          where table_name = 'weekly_reports')                                as weekly_reports_ready,
  exists (select 1 from information_schema.tables
          where table_name = 'office_requests')                               as office_requests_ready,
  (select position('can_approve' in prosrc) > 0 from pg_proc
    where proname = 'guard_po_approval')                                      as po_approval_updated,
  (select position('can_approve' in prosrc) > 0 from pg_proc
    where proname = 'decide_leave')                                           as leave_rules_updated,
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'leave_type' and e.enumlabel = 'permission')      as new_leave_types_added,
  (select column_default like '%30%' from information_schema.columns
    where table_name = 'leave_balances' and column_name = 'annual_total')     as annual_balance_is_30;
