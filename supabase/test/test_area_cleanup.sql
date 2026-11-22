-- ============================================================
-- MD Portal — TEST-area cleanup
-- Deletes ONLY records belonging to the test sandbox:
--   hospital  named exactly 'TEST Hospital'
--   warehouse named exactly 'TEST Warehouse'
--   product   with SKU 'TEST-001' (name 'TEST Product')
-- and every movement/record that references them.
-- Real hospitals, warehouses and products are never matched.
-- Idempotent: safe to run repeatedly; deleting nothing is a no-op.
-- Run in Supabase Dashboard → SQL Editor when testing is finished.
-- ============================================================

begin;

-- Everything is scoped through these three sets and nothing else.
-- Matching is case-insensitive: 'TEST Hospital', 'Test Hospital', etc. all match.
create temp table _test_hospitals on commit drop as
  select id from hospitals where lower(name) = 'test hospital';
create temp table _test_locations on commit drop as
  select id from locations
  where lower(name) = 'test warehouse'
     or hospital_id in (select id from _test_hospitals);
create temp table _test_products on commit drop as
  select id from products
  where lower(sku) = 'test-001' or lower(name) = 'test product';

-- 1. Consignment paperwork tied to the TEST hospital (defensive; Phase 3+)
delete from usage_invoice_lines where invoice_id in
  (select id from usage_invoices where hospital_id in (select id from _test_hospitals));
delete from usage_invoices where hospital_id in (select id from _test_hospitals);
delete from visits where hospital_id in (select id from _test_hospitals);
delete from shelf_count_lines where shelf_count_id in
  (select id from shelf_counts where hospital_id in (select id from _test_hospitals));
delete from shelf_count_lines where product_id in (select id from _test_products);
delete from shelf_counts where hospital_id in (select id from _test_hospitals);

-- 2. Purchasing lines that reference the TEST product (defensive; Phase 4+)
delete from quotation_lines where product_id in (select id from _test_products);
delete from quotations where hospital_id in (select id from _test_hospitals);
delete from purchase_order_lines where product_id in (select id from _test_products);

-- 3. Stock movements touching TEST locations or the TEST product.
-- These are sandbox rows, not regulatory records, so they are removed
-- outright — they vanish from stock on hand, alerts and reports.
delete from stock_movements
where product_id in (select id from _test_products)
   or from_location_id in (select id from _test_locations)
   or to_location_id   in (select id from _test_locations);

-- 4. The TEST hospital (its contacts, deals, activities and shelf
--    location are removed automatically with it) and the TEST warehouse.
delete from hospitals where id in (select id from _test_hospitals);
delete from locations where id in (select id from _test_locations);

-- 5. The TEST product.
delete from products where id in (select id from _test_products);

-- 6. Resync the invoice counter to the highest invoice number that still
--    exists this year, so numbering continues correctly after TEST invoices
--    are removed (back to 0 when none remain — first real invoice is INV-1).
--    Counters only move DOWN to a truthful value; numbers are never reused.
update doc_counters dc
set last_seq = coalesce((
  select max(split_part(ui.invoice_no, '-', 2)::int)
  from usage_invoices ui
  where ui.invoice_no like 'INV-%-MD-' || dc.year
), 0)
where dc.kind = 'invoice';

commit;
