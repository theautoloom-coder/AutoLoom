-- =============================================================================
-- Every list carries what the shop actually sells (owner, 10 Oct 2026)
--
-- Staff: "spoiler mein grey colour nahi aa raha". Owner: "sab categories, sab
-- products mein dekho — sab required cheezein honi chahiye."
--
-- Each category's lists were read one by one. Colours and finishes were the
-- thin ones — a spoiler came in seven finishes and none of them grey — and a
-- few sizes and types were missing. This adds what a car-accessories counter
-- is asked for. Added only: nothing existing is renamed, reordered or turned
-- back on, and new options go after the ones already there.
--
-- The app also takes a value the list does not have ("+ Aur"): the owner's
-- becomes an option, staff's is kept on the kism as typed.
-- =============================================================================

create function pg_temp.add(p_family text, p_def text, p_options text)
returns void language plpgsql as $$
declare
  v_def uuid;
  v_next int;
  v_opt text;
  v_val text;
begin
  select d.id into v_def
    from public.spec_definitions d join public.product_families f on f.id = d.family_id
   where f.code = p_family and d.code = p_def;
  if v_def is null then return; end if;
  select coalesce(max(sort_order), 0) into v_next from public.spec_options where spec_definition_id = v_def;
  foreach v_opt in array string_to_array(p_options, ',') loop
    v_val := trim(v_opt);
    if v_val = '' then continue; end if;
    -- The same word in another case is the same option.
    if exists (select 1 from public.spec_options where spec_definition_id = v_def and lower(value) = lower(v_val)) then continue; end if;
    v_next := v_next + 1;
    insert into public.spec_options (spec_definition_id, value, code, sort_order)
    values (v_def, v_val, upper(left(regexp_replace(v_val, '[^A-Za-z0-9]', '', 'g'), 8)), v_next)
    on conflict (spec_definition_id, value) do nothing;
  end loop;
end;
$$;

-- --- Body parts: the finishes paint shops and customers ask for -------------
select pg_temp.add('SPLR', 'finish', 'Grey,Silver,Black,Blue,Orange,Yellow,Maroon,Pearl White,Gunmetal,Dual Tone,Carbon Fibre (Real)');
select pg_temp.add('SPLR', 'spoiler_type', 'Universal Spoiler,Roof + Boot Set,Sport Spoiler');
select pg_temp.add('BKIT', 'finish', 'Grey,Silver,White,Red,Blue,Black + Red,Dual Tone,Chrome Line,Carbon Fibre (Real)');
select pg_temp.add('BKIT', 'part', 'Bonnet Vent,Fender Side Vents,Front + Rear Set,Hood Lip');
select pg_temp.add('GRIL', 'finish', 'Grey,Silver,Black + Chrome,Black + Red,Body Colour,Primer (paint karna hai)');
select pg_temp.add('CHRM', 'finish', 'Silver,Gold,Rose Gold,Red,Blue,Body Colour');
select pg_temp.add('ANT', 'finish', 'Grey,Blue,Maroon,Black,Gunmetal');
select pg_temp.add('MIRR', 'finish', 'Gloss Black,Grey,Silver,White,Red,Primer (paint karna hai)');
select pg_temp.add('MIRR', 'mirror_type', 'Convex Mirror,Mirror with Indicator');
select pg_temp.add('CLAD', 'finish', 'Grey,Chrome Line,Body Colour');
select pg_temp.add('NPF', 'finish', 'Silver,Gold,Gloss Black,Red');
select pg_temp.add('BGRD', 'finish', 'Grey,Gunmetal,Silver + Black,Powder Coated Black,Red');
select pg_temp.add('BGRD', 'guard_type', 'Brush Guard,Rear Step Guard,Front Guard,Rear Guard');
select pg_temp.add('STEP', 'finish', 'Grey,Gunmetal,Matte Black,Chrome Line');
select pg_temp.add('STEP', 'step_type', 'Tube Step,Hoop Step');
select pg_temp.add('ROOF', 'finish', 'Grey,Gunmetal,Chrome,White');
select pg_temp.add('ROOF', 'roof_type', 'Luggage Net,Cycle Carrier,Roof Ladder');
select pg_temp.add('VISR', 'finish', 'Carbon,Smoke Grey,Matte Black');
select pg_temp.add('MUDF', 'colour', 'Grey,Blue,White,Silver,Transparent');
select pg_temp.add('MUDF', 'pieces', 'Single');
select pg_temp.add('DGRD', 'colour', 'Grey,Silver,Red,Blue');
select pg_temp.add('EXT', 'finish', 'Grey,Gloss Black,White,Red,Gunmetal,Gold,Primer (paint karna hai)');
select pg_temp.add('MOD', 'finish', 'Grey,Chrome,Red,Gold,Gloss Black,Diamond Cut');

