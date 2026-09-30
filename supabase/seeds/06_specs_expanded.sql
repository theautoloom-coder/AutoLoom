-- =============================================================================
-- SEED 06 — the spec options 02 left out.
-- 02 seeded the lists a catalogue would carry. This file seeds the lists a
-- Noida counter actually needs: when the option a shopkeeper wants is missing
-- he types a free-text mess or gives up, and the variant stops being findable.
-- Values read the way the counter says them; `aliases` carries the other name
-- so "HB3", "noodle mat" or "1156" still find the row.
--
-- In an already-seeded database 99_cleanup has dropped seed_util, so this file
-- uses plain inserts rather than the helpers 02 calls. Every statement is
-- guarded: a second run changes nothing.
-- =============================================================================


-- =============================================================================
-- LIGHTING — bulb sockets
-- 02 seeded H1-H15 and the D-series. The other half of the market walks in
-- asking for a bulb by its US number (9005, 7443, 1156) or by its wedge name
-- (T10, W5W). Both spellings have to exist, on every family that carries a
-- socket list, or the man behind the counter cannot find his own stock.
-- =============================================================================
insert into public.spec_options (spec_definition_id, value, code, aliases, sort_order)
select sd.id, o.value, o.code, o.aliases, o.sort
from (values
  -- Headlight sockets the trade asks for by number
  ('9004',         '9004',   '9004 hb1 dual filament',            36),
  ('HB1',          'HB1',    'hb1 9004',                          37),
  ('9007',         '9007',   '9007 hb5 dual filament',            38),
  ('HB5',          'HB5',    'hb5 9007',                          39),
  ('HIR2',         'HIR2',   'hir2 9012 hir',                     40),
  ('5202',         '5202',   '5202 h16 2504 ps24w',               41),
  ('H27',          'H27',    'h27 h27w 880 881',                  42),
  -- Interior, parking, indicator and reverse bulbs
  ('W5W',          'W5W',    'w5w t10 194 168 wedge',             43),
  ('W16W',         'W16W',   'w16w t15 921 wedge',                44),
  ('7440',         '7440',   '7440 t20 w21w single filament',     45),
  ('7443',         '7443',   '7443 t20 w21-5w double filament',   46),
  ('W21W',         'W21W',   'w21w 7440 t20',                     47),
  ('BAY15D',       'BAY15D', 'bay15d 1157 p21-5w double contact', 48),
  ('BA15D',        'BA15D',  'ba15d 1142 double contact',         49),
  ('P21W',         'P21W',   'p21w 1156 ba15s',                   50),
  ('PY21W',        'PY21W',  'py21w bau15s amber indicator 1156', 51),
  ('H21W',         'H21W',   'h21w bay9s reverse',                52),
  -- Festoons are bought by length: the counter measures the old one
  ('Festoon 31mm', 'FEST31', 'festoon 31mm de3175',               53),
  ('Festoon 36mm', 'FEST36', 'festoon 36mm c5w de3423',           54),
  ('Festoon 39mm', 'FEST39', 'festoon 39mm de3425',               55),
  ('Festoon 41mm', 'FEST41', 'festoon 41mm de3428',               56)
) as o(value, code, aliases, sort)
cross join (values
  ('HAL','socket'), ('LED','socket'), ('HID','socket'),
  ('LHL','socket'), ('FOG','socket')
) as t(fam, spec)
join public.product_families f on f.code = t.fam
join public.spec_definitions sd on sd.family_id = f.id and sd.code = t.spec
on conflict (spec_definition_id, value) do nothing;


