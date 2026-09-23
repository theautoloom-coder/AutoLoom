-- =============================================================================
-- SEED 04 — Working sample data.
-- Brands, real-shaped products with specs/variants/fitments, parties, opening
-- stock, and staff logins. Replace with your own catalogue via the Import tool.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Staff logins (local development only — change passwords before go-live)
-- -----------------------------------------------------------------------------

select seed_util.seed_user('admin@autoloom.local',     'autoloom123', 'System Admin',   'admin',     'MAIN');
select seed_util.seed_user('owner@autoloom.local',     'autoloom123', 'Business Owner', 'owner',     'MAIN');
select seed_util.seed_user('purchase@autoloom.local',  'autoloom123', 'Purchase Staff', 'purchase',  'MAIN');
select seed_util.seed_user('sales@autoloom.local',     'autoloom123', 'Counter Sales',  'sales',     'SHOP');
select seed_util.seed_user('warehouse@autoloom.local', 'autoloom123', 'Warehouse Staff','warehouse', 'MAIN');
select seed_util.seed_user('accounts@autoloom.local',  'autoloom123', 'Accountant',     'accounts',  'MAIN');
select seed_util.seed_user('workshop@autoloom.local',  'autoloom123', 'Workshop Tech',  'workshop',  'WSHP');

-- -----------------------------------------------------------------------------
-- Brands
-- -----------------------------------------------------------------------------
insert into public.brands (name, code) values
  ('Philips','PHL'), ('Osram','OSR'), ('Autofy','AFY'), ('Hella','HEL'),
  ('Roots','RTS'), ('Bosch','BSH'), ('Minda','MND'), ('Elegant','ELG'),
  ('Kingsway','KNG'), ('Autoform','AFM'), ('Sony','SNY'), ('Pioneer','PNR'),
  ('JBL','JBL'), ('Blaupunkt','BLP'), ('Generic','GEN')
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- Helpers to build a product with specs, variants and fitments
-- -----------------------------------------------------------------------------

-- Set a product-level spec (variant_id null) or variant-level spec.




-- Opening stock as a movement (the only legitimate way stock appears)

-- =============================================================================
-- Sample catalogue
-- =============================================================================
do $$
declare
  p uuid; v uuid;
