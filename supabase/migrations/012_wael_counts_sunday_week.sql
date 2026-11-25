-- ============================================================
-- MD Portal — Migration 012: two rule tweaks (Nov 2026)
-- Idempotent: safe to run repeatedly in Supabase SQL Editor.
--
--   1) Shelf-count approval: Wael (manager) is allowed again,
--      alongside the GM and any flagged approver (VP).
--   2) Work week is Sunday–Thursday: the weekly rep report can be
--      submitted from Friday on (was: only from Saturday).
--   3) Admin may delete a weekly report (test data / mistakes).
-- ============================================================

-- ---------- 1. Shelf counts: manager OR GM/approver ----------
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
  if (public.is_admin_or_manager() or public.can_approve()) is distinct from true then
    raise exception 'Only a manager, the GM or an approver (VP) can approve shelf counts';
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

-- ---------- 2. Week = Sunday–Thursday: submit allowed from Friday ----------
create or replace function public.guard_weekly_report()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'submitted' and not public.is_admin() then
    raise exception 'A submitted weekly report can no longer be changed';
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    -- week_start is a Sunday; working days run to Thursday (week_start + 4),
    -- so submitting is allowed from Friday (week_start + 5) on.
    if new.week_start + 5 > current_date then
      raise exception 'The weekly report can be submitted only after the week ends';
    end if;
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

-- ---------- 3. Admin may delete weekly reports ----------
drop policy if exists wr_delete on weekly_reports;
create policy wr_delete on weekly_reports for delete to authenticated
  using ((rep_id = auth.uid() and status = 'draft') or public.is_admin());

-- Remove the Saturday-based TEST report Kamal submitted during testing
-- (the week grid is Sunday-based from now on).
delete from weekly_reports where week_start = '2026-11-14';

notify pgrst, 'reload schema';

-- ---------- Confirmation (you should see one row, all true) ----------
select
  (select position('is_admin_or_manager' in prosrc) > 0 from pg_proc
    where proname = 'approve_shelf_count')                                    as wael_can_approve_counts,
  (select position('+ 5' in prosrc) > 0 from pg_proc
    where proname = 'guard_weekly_report')                                    as sunday_week_applied,
  not exists (select 1 from weekly_reports where week_start = '2026-11-14')   as old_test_report_removed;