-- =============================================================================
-- INTERIOR — mats
-- "7D" and "PVC coil" are the two things a mat customer actually says. The
-- type list has to carry the whole vocabulary, because the shopkeeper picks
-- the word the customer used, not the word a catalogue would use.
-- =============================================================================
insert into public.spec_options (spec_definition_id, value, code, aliases, sort_order)
select sd.id, o.value, o.code, o.aliases, o.sort
from (values
  ('MAT','mat_type', '4D',                '4D',    '4d four d',                        20),
  ('MAT','mat_type', '6D',                '6D',    '6d six d',                         21),
  ('MAT','mat_type', 'PVC Coil (Noodle)', 'PVCCO', 'pvc coil noodle spaghetti curly',  22),
  ('MAT','mat_type', 'Rubber Mat',        'RUBM',  'rubber mat',                       23),
  ('MAT','mat_type', 'EVA Honeycomb',     'EVAH',  'eva honeycomb hexagon foam',       24),
  ('MAT','mat_type', 'TPE Mat',           'TPEM',  'tpe mat odourless',                25),
  ('MAT','mat_type', 'Carpet Mat',        'CRPTM', 'carpet mat cloth mat',             26),
  ('MAT','mat_type', 'Grass Mat',         'GRASS', 'grass mat turf artificial grass',  27),
  ('MAT','mat_type', 'Trunk / Boot Mat',  'TRNK',  'trunk mat boot mat dicky mat',     28),

  ('MAT','material', 'Art Leather',       'ART',   'art leather artificial leather',   20),
  ('MAT','material', 'Nappa Leather',     'NAPPA', 'nappa napa leather',               21),
  ('MAT','material', 'EVA Honeycomb',     'EVAH',  'eva honeycomb foam',               22),
  ('MAT','material', 'Grass / Turf',      'GRASS', 'grass turf artificial grass',      23),
  ('MAT','material', 'Silicone',          'SIL',   'silicone',                         24),

  ('MAT','border',   'Leather Border',    'LTHB',  'leather border leatherette border',20),
  ('MAT','border',   'Gold Stitch',       'GSTCH', 'gold stitch golden thread',        21),
  ('MAT','border',   'Silver Stitch',     'SSTCH', 'silver stitch silver thread',      22),
  ('MAT','border',   'Rope Piping',       'ROPE',  'rope piping rope border',          23)
) as o(fam, spec, value, code, aliases, sort)
join public.product_families f on f.code = o.fam
join public.spec_definitions sd on sd.family_id = f.id and sd.code = o.spec
on conflict (spec_definition_id, value) do nothing;


-- =============================================================================
-- INTERIOR — the shared colour list (mats, seat covers, accessories)
-- 02 gave all three families one colour list; it is short of the shades that
-- actually move, and of the dual tones the counter names as a pair rather
-- than calling "custom".
-- =============================================================================
insert into public.spec_options (spec_definition_id, value, code, aliases, sort_order)
select sd.id, o.value, o.code, o.aliases, o.sort
from (values
  ('White',          'WHT',    'white off white',              20),
  ('Cream',          'CRM',    'cream off white ivory',        21),
  ('Maroon',         'MRN',    'maroon cherry wine',           22),
  ('Camel',          'CAML',   'camel light tan biscuit',      23),
  ('Light Grey',     'LGRY',   'light grey light gray',        24),
  ('Dark Grey',      'DGRY',   'dark grey dark gray charcoal', 25),
  ('Black + Red',    'BLKRED', 'black red dual tone',          26),
  ('Black + Beige',  'BLKBEI', 'black beige dual tone',        27),
  ('Black + Tan',    'BLKTAN', 'black tan dual tone',          28),
  ('Black + Grey',   'BLKGRY', 'black grey gray dual tone',    29)
) as o(value, code, aliases, sort)
cross join (values ('MAT','colour'), ('SEAT','colour'), ('INT','colour')) as t(fam, spec)
join public.product_families f on f.code = t.fam
join public.spec_definitions sd on sd.family_id = f.id and sd.code = t.spec
on conflict (spec_definition_id, value) do nothing;