begin
  -- ---------------------------------------------------------------------------
  -- 1. LED headlight bulb range: one product, five socket variants
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('LED', 'Autofy', 'Autofy Ultra X1 LED Headlight Bulb', true);
  perform seed_util.set_spec(p, null, 'LED', 'lumens',   '12000');
  perform seed_util.set_spec(p, null, 'LED', 'voltage',  '12-24V');
  perform seed_util.set_spec(p, null, 'LED', 'cct',      '6500K Cool White');
  perform seed_util.set_spec(p, null, 'LED', 'canbus',   'Yes');
  perform seed_util.set_spec(p, null, 'LED', 'cooling',  'Fan');
  perform seed_util.set_spec(p, null, 'LED', 'beam',     'Hi/Lo');
  perform seed_util.set_spec(p, null, 'LED', 'chip',     'CSP 3570');
  perform seed_util.set_spec(p, null, 'LED', 'polarity', 'Polarity Free');
  perform seed_util.set_spec(p, null, 'LED', 'warranty', '12');

  v := seed_util.new_variant(p, 'H4 60W Pair',  'LED-AFY-H4-60W',  '8901234500011', 3200, 2400, 1900, 1750, 1700, 15);
  perform seed_util.set_spec(p, v, 'LED', 'socket', 'H4');
  perform seed_util.set_spec(p, v, 'LED', 'wattage', '60');
  perform seed_util.set_spec(p, v, 'LED', 'pack', 'Pair');
  perform seed_util.open_stock(v, 'MAIN', 25, 1450);
  perform seed_util.open_stock(v, 'SHOP', 6,  1450);

  v := seed_util.new_variant(p, 'H7 60W Pair',  'LED-AFY-H7-60W',  '8901234500028', 3200, 2400, 1900, 1750, 1700, 15);
  perform seed_util.set_spec(p, v, 'LED', 'socket', 'H7');
  perform seed_util.set_spec(p, v, 'LED', 'wattage', '60');
  perform seed_util.set_spec(p, v, 'LED', 'pack', 'Pair');
  perform seed_util.open_stock(v, 'MAIN', 18, 1450);

  v := seed_util.new_variant(p, 'H11 60W Pair', 'LED-AFY-H11-60W', '8901234500035', 3200, 2400, 1900, 1750, 1700, 15);
  perform seed_util.set_spec(p, v, 'LED', 'socket', 'H11');
  perform seed_util.set_spec(p, v, 'LED', 'wattage', '60');
  perform seed_util.set_spec(p, v, 'LED', 'pack', 'Pair');
  perform seed_util.open_stock(v, 'MAIN', 32, 1450);

  v := seed_util.new_variant(p, 'HB3 60W Pair', 'LED-AFY-HB3-60W', '8901234500042', 3200, 2400, 1900, 1750, 1700, 10);
  perform seed_util.set_spec(p, v, 'LED', 'socket', 'HB3');
  perform seed_util.set_spec(p, v, 'LED', 'wattage', '60');
  perform seed_util.set_spec(p, v, 'LED', 'pack', 'Pair');
  perform seed_util.open_stock(v, 'MAIN', 9, 1450);

  v := seed_util.new_variant(p, 'HB4 60W Pair', 'LED-AFY-HB4-60W', '8901234500059', 3200, 2400, 1900, 1750, 1700, 10);
  perform seed_util.set_spec(p, v, 'LED', 'socket', 'HB4');
  perform seed_util.set_spec(p, v, 'LED', 'wattage', '60');
  perform seed_util.set_spec(p, v, 'LED', 'pack', 'Pair');
  perform seed_util.open_stock(v, 'MAIN', 4, 1450);

  -- ---------------------------------------------------------------------------
  -- 2. Philips halogen H4 — the everyday seller
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('HAL', 'Philips', 'Philips X-tremeVision Halogen', true);
  perform seed_util.set_spec(p, null, 'HAL', 'voltage', '12V');
  perform seed_util.set_spec(p, null, 'HAL', 'cct', '3000K Golden Yellow');
  perform seed_util.set_spec(p, null, 'HAL', 'beam', 'Hi/Lo');
  perform seed_util.set_spec(p, null, 'HAL', 'warranty', '6');

  v := seed_util.new_variant(p, 'H4 60/55W Single', 'HAL-PHL-H4-60W', '8901234500110', 620, 480, 395, 370, 360, 40);
  perform seed_util.set_spec(p, v, 'HAL', 'socket', 'H4');
  perform seed_util.set_spec(p, v, 'HAL', 'wattage', '60');
  perform seed_util.set_spec(p, v, 'HAL', 'pack', 'Single');
  perform seed_util.open_stock(v, 'MAIN', 180, 305);
  perform seed_util.open_stock(v, 'SHOP', 24,  305);

  v := seed_util.new_variant(p, 'H7 55W Single', 'HAL-PHL-H7-55W', '8901234500127', 640, 495, 410, 385, 375, 40);
  perform seed_util.set_spec(p, v, 'HAL', 'socket', 'H7');
  perform seed_util.set_spec(p, v, 'HAL', 'wattage', '55');
  perform seed_util.set_spec(p, v, 'HAL', 'pack', 'Single');
  perform seed_util.open_stock(v, 'MAIN', 140, 318);

  -- ---------------------------------------------------------------------------
  -- 3. 7D mats — Creta specific, two colours (the classic fitment product)
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('MAT', 'Elegant', 'Elegant 7D Luxury Car Mat', false);
  perform seed_util.set_spec(p, null, 'MAT', 'mat_type',   '7D');
  perform seed_util.set_spec(p, null, 'MAT', 'material',   'Leatherette');
  perform seed_util.set_spec(p, null, 'MAT', 'rows',       '3 Rows');
  perform seed_util.set_spec(p, null, 'MAT', 'coverage',   'Full Set');
  perform seed_util.set_spec(p, null, 'MAT', 'thickness',  '12');
  perform seed_util.set_spec(p, null, 'MAT', 'antislip',   'Yes');
  perform seed_util.set_spec(p, null, 'MAT', 'waterproof', 'Yes');
  perform seed_util.set_spec(p, null, 'MAT', 'seat_config','5 Seater');
  perform seed_util.set_spec(p, null, 'MAT', 'warranty',   '12');

  v := seed_util.new_variant(p, 'Creta 2024+ Black', 'MAT-ELG-CRETA-7D-BLK', '8901234500210', 8500, 6200, 4600, 4300, 4200, 4);
  perform seed_util.set_spec(p, v, 'MAT', 'colour', 'Black');
  perform seed_util.set_spec(p, v, 'MAT', 'border', 'Contrast Stitch');
  perform seed_util.add_fitment(p, v, 'Creta', 'Facelift 2024+', 'full_set');
  perform seed_util.open_stock(v, 'MAIN', 11, 3350);
  perform seed_util.open_stock(v, 'SHOP', 2,  3350);

  v := seed_util.new_variant(p, 'Creta 2024+ Brown', 'MAT-ELG-CRETA-7D-BRN', '8901234500227', 8500, 6200, 4600, 4300, 4200, 4);
  perform seed_util.set_spec(p, v, 'MAT', 'colour', 'Brown');
  perform seed_util.set_spec(p, v, 'MAT', 'border', 'Piping');
  perform seed_util.add_fitment(p, v, 'Creta', 'Facelift 2024+', 'full_set');
  perform seed_util.open_stock(v, 'MAIN', 6, 3350);

  v := seed_util.new_variant(p, 'Seltos 2023+ Black', 'MAT-ELG-SELTOS-7D-BLK', '8901234500234', 8500, 6200, 4600, 4300, 4200, 4);
  perform seed_util.set_spec(p, v, 'MAT', 'colour', 'Black');
  perform seed_util.set_spec(p, v, 'MAT', 'border', 'Contrast Stitch');
  perform seed_util.add_fitment(p, v, 'Seltos', 'Facelift 2023+', 'full_set');
  perform seed_util.open_stock(v, 'MAIN', 7, 3350);

  -- ---------------------------------------------------------------------------
  -- 4. 5D mat, PVC, cheaper line — Swift
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('MAT', 'Kingsway', 'Kingsway 5D Premium Mat', false);
  perform seed_util.set_spec(p, null, 'MAT', 'mat_type', '5D');
  perform seed_util.set_spec(p, null, 'MAT', 'material', 'PVC');
  perform seed_util.set_spec(p, null, 'MAT', 'rows',     '2 Rows');
  perform seed_util.set_spec(p, null, 'MAT', 'coverage', 'Full Set');
  perform seed_util.set_spec(p, null, 'MAT', 'antislip', 'Yes');
  perform seed_util.set_spec(p, null, 'MAT', 'warranty', '6');

  v := seed_util.new_variant(p, 'Swift 2024+ Black', 'MAT-KNG-SWIFT-5D-BLK', '8901234500310', 4200, 3100, 2350, 2200, 2150, 4);
  perform seed_util.set_spec(p, v, 'MAT', 'colour', 'Black');
  perform seed_util.add_fitment(p, v, 'Swift', '4th Gen 2024+', 'full_set');
  perform seed_util.open_stock(v, 'MAIN', 9, 1680);

  v := seed_util.new_variant(p, 'Swift 2018-2023 Beige', 'MAT-KNG-SWIFT-5D-BEI', '8901234500327', 4200, 3100, 2350, 2200, 2150, 4);
  perform seed_util.set_spec(p, v, 'MAT', 'colour', 'Beige');
  perform seed_util.add_fitment(p, v, 'Swift', '3rd Gen 2018-2023', 'full_set');
  perform seed_util.open_stock(v, 'MAIN', 3, 1680);

  -- ---------------------------------------------------------------------------
  -- 5. Roots windtone horn — universal, twin
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('HORN', 'Roots', 'Roots Windtone Trumpet Horn', true);
  perform seed_util.set_spec(p, null, 'HORN', 'voltage',    '12V');
  perform seed_util.set_spec(p, null, 'HORN', 'db',         '118');
  perform seed_util.set_spec(p, null, 'HORN', 'frequency',  '400/500 Hz');
  perform seed_util.set_spec(p, null, 'HORN', 'compressor', 'No');
  perform seed_util.set_spec(p, null, 'HORN', 'connector',  'Twin Pin');
  perform seed_util.set_spec(p, null, 'HORN', 'colour',     'Black');
  perform seed_util.set_spec(p, null, 'HORN', 'relay_included', 'Yes');
  perform seed_util.set_spec(p, null, 'HORN', 'warranty',   '12');

  v := seed_util.new_variant(p, 'Windtone Twin', 'HORN-RTS-WIND-TWIN', '8901234500410', 1850, 1350, 1050, 980, 950, 10);
  perform seed_util.set_spec(p, v, 'HORN', 'horn_type', 'Windtone');
  perform seed_util.set_spec(p, v, 'HORN', 'config',    'Twin');
  perform seed_util.open_stock(v, 'MAIN', 22, 760);
  perform seed_util.open_stock(v, 'SHOP', 4,  760);

  v := seed_util.new_variant(p, 'Disc Twin', 'HORN-RTS-DISC-TWIN', '8901234500427', 1450, 1100, 860, 810, 790, 10);
  perform seed_util.set_spec(p, v, 'HORN', 'horn_type', 'Disc');
  perform seed_util.set_spec(p, v, 'HORN', 'config',    'Twin');
  perform seed_util.open_stock(v, 'MAIN', 14, 610);

  -- ---------------------------------------------------------------------------
  -- 6. Vehicle-specific fog lamp assembly — fits three cars
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('FGA', 'Autofy', 'Autofy Bi-LED Fog Lamp Assembly Kit', false);
  perform seed_util.set_spec(p, null, 'FGA', 'wiring_included', 'Yes');
  perform seed_util.set_spec(p, null, 'FGA', 'switch_included', 'Yes');
  perform seed_util.set_spec(p, null, 'FGA', 'bezel',           'Included');
  perform seed_util.set_spec(p, null, 'FGA', 'warranty',        '12');

  v := seed_util.new_variant(p, 'Bi-LED Dual Colour', 'FGA-AFY-BILED-DUAL', '8901234500510', 9500, 7200, 5400, 5100, 5000, 3);
  perform seed_util.set_spec(p, v, 'FGA', 'tech', 'Bi-LED Projector');
  perform seed_util.set_spec(p, v, 'FGA', 'cct',  'Dual Colour');
  perform seed_util.add_fitment(p, v, 'Creta', 'Facelift 2024+', 'both');
  perform seed_util.add_fitment(p, v, 'Seltos', 'Facelift 2023+', 'both');
  perform seed_util.add_fitment(p, v, 'Sonet',  'Facelift 2024+', 'both');
  perform seed_util.open_stock(v, 'MAIN', 5, 3900);

  -- ---------------------------------------------------------------------------
  -- 7. Reverse camera — universal electronics
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('CAM', 'Blaupunkt', 'Blaupunkt AHD Reverse Camera', true);
  perform seed_util.set_spec(p, null, 'CAM', 'night_vision', 'IR LED');
  perform seed_util.set_spec(p, null, 'CAM', 'ip',           'IP67');
  perform seed_util.set_spec(p, null, 'CAM', 'guidelines',   'Yes');
  perform seed_util.set_spec(p, null, 'CAM', 'angle',        '170');
  perform seed_util.set_spec(p, null, 'CAM', 'voltage',      '12V');
  perform seed_util.set_spec(p, null, 'CAM', 'connector',    'RCA');
  perform seed_util.set_spec(p, null, 'CAM', 'warranty',     '12');

  v := seed_util.new_variant(p, 'AHD 1080P Butterfly', 'CAM-BLP-AHD-1080P-BFLY', '8901234500610', 3500, 2600, 1980, 1850, 1800, 6);
  perform seed_util.set_spec(p, v, 'CAM', 'signal',     'AHD');
  perform seed_util.set_spec(p, v, 'CAM', 'resolution', '1080P');
  perform seed_util.set_spec(p, v, 'CAM', 'shape',      'Butterfly');
  perform seed_util.open_stock(v, 'MAIN', 12, 1420);

  -- ---------------------------------------------------------------------------
  -- 8. Android screen — high value, serial tracked in practice
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('ANDR', 'Pioneer', 'Pioneer Smart Android Stereo', false);
  perform seed_util.set_spec(p, null, 'ANDR', 'android_version', 'Android 13');
  perform seed_util.set_spec(p, null, 'ANDR', 'resolution',      '1920x1080');
  perform seed_util.set_spec(p, null, 'ANDR', 'processor',       'Octa-core UIS7862');
  perform seed_util.set_spec(p, null, 'ANDR', 'dsp',             'Yes');
  perform seed_util.set_spec(p, null, 'ANDR', 'carplay',         'Yes');
  perform seed_util.set_spec(p, null, 'ANDR', 'android_auto',    'Wireless');
  perform seed_util.set_spec(p, null, 'ANDR', 'sim',             'Yes');
  perform seed_util.set_spec(p, null, 'ANDR', 'camera_support',  'Yes');
  perform seed_util.set_spec(p, null, 'ANDR', 'frame_included',  'Yes');
  perform seed_util.set_spec(p, null, 'ANDR', 'warranty',        '12');

  v := seed_util.new_variant(p, '10 inch 4+64GB', 'ANDR-PNR-10-4G64', '8901234500710', 32000, 24500, 19500, 18500, 18000, 2);
  perform seed_util.set_spec(p, v, 'ANDR', 'screen_size', '10 inch');
  perform seed_util.set_spec(p, v, 'ANDR', 'ram_rom',     '4+64GB');
  perform seed_util.add_fitment(p, v, 'Creta', 'Facelift 2024+');
  perform seed_util.add_fitment(p, v, 'Seltos', 'Facelift 2023+');
  perform seed_util.open_stock(v, 'MAIN', 4, 15200);

  v := seed_util.new_variant(p, '10 inch 8+128GB', 'ANDR-PNR-10-8G128', '8901234500727', 42000, 32500, 26000, 24800, 24000, 2);
  perform seed_util.set_spec(p, v, 'ANDR', 'screen_size', '10 inch');
  perform seed_util.set_spec(p, v, 'ANDR', 'ram_rom',     '8+128GB');
  perform seed_util.add_fitment(p, v, 'Creta', 'Facelift 2024+');
  perform seed_util.open_stock(v, 'MAIN', 2, 20400);

  -- ---------------------------------------------------------------------------
  -- 9. Seat cover — custom fit, Creta
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('SEAT', 'Autoform', 'Autoform Nappa Custom Seat Cover', false);
  perform seed_util.set_spec(p, null, 'SEAT', 'airbag',    'Yes');
  perform seed_util.set_spec(p, null, 'SEAT', 'stitching', 'Double thread, heat sealed');
  perform seed_util.set_spec(p, null, 'SEAT', 'headrest',  'Included');
  perform seed_util.set_spec(p, null, 'SEAT', 'warranty',  '12');

  v := seed_util.new_variant(p, 'Creta Black Diamond 5S', 'SEAT-AFM-CRETA-BLK-5S', '8901234500810', 18000, 13500, 10200, 9700, 9500, 2);
  perform seed_util.set_spec(p, v, 'SEAT', 'fit',      'Custom Fit');
  perform seed_util.set_spec(p, v, 'SEAT', 'material', 'Nappa');
  perform seed_util.set_spec(p, v, 'SEAT', 'colour',   'Black');
  perform seed_util.set_spec(p, v, 'SEAT', 'pattern',  'Diamond Stitch');
  perform seed_util.set_spec(p, v, 'SEAT', 'seats',    '5 Seater');
  perform seed_util.add_fitment(p, v, 'Creta', 'Facelift 2024+');
  perform seed_util.open_stock(v, 'MAIN', 3, 7600);

  -- ---------------------------------------------------------------------------
  -- 10. Installation labour (a service line on invoices and job cards)
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('SRVC', 'Generic', 'Installation Labour', true);
  perform seed_util.set_spec(p, null, 'SRVC', 'duration', '1-2');
  v := seed_util.new_variant(p, 'Headlight / Bulb Fitting', 'SRV-GEN-INST-BULB', null, 0, 300, 300, 300, 200, 0);
  perform seed_util.set_spec(p, v, 'SRVC', 'service_type', 'Installation');
  v := seed_util.new_variant(p, 'Android Screen Fitting', 'SRV-GEN-INST-ANDR', null, 0, 1500, 1500, 1500, 1000, 0);
  perform seed_util.set_spec(p, v, 'SRVC', 'service_type', 'Installation');
  v := seed_util.new_variant(p, 'Fog Lamp Wiring Work', 'SRV-GEN-WIRE-FOG', null, 0, 1200, 1200, 1200, 800, 0);
  perform seed_util.set_spec(p, v, 'SRVC', 'service_type', 'Wiring Work');

  -- ---------------------------------------------------------------------------
  -- 11. Dead stock example — nothing sold, old colour
  -- ---------------------------------------------------------------------------
  p := seed_util.new_product('MAT', 'Kingsway', 'Kingsway 3D Economy Mat', false);
  perform seed_util.set_spec(p, null, 'MAT', 'mat_type', '3D');
  perform seed_util.set_spec(p, null, 'MAT', 'material', 'PVC');
  perform seed_util.set_spec(p, null, 'MAT', 'rows',     '2 Rows');
  perform seed_util.set_spec(p, null, 'MAT', 'coverage', 'Full Set');
  v := seed_util.new_variant(p, 'Alto 800 Ivory', 'MAT-KNG-ALTO-3D-IVY', '8901234500910', 2600, 1900, 1450, 1380, 1350, 2);
  perform seed_util.set_spec(p, v, 'MAT', 'colour', 'Ivory');
  perform seed_util.add_fitment(p, v, 'Alto', 'Alto 800 2012-2022', 'full_set');
  perform seed_util.open_stock(v, 'MAIN', 14, 800);