-- --- Wheels -------------------------------------------------------------------
select pg_temp.add('ALOY', 'finish', 'Grey,Hyper Silver,Gloss Black,White,Red Line,Gold,Black + Red,Matte Grey');
select pg_temp.add('ALOY', 'size', '12 inch,21 inch,22 inch');
select pg_temp.add('ALOY', 'pcd', '4x98,5x105,5x120,5x127,6x114.3');
select pg_temp.add('WCOV', 'finish', 'Grey,Gold,Red,Black + Red');
select pg_temp.add('WCOV', 'size', '17 inch');

-- --- Covers, wraps, films -----------------------------------------------------
select pg_temp.add('BCOV', 'colour', 'Dark Grey,Navy Blue,Red,Beige,Brown,Dual Tone');
select pg_temp.add('WRAP', 'colour', 'Silver,Gunmetal Grey,Matte Grey,Nardo Grey,Orange,Yellow,Purple,Maroon,Gold,Brown,Beige,Pearl White,Colour Shift');
select pg_temp.add('WRAP', 'finish', 'Brushed Metal,Metallic,Pearl,Colour Shift');
select pg_temp.add('FILM', 'shade', '20%,25%,80%');

-- --- Interior -----------------------------------------------------------------
select pg_temp.add('TRIM', 'finish', 'Grey,Silver,Gold,Blue,Rose Gold,Matte Black');
select pg_temp.add('STRC', 'colour', 'Blue,White,Maroon,Coffee,Ivory,Black + Grey,Black + Beige,Black + Yellow,Brown + Beige');
select pg_temp.add('STRC', 'size', 'XL 42 cm,Truck 45 cm');
select pg_temp.add('CUSH', 'colour', 'Blue,Maroon,Coffee,Ivory,Wine,Black + Red,Black + Grey,Black + Beige');
select pg_temp.add('ORG', 'colour', 'Red,Blue,Coffee,Maroon,Ivory');
select pg_temp.add('SHADE', 'colour', 'Brown');
select pg_temp.add('KEYC', 'colour', 'Grey,White,Beige,Pink,Green,Carbon,Rose Gold,Tan,Maroon');
select pg_temp.add('KEYC', 'key_type', 'Remote Key,Key Fob');
select pg_temp.add('PERF', 'fragrance', 'Vanilla,Ocean,Green Apple,Cherry,Mint,Oud,Mogra,Black Ice,Bubblegum,Orange');
select pg_temp.add('MAT', 'colour', 'Black + Blue,Black + White,Black + Brown,Brown + Beige,Navy Blue,Purple,Green,Orange,Yellow');
select pg_temp.add('SEAT', 'colour', 'Navy Blue,Black + Blue,Black + White,Black + Brown,Brown + Beige,Black + Orange,Black + Yellow');
select pg_temp.add('INT', 'colour', 'Navy Blue,Black + Blue,Black + White,Black + Brown,Brown + Beige,Silver,Carbon');

-- --- Lighting -----------------------------------------------------------------
select pg_temp.add('AMBL', 'colour', 'Green,Yellow,Pink,Orange,Warm White,Amber');
select pg_temp.add('LBAR', 'light_colour', 'Blue,Red,RGB,Ice Blue');
select pg_temp.add('LBAR', 'size', '8 inch,10 inch,14 inch,20 inch,50 inch');
select pg_temp.add('HLA', 'housing', 'Gloss Black,Matte Black,Smoked Black,Clear');
select pg_temp.add('TAIL', 'colour', 'Smoked Black,Dark Red');
select pg_temp.add('IND', 'colour', 'Smoked,Clear');
select pg_temp.add('DRL', 'colour_mode', 'Yellow,Amber,Blue,Red,White + Yellow');
select pg_temp.add('FOG', 'cct', '4300K Warm White,6500K Cool White,8000K Ice Blue,Tri Colour');
select pg_temp.add('FGA', 'cct', '4300K Warm White,6500K Cool White,8000K Ice Blue,Tri Colour');

-- --- Electronics and the rest ----------------------------------------------------
select pg_temp.add('HORN', 'colour', 'Grey,White,Yellow,Green');
select pg_temp.add('PSEN', 'colour', 'Red,Blue,Body Colour');
select pg_temp.add('LOCK', 'lock_type', 'Smart Key Kit,Remote Start');
select pg_temp.add('INFL', 'infl_type', 'Portable Air Compressor,Valve Caps');
select pg_temp.add('WIPR', 'size', '13 inch,15 inch,23 inch,25 inch,28 inch');
select pg_temp.add('EXH', 'size', '1.5 inch,4.5 inch,5 inch');
select pg_temp.add('EXH', 'finish', 'Silver,Matte Black,Blue Titanium');