-- =============================================================================
-- INTERIOR — seat covers
-- Towel, silicone and net are summer and monsoon sellers that 02 has no word
-- for; without them a whole season's stock lands in free text.
-- =============================================================================
insert into public.spec_options (spec_definition_id, value, code, aliases, sort_order)
select sd.id, o.value, o.code, o.aliases, o.sort
from (values
  ('SEAT','material','Towel / Terry',    'TWL',  'towel terry cotton towel summer', 20),
  ('SEAT','material','Silicone',         'SIL',  'silicone rubber cover',           21),
  ('SEAT','material','Velvet',           'VLVT', 'velvet velvate',                  22),
  ('SEAT','material','Rexine',           'REX',  'rexine rexin leatherette',        24),

  ('SEAT','pattern', 'Honeycomb',        'HNY',  'honeycomb hex quilt',             20),
  ('SEAT','pattern', 'Quilted',          'QLT',  'quilted quilting',                21),
  ('SEAT','pattern', 'Embossed',         'EMB',  'embossed emboss',                 22),
  ('SEAT','pattern', 'Printed',          'PRNT', 'printed print design',            23),
  ('SEAT','pattern', 'Line Stitch',      'LINE', 'line stitch wave stitch',         24),
  ('SEAT','pattern', 'Tri Tone',         'TRI',  'tri tone three colour',           25),

  ('SEAT','fit',     'Semi Bucket Fit',  'SEMI', 'semi bucket half bucket',         20),

  ('SEAT','seats',   '4 Seater',         '4S',   '4 seater four seater',            20),
  ('SEAT','seats',   '8 Seater',         '8S',   '8 seater eight seater',           21),
  ('SEAT','seats',   '7 Seater Captain', '7CAPT','7 seater captain seat',           22)
) as o(fam, spec, value, code, aliases, sort)
join public.product_families f on f.code = o.fam
join public.spec_definitions sd on sd.family_id = f.id and sd.code = o.spec
on conflict (spec_definition_id, value) do nothing;


-- =============================================================================
-- ELECTRONICS — Android screens and dash cameras
-- DIN size and panel type are the two questions asked before price, and
-- neither existed as a spec. A dash camera is quoted with the card in the box
-- or without it, so the card has to be part of the variant.
-- =============================================================================
insert into public.spec_definitions
  (family_id, code, name, data_type, unit, is_required, is_variant_axis,
   show_in_variant_name, is_filterable, sort_order)
select f.id, d.code, d.name, d.data_type, d.unit, false, d.axis, d.in_name, true, d.sort
from (values
  ('ANDR','din',    'DIN Size',      'select', null::text, true,  true,  13),
  ('ANDR','panel',  'Display Panel', 'select', null::text, false, false, 14),
  ('DASH','memory', 'Memory Card',   'select', null::text, false, false, 8)
) as d(fam, code, name, data_type, unit, axis, in_name, sort)
join public.product_families f on f.code = d.fam
on conflict (family_id, code) do nothing;

insert into public.spec_options (spec_definition_id, value, code, aliases, sort_order)
select sd.id, o.value, o.code, o.aliases, o.sort
from (values
  ('ANDR','din',       'Single DIN',             '1DIN',   'single din 1 din',               1),
  ('ANDR','din',       'Double DIN',             '2DIN',   'double din 2 din',               2),
  ('ANDR','din',       'Floating / Tesla Style', 'FLOAT',  'floating tesla style vertical',  3),
  ('ANDR','din',       'Vehicle Specific Frame', 'VSF',    'vehicle specific frame oem fit', 4),

  ('ANDR','panel',     'IPS',                    'IPS',    'ips panel',                      1),
  ('ANDR','panel',     'QLED',                   'QLED',   'qled q led',                     2),
  ('ANDR','panel',     'TFT',                    'TFT',    'tft normal panel',               3),
  ('ANDR','panel',     'Incell',                 'INCEL',  'incell in cell',                 4),

  ('ANDR','ram_rom',   '2+16GB',                 '2G16',   '2 16 2gb 16gb',                  20),
  ('ANDR','ram_rom',   '4+32GB',                 '4G32',   '4 32 4gb 32gb',                  21),
  ('ANDR','ram_rom',   '6+64GB',                 '6G64',   '6 64 6gb 64gb',                  22),

  ('ANDR','resolution','1280x800',               '1280X800','1280 800',                      20),

  ('ANDR','sim',       'WiFi Only',              'WIFI',   'wifi only no sim',               20),

  ('DASH','memory',    'No Card',                'NOCRD',  'no card without memory',         1),
  ('DASH','memory',    '32GB',                   '32GB',   '32 gb card',                     2),
  ('DASH','memory',    '64GB',                   '64GB',   '64 gb card',                     3),
  ('DASH','memory',    '128GB',                  '128GB',  '128 gb card',                    4),
  ('DASH','memory',    '256GB',                  '256GB',  '256 gb card',                    5),

  ('DASH','resolution','720P',                   '720P',   '720 hd',                         20)
) as o(fam, spec, value, code, aliases, sort)
join public.product_families f on f.code = o.fam
join public.spec_definitions sd on sd.family_id = f.id and sd.code = o.spec
on conflict (spec_definition_id, value) do nothing;