end;
$$;

-- =============================================================================
-- Customers and suppliers
-- =============================================================================
insert into public.customers
  (code, name, business_name, owner_name, mobile, gstin, address_line1, city, state_code, state_name, pincode,
   customer_type, price_list_id, credit_limit, credit_days)
select c.code, c.name, c.biz, c.owner, c.mobile, c.gstin, c.addr, c.city, c.state_code, c.state, c.pin,
       c.ctype, pl.id, c.limit_amt, c.days
from (values
  ('C0001','XYZ Accessories','XYZ Accessories','Rakesh Gupta','9811001100','09ABCDE1234F1Z5',
   'Shop 14, Sector 10 Market','Noida','09','Uttar Pradesh','201301','dealer','dealer',100000,30),
  ('C0002','ABC Auto Care','ABC Auto Care & Modification','Imran Khan','9811002200','09PQRST5678G1Z2',
   'B-45, Sector 63','Noida','09','Uttar Pradesh','201301','workshop','dealer',150000,30),
  ('C0003','Speed Motors','Speed Motors','Sandeep Yadav','9811003300','09LMNOP9012H1Z8',
   'Main Road, Ghaziabad','Ghaziabad','09','Uttar Pradesh','201001','dealer','dealer',75000,21),
  ('C0004','Delhi Car Studio','Delhi Car Studio','Vikram Singh','9811004400','07UVWXY3456J1Z4',
   'Karol Bagh','New Delhi','07','Delhi','110005','wholesale','wholesale',200000,45),
  ('C0005','Walk-in Customer',null,null,null,null,null,'Noida','09','Uttar Pradesh','201301','retail','retail',0,0)
) as c(code, name, biz, owner, mobile, gstin, addr, city, state_code, state, pin, ctype, plist, limit_amt, days)
join public.price_lists pl on pl.code = c.plist
on conflict (code) do nothing;

