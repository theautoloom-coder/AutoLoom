-- =============================================================================
-- SEED 02 — Product families and their dynamic specification templates.
-- This is the domain knowledge of the business expressed as data, not code.
-- Admin can edit every row of this from the app.
-- =============================================================================

-- Helper: create a family

-- Helper: create a spec definition and its options.
-- p_options: comma-separated 'Value' or 'Value|CODE' (CODE is used in SKUs).

-- Shared option lists -------------------------------------------------------
-- Bulb sockets used across bulbs, headlights, fog lamps
-- (9005/HB3 and 9006/HB4 are the same socket; both are listed because the trade
--  asks for them by either name, and aliases make search find the other.)


-- =============================================================================
-- LIGHTING
-- =============================================================================

-- 1. Halogen Bulbs ----------------------------------------------------------
select seed_util.seed_family('HAL','Halogen Bulbs','HAL','8539','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 10);
select seed_util.seed_spec('HAL','socket','Socket / Base','select',null, true, true, true, 1, seed_util.sockets());
select seed_util.seed_spec('HAL','wattage','Wattage','number','W',       true, true, true, 2);
select seed_util.seed_spec('HAL','voltage','Voltage','select','V',       true, false,false,3, '12V|12V,24V|24V');
select seed_util.seed_spec('HAL','cct','Colour Temperature','select','K',false,false,false,4, seed_util.cct());
select seed_util.seed_spec('HAL','beam','Beam Type','select',null,       false,false,false,5, 'Low Beam,High Beam,Hi/Lo,Fog,Parking,Indicator');
select seed_util.seed_spec('HAL','pack','Pack Size','select',null,       false,true, true, 6, 'Single|1PC,Pair|PAIR,Set of 4|4PC');
select seed_util.seed_spec('HAL','warranty','Warranty','number','months',false,false,false,9);

-- 2. LED Bulbs --------------------------------------------------------------
select seed_util.seed_family('LED','LED Bulbs','LED','8539','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 11);
select seed_util.seed_spec('LED','socket','Socket / Base','select',null,  true, true, true, 1, seed_util.sockets());
select seed_util.seed_spec('LED','wattage','Wattage','number','W',        true, true, true, 2);
select seed_util.seed_spec('LED','lumens','Lumens','number','lm',         false,false,false,3);
select seed_util.seed_spec('LED','voltage','Voltage','select','V',        true, false,false,4, '12V|12V,24V|24V,12-24V|1224');
select seed_util.seed_spec('LED','cct','Colour Temperature','select','K', true, false,false,5, seed_util.cct());
select seed_util.seed_spec('LED','canbus','CANBUS','select',null,         false,false,false,6, 'Yes,No,Built-in Decoder|BID');
select seed_util.seed_spec('LED','cooling','Cooling','select',null,       false,false,false,7, 'Fan,Fanless,Copper Braid|BRAID');
select seed_util.seed_spec('LED','beam','Beam Type','select',null,        false,false,false,8, 'Low Beam,High Beam,Hi/Lo,Fog,DRL,Parking,Indicator,Reverse');
select seed_util.seed_spec('LED','chip','LED Chip','text',null,           false,false,false,9);
select seed_util.seed_spec('LED','polarity','Polarity','select',null,     false,false,false,10,'Polarity Free|PF,Polarity Sensitive|PS');
select seed_util.seed_spec('LED','connector','Connector','text',null,     false,false,false,11);
select seed_util.seed_spec('LED','pack','Pack Size','select',null,        false,true, true, 12,'Single|1PC,Pair|PAIR,Set of 4|4PC');
select seed_util.seed_spec('LED','warranty','Warranty','number','months', false,false,false,13);

-- 3. HID Kits ---------------------------------------------------------------
select seed_util.seed_family('HID','HID Kits','HID','8539','GST 18%','kit', false, '{FAMILY}-{BRAND}-{AXES}', 12);
select seed_util.seed_spec('HID','socket','Socket / Base','select',null,  true, true, true, 1, seed_util.sockets());
select seed_util.seed_spec('HID','wattage','Wattage','select','W',        true, true, true, 2, '35W|35W,55W|55W,75W|75W,100W|100W');
select seed_util.seed_spec('HID','cct','Colour Temperature','select','K', true, true, true, 3, seed_util.cct());
select seed_util.seed_spec('HID','ballast','Ballast Type','select',null,  false,false,false,4, 'Slim AC,Slim DC,Digital,Canbus Ballast|CBB');
select seed_util.seed_spec('HID','voltage','Voltage','select','V',        false,false,false,5, '12V|12V,24V|24V');
select seed_util.seed_spec('HID','warranty','Warranty','number','months', false,false,false,9);

-- 4. LED Headlights (conversion units) --------------------------------------
select seed_util.seed_family('LHL','LED Headlights','LHL','8512','GST 28%','pair', false, '{FAMILY}-{BRAND}-{AXES}', 13);
select seed_util.seed_spec('LHL','socket','Socket / Base','select',null,  true, true, true, 1, seed_util.sockets());
select seed_util.seed_spec('LHL','wattage','Wattage','number','W',        true, true, true, 2);
select seed_util.seed_spec('LHL','lumens','Lumens','number','lm',         true, false,false,3);
select seed_util.seed_spec('LHL','cct','Colour Temperature','select','K', true, false,false,4, seed_util.cct());
select seed_util.seed_spec('LHL','voltage','Voltage','select','V',        true, false,false,5, '12V|12V,24V|24V,9-32V|932');
select seed_util.seed_spec('LHL','cooling','Cooling','select',null,       true, false,false,6, 'Fan,Fanless,Copper Braid|BRAID');
select seed_util.seed_spec('LHL','canbus','CANBUS','select',null,         false,false,false,7, 'Yes,No,Built-in Decoder|BID');
select seed_util.seed_spec('LHL','beam','Beam Pattern','select',null,     false,false,false,8, 'Hi/Lo,Low Only,High Only,Projector Optimised|PROJ');
select seed_util.seed_spec('LHL','ip','IP Rating','select',null,          false,false,false,9, 'IP65,IP67,IP68');
select seed_util.seed_spec('LHL','warranty','Warranty','number','months', false,false,false,10);

-- 5. Headlight Assemblies ---------------------------------------------------
select seed_util.seed_family('HLA','Headlight Assemblies','HLA','8512','GST 28%','pcs', true, '{FAMILY}-{BRAND}-{VEHICLE}-{AXES}', 14);
select seed_util.seed_spec('HLA','side','Side','select',null,             true, true, true, 1, 'Left|LH,Right|RH,Pair|PAIR');
select seed_util.seed_spec('HLA','style','Style','select',null,           true, true, true, 2, 'OEM Replacement|OEM,Projector DRL|PDRL,Sequential DRL|SEQ,Demon Eye|DEMON,Full LED|FLED');
select seed_util.seed_spec('HLA','drl','DRL Included','select',null,      false,false,false,3, seed_util.yesno());
select seed_util.seed_spec('HLA','indicator','Indicator Type','select',null,false,false,false,4,'Static,Sequential,None');
select seed_util.seed_spec('HLA','housing','Housing Colour','select',null,false,true, true, 5, 'Black|BLK,Chrome|CHR,Smoked|SMK');
select seed_util.seed_spec('HLA','bulb_included','Bulb Included','select',null,false,false,false,6, seed_util.yesno());
select seed_util.seed_spec('HLA','warranty','Warranty','number','months', false,false,false,9);

-- 6. Projectors -------------------------------------------------------------
select seed_util.seed_family('PRJ','Projectors','PRJ','8512','GST 28%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 15);
select seed_util.seed_spec('PRJ','proj_size','Projector Size','select','inch', true, true, true, 1, '2.5 inch|25,3.0 inch|30,3.5 inch|35');
select seed_util.seed_spec('PRJ','tech','Technology','select',null,       true, true, true, 2, 'Bi-LED|BILED,Bi-Xenon|BIXEN,Laser|LASER,Halogen|HAL');
select seed_util.seed_spec('PRJ','lens_type','Lens Type','select',null,   false,false,false,3, 'Clear,Fluted,Blue Tint|BTINT,Double Lens|DBL');
select seed_util.seed_spec('PRJ','shutter','Shutter','select',null,       false,false,false,4, 'Solenoid,Mechanical,None');
select seed_util.seed_spec('PRJ','wattage','Wattage','number','W',        false,false,false,5);
select seed_util.seed_spec('PRJ','lumens','Lumens','number','lm',         false,false,false,6);
select seed_util.seed_spec('PRJ','cct','Colour Temperature','select','K', false,false,false,7, seed_util.cct());
select seed_util.seed_spec('PRJ','beam','Beam','select',null,             false,false,false,8, 'LHD,RHD');
select seed_util.seed_spec('PRJ','pack','Pack Size','select',null,        false,true, true, 9, 'Single|1PC,Pair|PAIR');
select seed_util.seed_spec('PRJ','warranty','Warranty','number','months', false,false,false,10);

-- 7. Fog Lamps (bulbs/pods) -------------------------------------------------
select seed_util.seed_family('FOG','Fog Lamps','FOG','8512','GST 28%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 16);
select seed_util.seed_spec('FOG','tech','Technology','select',null,       true, true, true, 1, 'LED,Halogen|HAL,Laser|LASER');
select seed_util.seed_spec('FOG','socket','Bulb Type','select',null,      false,false,false,2, seed_util.sockets());
select seed_util.seed_spec('FOG','shape','Shape','select',null,           false,true, true, 3, 'Round|RND,Square|SQR,Oval|OVL,Rectangular|RECT');
select seed_util.seed_spec('FOG','wattage','Wattage','number','W',        false,false,false,4);
select seed_util.seed_spec('FOG','lumens','Lumens','number','lm',         false,false,false,5);
select seed_util.seed_spec('FOG','cct','Colour','select','K',             false,true, true, 6, '3000K Golden Yellow|YEL,6000K White|WHT,Dual Colour|DUAL');
select seed_util.seed_spec('FOG','lens_type','Lens Type','select',null,   false,false,false,7, 'Projector,Reflector,Fluted');
select seed_util.seed_spec('FOG','voltage','Voltage','select','V',        false,false,false,8, '12V|12V,24V|24V,9-32V|932');
select seed_util.seed_spec('FOG','side','Side','select',null,             false,true, true, 9, 'Left|LH,Right|RH,Pair|PAIR');
select seed_util.seed_spec('FOG','warranty','Warranty','number','months', false,false,false,10);

-- 8. Fog Lamp Assemblies (vehicle-specific kits) ----------------------------
select seed_util.seed_family('FGA','Fog Lamp Assemblies','FGA','8512','GST 28%','kit', true, '{FAMILY}-{BRAND}-{VEHICLE}-{AXES}', 17);
select seed_util.seed_spec('FGA','tech','Technology','select',null,       true, true, true, 1, 'LED,Halogen|HAL,Bi-LED Projector|BILED');
select seed_util.seed_spec('FGA','cct','Colour','select','K',             false,true, true, 2, '3000K Golden Yellow|YEL,6000K White|WHT,Dual Colour|DUAL');
select seed_util.seed_spec('FGA','wiring_included','Wiring Kit Included','select',null, false,false,false,3, seed_util.yesno());
select seed_util.seed_spec('FGA','switch_included','OEM Switch Included','select',null, false,false,false,4, seed_util.yesno());
select seed_util.seed_spec('FGA','bezel','Bezel / Cover','select',null,   false,false,false,5, 'Included,Not Included');
select seed_util.seed_spec('FGA','warranty','Warranty','number','months', false,false,false,9);

-- 9. DRLs -------------------------------------------------------------------
select seed_util.seed_family('DRL','DRLs','DRL','8512','GST 28%','pair', false, '{FAMILY}-{BRAND}-{AXES}', 18);
select seed_util.seed_spec('DRL','style','Style','select',null,           true, true, true, 1, 'Flexible Strip|FLEX,Rigid Bar|BAR,Vehicle Specific|VS,Eyebrow|EYE');
select seed_util.seed_spec('DRL','length','Length','number','cm',         false,true, true, 2);
select seed_util.seed_spec('DRL','colour_mode','Colour Mode','select',null,true, true, true, 3, 'White|WHT,White + Amber|WA,RGB|RGB,Ice Blue|ICE');
select seed_util.seed_spec('DRL','indicator','Sequential Indicator','select',null, false,false,false,4, seed_util.yesno());
select seed_util.seed_spec('DRL','waterproof','Waterproof','select',null, false,false,false,5, 'IP65,IP67,IP68');
select seed_util.seed_spec('DRL','voltage','Voltage','select','V',        false,false,false,6, '12V|12V,24V|24V');
select seed_util.seed_spec('DRL','warranty','Warranty','number','months', false,false,false,9);

-- 10. Tail Lamps ------------------------------------------------------------
select seed_util.seed_family('TAIL','Tail Lamps','TAIL','8512','GST 28%','pcs', true, '{FAMILY}-{BRAND}-{VEHICLE}-{AXES}', 19);
select seed_util.seed_spec('TAIL','side','Side','select',null,            true, true, true, 1, 'Left|LH,Right|RH,Pair|PAIR');
select seed_util.seed_spec('TAIL','style','Style','select',null,          true, true, true, 2, 'OEM Replacement|OEM,LED Bar|BAR,Sequential|SEQ,Smoked|SMK');
select seed_util.seed_spec('TAIL','colour','Lens Colour','select',null,   false,true, true, 3, 'Red|RED,Smoked|SMK,Clear|CLR,Red-Clear|RCL');
select seed_util.seed_spec('TAIL','warranty','Warranty','number','months',false,false,false,9);

-- 11. Indicators / Side Markers ---------------------------------------------
select seed_util.seed_family('IND','Indicators & Side Markers','IND','8512','GST 28%','pair', false, '{FAMILY}-{BRAND}-{AXES}', 20);
select seed_util.seed_spec('IND','type','Type','select',null,             true, true, true, 1, 'Side Repeater|SIDE,Mirror Indicator|MIRR,Front Indicator|FRNT,Rear Indicator|REAR');
select seed_util.seed_spec('IND','mode','Mode','select',null,             false,true, true, 2, 'Static|STAT,Sequential|SEQ');
select seed_util.seed_spec('IND','colour','Colour','select',null,         false,true, true, 3, 'Amber|AMB,White|WHT,Amber+White|AW');
select seed_util.seed_spec('IND','warranty','Warranty','number','months', false,false,false,9);

-- =============================================================================
-- INTERIOR
-- =============================================================================

-- 12. Mats ------------------------------------------------------------------
select seed_util.seed_family('MAT','Mats','MAT','4016','GST 28%','set', true, '{FAMILY}-{BRAND}-{VEHICLE}-{AXES}', 30);
select seed_util.seed_spec('MAT','mat_type','Mat Type','select',null,     true, true, true, 1, '3D|3D,5D|5D,7D|7D,9D|9D,Flat|FLAT,Coil|COIL,Universal|UNI');
select seed_util.seed_spec('MAT','material','Material','select',null,     true, false,false,2, 'PVC,Rubber,Leatherette|LTHR,PU Leather|PU,TPE,Coil/Noodle|COIL,Carpet|CRPT,EVA');
select seed_util.seed_spec('MAT','colour','Colour','select',null,         true, true, true, 3, seed_util.colours());
select seed_util.seed_spec('MAT','border','Border Type','select',null,    false,true, true, 4, 'Same Colour|SAME,Contrast Stitch|CSTCH,Piping|PIPE,Gold Line|GOLD,No Border|NONE');
select seed_util.seed_spec('MAT','rows','Number of Rows','select',null,   true, true, true, 5, '2 Rows|R2,3 Rows|R3');
select seed_util.seed_spec('MAT','coverage','Coverage','select',null,     true, true, true, 6, 'Full Set|FULL,Front Only|FRNT,Rear Only|REAR,Boot Mat|BOOT,Dicky Tray|DICKY');
select seed_util.seed_spec('MAT','thickness','Thickness','number','mm',   false,false,false,7);
select seed_util.seed_spec('MAT','antislip','Anti-slip Backing','select',null, false,false,false,8, seed_util.yesno());
select seed_util.seed_spec('MAT','waterproof','Waterproof','select',null, false,false,false,9, seed_util.yesno());
select seed_util.seed_spec('MAT','seat_config','Seat Configuration','select',null, false,false,false,10,'5 Seater|5S,6 Seater|6S,7 Seater|7S,Captain Seats|CAPT');
select seed_util.seed_spec('MAT','warranty','Warranty','number','months', false,false,false,11);

-- 13. Seat Covers -----------------------------------------------------------
select seed_util.seed_family('SEAT','Seat Covers','SEAT','9401','GST 18%','set', true, '{FAMILY}-{BRAND}-{VEHICLE}-{AXES}', 31);
select seed_util.seed_spec('SEAT','fit','Fit','select',null,              true, true, true, 1, 'Custom Fit|CUST,Universal|UNI,Bucket Fit|BKT');
select seed_util.seed_spec('SEAT','material','Material','select',null,    true, true, true, 2, 'Leatherette|LTHR,PU Leather|PU,Nappa|NAPPA,Fabric|FAB,Art Leather|ART,Jacquard|JCQ,Mesh|MESH');
select seed_util.seed_spec('SEAT','colour','Colour','select',null,        true, true, true, 3, seed_util.colours());
select seed_util.seed_spec('SEAT','pattern','Pattern','select',null,      false,true, true, 4, 'Plain|PLN,Diamond Stitch|DIAM,Hexagon|HEX,Perforated|PERF,Dual Tone|DUAL,Bucket|BKT');
select seed_util.seed_spec('SEAT','seats','Number of Seats','select',null,true, true, true, 5, '5 Seater|5S,6 Seater|6S,7 Seater|7S');
select seed_util.seed_spec('SEAT','airbag','Airbag Compatible','select',null, true, false,false,6, seed_util.yesno());
select seed_util.seed_spec('SEAT','stitching','Stitching','text',null,    false,false,false,7);
select seed_util.seed_spec('SEAT','headrest','Headrest Covers','select',null, false,false,false,8, 'Included,Not Included');
select seed_util.seed_spec('SEAT','warranty','Warranty','number','months',false,false,false,9);

-- 14. Interior Accessories --------------------------------------------------
select seed_util.seed_family('INT','Interior Accessories','INT','8708','GST 28%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 32);
select seed_util.seed_spec('INT','item_type','Item Type','select',null,   true, true, true, 1, 'Armrest|ARM,Steering Cover|STW,Gear Knob|GEAR,Sun Shade|SUN,Cushion|CUSH,Organiser|ORG,Ambient Light|AMB,Door Guard|DRG,Pedal Set|PEDL,Phone Holder|HOLD,Other|OTH');
select seed_util.seed_spec('INT','material','Material','select',null,     false,false,false,2, 'Leatherette|LTHR,Fabric|FAB,ABS Plastic|ABS,Aluminium|ALU,Silicone|SIL,Carbon Fibre Finish|CF');
select seed_util.seed_spec('INT','colour','Colour','select',null,         false,true, true, 3, seed_util.colours());
select seed_util.seed_spec('INT','fit','Fit','select',null,               false,false,false,4, 'Universal|UNI,Vehicle Specific|VS');
select seed_util.seed_spec('INT','warranty','Warranty','number','months', false,false,false,9);

-- =============================================================================
-- ELECTRONICS
-- =============================================================================

-- 15. Horns -----------------------------------------------------------------
select seed_util.seed_family('HORN','Horns','HORN','8512','GST 28%','set', false, '{FAMILY}-{BRAND}-{AXES}', 40);
select seed_util.seed_spec('HORN','horn_type','Horn Type','select',null,  true, true, true, 1, 'Disc|DISC,Snail|SNAIL,Trumpet|TRMP,Air Horn|AIR,Windtone|WIND,Musical|MUS');
select seed_util.seed_spec('HORN','config','Configuration','select',null, true, true, true, 2, 'Single|1PC,Twin|TWIN,Set of 3|3PC,Set of 4|4PC');
select seed_util.seed_spec('HORN','voltage','Voltage','select','V',       true, false,false,3, '12V|12V,24V|24V');
select seed_util.seed_spec('HORN','db','Sound Level','number','dB',       false,false,false,4);
select seed_util.seed_spec('HORN','frequency','Frequency','text','Hz',    false,false,false,5);
select seed_util.seed_spec('HORN','compressor','Compressor Required','select',null, false,false,false,6, seed_util.yesno());
select seed_util.seed_spec('HORN','connector','Connector','select',null,  false,false,false,7, 'Single Pin|1PIN,Twin Pin|2PIN,Spade|SPADE,Bullet|BUL');
select seed_util.seed_spec('HORN','colour','Colour','select',null,        false,false,false,8, 'Black|BLK,Chrome|CHR,Red|RED,Silver|SLV');
select seed_util.seed_spec('HORN','relay_included','Relay Included','select',null, false,false,false,9, seed_util.yesno());
select seed_util.seed_spec('HORN','warranty','Warranty','number','months',false,false,false,10);

-- 16. Reverse Cameras -------------------------------------------------------
select seed_util.seed_family('CAM','Reverse Cameras','CAM','8525','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 41);
select seed_util.seed_spec('CAM','signal','Signal Type','select',null,    true, true, true, 1, 'AHD|AHD,CVBS|CVBS,HD|HD,Wireless|WLESS');
select seed_util.seed_spec('CAM','resolution','Resolution','select',null, true, true, true, 2, '720P|720P,1080P|1080P,960P|960P,480P|480P');
select seed_util.seed_spec('CAM','shape','Camera Shape','select',null,    false,true, true, 3, 'Butterfly|BFLY,Bullet|BUL,Number Plate|NPLT,Flush Mount|FLSH,OEM Specific|OEM,Fisheye|FISH');
select seed_util.seed_spec('CAM','night_vision','Night Vision','select',null, false,false,false,4, 'Yes,No,IR LED|IR,Starlight|STAR');
select seed_util.seed_spec('CAM','ip','Waterproof Rating','select',null,  false,false,false,5, 'IP66,IP67,IP68');
select seed_util.seed_spec('CAM','guidelines','Dynamic Guidelines','select',null, false,false,false,6, seed_util.yesno());
select seed_util.seed_spec('CAM','angle','Viewing Angle','number','deg',  false,false,false,7);
select seed_util.seed_spec('CAM','voltage','Voltage','select','V',        false,false,false,8, '12V|12V,24V|24V');
select seed_util.seed_spec('CAM','connector','Connector','select',null,   false,false,false,9, 'RCA,4-Pin Aviation|4PIN,6-Pin|6PIN,OEM Plug|OEMP');
select seed_util.seed_spec('CAM','warranty','Warranty','number','months', false,false,false,10);

-- 17. Parking Sensors -------------------------------------------------------
select seed_util.seed_family('PSEN','Parking Sensors','PSEN','8512','GST 28%','kit', false, '{FAMILY}-{BRAND}-{AXES}', 42);
select seed_util.seed_spec('PSEN','sensor_count','Sensor Count','select',null, true, true, true, 1, '2 Sensor|2S,4 Sensor|4S,6 Sensor|6S,8 Sensor|8S');
select seed_util.seed_spec('PSEN','display','Display Type','select',null, true, true, true, 2, 'LED Display|LED,Buzzer Only|BUZZ,Mirror Display|MIRR,No Display|NONE');
select seed_util.seed_spec('PSEN','colour','Sensor Colour','select',null, false,true, true, 3, 'Black|BLK,White|WHT,Silver|SLV,Paintable|PNT');
select seed_util.seed_spec('PSEN','position','Position','select',null,    false,false,false,4, 'Rear,Front,Front+Rear|FR');
select seed_util.seed_spec('PSEN','warranty','Warranty','number','months',false,false,false,9);

-- 18. Android Screens -------------------------------------------------------
select seed_util.seed_family('ANDR','Android Screens','ANDR','8527','GST 28%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 43);
select seed_util.seed_spec('ANDR','screen_size','Screen Size','select','inch', true, true, true, 1, '7 inch|7,9 inch|9,10 inch|10,10.1 inch|101,12.3 inch|123,13.6 inch|136,Tesla Style|TESLA');
select seed_util.seed_spec('ANDR','ram_rom','RAM / Storage','select',null,true, true, true, 2, '1+16GB|1G16,2+32GB|2G32,4+64GB|4G64,6+128GB|6G128,8+128GB|8G128,8+256GB|8G256');
select seed_util.seed_spec('ANDR','android_version','Android Version','select',null, false,false,false,3, 'Android 10,Android 11,Android 12,Android 13,Android 14');
select seed_util.seed_spec('ANDR','resolution','Resolution','select',null,false,false,false,4, '1024x600,1280x720,1920x1080,2000x1200,2K');
select seed_util.seed_spec('ANDR','processor','Processor','text',null,    false,false,false,5);
select seed_util.seed_spec('ANDR','dsp','DSP','select',null,              false,false,false,6, seed_util.yesno());
select seed_util.seed_spec('ANDR','carplay','Wireless CarPlay','select',null, false,false,false,7, seed_util.yesno());
select seed_util.seed_spec('ANDR','android_auto','Android Auto','select',null, false,false,false,8, 'Wireless,Wired,No');
select seed_util.seed_spec('ANDR','sim','4G / SIM Slot','select',null,    false,false,false,9, seed_util.yesno());
select seed_util.seed_spec('ANDR','camera_support','360 Camera Support','select',null, false,false,false,10, seed_util.yesno());
select seed_util.seed_spec('ANDR','frame_included','Frame + Canbus Included','select',null, false,false,false,11, seed_util.yesno());
select seed_util.seed_spec('ANDR','warranty','Warranty','number','months',false,false,false,12);

-- 19. Speakers --------------------------------------------------------------
select seed_util.seed_family('SPKR','Speakers','SPKR','8518','GST 18%','pair', false, '{FAMILY}-{BRAND}-{AXES}', 44);
select seed_util.seed_spec('SPKR','speaker_type','Speaker Type','select',null, true, true, true, 1, 'Coaxial|COAX,Component|COMP,Tweeter|TWTR,Midrange|MID,Full Range|FULL');
select seed_util.seed_spec('SPKR','size','Size','select','inch',          true, true, true, 2, '4 inch|4,5.25 inch|525,6 inch|6,6.5 inch|65,6x9 inch|69');
select seed_util.seed_spec('SPKR','rms','RMS Power','number','W',         false,false,false,3);
select seed_util.seed_spec('SPKR','peak','Peak Power','number','W',       false,false,false,4);
select seed_util.seed_spec('SPKR','impedance','Impedance','select','ohm', false,false,false,5, '2 Ohm|2,4 Ohm|4,8 Ohm|8');
select seed_util.seed_spec('SPKR','sensitivity','Sensitivity','number','dB', false,false,false,6);
select seed_util.seed_spec('SPKR','warranty','Warranty','number','months',false,false,false,9);

-- 20. Amplifiers & Subwoofers ----------------------------------------------
select seed_util.seed_family('AMP','Amplifiers & Subwoofers','AMP','8518','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 45);
select seed_util.seed_spec('AMP','item_type','Item Type','select',null,   true, true, true, 1, 'Amplifier|AMP,Subwoofer|SUB,Bass Tube|TUBE,DSP Processor|DSP');
select seed_util.seed_spec('AMP','channels','Channels','select',null,     false,true, true, 2, 'Mono|1CH,2 Channel|2CH,4 Channel|4CH,5 Channel|5CH');
select seed_util.seed_spec('AMP','size','Size','select','inch',           false,true, true, 3, '8 inch|8,10 inch|10,12 inch|12,15 inch|15');
select seed_util.seed_spec('AMP','rms','RMS Power','number','W',          false,false,false,4);
select seed_util.seed_spec('AMP','peak','Peak Power','number','W',        false,false,false,5);
select seed_util.seed_spec('AMP','impedance','Impedance','select','ohm',  false,false,false,6, '1 Ohm|1,2 Ohm|2,4 Ohm|4');
select seed_util.seed_spec('AMP','enclosure','Enclosure','select',null,   false,false,false,7, 'Sealed,Ported,Free Air,Active');
select seed_util.seed_spec('AMP','warranty','Warranty','number','months', false,false,false,9);

-- 21. Dash Cameras ----------------------------------------------------------
select seed_util.seed_family('DASH','Dash Cameras','DASH','8525','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 46);
select seed_util.seed_spec('DASH','channels','Channels','select',null,    true, true, true, 1, 'Front Only|1CH,Front + Rear|2CH,Front + Cabin|FC,3 Channel|3CH');
select seed_util.seed_spec('DASH','resolution','Resolution','select',null,true, true, true, 2, '1080P|1080P,1440P|1440P,2K|2K,4K|4K');
select seed_util.seed_spec('DASH','display','Display','select',null,      false,false,false,3, 'Yes,No,Mirror Type|MIRR');
select seed_util.seed_spec('DASH','gps','GPS','select',null,              false,false,false,4, seed_util.yesno());
select seed_util.seed_spec('DASH','wifi','WiFi','select',null,            false,false,false,5, seed_util.yesno());
select seed_util.seed_spec('DASH','parking_mode','Parking Mode','select',null, false,false,false,6, seed_util.yesno());
select seed_util.seed_spec('DASH','night_vision','Night Vision','select',null, false,false,false,7, seed_util.yesno());
select seed_util.seed_spec('DASH','warranty','Warranty','number','months',false,false,false,9);

-- 22. GPS & Trackers --------------------------------------------------------
select seed_util.seed_family('GPS','GPS & Trackers','GPS','8526','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 47);
select seed_util.seed_spec('GPS','device_type','Device Type','select',null, true, true, true, 1, 'GPS Tracker|TRK,OBD Tracker|OBD,Magnetic Tracker|MAG,Navigation Unit|NAV');
select seed_util.seed_spec('GPS','network','Network','select',null,       false,true, true, 2, '2G,4G,4G+WiFi|4GW');
select seed_util.seed_spec('GPS','battery','Backup Battery','select',null,false,false,false,3, seed_util.yesno());
select seed_util.seed_spec('GPS','subscription','Subscription Included','text',null, false,false,false,4);
select seed_util.seed_spec('GPS','warranty','Warranty','number','months', false,false,false,9);

-- 23. Chargers & Power ------------------------------------------------------
select seed_util.seed_family('CHRG','Chargers & Power','CHRG','8536','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 48);
select seed_util.seed_spec('CHRG','item_type','Item Type','select',null,  true, true, true, 1, 'Car Charger|CHG,Wireless Charger|WLC,Inverter|INV,Jump Starter|JMP,Power Socket|SOCK');
select seed_util.seed_spec('CHRG','ports','Ports','select',null,          false,true, true, 2, '1 USB|1U,2 USB|2U,USB + Type-C|UC,Dual Type-C|2C');
select seed_util.seed_spec('CHRG','output','Max Output','number','W',     false,false,false,3);
select seed_util.seed_spec('CHRG','fast_charge','Fast Charge','select',null, false,false,false,4, 'QC 3.0|QC3,PD|PD,No');
select seed_util.seed_spec('CHRG','warranty','Warranty','number','months',false,false,false,9);

-- =============================================================================
-- ELECTRICAL / FITMENT PARTS
-- =============================================================================

-- 24. Wiring, Relays & Fuses ------------------------------------------------
select seed_util.seed_family('WIRE','Wiring, Relays & Fuses','WIRE','8544','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 50);
select seed_util.seed_spec('WIRE','item_type','Item Type','select',null,  true, true, true, 1, 'Wiring Harness|HARN,Relay|RLY,Fuse|FUSE,Fuse Box|FBOX,Connector|CONN,Wire Roll|ROLL,Switch|SW');
select seed_util.seed_spec('WIRE','amperage','Amperage','select','A',     false,true, true, 2, '5A|5A,10A|10A,15A|15A,20A|20A,30A|30A,40A|40A,60A|60A,80A|80A');
select seed_util.seed_spec('WIRE','pins','Pins','select',null,           false,true, true, 3, '3 Pin|3P,4 Pin|4P,5 Pin|5P,6 Pin|6P,8 Pin|8P');
select seed_util.seed_spec('WIRE','voltage','Voltage','select','V',       false,false,false,4, '12V|12V,24V|24V');
select seed_util.seed_spec('WIRE','gauge','Wire Gauge','text','sqmm',     false,false,false,5);
select seed_util.seed_spec('WIRE','length','Length','number','mtr',       false,false,false,6);
select seed_util.seed_spec('WIRE','fit','Fit','select',null,              false,false,false,7, 'Universal|UNI,Vehicle Specific|VS');

-- 25. Exterior Accessories --------------------------------------------------
select seed_util.seed_family('EXT','Exterior Accessories','EXT','8708','GST 28%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 51);
select seed_util.seed_spec('EXT','item_type','Item Type','select',null,   true, true, true, 1, 'Body Kit|KIT,Spoiler|SPOI,Roof Rail|RAIL,Side Step|STEP,Bumper Guard|BGRD,Door Visor|VIS,Mud Flap|MUD,Chrome Garnish|CHR,Wheel Cover|WCOV,Grille|GRIL,Bonnet Scoop|SCOOP,Other|OTH');
select seed_util.seed_spec('EXT','material','Material','select',null,     false,false,false,2, 'ABS Plastic|ABS,Stainless Steel|SS,Aluminium|ALU,Fibre|FIB,Rubber|RUB,Carbon Fibre|CF');
select seed_util.seed_spec('EXT','finish','Finish','select',null,         false,true, true, 3, 'Black|BLK,Chrome|CHR,Matte Black|MBLK,Carbon Fibre|CF,Body Colour|BC,Silver|SLV');
select seed_util.seed_spec('EXT','fit','Fit','select',null,               true, false,false,4, 'Vehicle Specific|VS,Universal|UNI');
select seed_util.seed_spec('EXT','position','Position','select',null,     false,true, true, 5, 'Front|FRNT,Rear|REAR,Side|SIDE,Full Set|FULL');
select seed_util.seed_spec('EXT','warranty','Warranty','number','months', false,false,false,9);

-- 26. Modification Parts ----------------------------------------------------
select seed_util.seed_family('MOD','Modification Parts','MOD','8708','GST 28%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 52);
select seed_util.seed_spec('MOD','item_type','Item Type','select',null,   true, true, true, 1, 'Alloy Wheel|ALLOY,Exhaust|EXH,Suspension|SUSP,Brake Kit|BRK,Air Filter|FILT,Sound Damping|DAMP,Window Film|FILM,Ambient Lighting|AMB,Other|OTH');
select seed_util.seed_spec('MOD','size','Size','text',null,              false,true, true, 2);
select seed_util.seed_spec('MOD','finish','Finish','select',null,        false,true, true, 3, 'Black|BLK,Silver|SLV,Machined|MACH,Matte|MATT,Gunmetal|GUN,Bronze|BRZ');
select seed_util.seed_spec('MOD','fit','Fit','select',null,              true, false,false,4, 'Vehicle Specific|VS,Universal|UNI');
select seed_util.seed_spec('MOD','pcd','PCD','text',null,                false,false,false,5);
select seed_util.seed_spec('MOD','warranty','Warranty','number','months',false,false,false,9);

-- 27. Detailing Products ----------------------------------------------------
select seed_util.seed_family('DET','Detailing Products','DET','3405','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 53);
select seed_util.seed_spec('DET','item_type','Item Type','select',null,   true, true, true, 1, 'Shampoo|SHMP,Wax|WAX,Ceramic Coating|CERM,Polish|POL,Interior Cleaner|INTC,Glass Cleaner|GLSS,Tyre Shine|TYRE,Microfibre Cloth|MFC,Applicator|APPL,Other|OTH');
select seed_util.seed_spec('DET','volume','Volume','number','ml',         false,true, true, 2);
select seed_util.seed_spec('DET','surface','Surface','select',null,       false,false,false,3, 'Paint,Glass,Interior,Tyre,Engine Bay,All');

-- 28. Services & Labour -----------------------------------------------------
select seed_util.seed_family('SRVC','Services & Labour','SRV','9987','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 60);
select seed_util.seed_spec('SRVC','service_type','Service Type','select',null, true, true, true, 1, 'Installation|INST,Wiring Work|WIRE,Denting|DENT,Painting|PAINT,Detailing|DETAIL,Custom Fabrication|FAB,Diagnostics|DIAG,Other|OTH');
select seed_util.seed_spec('SRVC','duration','Estimated Duration','text','hours', false,false,false,2);

-- 29. Other / Miscellaneous -------------------------------------------------
select seed_util.seed_family('MISC','Other Accessories','MSC','8708','GST 18%','pcs', false, '{FAMILY}-{BRAND}-{AXES}', 99);
select seed_util.seed_spec('MISC','item_type','Item Type','text',null,    true, true, true, 1);
select seed_util.seed_spec('MISC','variant_label','Variant','text',null,  false,true, true, 2);

-- =============================================================================
-- Categories (reporting buckets)
-- =============================================================================
insert into public.categories (family_id, name, level, sort_order)
select f.id, c.cat, 1, c.sort
from (values
  ('HAL','Lighting',1), ('LED','Lighting',2), ('HID','Lighting',3), ('LHL','Lighting',4),
  ('HLA','Lighting',5), ('PRJ','Lighting',6), ('FOG','Lighting',7), ('FGA','Lighting',8),
  ('DRL','Lighting',9), ('TAIL','Lighting',10), ('IND','Lighting',11),
  ('MAT','Interior',12), ('SEAT','Interior',13), ('INT','Interior',14),
  ('HORN','Electronics',15), ('CAM','Electronics',16), ('PSEN','Electronics',17),
  ('ANDR','Electronics',18), ('SPKR','Audio',19), ('AMP','Audio',20),
  ('DASH','Electronics',21), ('GPS','Electronics',22), ('CHRG','Electronics',23),
  ('WIRE','Electrical',24), ('EXT','Exterior',25), ('MOD','Modification',26),
  ('DET','Detailing',27), ('SRVC','Services',28), ('MISC','Other',29)
) as c(fam, cat, sort)
join public.product_families f on f.code = c.fam
where not exists (select 1 from public.categories x where x.family_id = f.id and x.name = c.cat);

-- =============================================================================
-- Socket aliases: the trade calls the same socket by two names.
-- Searching "HB3" must also find products tagged "9005".
-- =============================================================================
update public.spec_options so
   set aliases = a.alias
  from (values
    ('HB3','9005 hb3'), ('9005','9005 hb3'),
    ('HB4','9006 hb4'), ('9006','9006 hb4'),
    ('H4','h4 hb2 9003'), ('T10','t10 w5w 194 168'),
    ('BA9S','ba9s t4w'), ('BA15S','ba15s 1156 p21w'),
    ('1156','1156 ba15s p21w'), ('1157','1157 bay15d p21-5w'),
    ('880','880 881 h27'), ('881','881 880 h27'),
    ('H8','h8 h11 h9'), ('H16','h16 5202 psx24w')
  ) as a(val, alias)
 where so.value = a.val;
