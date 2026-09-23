-- =============================================================================
-- SEED 01 — Core business setup: company, GST slabs, HSN, units, locations,
-- price lists, role permissions.
-- =============================================================================

insert into public.company_settings (legal_name, trade_name, state_code, state_name, city, pincode, fy_start_month, invoice_terms, invoice_footer, whatsapp_number, upi_id, upi_payee_name, phone)
values ('AutoLoom Premium Car Accessories', 'AutoLoom', '09', 'Uttar Pradesh', 'Noida', '201301', 4,
        'Goods once sold will not be taken back. Warranty as per manufacturer terms. Subject to Noida jurisdiction.',
        'Drive Better', '9811000000', 'autoloom@upi', 'AutoLoom', '9811000000')
on conflict do nothing;

insert into public.app_settings (id, value, description) values
  ('dead_stock_days',        '90',    'Days without a sale before a SKU counts as dead stock'),
  ('fast_moving_days',       '30',    'Window used for fast-moving ranking'),
  ('allow_negative_stock',   'true',  'Offline billing must not be blocked by stale stock'),
  ('low_stock_scope',        '"all_locations"', 'all_locations | per_location'),
  ('default_credit_days',    '30',    'Default credit period for new dealer customers'),
  ('margin_floor_pct',       '5',     'Warn when a sale rate leaves less than this margin over avg cost')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- GST slabs (verify against current rules with your CA before production)
-- -----------------------------------------------------------------------------
insert into public.tax_rates (name, rate_pct, cgst_pct, sgst_pct, igst_pct) values
  ('GST 0%',   0,  0,    0,    0),
  ('GST 5%',   5,  2.5,  2.5,  5),
  ('GST 12%', 12,  6,    6,   12),
  ('GST 18%', 18,  9,    9,   18),
  ('GST 28%', 28, 14,   14,   28)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- HSN codes commonly used in auto accessories
-- -----------------------------------------------------------------------------
insert into public.hsn_codes (code, description, default_tax_rate_id)
select v.code, v.descr, tr.id
from (values
  ('8539', 'Electric filament or discharge lamps, sealed beam lamp units', 'GST 18%'),
  ('8512', 'Electrical lighting/signalling equipment, horns, wipers for vehicles', 'GST 28%'),
  ('8708', 'Parts and accessories of motor vehicles', 'GST 28%'),
  ('8714', 'Parts and accessories of vehicles (misc)', 'GST 28%'),
  ('8527', 'Reception apparatus for radio-broadcasting; car audio head units', 'GST 28%'),
  ('8518', 'Loudspeakers, amplifiers, audio-frequency electric amplifier sets', 'GST 18%'),
  ('8525', 'Television cameras, digital cameras and video camera recorders', 'GST 18%'),
  ('8526', 'Radar apparatus, radio navigational aid apparatus (GPS)', 'GST 18%'),
  ('8544', 'Insulated wire, cable and other insulated electric conductors', 'GST 18%'),
  ('8536', 'Electrical apparatus for switching/protecting circuits (relays, fuses)', 'GST 18%'),
  ('4016', 'Other articles of vulcanised rubber (rubber mats)', 'GST 28%'),
  ('3918', 'Floor coverings of plastics (PVC mats)', 'GST 18%'),
  ('5703', 'Carpets and other textile floor coverings, tufted', 'GST 12%'),
  ('9401', 'Seats and parts thereof (seat covers)', 'GST 18%'),
  ('3405', 'Polishes and creams for coachwork (detailing)', 'GST 18%'),
  ('9987', 'Maintenance, repair and installation services (labour)', 'GST 18%')
) as v(code, descr, rate)
join public.tax_rates tr on tr.name = v.rate
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Units
-- -----------------------------------------------------------------------------
insert into public.units (code, name, allow_decimal) values
  ('pcs', 'Pieces', false),
  ('set', 'Set', false),
  ('pair', 'Pair', false),
  ('kit', 'Kit', false),
  ('box', 'Box', false),
  ('mtr', 'Metre', true),
  ('ltr', 'Litre', true)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Locations