-- =============================================================================
-- AUDIO — speakers and amplifiers
-- Door speakers are bought by the hole they must fit, so every size the
-- counter measures needs a row, including the oval ones.
-- =============================================================================
insert into public.spec_options (spec_definition_id, value, code, aliases, sort_order)
select sd.id, o.value, o.code, o.aliases, o.sort
from (values
  ('SPKR','size',        '3 inch',        '3',     '3 inch',                    20),
  ('SPKR','size',        '3.5 inch',      '35',    '3.5 inch',                  21),
  ('SPKR','size',        '4x6 inch',      '46',    '4x6 4 x 6 oval',            22),
  ('SPKR','size',        '5 inch',        '5',     '5 inch',                    23),
  ('SPKR','size',        '6x8 inch',      '68',    '6x8 6 x 8 oval',            24),
  ('SPKR','size',        '8 inch',        '8',     '8 inch',                    25),

  ('SPKR','speaker_type','2-Way Coaxial', '2WAY',  '2 way two way coaxial',     20),
  ('SPKR','speaker_type','3-Way Coaxial', '3WAY',  '3 way three way coaxial',   21),
  ('SPKR','speaker_type','Super Tweeter', 'STWTR', 'super tweeter dome tweeter',22),

  ('AMP','channels',     '3 Channel',     '3CH',   '3 channel three channel',   20),
  ('AMP','channels',     '6 Channel',     '6CH',   '6 channel six channel',     21),
  ('AMP','channels',     '8 Channel',     '8CH',   '8 channel eight channel',   22),

  ('AMP','item_type',    'Subwoofer Box', 'SBOX',  'subwoofer box enclosure',   20),
  ('AMP','item_type',    'Capacitor',     'CAP',   'capacitor cap farad',       21),

  ('AMP','size',         '6.5 inch',      '65',    '6.5 inch',                  20)
) as o(fam, spec, value, code, aliases, sort)
join public.product_families f on f.code = o.fam
join public.spec_definitions sd on sd.family_id = f.id and sd.code = o.spec
on conflict (spec_definition_id, value) do nothing;


-- =============================================================================
-- ELECTRONICS — horns, cameras, sensors, chargers, wiring
-- "Pressure horn" and "reverse horn" are asked for by those names here, and a
-- reverse camera is chosen by where it hides, not by its sensor.
-- =============================================================================
insert into public.spec_options (spec_definition_id, value, code, aliases, sort_order)
select sd.id, o.value, o.code, o.aliases, o.sort
from (values
  ('HORN','horn_type',   'Pressure Horn',      'PRESS', 'pressure horn hawa horn',    20),
  ('HORN','horn_type',   'Reverse Horn',       'REV',   'reverse horn reverse tune',  21),
  ('HORN','horn_type',   'Bullet / Mini Horn', 'MINI',  'bullet horn mini horn',      22),
  ('HORN','config',      'Set of 6',           '6PC',   'set of 6 six piece',         20),
  ('HORN','colour',      'Blue',               'BLU',   'blue',                       20),
  ('HORN','colour',      'Gold',               'GLD',   'gold golden',                21),

  ('CAM','shape',        'Boot Handle',        'BOOT',  'boot handle dicky handle',   20),
  ('CAM','shape',        'Logo Camera',        'LOGO',  'logo camera badge camera',   21),
  ('CAM','shape',        'Bracket Type',       'BRKT',  'bracket type hanging',       22),
  ('CAM','resolution',   '1440P',              '1440P', '1440 2k',                    20),

  ('PSEN','display',     'Voice Alert',        'VOICE', 'voice alert talking sensor', 20),
  ('PSEN','display',     'TFT Screen',         'TFT',   'tft screen display',         21),
  ('PSEN','colour',      'Grey',               'GRY',   'grey gray',                  20),

  ('CHRG','ports',       '3 USB',              '3U',    '3 usb three usb',            20),
  ('CHRG','ports',       'Type-C Only',        '1C',    'type c only single type c',  21),
  ('CHRG','fast_charge', 'QC 2.0',             'QC2',   'qc 2 quick charge 2',        20),
  ('CHRG','fast_charge', 'PD 20W',             'PD20',  'pd 20w power delivery 20',   21),
  ('CHRG','fast_charge', 'PD 30W',             'PD30',  'pd 30w power delivery 30',   22),

  ('WIRE','amperage',    '25A',                '25A',   '25 amp',                     20),
  ('WIRE','amperage',    '50A',                '50A',   '50 amp',                     21),
  ('WIRE','amperage',    '100A',               '100A',  '100 amp',                    22),
  ('WIRE','pins',        '2 Pin',              '2P',    '2 pin two pin',              20),
  ('WIRE','pins',        '10 Pin',             '10P',   '10 pin ten pin',             21),
  ('WIRE','pins',        '12 Pin',             '12P',   '12 pin twelve pin',          22)
) as o(fam, spec, value, code, aliases, sort)
join public.product_families f on f.code = o.fam
join public.spec_definitions sd on sd.family_id = f.id and sd.code = o.spec
on conflict (spec_definition_id, value) do nothing;