insert into public.suppliers
  (code, name, company_name, contact_person, mobile, gstin, address_line1, city, state_code, state_name, pincode, payment_terms_days)
values
  ('S0001','Bright Auto Imports','Bright Auto Imports Pvt Ltd','Manoj Jain','9899001100','07AABCU9603R1ZM',
   'Kashmere Gate Auto Market','New Delhi','07','Delhi','110006',30),
  ('S0002','Lighting World','Lighting World Traders','Suresh Agarwal','9899002200','09AADCB2230M1Z3',
   'Sector 2, Industrial Area','Noida','09','Uttar Pradesh','201301',15),
  ('S0003','Mat Craft India','Mat Craft India','Deepak Sharma','9899003300','09AAGCM1234K1Z9',
   'Sahibabad Industrial Area','Ghaziabad','09','Uttar Pradesh','201005',30)
on conflict (code) do nothing;

-- Customer's own vehicles (workshop / vehicle-number search)
insert into public.customer_vehicles (customer_id, registration_no, model_id, generation_id, color)
select c.id, v.reg, m.id, g.id, v.colour
from (values
  ('C0002','UP16AB1234','Creta','Facelift 2024+','White'),
  ('C0002','UP16CD5678','Swift','3rd Gen 2018-2023','Red'),
  ('C0003','UP14XY9012','Thar','2nd Gen 2020+','Black')
) as v(cust, reg, model, gen, colour)
join public.customers c on c.code = v.cust
join public.vehicle_models m on m.name = v.model
join public.vehicle_generations g on g.model_id = m.id and g.name = v.gen
on conflict do nothing;

-- Negotiated price: XYZ Accessories buys H4 LED below the dealer rate
insert into public.customer_prices (customer_id, variant_id, price)
select c.id, pv.id, 1550
from public.customers c, public.product_variants pv
where c.code = 'C0001' and pv.sku = 'LED-AFY-H4-60W'
on conflict do nothing;

-- Opening balances become ledger entries, never a stored "balance" column
insert into public.ledger_entries (party_type, party_id, entry_date, doc_type, debit, credit, narration)
select 'customer', c.id, current_date - 60, 'opening', b.amount, 0, 'Opening balance'
from (values ('C0001', 28500::numeric), ('C0002', 41200::numeric), ('C0003', 12000::numeric)) as b(code, amount)
join public.customers c on c.code = b.code;

insert into public.ledger_entries (party_type, party_id, entry_date, doc_type, debit, credit, narration)
select 'supplier', s.id, current_date - 45, 'opening', 0, b.amount, 'Opening balance'
from (values ('S0001', 96000::numeric), ('S0003', 34500::numeric)) as b(code, amount)
join public.suppliers s on s.code = b.code;