-- -----------------------------------------------------------------------------
insert into public.locations (code, name, type, sort_order) values
  ('MAIN', 'Main Warehouse', 'warehouse', 1),
  ('SHOP', 'Shop Counter',   'shop',      2),
  ('WSHP', 'Workshop',       'workshop',  3),
  ('DMGD', 'Damaged / Returns', 'damaged', 9)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Price lists
-- -----------------------------------------------------------------------------
insert into public.price_lists (code, name, price_column, is_default) values
  ('retail',    'Retail',    'retail_price',    true),
  ('dealer',    'Dealer',    'dealer_price',    false),
  ('wholesale', 'Wholesale', 'wholesale_price', false)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Role permissions
-- -----------------------------------------------------------------------------
insert into public.role_permissions (role, permission)
select r.role, p.permission
from (values
  -- permission,                 admin owner purch sales whse  acct  wshop
  ('catalog.view',                true, true, true, true, true, true, true),
  ('catalog.edit',                true, true, false,false,false,false,false),
  ('catalog.edit_price',          true, true, false,false,false,false,false),
  ('catalog.view_cost',           true, true, true, false,false,true, false),
  ('purchase.create',             true, true, true, false,true, false,false),
  ('purchase.cancel',             true, true, false,false,false,false,false),
  ('sale.create',                 true, true, false,true, false,false,true),
  ('sale.override_price',         true, true, false,false,false,false,false),
  ('sale.override_credit',        true, true, false,false,false,false,false),
  ('sale.cancel',                 true, true, false,false,false,false,false),
  ('sale.return',                 true, true, false,true, false,true, false),
  ('payment.receive',             true, true, false,true, false,true, true),
  ('payment.pay_supplier',        true, true, true, false,false,true, false),
  ('expense.record',              true, true, false,false,false,true, false),
  ('stock.transfer',              true, true, false,false,true, false,true),
  ('stock.count',                 true, true, false,false,true, false,true),
  ('stock.adjust',                true, true, false,false,false,false,false),
  ('party.edit',                  true, true, true, true, false,true, false),
  ('party.edit_credit_limit',     true, true, false,false,false,false,false),
  ('jobcard.edit',                true, true, false,false,false,false,true),
  ('reports.view',                true, true, false,false,false,true, false),
  ('reports.view_margin',         true, true, false,false,false,false,false),
  -- The owner hires the staff and sets the shop's own details; see
  -- migration 20260922140000. Kept in step with it so a db reset agrees.
  ('admin.users',                 true, true, false,false,false,false,false),
  ('admin.settings',              true, true, false,false,false,false,false)
) as p(permission, a, o, pu, s, w, ac, ws)
cross join lateral (values
  ('admin', p.a), ('owner', p.o), ('purchase', p.pu), ('sales', p.s),
  ('warehouse', p.w), ('accounts', p.ac), ('workshop', p.ws)
) as r(role, granted)
where r.granted
on conflict (role, permission) do nothing;

-- -----------------------------------------------------------------------------
-- Numbering series (one per billing device; 'A' is the shop counter)
-- -----------------------------------------------------------------------------
insert into public.document_sequences (series_code, doc_type, financial_year, prefix, next_number, location_id)
select v.series, v.doc_type, '26-27', v.prefix, 1, l.id
from (values
  ('A', 'sales_invoice',    'NOI/A/26-27/', 'SHOP'),
  ('A', 'credit_note',      'CN/A/26-27/',  'SHOP'),
  ('A', 'payment_in',       'RCP/26-27/',   'SHOP'),
  ('A', 'purchase',         'PUR/26-27/',   'MAIN'),
  ('A', 'debit_note',       'DN/26-27/',    'MAIN'),
  ('A', 'payment_out',      'PAY/26-27/',   'MAIN'),
  ('A', 'stock_adjustment', 'ADJ/26-27/',   'MAIN'),
  ('A', 'stock_transfer',   'TRF/26-27/',   'MAIN'),
  ('A', 'stock_audit',      'AUD/26-27/',   'MAIN'),
  ('A', 'job_card',         'JOB/26-27/',   'WSHP')
) as v(series, doc_type, prefix, loc)
join public.locations l on l.code = v.loc
on conflict (series_code, doc_type, financial_year) do nothing;