-- =============================================================================
-- Aliases on rows 02 already created.
-- Same reason as 02's alias block: one part, two names. Guarded on the value
-- actually changing, so a second run writes nothing.
-- =============================================================================
update public.spec_options so
   set aliases = a.alias
  from (values
    ('9012',        '9012 hir2'),
    ('H13',         'h13 9008'),
    ('H10',         'h10 9145 9140'),
    ('H9',          'h9 h11 h8'),
    ('T15',         't15 w16w 921'),
    ('T20',         't20 7440 7443 w21w'),
    ('BAU15S',      'bau15s py21w amber 1156'),
    ('PSX24W',      'psx24w 2504 h16'),
    ('Festoon',     'festoon c5w soffit'),
    ('Coil',        'coil noodle pvc coil spaghetti'),
    ('Coil/Noodle', 'coil noodle pvc spaghetti'),
    ('Nappa',       'nappa napa leather'),
    ('Mesh',        'mesh net jali')
  ) as a(val, alias)
 where so.value = a.val
   and so.aliases is distinct from a.alias;

-- Warranty is the last thing anyone fills in; the two new Android Screen specs
-- belong above it, and 02's sort numbers 1-12 were already full.
update public.spec_definitions sd
   set sort_order = 20
  from public.product_families f
 where f.id = sd.family_id and f.code = 'ANDR' and sd.code = 'warranty'
   and sd.sort_order is distinct from 20;


-- =============================================================================
-- LEFT OUT ON PURPOSE — settle these with the shop before adding.
--
-- * 9004 / HB1 and 9007 / HB5 are in because they were asked for, but they are
--   US dual-filament sockets and almost never come up at a Noida counter.
--   If the shop never sells them, delete those four rows.
-- * D1R, D4R and D8S HID capsules exist but are import-only parts here. Left
--   out; add if the shop starts taking imports.
-- * 3156 / 3157 wedge bulbs and 9011 / HIR1 — US sockets, not fitted on cars
--   sold in India.
-- * BA15D is in, but it is mostly a two-wheeler and commercial-vehicle socket.
--   If this shop is cars only, it is noise.
-- * Mat Type now carries 3D/4D/5D/6D/7D/9D. "10D" is sold as a marketing word
--   by some importers; left out because nobody can say what it means.
-- * Android 12+256GB and Android 15 head units are listed by some sellers but
--   were not sold here this season.
-- * Screen Size was left alone — 7 / 9 / 10 / 10.1 / 12.3 / 13.6 already cover
--   what is stocked. 8" and 11.5" exist in listings but not on this counter.
-- * "Wireless CarPlay" is still a Yes / No spec, so a wired-only unit has no
--   honest answer. It should read Wireless / Wired / No like Android Auto, but
--   that is a rename of an existing spec, not new data, so it is not here.
-- * Dash Camera "lens count" not added: Channels already says front, front +
--   rear or front + cabin, and two fields would end up disagreeing.
-- * Seat cover genuine leather and suede left out; nobody quoted them. "Mesh
--   Net" was dropped as a separate material — 02's "Mesh" is the same thing and
--   now carries "net" and "jali" as aliases.
-- * Horn tunes (bugle, siren, whistle) left out — that is a product name, not
--   a spec; "Musical" already covers the category.
-- =============================================================================

