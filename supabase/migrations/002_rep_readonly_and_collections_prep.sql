-- ============================================================
-- MD Portal — Migration 002
-- 1) Sales reps: READ-ONLY view of all hospitals & contacts
--    (edits / activity still restricted to their own hospitals)
-- 2) Collections design-ahead: due_date on usage_invoices,
--    structure ready for a future payments table (partial payments)
-- 3) Phase 2 plumbing: auto-create a consignment location per
--    hospital + a stock-on-hand view computed from the ledger
-- Run in Supabase Dashboard → SQL Editor after 001.
-- ============================================================

-- ---------- 1. Rep read-only visibility ----------
drop policy hospitals_rep_select on hospitals;
create policy hospitals_rep_select on hospitals for select to authenticated
  using (public.my_role() = 'sales_rep');   -- all hospitals, read-only

drop policy contacts_rep_all on contacts;
create policy contacts_rep_select on contacts for select to authenticated
  using (public.my_role() = 'sales_rep');   -- all contacts, read-only
create policy contacts_rep_insert on contacts for insert to authenticated
  with check (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id));
create policy contacts_rep_update on contacts for update to authenticated
  using (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id))
  with check (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id));
create policy contacts_rep_delete on contacts for delete to authenticated
  using (public.my_role() = 'sales_rep' and public.owns_hospital(hospital_id));

-- ---------- 2. Collections design-ahead ----------
-- Payment terms are nominally 90 days; Phase 3's approval function will
-- default due_date = invoice_date + 90. Nullable so old/edge rows are valid.
alter table usage_invoices add column due_date date;

create index usage_invoices_hospital_idx on usage_invoices (hospital_id);

comment on table usage_invoices is
  'Operational invoice record (not the books). Design-ahead for a future '
  'collections phase: a payments table will reference invoice_id with '
  'amount + paid_at rows (partial payments / installments). Outstanding '
  'balance per hospital = sum(usage_invoices.total) - sum(payments.amount), '
  'grouped by hospital_id. Do not store balance columns — always derive.';

-- ---------- 3. Consignment location per hospital ----------
create or replace function public.create_hospital_location()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into locations (type, hospital_id, name) values ('hospital', new.id, new.name);
  return new;
end;
$$;
create trigger trg_hospital_location
  after insert on hospitals
  for each row execute function public.create_hospital_location();

-- Keep the location name in sync if a hospital is renamed.
create or replace function public.sync_hospital_location_name()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update locations set name = new.name where hospital_id = new.id;
  return new;
end;
$$;
create trigger trg_sync_hospital_location
  after update of name on hospitals
  for each row execute function public.sync_hospital_location_name();

-- Backfill any hospitals created before this migration.
insert into locations (type, hospital_id, name)
select 'hospital', h.id, h.name from hospitals h
where not exists (select 1 from locations l where l.hospital_id = h.id);

-- ---------- 4. Stock on hand (computed from the ledger) ----------
-- security_invoker: the view respects each user's RLS on stock_movements.
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
