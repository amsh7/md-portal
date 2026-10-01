-- Acrostak product catalog seed (from "Acrostak Products.docx", 2026-10-01)
-- SKU scheme: ACR-### (manufacturer prefix + sequence).
-- price_egp left at 0 — prices to be set later in the app (Inventory → Products → Edit).
-- Idempotent: re-running skips SKUs that already exist.

insert into products (sku, name, manufacturer, category, unit, price_egp, active) values
  ('ACR-001', 'Across HP',                                      'Acrostak', 'Interventional Cardiology', 'unit', 0, true),
  ('ACR-002', 'Across CTO RX',                                  'Acrostak', 'Interventional Cardiology', 'unit', 0, true),
  ('ACR-003', 'Across CTO ST',                                  'Acrostak', 'Interventional Cardiology', 'unit', 0, true),
  ('ACR-004', 'M-CATH Flexy 135 cm (for Antegrade technique)',  'Acrostak', 'Interventional Cardiology', 'unit', 0, true),
  ('ACR-005', 'M-CATH Flexy 150 cm (for Retrograde technique)', 'Acrostak', 'Interventional Cardiology', 'unit', 0, true),
  ('ACR-006', 'GRIP TT',                                        'Acrostak', 'Interventional Cardiology', 'unit', 0, true)
on conflict (sku) do nothing;
