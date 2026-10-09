-- =============================================================================
-- The categories a car-accessories wholesaler actually stocks (owner, 9 Oct 2026)
--
-- "Category mein aise bahut se items ki category missing hai — Spoilers, Body
-- Kit, Roof Rails, Guards etc. Bahut si cheezein hoti hain, wo lagao."
--
-- The catalogue had lighting and electronics in depth, and the whole body side
-- of the trade folded into one "Exterior Accessories". Each category below
-- comes with its own details: the ones that tell one kism from the next (type,
-- finish, size, position — "kism ki pehchaan", asked while stocking in and
-- part of the kism's name) and the ones an item shares (material, capacity).
--
-- Added only: a category, detail or option that already exists is left as it
-- is, so nothing the owner has renamed or switched off in Category settings is
-- touched. Everything here can be changed from that screen afterwards.
-- =============================================================================

create function pg_temp.fam(p_code text, p_name text, p_prefix text, p_hsn text, p_tax text, p_unit text, p_fit boolean, p_sort int)
returns void language sql as $$
  insert into public.product_families
    (code, name, sku_prefix, sku_template, default_hsn_code, default_unit_id, default_tax_rate_id, is_fitment_required, sort_order)
  select p_code, p_name, p_prefix, '{FAMILY}-{AXES}', p_hsn,
         (select id from public.units where code = p_unit), (select id from public.tax_rates where name = p_tax), p_fit, p_sort
  on conflict (code) do nothing;
$$;

-- p_options: comma-separated 'Value' or 'Value|CODE'. p_axis: a kism detail.
create function pg_temp.spec(p_family text, p_code text, p_name text, p_type text, p_unit text,
                             p_axis boolean, p_sort int, p_options text default null, p_required boolean default false)
returns void language plpgsql as $$
declare
  v_family uuid;
  v_id uuid;
  v_opt text;
  i int := 0;
begin
  select id into v_family from public.product_families where code = p_family;
  if v_family is null then return; end if;
  insert into public.spec_definitions
    (family_id, code, name, data_type, unit, is_required, is_variant_axis, show_in_variant_name, is_filterable, sort_order)
  values (v_family, p_code, p_name, p_type, p_unit, p_required, p_axis, p_axis, true, p_sort)
  on conflict (family_id, code) do nothing;
  select id into v_id from public.spec_definitions where family_id = v_family and code = p_code;
  if p_options is null then return; end if;
  foreach v_opt in array string_to_array(p_options, ',') loop
    i := i + 1;
    insert into public.spec_options (spec_definition_id, value, code, sort_order)
    values (v_id, split_part(trim(v_opt), '|', 1),
            coalesce(nullif(split_part(trim(v_opt), '|', 2), ''),
                     upper(left(regexp_replace(split_part(trim(v_opt), '|', 1), '[^A-Za-z0-9]', '', 'g'), 6))),
            i)
    on conflict (spec_definition_id, value) do nothing;
  end loop;
end;
$$;

-- --- Lighting -----------------------------------------------------------------
select pg_temp.fam('AMBL', 'Ambient & Interior Lights', 'AMBL', '9405', 'GST 18%', 'set', false, 21);
select pg_temp.spec('AMBL', 'light_type', 'Type', 'select', null, true, 1, 'Ambient Strip|AMB,Roof Light|ROOF,Footwell Light|FOOT,Door Logo Projector|LOGO,Starlight Roof|STAR,Dashboard Light|DASH');
select pg_temp.spec('AMBL', 'colour', 'Colour', 'select', null, true, 2, 'RGB Multicolour|RGB,White|WHT,Blue|BLU,Red|RED,Ice Blue|ICE,Purple|PUR');
select pg_temp.spec('AMBL', 'control', 'Control', 'select', null, false, 3, 'Mobile App|APP,Remote|RMT,Switch|SW,Music Sync|MUS,Door Sensor|DOOR');

select pg_temp.fam('LBAR', 'Light Bars & Aux Lamps', 'LBAR', '8512', 'GST 28%', 'pcs', false, 22);
select pg_temp.spec('LBAR', 'lamp_type', 'Type', 'select', null, true, 1, 'Light Bar|BAR,Pod Light|POD,Spot Lamp|SPOT,Flood Lamp|FLD,Work Light|WORK');
select pg_temp.spec('LBAR', 'size', 'Size', 'select', null, true, 2, '3 inch|3,4 inch|4,6 inch|6,12 inch|12,22 inch|22,32 inch|32,42 inch|42,52 inch|52');
select pg_temp.spec('LBAR', 'beam', 'Beam', 'select', null, true, 3, 'Spot|SPOT,Flood|FLD,Combo|COMBO');
select pg_temp.spec('LBAR', 'wattage', 'Wattage', 'number', 'W', false, 4);
select pg_temp.spec('LBAR', 'light_colour', 'Light Colour', 'select', null, false, 5, 'White|WHT,Yellow|YEL,White + Yellow|WY,Amber|AMB');

-- --- Interior -----------------------------------------------------------------
select pg_temp.fam('STRC', 'Steering Covers', 'STRC', '4205', 'GST 12%', 'pcs', false, 33);
select pg_temp.spec('STRC', 'material', 'Material', 'select', null, true, 1, 'Leather|LTH,PU Leather|PU,Suede|SUE,Silicone|SIL,Wooden Grip|WOOD,Perforated Leather|PERF');
select pg_temp.spec('STRC', 'colour', 'Colour', 'select', null, true, 2, 'Black|BLK,Beige|BEI,Brown|BRN,Tan|TAN,Grey|GRY,Red|RED,Black + Red|BRED,Black + Blue|BBLU');
select pg_temp.spec('STRC', 'size', 'Size', 'select', null, true, 3, 'Small 36 cm|S,Medium 38 cm|M,Large 40 cm|L');

select pg_temp.fam('CUSH', 'Cushions & Neck Rests', 'CUSH', '9404', 'GST 18%', 'pcs', false, 34);
select pg_temp.spec('CUSH', 'item_type', 'Type', 'select', null, true, 1, 'Neck Rest|NECK,Back Rest|BACK,Seat Cushion|SEAT,Lumbar Support|LUMB,Neck + Back Set|SET');
select pg_temp.spec('CUSH', 'colour', 'Colour', 'select', null, true, 2, 'Black|BLK,Beige|BEI,Brown|BRN,Tan|TAN,Grey|GRY,Red|RED');
select pg_temp.spec('CUSH', 'material', 'Material', 'select', null, false, 3, 'Memory Foam|MEM,Velvet|VEL,PU Leather|PU,Fabric|FAB,Bamboo|BAM');
select pg_temp.spec('CUSH', 'pack', 'Pack', 'select', null, false, 4, 'Single|1,Pair|2,Set of 4|4');

select pg_temp.fam('PERF', 'Perfumes & Fresheners', 'PERF', '3307', 'GST 18%', 'pcs', false, 35);
select pg_temp.spec('PERF', 'perfume_type', 'Type', 'select', null, true, 1, 'Dashboard Gel|GEL,AC Vent Clip|VENT,Hanging|HANG,Spray|SPRY,Diffuser|DIFF,Can|CAN');
select pg_temp.spec('PERF', 'fragrance', 'Fragrance', 'select', null, true, 2, 'Lavender|LAV,Lemon|LEM,Rose|ROSE,Aqua|AQUA,Musk|MUSK,Jasmine|JAS,Coffee|COF,New Car|NEW,Strawberry|STR,Sandal|SAND');
select pg_temp.spec('PERF', 'quantity', 'Quantity', 'number', 'ml', false, 3);

select pg_temp.fam('SHADE', 'Sun Shades & Curtains', 'SHADE', '6303', 'GST 12%', 'set', true, 36);
select pg_temp.spec('SHADE', 'shade_type', 'Type', 'select', null, true, 1, 'Magnetic Curtain|MAG,Roller Shade|ROLL,Windshield Shade|WIND,Window Net|NET,Static Cling|CLING');
select pg_temp.spec('SHADE', 'windows', 'Windows', 'select', null, true, 2, 'Side Windows|SIDE,Rear Window|REAR,Full Set|FULL,Windshield|WS');
select pg_temp.spec('SHADE', 'colour', 'Colour', 'select', null, true, 3, 'Black|BLK,Grey|GRY,Beige|BEI,Silver|SLV');

select pg_temp.fam('TRIM', 'Interior Trims & Garnish', 'TRIM', '8708', 'GST 28%', 'set', true, 37);
select pg_temp.spec('TRIM', 'part', 'Part', 'select', null, true, 1, 'Dashboard Kit|DASH,Door Trim|DOOR,AC Vent Ring|VENT,Gear Console Trim|GEAR,Steering Trim|STR,Full Interior Kit|FULL');
select pg_temp.spec('TRIM', 'finish', 'Finish', 'select', null, true, 2, 'Wooden|WOOD,Carbon|CF,Chrome|CHR,Piano Black|PB,Brushed Silver|BRS,Red|RED');

select pg_temp.fam('ORG', 'Organisers & Storage', 'ORG', '4202', 'GST 18%', 'pcs', false, 38);
select pg_temp.spec('ORG', 'org_type', 'Type', 'select', null, true, 1, 'Seat Back Organiser|SBO,Boot Organiser|BOOT,Seat Gap Filler|GAP,Tissue Box|TIS,Dustbin|BIN,Mobile Holder|MOB,Cup Holder|CUP,Armrest Box|ARM');
select pg_temp.spec('ORG', 'colour', 'Colour', 'select', null, true, 2, 'Black|BLK,Beige|BEI,Brown|BRN,Grey|GRY,Tan|TAN');
select pg_temp.spec('ORG', 'material', 'Material', 'select', null, false, 3, 'PU Leather|PU,Fabric|FAB,Plastic|PLS,Felt|FELT');

select pg_temp.fam('KEYC', 'Key Covers', 'KEYC', '4202', 'GST 18%', 'pcs', true, 39);
select pg_temp.spec('KEYC', 'material', 'Material', 'select', null, true, 1, 'Silicone|SIL,Leather|LTH,TPU|TPU,Metal|MTL,Carbon|CF');
select pg_temp.spec('KEYC', 'colour', 'Colour', 'select', null, true, 2, 'Black|BLK,Brown|BRN,Red|RED,Blue|BLU,Silver|SLV,Gold|GLD,Transparent|CLR');
select pg_temp.spec('KEYC', 'key_type', 'Key Type', 'select', null, true, 3, 'Flip Key|FLIP,Smart Key|SMART,Plain Key|PLAIN');

-- --- Electronics & security -------------------------------------------------
select pg_temp.fam('LOCK', 'Central Locking & Security', 'LOCK', '8526', 'GST 18%', 'kit', false, 49);
select pg_temp.spec('LOCK', 'lock_type', 'Type', 'select', null, true, 1, 'Central Locking|CL,Alarm System|ALM,Keyless Entry|KLE,Push Start Kit|PUSH,Immobiliser|IMM,Steering Lock|SLK,Pedal Lock|PEDL');
select pg_temp.spec('LOCK', 'doors', 'Doors', 'select', null, true, 2, '2 Door|2D,4 Door|4D,Universal|UNI');
select pg_temp.spec('LOCK', 'remote', 'Remote', 'select', null, false, 3, 'Flip Key|FLIP,Plain Remote|RMT,Smart Key|SMART,Mobile App|APP');

select pg_temp.fam('INFL', 'Tyre Inflators & TPMS', 'INFL', '8414', 'GST 18%', 'pcs', false, 49);
select pg_temp.spec('INFL', 'infl_type', 'Type', 'select', null, true, 1, 'Tyre Inflator|INFL,Digital Inflator|DIG,TPMS Internal|TPMI,TPMS External|TPME,Pressure Gauge|GAUGE,Puncture Kit|PKIT');
select pg_temp.spec('INFL', 'power', 'Power', 'select', null, false, 2, '12V Socket|12V,Battery Clamp|BAT,Rechargeable|RCH,Solar|SOL');

select pg_temp.fam('MIRF', 'Mirror Folding & Power Windows', 'MIRF', '8708', 'GST 28%', 'kit', true, 49);
select pg_temp.spec('MIRF', 'mirf_type', 'Type', 'select', null, true, 1, 'Auto Mirror Folding|AMF,Window Roll-up Kit|ROLL,Power Window Kit|PWK,Mirror Folding + Roll-up|COMBO');

-- --- Body & exterior ---------------------------------------------------------
select pg_temp.fam('SPLR', 'Spoilers', 'SPLR', '8708', 'GST 28%', 'pcs', true, 54);
select pg_temp.spec('SPLR', 'spoiler_type', 'Type', 'select', null, true, 1, 'Roof Spoiler|ROOF,Boot Lip|LIP,Wing Spoiler|WING,Ducktail|DUCK');
select pg_temp.spec('SPLR', 'finish', 'Finish', 'select', null, true, 2, 'Primer (paint karna hai)|PRM,Body Colour|BC,Gloss Black|GBLK,Matte Black|MBLK,Carbon Look|CFL,White|WHT,Red|RED');
select pg_temp.spec('SPLR', 'led', 'LED', 'select', null, true, 3, 'With LED|LED,Without LED|NOLED');
select pg_temp.spec('SPLR', 'material', 'Material', 'select', null, false, 4, 'ABS Plastic|ABS,Fibre|FIB,Polyurethane|PU,Carbon Fibre|CF');

select pg_temp.fam('BKIT', 'Body Kits', 'BKIT', '8708', 'GST 28%', 'set', true, 55);
select pg_temp.spec('BKIT', 'part', 'Part', 'select', null, true, 1, 'Front Lip|FLIP,Side Skirts|SKRT,Rear Diffuser|DIFF,Full Body Kit|FULL,Front Bumper|FBMP,Rear Bumper|RBMP,Bonnet Scoop|SCOOP,Fender Flares|FLARE,Canards|CAN');
select pg_temp.spec('BKIT', 'finish', 'Finish', 'select', null, true, 2, 'Primer (paint karna hai)|PRM,Gloss Black|GBLK,Matte Black|MBLK,Body Colour|BC,Carbon Look|CFL,Red Line|REDL');
select pg_temp.spec('BKIT', 'material', 'Material', 'select', null, false, 3, 'ABS Plastic|ABS,Fibre|FIB,Polyurethane|PU,Carbon Fibre|CF');

select pg_temp.fam('BGRD', 'Bumper Guards & Bull Bars', 'BGRD', '8708', 'GST 28%', 'pcs', true, 56);
select pg_temp.spec('BGRD', 'position', 'Position', 'select', null, true, 1, 'Front|FRT,Rear|REAR,Front + Rear|BOTH');
select pg_temp.spec('BGRD', 'guard_type', 'Type', 'select', null, true, 2, 'Bull Bar|BULL,Nudge Guard|NUDG,Sleek Guard|SLEK,Corner Guard|CORN,Bumper Protector|PROT,Skid Plate|SKID');
select pg_temp.spec('BGRD', 'finish', 'Finish', 'select', null, true, 3, 'Black|BLK,Chrome|CHR,Silver|SLV,Matte Black|MBLK,Black + Chrome|BCHR');
select pg_temp.spec('BGRD', 'material', 'Material', 'select', null, false, 4, 'Mild Steel|MS,Stainless Steel|SS,ABS Plastic|ABS,Rubber|RUB,Aluminium|ALU');

select pg_temp.fam('ROOF', 'Roof Rails & Carriers', 'ROOF', '8708', 'GST 28%', 'set', true, 57);
select pg_temp.spec('ROOF', 'roof_type', 'Type', 'select', null, true, 1, 'Roof Rails|RAIL,Cross Bars|XBAR,Roof Carrier|CARR,Roof Box|BOX,Roof Basket|BASK,Rails + Cross Bars|RXB');
select pg_temp.spec('ROOF', 'finish', 'Finish', 'select', null, true, 2, 'Silver|SLV,Black|BLK,Silver + Black|SB,Matte Black|MBLK');
select pg_temp.spec('ROOF', 'material', 'Material', 'select', null, false, 3, 'Aluminium|ALU,ABS Plastic|ABS,Steel|STL');
select pg_temp.spec('ROOF', 'load', 'Load Capacity', 'number', 'kg', false, 4);

select pg_temp.fam('STEP', 'Side Steps & Footsteps', 'STEP', '8708', 'GST 28%', 'pair', true, 58);
select pg_temp.spec('STEP', 'step_type', 'Type', 'select', null, true, 1, 'Side Step|SIDE,Running Board|RUN,Electric Step|ELEC,Rear Step|REAR,Door Step|DOOR');
select pg_temp.spec('STEP', 'finish', 'Finish', 'select', null, true, 2, 'Black|BLK,Silver|SLV,Chrome|CHR,Black + Silver|BS');
select pg_temp.spec('STEP', 'material', 'Material', 'select', null, false, 3, 'Aluminium|ALU,Stainless Steel|SS,Mild Steel|MS,ABS Plastic|ABS');

select pg_temp.fam('VISR', 'Door Visors & Rain Guards', 'VISR', '8708', 'GST 28%', 'set', true, 59);
select pg_temp.spec('VISR', 'visor_type', 'Type', 'select', null, true, 1, 'Door Visor|VIS,Bonnet Guard|BON,Sunroof Visor|SUN');
select pg_temp.spec('VISR', 'finish', 'Finish', 'select', null, true, 2, 'Smoke Black|SMK,Chrome Line|CHRL,Clear|CLR');
select pg_temp.spec('VISR', 'pieces', 'Pieces', 'select', null, true, 3, 'Set of 4|4,Set of 6|6,Single|1');

select pg_temp.fam('MUDF', 'Mud Flaps', 'MUDF', '4016', 'GST 18%', 'set', true, 61);
select pg_temp.spec('MUDF', 'pieces', 'Pieces', 'select', null, true, 1, 'Set of 4|4,Front Pair|FRT,Rear Pair|REAR');
select pg_temp.spec('MUDF', 'colour', 'Colour', 'select', null, true, 2, 'Black|BLK,Body Colour|BC,Red|RED');
select pg_temp.spec('MUDF', 'material', 'Material', 'select', null, false, 3, 'Rubber|RUB,PVC|PVC,ABS Plastic|ABS');

select pg_temp.fam('CHRM', 'Chrome & Garnish', 'CHRM', '8708', 'GST 28%', 'set', true, 62);
select pg_temp.spec('CHRM', 'part', 'Part', 'select', null, true, 1, 'Door Handle|DH,Window Line|WIN,Tail Lamp Garnish|TL,Head Lamp Garnish|HL,Fog Lamp Garnish|FOG,Side Beading|BEAD,Boot Garnish|BOOT,Grille Garnish|GRIL,Mirror Cover|MIR,Pillar Garnish|PIL');
select pg_temp.spec('CHRM', 'finish', 'Finish', 'select', null, true, 2, 'Chrome|CHR,Black Chrome|BCHR,Carbon|CF,Gloss Black|GBLK,Matte Black|MBLK');

select pg_temp.fam('GRIL', 'Grilles', 'GRIL', '8708', 'GST 28%', 'pcs', true, 63);
select pg_temp.spec('GRIL', 'grille_type', 'Type', 'select', null, true, 1, 'Front Grille|FRT,Honeycomb Grille|HONEY,Badge-less Grille|NOBADG,Lower Grille|LOW,Grille with LED|LED');
select pg_temp.spec('GRIL', 'finish', 'Finish', 'select', null, true, 2, 'Gloss Black|GBLK,Chrome|CHR,Matte Black|MBLK,Carbon Look|CFL,Red Line|REDL');

select pg_temp.fam('ALOY', 'Alloy Wheels', 'ALOY', '8708', 'GST 28%', 'set', true, 64);
select pg_temp.spec('ALOY', 'size', 'Size', 'select', null, true, 1, '13 inch|13,14 inch|14,15 inch|15,16 inch|16,17 inch|17,18 inch|18,19 inch|19,20 inch|20', true);
select pg_temp.spec('ALOY', 'pcd', 'PCD', 'select', null, true, 2, '4x100|4100,4x108|4108,4x114.3|4114,5x100|5100,5x108|5108,5x112|5112,5x114.3|5114,5x139.7|5139,6x139.7|6139');
select pg_temp.spec('ALOY', 'finish', 'Finish', 'select', null, true, 3, 'Silver|SLV,Gunmetal|GUN,Black Machined|BMC,Matte Black|MBLK,Diamond Cut|DIA,Chrome|CHR,Bronze|BRZ');
select pg_temp.spec('ALOY', 'pieces', 'Pieces', 'select', null, true, 4, 'Set of 4|4,Single|1');
select pg_temp.spec('ALOY', 'width', 'Width', 'number', 'inch', false, 5);
select pg_temp.spec('ALOY', 'offset', 'Offset', 'number', 'mm', false, 6);

select pg_temp.fam('WCOV', 'Wheel Covers & Caps', 'WCOV', '8708', 'GST 28%', 'set', false, 65);
select pg_temp.spec('WCOV', 'cover_type', 'Type', 'select', null, true, 1, 'Wheel Cover|COV,Centre Cap|CAP,Nut Cover|NUT,Valve Cap|VALVE');
select pg_temp.spec('WCOV', 'size', 'Size', 'select', null, true, 2, '12 inch|12,13 inch|13,14 inch|14,15 inch|15,16 inch|16');
select pg_temp.spec('WCOV', 'finish', 'Finish', 'select', null, true, 3, 'Silver|SLV,Black|BLK,Silver + Black|SB,Chrome|CHR,Gunmetal|GUN');

select pg_temp.fam('BCOV', 'Car Body Covers', 'BCOV', '6307', 'GST 12%', 'pcs', true, 66);
select pg_temp.spec('BCOV', 'material', 'Material', 'select', null, true, 1, 'Parachute|PARA,Triple Stitched|TRI,Waterproof Polyester|POLY,Silver Matty|SLV,Satin|SAT');
select pg_temp.spec('BCOV', 'colour', 'Colour', 'select', null, true, 2, 'Silver|SLV,Grey|GRY,Black|BLK,Blue|BLU,Military Green|MIL,Maroon|MAR');
select pg_temp.spec('BCOV', 'mirror_pocket', 'Mirror Pocket', 'select', null, false, 3, 'With Mirror Pocket|MP,Without Mirror Pocket|NOMP');

select pg_temp.fam('DGRD', 'Door Guards & Edge Protectors', 'DGRD', '4016', 'GST 18%', 'set', false, 67);
select pg_temp.spec('DGRD', 'guard_type', 'Type', 'select', null, true, 1, 'Door Edge Guard|EDGE,Door Guard Pad|PAD,Bumper Corner|CORN,Door Sill Guard|SILL');
select pg_temp.spec('DGRD', 'colour', 'Colour', 'select', null, true, 2, 'Black|BLK,Transparent|CLR,Chrome|CHR,Carbon|CF,White|WHT');

select pg_temp.fam('SCUF', 'Scuff & Sill Plates', 'SCUF', '8708', 'GST 28%', 'set', true, 68);
select pg_temp.spec('SCUF', 'plate_type', 'Type', 'select', null, true, 1, 'Plain|PLN,With LED|LED,Logo Embossed|LOGO');
select pg_temp.spec('SCUF', 'pieces', 'Pieces', 'select', null, true, 2, 'Set of 4|4,Set of 2|2,Boot Sill|BOOT');
select pg_temp.spec('SCUF', 'material', 'Material', 'select', null, false, 3, 'Stainless Steel|SS,Carbon|CF,ABS Plastic|ABS');

select pg_temp.fam('WRAP', 'Wraps, PPF & Stickers', 'WRAP', '3919', 'GST 18%', 'mtr', false, 69);
select pg_temp.spec('WRAP', 'wrap_type', 'Type', 'select', null, true, 1, 'Body Wrap|WRAP,PPF|PPF,Sticker / Decal|STK,Roof Wrap|ROOF,Chrome Delete|CDEL,Headlight Tint|HTNT');
select pg_temp.spec('WRAP', 'finish', 'Finish', 'select', null, true, 2, 'Gloss|GLS,Matte|MAT,Satin|SAT,Carbon|CF,Chrome|CHR,Clear|CLR');
select pg_temp.spec('WRAP', 'colour', 'Colour', 'select', null, true, 3, 'Black|BLK,White|WHT,Red|RED,Blue|BLU,Grey|GRY,Green|GRN,Clear|CLR');

select pg_temp.fam('FILM', 'Sun Control & Tint Films', 'FILM', '3920', 'GST 18%', 'set', false, 70);
select pg_temp.spec('FILM', 'shade', 'Shade', 'select', null, true, 1, '5% Dark|5,15%|15,35%|35,50%|50,70% Light|70,Clear UV|UV');
select pg_temp.spec('FILM', 'film_type', 'Type', 'select', null, true, 2, 'Dyed|DYE,Carbon|CARB,Ceramic|CER,Nano Ceramic|NANO');
select pg_temp.spec('FILM', 'roll', 'Sold As', 'select', null, false, 3, 'Car Set|SET,Per Metre|MTR,Full Roll|ROLL');

select pg_temp.fam('WIPR', 'Wiper Blades', 'WIPR', '8512', 'GST 28%', 'pcs', false, 71);
select pg_temp.spec('WIPR', 'size', 'Size', 'select', null, true, 1, '12 inch|12,14 inch|14,16 inch|16,17 inch|17,18 inch|18,19 inch|19,20 inch|20,21 inch|21,22 inch|22,24 inch|24,26 inch|26', true);
select pg_temp.spec('WIPR', 'wiper_type', 'Type', 'select', null, true, 2, 'Frameless|FRML,Framed|FRM,Hybrid|HYB,Rear Wiper|REAR');
select pg_temp.spec('WIPR', 'pieces', 'Pieces', 'select', null, true, 3, 'Single|1,Pair|2');

select pg_temp.fam('MIRR', 'Mirrors & Mirror Covers', 'MIRR', '7009', 'GST 18%', 'pcs', true, 72);
select pg_temp.spec('MIRR', 'mirror_type', 'Type', 'select', null, true, 1, 'Side Mirror Assembly|ASM,Mirror Glass|GLS,Mirror Cover|COV,Blind Spot Mirror|BSM,Inside Rear View Mirror|IRVM');
select pg_temp.spec('MIRR', 'side', 'Side', 'select', null, true, 2, 'Left|L,Right|R,Pair|PAIR');
select pg_temp.spec('MIRR', 'finish', 'Finish', 'select', null, true, 3, 'Black|BLK,Chrome|CHR,Carbon|CF,Body Colour|BC');

select pg_temp.fam('EXH', 'Exhausts & Mufflers', 'EXH', '8708', 'GST 28%', 'pcs', false, 73);
select pg_temp.spec('EXH', 'exhaust_type', 'Type', 'select', null, true, 1, 'Exhaust Tip|TIP,Muffler|MUF,Silencer|SIL,Full System|FULL');
select pg_temp.spec('EXH', 'finish', 'Finish', 'select', null, true, 2, 'Chrome|CHR,Black|BLK,Burnt Titanium|TI,Carbon|CF');
select pg_temp.spec('EXH', 'size', 'Size', 'select', null, true, 3, '2 inch|2,2.5 inch|25,3 inch|3,3.5 inch|35,4 inch|4');

select pg_temp.fam('ANT', 'Antennas & Shark Fins', 'ANT', '8529', 'GST 18%', 'pcs', false, 74);
select pg_temp.spec('ANT', 'antenna_type', 'Type', 'select', null, true, 1, 'Shark Fin|FIN,Shark Fin with Signal|FINS,Rod Antenna|ROD,Antenna Base|BASE');
select pg_temp.spec('ANT', 'finish', 'Finish', 'select', null, true, 2, 'Body Colour|BC,Gloss Black|GBLK,Carbon|CF,White|WHT,Silver|SLV,Red|RED');

select pg_temp.fam('NPF', 'Number Plate Frames', 'NPF', '8708', 'GST 28%', 'pair', false, 75);
select pg_temp.spec('NPF', 'frame_type', 'Type', 'select', null, true, 1, 'Frame|FRM,Frame with LED|LED,HSRP Holder|HSRP');
select pg_temp.spec('NPF', 'finish', 'Finish', 'select', null, true, 2, 'Chrome|CHR,Black|BLK,Carbon|CF');
select pg_temp.spec('NPF', 'set', 'Set', 'select', null, true, 3, 'Front|FRT,Rear|REAR,Pair|PAIR');

select pg_temp.fam('CLAD', 'Claddings & Arch Mouldings', 'CLAD', '8708', 'GST 28%', 'set', true, 76);
select pg_temp.spec('CLAD', 'part', 'Part', 'select', null, true, 1, 'Wheel Arch|ARCH,Side Cladding|SIDE,Door Cladding|DOOR,Full Cladding Kit|FULL');
select pg_temp.spec('CLAD', 'finish', 'Finish', 'select', null, true, 2, 'Matte Black|MBLK,Gloss Black|GBLK,Textured Black|TEX,Silver|SLV');