-- =============================================================================
-- POLISH — three things the list above got wrong for a counter.
--
-- A list is only useful if a shopkeeper can find his value in it in one look.
-- Two of these are about that; the third is a spec that could not be answered
-- honestly.
-- =============================================================================

-- 1. US-only sockets. They were added because they were asked for, but no car
--    sold in India uses them, and every row a person has to read past is a row
--    that makes the list less useful.
delete from public.spec_options so
 using public.spec_definitions sd
 where sd.id = so.spec_definition_id
   and sd.code = 'socket'
   and so.value in ('9004', 'HB1', '9007', 'HB5');

-- 2. "Wireless CarPlay: Yes / No" left a wired-only unit with no honest answer,
--    which is how a spec sheet starts lying. Android Auto next to it already
--    reads Wireless / Wired / No; this now matches.
update public.spec_definitions
   set name = 'CarPlay'
 where code = 'carplay' and name is distinct from 'CarPlay';

insert into public.spec_options (spec_definition_id, value, code, sort_order)
select sd.id, v.value, v.code, v.sort_order
  from public.spec_definitions sd
  join (values ('Wired', 'wired', 2), ('No', 'no', 3)) as v(value, code, sort_order) on true
 where sd.code = 'carplay'
on conflict do nothing;

update public.spec_options so
   set value = 'Wireless', code = 'wireless', sort_order = 1
  from public.spec_definitions sd
 where sd.id = so.spec_definition_id and sd.code = 'carplay'
   and so.value = 'Yes';

delete from public.spec_options so
 using public.spec_definitions sd
 where sd.id = so.spec_definition_id and sd.code = 'carplay'
   and so.value = 'No' and so.code is distinct from 'no';

-- 3. Sort order. New options were appended, so "4 Seater" sat below "7 Seater"
--    and the socket list ran H1, H10, H11, H13, H15, H16, H21W, H27, H3, H4 —
--    plain alphabetical, which puts H27 before H3 and is wrong to anyone who
--    reads part numbers. This sorts the letter prefix first, then the number
--    inside it as a number, which is the order a parts list is written in.
--
--    The dozen sockets a counter reaches for every day are pinned above that,
--    because scrolling past forty entries to find H4 is the difference between
--    a list that helps and a list people stop using.
update public.spec_options so
   set sort_order = ranked.rn
  from (
    select so2.id,
           row_number() over (
             partition by so2.spec_definition_id
             order by
               case so2.value
                 when 'H4' then 1 when 'H7' then 2 when 'H11' then 3
                 when 'H1' then 4 when 'H3' then 5 when '9005' then 6
                 when '9006' then 7 when 'H8' then 8 when 'H9' then 9
                 when 'T10' then 10 when '1156' then 11 when '1157' then 12
                 else 100
               end,
               -- Letter prefix, then the number inside it as a number.
               coalesce(substring(so2.value from '^[A-Za-z]+'), ''),
               coalesce((substring(so2.value from '([0-9]+)'))::int, 0),
               so2.value
           ) as rn
      from public.spec_options so2
      join public.spec_definitions sd2 on sd2.id = so2.spec_definition_id
     where sd2.code in ('socket', 'seats', 'mat_type', 'material', 'colour', 'ram_rom', 'size')
  ) ranked
 where ranked.id = so.id
   and so.sort_order is distinct from ranked.rn;

-- 4. Two names for one thing. 02 already had "Coil" (aliased to noodle/pvc/
--    spaghetti) and this file added "PVC Coil (Noodle)" beside it, so the list
--    offered the same mat twice under different words. A list a person cannot
--    trust to have one row per thing is a list they stop reading.
update public.spec_options so
   set aliases = 'noodle,pvc,spaghetti,pvc coil'
  from public.spec_definitions sd
 where sd.id = so.spec_definition_id
   and sd.code = 'mat_type' and so.value = 'Coil'
   and so.aliases is distinct from 'noodle,pvc,spaghetti,pvc coil';

delete from public.spec_options so
 using public.spec_definitions sd
 where sd.id = so.spec_definition_id
   and sd.code in ('mat_type', 'material')
   and so.value in ('PVC Coil (Noodle)', 'Coil/Noodle ');
