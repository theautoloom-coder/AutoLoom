-- =============================================================================
-- AutoLoom master data — vehicles and accessory specs, for PRODUCTION.
--
-- Paste the whole file into the Supabase SQL editor and run it. It is safe to
-- run more than once: every insert is guarded, so a second run changes nothing.
--
-- It adds only master data — makes, models, generations, categories and the
-- spec options behind them. It does not touch a single stock, bill, customer
-- or payment row.
--
-- Built 2026-09-30 from:
--   supabase/seeds/00_seed_util.sql        (helper functions)
--   supabase/seeds/05_vehicles_expanded.sql
--   supabase/seeds/06_specs_expanded.sql
-- =============================================================================

-- =============================================================================
-- SEED 00 — helper routines used by the seed files.
-- Lives in its own schema and is dropped again by 99_cleanup.sql.
-- =============================================================================

create schema if not exists seed_util;

-- -----------------------------------------------------------------------------
-- Shared option lists
-- (9005/HB3 and 9006/HB4 are the same socket; both are listed because the trade
--  asks for them by either name, and aliases let search find the other.)
-- -----------------------------------------------------------------------------
create or replace function seed_util.sockets() returns text language sql immutable as $$
  select 'H1,H3,H4,H7,H8,H9,H10,H11,H13,H15,H16,HB3|HB3,HB4|HB4,9005|9005,9006|9006,9012|9012,'
      || 'D1S,D2S,D2R,D3S,D4S,880,881,T10|T10,T15,T20,1156,1157,BA9S,BA15S,BAU15S,Festoon|FEST,P13W,PSX24W,PSX26W';
$$;

create or replace function seed_util.cct() returns text language sql immutable as $$
  select '3000K Golden Yellow|3000K,4300K Warm White|4300K,5000K White|5000K,'
      || '6000K White|6000K,6500K Cool White|6500K,8000K Ice Blue|8000K';
$$;

create or replace function seed_util.colours() returns text language sql immutable as $$
  select 'Black|BLK,Beige|BEI,Brown|BRN,Tan|TAN,Grey|GRY,Ivory|IVY,Red|RED,Blue|BLU,'
      || 'Coffee|COF,Wine|WIN,Custom Dual Tone|DUAL';
$$;

create or replace function seed_util.yesno() returns text language sql immutable as $$
  select 'Yes,No';
$$;

-- -----------------------------------------------------------------------------
-- Catalogue builders
-- -----------------------------------------------------------------------------
create or replace function seed_util.seed_family(
  p_code text, p_name text, p_prefix text, p_hsn text, p_tax text,
  p_unit text, p_fitment boolean, p_template text, p_sort int
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.product_families
    (code, name, sku_prefix, sku_template, default_hsn_code, default_unit_id,
     default_tax_rate_id, is_fitment_required, sort_order)
  select p_code, p_name, p_prefix, p_template, p_hsn, u.id, t.id, p_fitment, p_sort
  from public.units u, public.tax_rates t
  where u.code = p_unit and t.name = p_tax
  on conflict (code) do update set name = excluded.name
  returning id into v_id;
  return v_id;
end;
$$;

-- p_options: comma-separated 'Value' or 'Value|CODE' (CODE is used in SKUs).
create or replace function seed_util.seed_spec(
  p_family text, p_code text, p_name text, p_type text, p_unit text,
  p_required boolean, p_axis boolean, p_in_name boolean, p_sort int,
  p_options text default null
) returns uuid language plpgsql as $$
declare
  v_family uuid;
  v_id uuid;
  v_opt text;
  v_val text;
  v_code text;
  i int := 0;
begin
  select id into v_family from public.product_families where code = p_family;

  insert into public.spec_definitions
    (family_id, code, name, data_type, unit, is_required, is_variant_axis,
     show_in_variant_name, is_filterable, sort_order)
  values (v_family, p_code, p_name, p_type, p_unit, p_required, p_axis, p_in_name, true, p_sort)
  on conflict (family_id, code) do update
    set name = excluded.name, data_type = excluded.data_type
  returning id into v_id;

  if p_options is not null then
    foreach v_opt in array string_to_array(p_options, ',') loop
      i := i + 1;
      v_val  := split_part(trim(v_opt), '|', 1);
      v_code := nullif(split_part(trim(v_opt), '|', 2), '');
      insert into public.spec_options (spec_definition_id, value, code, sort_order)
      values (v_id, v_val,
              coalesce(v_code, upper(left(regexp_replace(v_val, '[^A-Za-z0-9]', '', 'g'), 6))), i)
      on conflict (spec_definition_id, value) do update
        set code = excluded.code, sort_order = excluded.sort_order;
    end loop;
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vehicle builders
-- -----------------------------------------------------------------------------
create or replace function seed_util.seed_vehicle(
  p_make text, p_model text, p_code text, p_body text,
  p_gen text, p_from int, p_to int, p_facelift boolean default false
) returns void language plpgsql as $$
declare v_make uuid; v_model uuid;
begin
  select id into v_make from public.vehicle_makes where name = p_make;

  insert into public.vehicle_models (make_id, name, code, body_type)
  values (v_make, p_model, p_code, p_body)
  on conflict (make_id, name) do update set body_type = excluded.body_type
  returning id into v_model;

  insert into public.vehicle_generations
    (model_id, name, year_from, year_to, is_facelift, body_type, sort_order)
  values (v_model, p_gen, p_from, p_to, p_facelift, p_body, p_from)
  on conflict (model_id, name) do nothing;
end;
$$;

create or replace function seed_util.seed_socket(
  p_model text, p_gen text, p_position text, p_socket text
) returns void language plpgsql as $$
declare v_gen uuid; v_spec uuid; v_opt uuid;
begin
  select g.id into v_gen
  from public.vehicle_generations g
  join public.vehicle_models m on m.id = g.model_id
  where m.name = p_model and g.name = p_gen;

  select sd.id into v_spec
  from public.spec_definitions sd
  join public.product_families f on f.id = sd.family_id
  where f.code = 'LED' and sd.code = 'socket';

  select id into v_opt from public.spec_options
  where spec_definition_id = v_spec and value = p_socket;

  if v_gen is null or v_opt is null then return; end if;

  insert into public.vehicle_spec_map (generation_id, spec_definition_id, position_label, option_id)
  values (v_gen, v_spec, p_position, v_opt);
end;
$$;

-- -----------------------------------------------------------------------------
-- Product / stock builders
-- -----------------------------------------------------------------------------
create or replace function seed_util.set_spec(
  p_product uuid, p_variant uuid, p_family text, p_code text, p_value text
) returns void language plpgsql as $$
declare
  v_def public.spec_definitions;
  v_opt public.spec_options;
begin
  select sd.* into v_def
  from public.spec_definitions sd
  join public.product_families f on f.id = sd.family_id
  where f.code = p_family and sd.code = p_code;

  if v_def is null then
    raise exception 'No spec % on family %', p_code, p_family;
  end if;

  if v_def.data_type in ('select','multiselect') then
    select * into v_opt from public.spec_options
    where spec_definition_id = v_def.id and (value = p_value or code = p_value);
    if v_opt is null then
      raise exception 'No option % for spec %.%', p_value, p_family, p_code;
    end if;
  end if;

  insert into public.spec_values
    (product_id, variant_id, spec_definition_id, value_text, value_number,
     value_bool, option_id, display_value)
  values (
    p_product, p_variant, v_def.id,
    case when v_def.data_type = 'text' then p_value end,
    case when v_def.data_type = 'number' then p_value::numeric end,
    case when v_def.data_type = 'boolean' then p_value::boolean end,
    v_opt.id,
    case when v_opt.id is not null then v_opt.value
         when v_def.unit is not null then p_value || ' ' || v_def.unit
         else p_value end
  )
  on conflict do nothing;
end;
$$;

create or replace function seed_util.new_product(
  p_family text, p_brand text, p_name text, p_universal boolean default false
) returns uuid language plpgsql as $$
declare v_id uuid; v_fam public.product_families; v_cat uuid;
begin
  select * into v_fam from public.product_families where code = p_family;
  select id into v_cat from public.categories where family_id = v_fam.id limit 1;

  insert into public.products
    (family_id, category_id, brand_id, name, hsn_code, unit_id, tax_rate_id, is_universal_fit)
  select v_fam.id, v_cat, b.id, p_name, v_fam.default_hsn_code, v_fam.default_unit_id,
         v_fam.default_tax_rate_id, p_universal
  from public.brands b where b.name = p_brand
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function seed_util.new_variant(
  p_product uuid, p_name text, p_sku text, p_barcode text,
  p_mrp numeric, p_retail numeric, p_dealer numeric, p_wholesale numeric,
  p_min_sell numeric, p_min_stock numeric
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.product_variants
    (product_id, variant_name, sku, barcode, mrp, retail_price, dealer_price,
     wholesale_price, min_selling_price, min_stock, reorder_level, reorder_qty)
  values (p_product, p_name, p_sku, p_barcode, p_mrp, p_retail, p_dealer,
          p_wholesale, p_min_sell, p_min_stock, p_min_stock, p_min_stock * 3)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function seed_util.add_fitment(
  p_product uuid, p_variant uuid, p_model text,
  p_gen text default null, p_position text default null
) returns void language plpgsql as $$
declare v_model uuid; v_gen uuid;
begin
  select id into v_model from public.vehicle_models where name = p_model limit 1;
  if v_model is null then return; end if;
  if p_gen is not null then
    select id into v_gen from public.vehicle_generations
    where model_id = v_model and name = p_gen;
  end if;
  insert into public.product_fitments (product_id, variant_id, model_id, generation_id, position)
  values (p_product, p_variant, v_model, v_gen, p_position);
end;
$$;

-- Opening stock is a movement. It is the only legitimate way stock appears.
create or replace function seed_util.open_stock(
  p_variant uuid, p_location text, p_qty numeric, p_cost numeric
) returns void language plpgsql as $$
declare v_loc uuid;
begin
  select id into v_loc from public.locations where code = p_location;
  insert into public.stock_movements
    (variant_id, location_id, qty, movement_type, unit_cost, note)
  values (p_variant, v_loc, p_qty, 'opening', p_cost, 'Opening stock');
  update public.product_variants
     set avg_cost = p_cost, last_purchase_cost = p_cost
   where id = p_variant and avg_cost = 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- Staff logins (local development only — change passwords before go-live)
-- -----------------------------------------------------------------------------
create or replace function seed_util.seed_user(
  p_email text, p_password text, p_name text, p_role text, p_location text
) returns uuid language plpgsql
set search_path = public, auth, extensions
as $$
declare v_id uuid; v_loc uuid;
begin
  select id into v_id from auth.users where email = p_email;

  if v_id is null then
    v_id := gen_random_uuid();
    -- GoTrue scans these token columns into Go strings; NULL breaks sign-in with
    -- "Database error querying schema", so they must be '' rather than NULL.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      p_email, crypt(p_password, gen_salt('bf')),
      now(), now(), now(), now(),
      jsonb_build_object('provider','email','providers',array['email']),
      jsonb_build_object('full_name', p_name),
      false, false,
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities
      (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', p_email),
            'email', now(), now(), now());
  end if;

  select id into v_loc from public.locations where code = p_location;

  insert into public.profiles (id, full_name, role, default_location_id, is_active)
  values (v_id, p_name, p_role, v_loc, true)
  on conflict (id) do update
    set full_name = excluded.full_name, role = excluded.role;

  return v_id;
end;
$$;


-- =============================================================================
-- SEED 05 — the rest of the Indian vehicle master.
-- 03 lists what is on sale today. This file lists what is still on the road.
-- A 2011 Ritz or a 2009 Indica comes to the counter for mats, covers and bulbs
-- far more often than a brand new Victoris does, and a car that is not in the
-- master cannot be tagged on an item at all, so the dead nameplates earn their
-- rows as much as the launches do.
-- Years here are Indian years. A car that reached Europe in 2008 often reached
-- Noida in 2011, or never arrived. European generation numbers are ignored.
-- Where the exact facelift split was not certain the model gets ONE generation
-- covering its whole Indian run, because a wrong year range quietly sells
-- somebody the wrong part, while a wide one only makes the staff look twice.
-- Everything uncertain is listed in the comment block at the foot of the file.
-- Runs after 03, repeats nothing from it, and is safe to re-run.
-- =============================================================================

-- Body types stay inside the vocabulary 03 established — hatchback, sedan, suv,
-- muv, pickup — because the counter sorts by shape, not by RTO class, and a new
-- word here only makes the filter list longer. Vans (Omni, Traveller, Winger)
-- are filed as muv and the small commercials (Ace, Dost, Super Carry) as pickup.
-- The one exception is the electric three-wheelers at the foot of the file; see
-- the note there.

insert into public.vehicle_makes (name, code, sort_order) values
  ('Datsun',              'DAT', 25),
  ('Chevrolet',           'CHV', 26),
  ('Fiat',                'FIA', 27),
  ('Mitsubishi',          'MIT', 28),
  ('Hindustan Motors',    'HM',  29),
  ('BYD',                 'BYD', 30),
  ('Lexus',               'LEX', 31),
  ('Mini',                'MIN', 32),
  ('Jaguar',              'JAG', 33),
  ('Porsche',             'POR', 34),
  ('Ashok Leyland',       'ASL', 35),
  ('Mahindra Last Mile',  'MLM', 36)
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- Models + generations. year_to NULL means "still on sale".
-- Where a model already exists from 03 its original code is repeated verbatim:
-- the model table is unique on (make, code) as well as (make, name), so a fresh
-- code on an old model would collide instead of adding the generation.
-- -----------------------------------------------------------------------------

-- Maruti Suzuki --------------------------------------------------------------
-- The older gens first: 03 starts the Swift at 2011 and the WagonR at 2010, but
-- the ones before those are exactly the cars that come in for a re-trim.
select seed_util.seed_vehicle('Maruti Suzuki','Swift','SWIFT','hatchback','1st Gen 2005-2010', 2005, 2010);
select seed_util.seed_vehicle('Maruti Suzuki','WagonR','WAGONR','hatchback','1st Gen 1999-2010', 1999, 2010);
select seed_util.seed_vehicle('Maruti Suzuki','Alto','ALTO','hatchback','India 2000-2012',      2000, 2012);
select seed_util.seed_vehicle('Maruti Suzuki','Alto K10','ALTOK10','hatchback','India 2010-2014', 2010, 2014);
select seed_util.seed_vehicle('Maruti Suzuki','Dzire','DZIRE','sedan','1st Gen 2008-2012',      2008, 2012);
select seed_util.seed_vehicle('Maruti Suzuki','Celerio','CELERIO','hatchback','1st Gen 2014-2021', 2014, 2021);
select seed_util.seed_vehicle('Maruti Suzuki','Maruti 800','M800','hatchback','India 1983-2014', 1983, 2014);
select seed_util.seed_vehicle('Maruti Suzuki','Zen','ZEN','hatchback','India 1993-2006',        1993, 2006);
select seed_util.seed_vehicle('Maruti Suzuki','Zen Estilo','ESTILO','hatchback','India 2006-2013', 2006, 2013);
select seed_util.seed_vehicle('Maruti Suzuki','Esteem','ESTEEM','sedan','India 1994-2007',      1994, 2007);
select seed_util.seed_vehicle('Maruti Suzuki','Ritz','RITZ','hatchback','India 2009-2016',      2009, 2016);
select seed_util.seed_vehicle('Maruti Suzuki','A-Star','ASTAR','hatchback','India 2008-2014',   2008, 2014);
select seed_util.seed_vehicle('Maruti Suzuki','SX4','SX4','sedan','India 2007-2014',            2007, 2014);
select seed_util.seed_vehicle('Maruti Suzuki','Versa','VERSA','muv','India 2001-2010',          2001, 2010);
select seed_util.seed_vehicle('Maruti Suzuki','Omni','OMNI','muv','India 1984-2019',            1984, 2019);
select seed_util.seed_vehicle('Maruti Suzuki','Gypsy','GYPSY','suv','India 1985-2019',          1985, 2019);
select seed_util.seed_vehicle('Maruti Suzuki','S-Cross','SCROSS','suv','India 2015-2022',       2015, 2022);
select seed_util.seed_vehicle('Maruti Suzuki','Kizashi','KIZASHI','sedan','India 2011-2014',    2011, 2014);
-- The Stingray got its own grille, headlamps and bumper, so it is its own model
-- rather than a WagonR generation: a bumper part that fits one will not fit the other.
select seed_util.seed_vehicle('Maruti Suzuki','WagonR Stingray','STINGRAY','hatchback','India 2013-2017', 2013, 2017);
select seed_util.seed_vehicle('Maruti Suzuki','Super Carry','SCARRY','pickup','2016+',          2016, null);
select seed_util.seed_vehicle('Maruti Suzuki','Victoris','VICTORIS','suv','2025+',              2025, null);
select seed_util.seed_vehicle('Maruti Suzuki','e Vitara','EVITARA','suv','2025+',               2025, null);

-- Hyundai --------------------------------------------------------------------
-- 03 folds the whole i10 line into one model; these are the two runs before Nios.
select seed_util.seed_vehicle('Hyundai','i10','I10','hatchback','i10 2007-2013',          2007, 2013);
select seed_util.seed_vehicle('Hyundai','i10','I10','hatchback','Grand i10 2013-2019',    2013, 2019);
select seed_util.seed_vehicle('Hyundai','i20','I20','hatchback','1st Gen 2008-2014',      2008, 2014);
select seed_util.seed_vehicle('Hyundai','Verna','VERNA','sedan','India 2006-2011',        2006, 2011);
select seed_util.seed_vehicle('Hyundai','Verna','VERNA','sedan','Fluidic 2011-2017',      2011, 2017);
select seed_util.seed_vehicle('Hyundai','Santro','SANTRO','hatchback','India 1998-2014',  1998, 2014);
select seed_util.seed_vehicle('Hyundai','Tucson','TUCSON','suv','India 2016-2020',        2016, 2020);
select seed_util.seed_vehicle('Hyundai','Xcent','XCENT','sedan','India 2014-2019',        2014, 2019);
select seed_util.seed_vehicle('Hyundai','Eon','EON','hatchback','India 2011-2018',        2011, 2018);
select seed_util.seed_vehicle('Hyundai','Getz','GETZ','hatchback','India 2004-2009',      2004, 2009);
select seed_util.seed_vehicle('Hyundai','Accent','ACCENT','sedan','India 1999-2013',      1999, 2013);
select seed_util.seed_vehicle('Hyundai','Elantra','ELANTRA','sedan','India 2012-2016',    2012, 2016);
select seed_util.seed_vehicle('Hyundai','Elantra','ELANTRA','sedan','India 2016-2022',    2016, 2022);
select seed_util.seed_vehicle('Hyundai','i20 Active','I20ACTIVE','hatchback','India 2015-2020', 2015, 2020);
select seed_util.seed_vehicle('Hyundai','Santa Fe','SANTAFE','suv','India 2010-2017',     2010, 2017);
select seed_util.seed_vehicle('Hyundai','Sonata','SONATA','sedan','India 2001-2014',      2001, 2014);
select seed_util.seed_vehicle('Hyundai','Kona Electric','KONA','suv','India 2019-2023',   2019, 2023);
select seed_util.seed_vehicle('Hyundai','Ioniq 5','IONIQ5','suv','2023+',                 2023, null);
select seed_util.seed_vehicle('Hyundai','i20 N Line','I20NLINE','hatchback','2021+',      2021, null);
select seed_util.seed_vehicle('Hyundai','Creta N Line','CRETANL','suv','2024+',           2024, null);
select seed_util.seed_vehicle('Hyundai','Creta Electric','CRETAEV','suv','2025+',         2025, null);

-- Tata -----------------------------------------------------------------------
-- The old Safari is the same nameplate as the 2021 car, so it is a generation on
-- the existing model; the Storme is a different body and gets its own row.
select seed_util.seed_vehicle('Tata','Safari','SAFARI','suv','Dicor 1998-2012',      1998, 2012);
select seed_util.seed_vehicle('Tata','Safari Storme','STORME','suv','India 2012-2019', 2012, 2019);
select seed_util.seed_vehicle('Tata','Indica','INDICA','hatchback','India 1998-2018', 1998, 2018);
select seed_util.seed_vehicle('Tata','Indigo','INDIGO','sedan','India 2002-2018',     2002, 2018);
select seed_util.seed_vehicle('Tata','Zest','ZEST','sedan','India 2014-2020',         2014, 2020);
select seed_util.seed_vehicle('Tata','Bolt','BOLT','hatchback','India 2015-2019',     2015, 2019);
select seed_util.seed_vehicle('Tata','Hexa','HEXA','muv','India 2017-2020',           2017, 2020);
select seed_util.seed_vehicle('Tata','Sumo','SUMO','suv','India 1994-2019',           1994, 2019);
select seed_util.seed_vehicle('Tata','Nano','NANO','hatchback','India 2009-2018',     2009, 2018);
select seed_util.seed_vehicle('Tata','Manza','MANZA','sedan','India 2009-2016',       2009, 2016);
select seed_util.seed_vehicle('Tata','Aria','ARIA','muv','India 2010-2016',           2010, 2016);
select seed_util.seed_vehicle('Tata','Xenon','XENON','pickup','India 2009-2019',      2009, 2019);
select seed_util.seed_vehicle('Tata','Ace','ACE','pickup','India 2005+',              2005, null);
select seed_util.seed_vehicle('Tata','Intra','INTRA','pickup','2019+',                2019, null);
select seed_util.seed_vehicle('Tata','Yodha','YODHA','pickup','2017+',                2017, null);
select seed_util.seed_vehicle('Tata','Winger','WINGER','muv','India 2007+',           2007, null);
-- The EVs are separate models, not trims: the bumpers, grilles and lamp units
-- differ from the petrol car, so a fitment tagged "Nexon" must not claim them.
select seed_util.seed_vehicle('Tata','Nexon EV','NEXONEV','suv','India 2020-2023',    2020, 2023);
select seed_util.seed_vehicle('Tata','Nexon EV','NEXONEV','suv','Facelift 2023+',     2023, null, true);
select seed_util.seed_vehicle('Tata','Punch EV','PUNCHEV','suv','2024+',              2024, null);
select seed_util.seed_vehicle('Tata','Tiago EV','TIAGOEV','hatchback','2023+',        2023, null);
select seed_util.seed_vehicle('Tata','Tigor EV','TIGOREV','sedan','2021+',            2021, null);
select seed_util.seed_vehicle('Tata','Curvv EV','CURVVEV','suv','2024+',              2024, null);
select seed_util.seed_vehicle('Tata','Harrier EV','HARRIEREV','suv','2025+',          2025, null);
select seed_util.seed_vehicle('Tata','Sierra','SIERRA','suv','2025+',                 2025, null);

-- Mahindra -------------------------------------------------------------------
select seed_util.seed_vehicle('Mahindra','Thar','THAR','suv','CRDe 2010-2019',            2010, 2019);
select seed_util.seed_vehicle('Mahindra','Scorpio','SCORPIO','suv','1st Gen 2002-2014',   2002, 2014);
-- 03 already claims 2014+ for the Scorpio as "Classic"; the actual Scorpio Classic
-- badge is the 2022 restyle, so it goes in as its own generation rather than a fix.
select seed_util.seed_vehicle('Mahindra','Scorpio','SCORPIO','suv','Scorpio Classic 2022+', 2022, null);
select seed_util.seed_vehicle('Mahindra','XUV500','XUV500','suv','India 2011-2021',       2011, 2021);
select seed_util.seed_vehicle('Mahindra','KUV100','KUV100','suv','India 2016-2023',       2016, 2023);
select seed_util.seed_vehicle('Mahindra','TUV300','TUV300','suv','India 2015-2020',       2015, 2020);
select seed_util.seed_vehicle('Mahindra','Xylo','XYLO','muv','India 2009-2019',           2009, 2019);
select seed_util.seed_vehicle('Mahindra','Verito','VERITO','sedan','India 2011-2019',     2011, 2019);
select seed_util.seed_vehicle('Mahindra','Quanto','QUANTO','suv','India 2012-2016',       2012, 2016);
select seed_util.seed_vehicle('Mahindra','Alturas G4','ALTURAS','suv','India 2018-2022',  2018, 2022);
select seed_util.seed_vehicle('Mahindra','Bolero Camper','BOLEROCAMP','pickup','India 2007+', 2007, null);
select seed_util.seed_vehicle('Mahindra','Bolero Pik-Up','BOLEROPU','pickup','India 2007+',   2007, null);
select seed_util.seed_vehicle('Mahindra','Supro','SUPRO','muv','India 2015+',             2015, null);
select seed_util.seed_vehicle('Mahindra','Jeeto','JEETO','pickup','2015+',                2015, null);
select seed_util.seed_vehicle('Mahindra','XUV400 EV','XUV400','suv','2023+',              2023, null);
select seed_util.seed_vehicle('Mahindra','BE 6','BE6','suv','2025+',                      2025, null);
select seed_util.seed_vehicle('Mahindra','XEV 9e','XEV9E','suv','2025+',                  2025, null);

-- Kia ------------------------------------------------------------------------
select seed_util.seed_vehicle('Kia','Carnival','CARNIVAL','muv','New Gen 2024+', 2024, null);
select seed_util.seed_vehicle('Kia','Syros','SYROS','suv','2025+',               2025, null);
select seed_util.seed_vehicle('Kia','EV9','EV9','suv','2024+',                   2024, null);

-- Toyota ---------------------------------------------------------------------
select seed_util.seed_vehicle('Toyota','Fortuner','FORTUNER','suv','1st Gen 2009-2016', 2009, 2016);
-- 03 took the code INNOVA for the Crysta, so the pre-Crysta car carries INNOVA1.
-- The name is what staff search on; the code only has to stay unique per make.
select seed_util.seed_vehicle('Toyota','Innova','INNOVA1','muv','India 2005-2016',      2005, 2016);
select seed_util.seed_vehicle('Toyota','Qualis','QUALIS','muv','India 2000-2005',       2000, 2005);
select seed_util.seed_vehicle('Toyota','Etios','ETIOS','sedan','India 2010-2020',       2010, 2020);
select seed_util.seed_vehicle('Toyota','Etios Liva','LIVA','hatchback','India 2011-2020', 2011, 2020);
select seed_util.seed_vehicle('Toyota','Corolla','COROLLA','sedan','India 2003-2008',   2003, 2008);
select seed_util.seed_vehicle('Toyota','Corolla Altis','ALTIS','sedan','India 2008-2014', 2008, 2014);
select seed_util.seed_vehicle('Toyota','Corolla Altis','ALTIS','sedan','India 2014-2020', 2014, 2020);
select seed_util.seed_vehicle('Toyota','Camry','CAMRY','sedan','India 2002+',           2002, null);
select seed_util.seed_vehicle('Toyota','Yaris','YARIS','sedan','India 2018-2021',       2018, 2021);
select seed_util.seed_vehicle('Toyota','Urban Cruiser','URBANCRUISER','suv','India 2020-2022', 2020, 2022);
select seed_util.seed_vehicle('Toyota','Hilux','HILUX','pickup','2022+',                2022, null);
select seed_util.seed_vehicle('Toyota','Vellfire','VELLFIRE','muv','2020+',             2020, null);
select seed_util.seed_vehicle('Toyota','Land Cruiser','LANDCRUISER','suv','India 2009-2021', 2009, 2021);
select seed_util.seed_vehicle('Toyota','Land Cruiser','LANDCRUISER','suv','LC 300 2022+',    2022, null);
select seed_util.seed_vehicle('Toyota','Land Cruiser Prado','PRADO','suv','India 2010-2020', 2010, 2020);

-- Honda ----------------------------------------------------------------------
select seed_util.seed_vehicle('Honda','City','CITY','sedan','2nd Gen 2003-2008',    2003, 2008);
select seed_util.seed_vehicle('Honda','City','CITY','sedan','3rd Gen 2008-2014',    2008, 2014);
select seed_util.seed_vehicle('Honda','Amaze','AMAZE','sedan','1st Gen 2013-2018',  2013, 2018);
select seed_util.seed_vehicle('Honda','Jazz','JAZZ','hatchback','1st Gen 2009-2013', 2009, 2013);
select seed_util.seed_vehicle('Honda','Brio','BRIO','hatchback','India 2011-2016',  2011, 2016);
select seed_util.seed_vehicle('Honda','Mobilio','MOBILIO','muv','India 2014-2017',  2014, 2017);
select seed_util.seed_vehicle('Honda','BR-V','BRV','suv','India 2016-2020',         2016, 2020);
-- The Civic left India in 2012 and came back for two years in 2019; one row each,
-- because nothing off the old car fits the new one.
select seed_util.seed_vehicle('Honda','Civic','CIVIC','sedan','India 2006-2012',    2006, 2012);
select seed_util.seed_vehicle('Honda','Civic','CIVIC','sedan','India 2019-2020',    2019, 2020);
select seed_util.seed_vehicle('Honda','CR-V','CRV','suv','India 2003-2020',         2003, 2020);
select seed_util.seed_vehicle('Honda','Accord','ACCORD','sedan','India 2001-2020',  2001, 2020);

-- MG -------------------------------------------------------------------------
select seed_util.seed_vehicle('MG','ZS EV','ZSEV','suv','2020+',              2020, null);
select seed_util.seed_vehicle('MG','Hector Plus','HECTORPLUS','suv','2020+',  2020, null);
select seed_util.seed_vehicle('MG','Majestor','MAJESTOR','suv','2025+',       2025, null);
select seed_util.seed_vehicle('MG','M9','M9','muv','2025+',                   2025, null);

-- Renault --------------------------------------------------------------------
select seed_util.seed_vehicle('Renault','Captur','CAPTUR','suv','India 2017-2020',     2017, 2020);
select seed_util.seed_vehicle('Renault','Lodgy','LODGY','muv','India 2015-2020',       2015, 2020);
select seed_util.seed_vehicle('Renault','Scala','SCALA','sedan','India 2012-2017',     2012, 2017);
select seed_util.seed_vehicle('Renault','Pulse','PULSE','hatchback','India 2012-2017', 2012, 2017);
select seed_util.seed_vehicle('Renault','Fluence','FLUENCE','sedan','India 2011-2016', 2011, 2016);
select seed_util.seed_vehicle('Renault','Koleos','KOLEOS','suv','India 2011-2016',     2011, 2016);

-- Nissan ---------------------------------------------------------------------
select seed_util.seed_vehicle('Nissan','Micra','MICRA','hatchback','India 2010-2020', 2010, 2020);
select seed_util.seed_vehicle('Nissan','Sunny','SUNNY','sedan','India 2011-2019',     2011, 2019);
select seed_util.seed_vehicle('Nissan','Terrano','TERRANO','suv','India 2013-2020',   2013, 2020);
select seed_util.seed_vehicle('Nissan','Kicks','KICKS','suv','India 2019-2022',       2019, 2022);
select seed_util.seed_vehicle('Nissan','Evalia','EVALIA','muv','India 2012-2016',     2012, 2016);
select seed_util.seed_vehicle('Nissan','X-Trail','XTRAIL','suv','India 2005-2014',    2005, 2014);
select seed_util.seed_vehicle('Nissan','X-Trail','XTRAIL','suv','2023+',              2023, null);

-- Volkswagen -----------------------------------------------------------------
select seed_util.seed_vehicle('Volkswagen','Vento','VENTO','sedan','India 2010-2022', 2010, 2022);
select seed_util.seed_vehicle('Volkswagen','Ameo','AMEO','sedan','India 2016-2020',   2016, 2020);
select seed_util.seed_vehicle('Volkswagen','Jetta','JETTA','sedan','India 2008-2017', 2008, 2017);
select seed_util.seed_vehicle('Volkswagen','Passat','PASSAT','sedan','India 2017-2020', 2017, 2020);
select seed_util.seed_vehicle('Volkswagen','Tiguan','TIGUAN','suv','India 2017-2020', 2017, 2020);
select seed_util.seed_vehicle('Volkswagen','Tiguan','TIGUAN','suv','Allspace 2020+',  2020, null);
select seed_util.seed_vehicle('Volkswagen','T-Roc','TROC','suv','India 2020-2022',    2020, 2022);

-- Skoda ----------------------------------------------------------------------
-- The Laura was sold alongside the name Octavia in India, so it keeps its own row
-- the way the showroom sold it, not the way Skoda numbers its generations.
select seed_util.seed_vehicle('Skoda','Octavia','OCTAVIA','sedan','India 2001-2010', 2001, 2010);
select seed_util.seed_vehicle('Skoda','Octavia','OCTAVIA','sedan','3rd Gen 2013-2020', 2013, 2020);
select seed_util.seed_vehicle('Skoda','Octavia','OCTAVIA','sedan','4th Gen 2021+',   2021, null);
select seed_util.seed_vehicle('Skoda','Laura','LAURA','sedan','India 2005-2013',     2005, 2013);
select seed_util.seed_vehicle('Skoda','Superb','SUPERB','sedan','India 2009-2020',   2009, 2020);
select seed_util.seed_vehicle('Skoda','Superb','SUPERB','sedan','CBU 2023+',         2023, null);
select seed_util.seed_vehicle('Skoda','Fabia','FABIA','hatchback','India 2008-2013', 2008, 2013);
select seed_util.seed_vehicle('Skoda','Yeti','YETI','suv','India 2010-2017',         2010, 2017);
select seed_util.seed_vehicle('Skoda','Kodiaq','KODIAQ','suv','India 2017+',         2017, null);

-- Ford -----------------------------------------------------------------------
select seed_util.seed_vehicle('Ford','Endeavour','ENDEAVOUR','suv','India 2003-2015',  2003, 2015);
select seed_util.seed_vehicle('Ford','Endeavour','ENDEAVOUR','suv','3rd Gen 2016-2021', 2016, 2021);
select seed_util.seed_vehicle('Ford','Fiesta','FIESTA','sedan','Classic 2005-2011',    2005, 2011);
select seed_util.seed_vehicle('Ford','Fiesta','FIESTA','sedan','India 2011-2015',      2011, 2015);
select seed_util.seed_vehicle('Ford','Ikon','IKON','sedan','India 1999-2011',          1999, 2011);
select seed_util.seed_vehicle('Ford','Aspire','ASPIRE','sedan','India 2015-2021',      2015, 2021);
select seed_util.seed_vehicle('Ford','Freestyle','FREESTYLE','hatchback','India 2018-2021', 2018, 2021);

-- Citroen --------------------------------------------------------------------
select seed_util.seed_vehicle('Citroen','eC3','EC3','hatchback','2023+',           2023, null);
select seed_util.seed_vehicle('Citroen','Basalt','BASALT','suv','2024+',           2024, null);
select seed_util.seed_vehicle('Citroen','C3 Aircross','C3AIRCROSS','suv','2023+',  2023, null);
select seed_util.seed_vehicle('Citroen','C5 Aircross','C5AIRCROSS','suv','India 2021+', 2021, null);

-- Jeep -----------------------------------------------------------------------
-- The Wrangler and Grand Cherokee arrived as imports and later came off the Ranjangaon
-- line; the body did not change enough to sell different parts, so one row each.
select seed_util.seed_vehicle('Jeep','Wrangler','WRANGLER','suv','India 2016+',              2016, null);
select seed_util.seed_vehicle('Jeep','Grand Cherokee','GRANDCHEROKEE','suv','India 2016+',   2016, null);
select seed_util.seed_vehicle('Jeep','Meridian','MERIDIAN','suv','2022+',                    2022, null);

-- Isuzu ----------------------------------------------------------------------
select seed_util.seed_vehicle('Isuzu','MU-X','MUX','suv','India 2017+', 2017, null);

-- Force ----------------------------------------------------------------------
-- Every second school van and staff shuttle in Noida is a Traveller, and they go
-- through seat covers and roof lamps faster than anything a private owner buys.
select seed_util.seed_vehicle('Force','Traveller','TRAVELLER','muv','India 2000+', 2000, null);
select seed_util.seed_vehicle('Force','Urbania','URBANIA','muv','2023+',           2023, null);

-- Datsun ---------------------------------------------------------------------
-- Dead brand, live cars: the GO family was sold cheap and in volume until 2022.
select seed_util.seed_vehicle('Datsun','GO','GO','hatchback','India 2014-2022',       2014, 2022);
select seed_util.seed_vehicle('Datsun','GO+','GOPLUS','muv','India 2015-2022',        2015, 2022);
select seed_util.seed_vehicle('Datsun','redi-GO','REDIGO','hatchback','India 2016-2022', 2016, 2022);

-- Chevrolet ------------------------------------------------------------------
-- GM left India in 2017 and the dealer network went with it, which is exactly why
-- these owners end up at an independent accessories counter.
select seed_util.seed_vehicle('Chevrolet','Beat','BEAT','hatchback','India 2010-2017',  2010, 2017);
select seed_util.seed_vehicle('Chevrolet','Spark','SPARK','hatchback','India 2007-2013', 2007, 2013);
select seed_util.seed_vehicle('Chevrolet','Sail','SAIL','sedan','India 2012-2017',      2012, 2017);
select seed_util.seed_vehicle('Chevrolet','Cruze','CRUZE','sedan','India 2009-2017',    2009, 2017);
select seed_util.seed_vehicle('Chevrolet','Optra','OPTRA','sedan','India 2003-2010',    2003, 2010);
select seed_util.seed_vehicle('Chevrolet','Aveo','AVEO','sedan','India 2006-2011',      2006, 2011);
select seed_util.seed_vehicle('Chevrolet','Tavera','TAVERA','muv','India 2004-2017',    2004, 2017);
select seed_util.seed_vehicle('Chevrolet','Enjoy','ENJOY','muv','India 2013-2017',      2013, 2017);
select seed_util.seed_vehicle('Chevrolet','Captiva','CAPTIVA','suv','India 2007-2015',  2007, 2015);
select seed_util.seed_vehicle('Chevrolet','Trailblazer','TRAILBLAZER','suv','India 2015-2017', 2015, 2017);

-- Fiat -----------------------------------------------------------------------
select seed_util.seed_vehicle('Fiat','Palio','PALIO','hatchback','India 1999-2009',     1999, 2009);
select seed_util.seed_vehicle('Fiat','Punto','PUNTO','hatchback','India 2009-2019',     2009, 2019);
select seed_util.seed_vehicle('Fiat','Linea','LINEA','sedan','India 2009-2018',         2009, 2018);
select seed_util.seed_vehicle('Fiat','Avventura','AVVENTURA','hatchback','India 2014-2019', 2014, 2019);

-- Mitsubishi -----------------------------------------------------------------
select seed_util.seed_vehicle('Mitsubishi','Lancer','LANCER','sedan','India 1998-2012',        1998, 2012);
select seed_util.seed_vehicle('Mitsubishi','Cedia','CEDIA','sedan','India 2006-2013',          2006, 2013);
select seed_util.seed_vehicle('Mitsubishi','Pajero','PAJERO','suv','India 2002-2012',          2002, 2012);
select seed_util.seed_vehicle('Mitsubishi','Pajero Sport','PAJEROSPORT','suv','India 2012-2020', 2012, 2020);
select seed_util.seed_vehicle('Mitsubishi','Outlander','OUTLANDER','suv','India 2009-2017',    2009, 2017);

-- Hindustan Motors -----------------------------------------------------------
-- One model, sixty years, and still a steady trade in seat covers and mats.
select seed_util.seed_vehicle('Hindustan Motors','Ambassador','AMBASSADOR','sedan','India 1958-2014', 1958, 2014);

-- BYD ------------------------------------------------------------------------
select seed_util.seed_vehicle('BYD','e6','E6','muv','India 2021+',       2021, null);
select seed_util.seed_vehicle('BYD','Atto 3','ATTO3','suv','2022+',      2022, null);
select seed_util.seed_vehicle('BYD','Seal','SEAL','sedan','2024+',       2024, null);
select seed_util.seed_vehicle('BYD','eMAX 7','EMAX7','muv','2024+',      2024, null);
select seed_util.seed_vehicle('BYD','Sealion 7','SEALION7','suv','2025+', 2025, null);

-- Lexus, Mini, Jaguar, Porsche -----------------------------------------------
-- The imported brands get one generation per nameplate on purpose. Their Indian
-- runs are short, the facelift dates here rarely match the factory ones, and the
-- shop sells them mats and films rather than body parts, so a wide range is safe
-- and a guessed split would not be.
select seed_util.seed_vehicle('Lexus','ES','ES','sedan','India 2018+',   2018, null);
select seed_util.seed_vehicle('Lexus','NX','NX','suv','India 2022+',     2022, null);
select seed_util.seed_vehicle('Lexus','RX','RX','suv','India 2023+',     2023, null);
select seed_util.seed_vehicle('Lexus','LX','LX','suv','India 2022+',     2022, null);
select seed_util.seed_vehicle('Lexus','LM','LM','muv','India 2023+',     2023, null);
select seed_util.seed_vehicle('Mini','Cooper','COOPER','hatchback','India 2012+',     2012, null);
select seed_util.seed_vehicle('Mini','Countryman','COUNTRYMAN','suv','India 2013+',   2013, null);
select seed_util.seed_vehicle('Jaguar','XE','XE','sedan','India 2016-2021',  2016, 2021);
select seed_util.seed_vehicle('Jaguar','XF','XF','sedan','India 2009-2021',  2009, 2021);
select seed_util.seed_vehicle('Jaguar','XJ','XJ','sedan','India 2010-2019',  2010, 2019);
select seed_util.seed_vehicle('Jaguar','F-Pace','FPACE','suv','India 2016+', 2016, null);
select seed_util.seed_vehicle('Porsche','Cayenne','CAYENNE','suv','India 2004+',    2004, null);
select seed_util.seed_vehicle('Porsche','Macan','MACAN','suv','India 2014+',        2014, null);
select seed_util.seed_vehicle('Porsche','Panamera','PANAMERA','sedan','India 2010+', 2010, null);
select seed_util.seed_vehicle('Porsche','Taycan','TAYCAN','sedan','India 2021+',    2021, null);

-- BMW ------------------------------------------------------------------------
-- 03 created the German makes but left them empty, so every row below is new.
-- Only the splits that are common knowledge at an Indian counter are split.
select seed_util.seed_vehicle('BMW','3 Series','SERIES3','sedan','F30 2012-2019', 2012, 2019);
select seed_util.seed_vehicle('BMW','3 Series','SERIES3','sedan','G20 2019+',     2019, null);
select seed_util.seed_vehicle('BMW','5 Series','SERIES5','sedan','F10 2010-2017', 2010, 2017);
select seed_util.seed_vehicle('BMW','5 Series','SERIES5','sedan','G30 2017-2024', 2017, 2024);
select seed_util.seed_vehicle('BMW','5 Series','SERIES5','sedan','G60 2024+',     2024, null);
select seed_util.seed_vehicle('BMW','7 Series','SERIES7','sedan','India 2009-2022', 2009, 2022);
select seed_util.seed_vehicle('BMW','7 Series','SERIES7','sedan','G70 2023+',     2023, null);
select seed_util.seed_vehicle('BMW','2 Series Gran Coupe','SERIES2','sedan','India 2020+', 2020, null);
select seed_util.seed_vehicle('BMW','X1','X1','suv','India 2010-2016',  2010, 2016);
select seed_util.seed_vehicle('BMW','X1','X1','suv','India 2016-2022',  2016, 2022);
select seed_util.seed_vehicle('BMW','X1','X1','suv','India 2023+',      2023, null);
select seed_util.seed_vehicle('BMW','X3','X3','suv','India 2011-2018',  2011, 2018);
select seed_util.seed_vehicle('BMW','X3','X3','suv','India 2018+',      2018, null);
select seed_util.seed_vehicle('BMW','X5','X5','suv','India 2007+',      2007, null);
select seed_util.seed_vehicle('BMW','X7','X7','suv','India 2019+',      2019, null);
select seed_util.seed_vehicle('BMW','iX1','IX1','suv','India 2023+',    2023, null);

-- Mercedes-Benz --------------------------------------------------------------
select seed_util.seed_vehicle('Mercedes-Benz','C-Class','CCLASS','sedan','W205 2015-2022', 2015, 2022);
select seed_util.seed_vehicle('Mercedes-Benz','C-Class','CCLASS','sedan','W206 2022+',     2022, null);
select seed_util.seed_vehicle('Mercedes-Benz','E-Class','ECLASS','sedan','W213 2017-2024', 2017, 2024);
select seed_util.seed_vehicle('Mercedes-Benz','E-Class','ECLASS','sedan','W214 2024+',     2024, null);
select seed_util.seed_vehicle('Mercedes-Benz','S-Class','SCLASS','sedan','W222 2014-2021', 2014, 2021);
select seed_util.seed_vehicle('Mercedes-Benz','S-Class','SCLASS','sedan','W223 2021+',     2021, null);
select seed_util.seed_vehicle('Mercedes-Benz','A-Class Limousine','ACLASS','sedan','India 2021+', 2021, null);
select seed_util.seed_vehicle('Mercedes-Benz','GLA','GLA','suv','India 2014-2020',  2014, 2020);
select seed_util.seed_vehicle('Mercedes-Benz','GLA','GLA','suv','India 2021+',      2021, null);
select seed_util.seed_vehicle('Mercedes-Benz','GLC','GLC','suv','India 2016-2022',  2016, 2022);
select seed_util.seed_vehicle('Mercedes-Benz','GLC','GLC','suv','India 2023+',      2023, null);
select seed_util.seed_vehicle('Mercedes-Benz','GLE','GLE','suv','India 2015+',      2015, null);
select seed_util.seed_vehicle('Mercedes-Benz','GLS','GLS','suv','India 2016+',      2016, null);
select seed_util.seed_vehicle('Mercedes-Benz','G-Class','GCLASS','suv','India 2018+', 2018, null);
select seed_util.seed_vehicle('Mercedes-Benz','EQS','EQS','sedan','India 2022+',    2022, null);

-- Audi -----------------------------------------------------------------------
select seed_util.seed_vehicle('Audi','A3','A3','sedan','India 2014-2020',  2014, 2020);
select seed_util.seed_vehicle('Audi','A4','A4','sedan','India 2008-2016',  2008, 2016);
select seed_util.seed_vehicle('Audi','A4','A4','sedan','B9 2016+',         2016, null);
select seed_util.seed_vehicle('Audi','A6','A6','sedan','India 2011-2019',  2011, 2019);
select seed_util.seed_vehicle('Audi','A6','A6','sedan','C8 2019+',         2019, null);
select seed_util.seed_vehicle('Audi','A8 L','A8','sedan','India 2011+',    2011, null);
select seed_util.seed_vehicle('Audi','Q3','Q3','suv','India 2012-2019',    2012, 2019);
select seed_util.seed_vehicle('Audi','Q3','Q3','suv','India 2022+',        2022, null);
select seed_util.seed_vehicle('Audi','Q5','Q5','suv','India 2009-2018',    2009, 2018);
select seed_util.seed_vehicle('Audi','Q5','Q5','suv','India 2018+',        2018, null);
select seed_util.seed_vehicle('Audi','Q7','Q7','suv','India 2006-2015',    2006, 2015);
select seed_util.seed_vehicle('Audi','Q7','Q7','suv','India 2015+',        2015, null);
select seed_util.seed_vehicle('Audi','Q8','Q8','suv','India 2020+',        2020, null);
select seed_util.seed_vehicle('Audi','e-tron','ETRON','suv','India 2021+', 2021, null);

-- Volvo ----------------------------------------------------------------------
select seed_util.seed_vehicle('Volvo','S60','S60','sedan','India 2011+',        2011, null);
select seed_util.seed_vehicle('Volvo','S90','S90','sedan','India 2016+',        2016, null);
select seed_util.seed_vehicle('Volvo','XC40','XC40','suv','India 2018+',        2018, null);
select seed_util.seed_vehicle('Volvo','XC60','XC60','suv','India 2017+',        2017, null);
select seed_util.seed_vehicle('Volvo','XC90','XC90','suv','India 2015+',        2015, null);
select seed_util.seed_vehicle('Volvo','C40 Recharge','C40','suv','India 2022+', 2022, null);

-- Land Rover -----------------------------------------------------------------
select seed_util.seed_vehicle('Land Rover','Range Rover','RANGEROVER','suv','India 2013+',        2013, null);
select seed_util.seed_vehicle('Land Rover','Range Rover Sport','RRSPORT','suv','India 2013+',     2013, null);
select seed_util.seed_vehicle('Land Rover','Range Rover Evoque','EVOQUE','suv','India 2011+',     2011, null);
select seed_util.seed_vehicle('Land Rover','Range Rover Velar','VELAR','suv','India 2017+',       2017, null);
select seed_util.seed_vehicle('Land Rover','Discovery','DISCOVERY','suv','India 2017+',           2017, null);
select seed_util.seed_vehicle('Land Rover','Discovery Sport','DISCOSPORT','suv','India 2015+',    2015, null);
select seed_util.seed_vehicle('Land Rover','Defender','DEFENDER','suv','India 2020+',             2020, null);

-- Ashok Leyland --------------------------------------------------------------
-- Small commercials are here because the shop already sells them seat covers,
-- floor mats and work lamps; the heavy trucks are deliberately left out.
select seed_util.seed_vehicle('Ashok Leyland','Dost','DOST','pickup','India 2011+',      2011, null);
select seed_util.seed_vehicle('Ashok Leyland','Bada Dost','BADADOST','pickup','2020+',   2020, null);
select seed_util.seed_vehicle('Ashok Leyland','Partner','PARTNER','pickup','India 2017+', 2017, null);

-- Mahindra Last Mile ---------------------------------------------------------
-- The e-rickshaws get a body type of their own. Calling a Treo an MUV would put
-- it in front of staff looking for car mats, and calling it a pickup would be a
-- lie; it sells seat covers, hood covers and lamps, so it belongs in the master.
select seed_util.seed_vehicle('Mahindra Last Mile','Treo','TREO','three-wheeler','India 2018+',      2018, null);
select seed_util.seed_vehicle('Mahindra Last Mile','Treo Zor','TREOZOR','three-wheeler','2020+',     2020, null);
select seed_util.seed_vehicle('Mahindra Last Mile','e-Alfa Mini','EALFAMINI','three-wheeler','India 2018+', 2018, null);

-- -----------------------------------------------------------------------------
-- Search aliases, same idea as 03: the name on the bonnet is rarely the name the
-- customer says out loud.
-- -----------------------------------------------------------------------------
insert into public.vehicle_model_aliases (model_id, alias)
select vm.id, a.alias
from (values
  ('Zen Estilo','Estilo'), ('WagonR Stingray','Stingray'),
  ('Maruti 800','800'), ('Maruti 800','M800'),
  ('Super Carry','Supercarry'), ('e Vitara','eVitara'), ('e Vitara','E Vitara'),
  ('i20 Active','Active i20'), ('i20 N Line','i20 NLine'),
  ('Creta N Line','Creta NLine'), ('Creta Electric','Creta EV'),
  ('Kona Electric','Kona'), ('Ioniq 5','Ioniq'),
  ('Safari Storme','Storme'), ('Nexon EV','Nexon Electric'),
  ('Tigor EV','Tigor Electric'), ('Tiago EV','Tiago Electric'),
  ('Punch EV','Punch Electric'), ('Curvv EV','Curvv Electric'),
  ('Harrier EV','Harrier Electric'),
  ('XUV400 EV','XUV400'), ('BE 6','BE6'), ('XEV 9e','XEV9e'),
  ('Alturas G4','Alturas'), ('Bolero Camper','Camper'), ('Bolero Pik-Up','Pikup'),
  ('Innova','Old Innova'), ('Corolla Altis','Altis'),
  ('Land Cruiser Prado','Prado'), ('Etios Liva','Liva'),
  ('Urban Cruiser','Urban Cruiser 2020'),
  ('BR-V','BRV'), ('CR-V','CRV'),
  ('Hector Plus','Hector+'), ('ZS EV','ZS'),
  ('C3 Aircross','Aircross'), ('eC3','e-C3'), ('eC3','E C3'),
  ('C5 Aircross','C5'), ('Grand Cherokee','Cherokee'),
  ('MU-X','MUX'), ('redi-GO','Redigo'), ('GO+','GO Plus'),
  ('Pajero Sport','Pajero Sports'), ('Ambassador','Amby'),
  ('Atto 3','Atto'), ('eMAX 7','eMAX'), ('Sealion 7','Sealion'),
  ('Bada Dost','Badadost'), ('Treo Zor','Zor'),
  ('3 Series','320d'), ('5 Series','530d'),
  ('A8 L','A8'), ('C40 Recharge','C40'),
  ('Range Rover Evoque','Evoque'), ('Range Rover Velar','Velar'),
  ('Range Rover Sport','RR Sport'), ('Discovery Sport','Disco Sport')
) as a(model, alias)
join public.vehicle_models vm on vm.name = a.model
on conflict (model_id, alias) do nothing;

-- =============================================================================
-- DOUBTS — every row above that I was less than sure of, and why.
-- Check these against a real car or a dealer before a fitment is tagged to them.
--
-- Launch years I could not pin to a month, so the year may be out by one:
--   Maruti 800 'India 1983-2014'   — 1983 is the launch, but production ran on in
--                                    small numbers; 2014 is the end I am confident of.
--   Omni 'India 1984-2019'         — long unbroken run, several quiet updates I did
--                                    not split because the body barely moved.
--   Gypsy 'India 1985-2019'        — civilian sales stopped earlier than army supply.
--   Tata Ace 'India 2005+'         — still made, but the Ace Gold/EV split is not here.
--   Tata Sumo 'India 1994-2019'    — Spacio, Grande and Gold are all inside this one
--                                    range; they are different bodies and should be
--                                    split once somebody can confirm the dates.
--   Mahindra Bolero Camper / Pik-Up 'India 2007+' — both are roughly mid-2000s; the
--                                    2007 start is my best guess, not a known date.
--   Mahindra Supro 'India 2015+'   — launch year confident, current status not.
--   Force Traveller 'India 2000+'  — sold far longer than that under earlier names.
--   Ashok Leyland Partner 'India 2017+' — launch year is approximate.
--   Mahindra Last Mile e-Alfa Mini 'India 2018+' — approximate; the Last Mile brand
--                                    itself was carved out later than the product.
--
-- 2025 launches I believe happened but have not seen a car of:
--   Maruti Victoris 2025+, Maruti e Vitara 2025+, Tata Sierra 2025+,
--   Tata Harrier EV 2025+, Mahindra BE 6 2025+, Mahindra XEV 9e 2025+,
--   MG Majestor 2025+, MG M9 2025+, BYD Sealion 7 2025+, Kia Syros 2025+.
--   If any of these slipped, the row is harmless but the year is wrong.
--
-- Deliberately ONE generation where the real car had more, because I could not
-- place the split with confidence:
--   Honda CR-V 'India 2003-2020'      — four generations came here; dates unclear.
--   Honda Accord 'India 2001-2020'    — includes the hybrid that returned in 2016.
--   Toyota Camry 'India 2002+'        — many generations, several hybrid changes.
--   Mahindra XUV500 'India 2011-2021' — the 2015 and 2018 restyles are not split.
--   Skoda Kodiaq 'India 2017+'        — a newer generation exists; I did not date it.
--   Tata Indica / Indigo              — V2, CS, eV2, eCS all folded into one range.
--   Hyundai Accent 'India 1999-2013'  — taxi-spec Executive ran past the retail car.
--   Hyundai Sonata 'India 2001-2014'  — sold in bursts, not continuously. Least
--                                       trustworthy row in the Hyundai block.
--   BMW X5 'India 2007+'              — start year and generation splits both soft.
--   All Lexus / Mini / Jaguar / Porsche / Volvo / Land Rover rows — single wide
--     Indian ranges on purpose; treat the start year as approximate.
--
-- Facelift rows I did split and am confident about, listed so they are easy to
-- re-check anyway: Tata Nexon EV 2023, BMW 3 Series F30/G20, BMW 5 Series G30/G60,
-- Mercedes C-Class W205/W206, E-Class W213/W214, S-Class W222/W223.
--
-- Discontinuation years that may be a year late or early:
--   Hyundai Kona Electric 2023, Nissan Kicks 2022, VW T-Roc 2022,
--   Jaguar XF 2021, Skoda Octavia '4th Gen 2021+' (it may already be off sale),
--   VW Tiguan 'Allspace 2020+' (likewise), Skoda Superb 'CBU 2023+'.
--
-- Left OUT because I could not confirm they were sold in India at all, or in what
-- years — add them by hand if the shop sees one:
--   Skoda Enyaq (an India launch was announced; I could not confirm it happened).
--   Force Trax (certainly sold, dates unknown).
--   Mahindra e2o / e2o Plus, Mahindra Zor Grand.
--   Toyota Prius, Toyota bZ4X, Hyundai i30, Hyundai Terracan.
--   Porsche 911 and other coupes/roadsters — also no honest body_type for them
--     in the vocabulary 03 set, and the counter does not stock for them.
--   The old Tata Sierra (1991-2000) — the 2025 row above is the new car only.
--   The old Maruti Baleno sedan (1999-2007) — the name now belongs to the
--     hatchback in 03, and two models cannot share a name under one make.
--   Chevrolet Forester, Daewoo Matiz, Premier Rio, Opel Astra/Corsa — all real
--     Indian cars, all too rare now to be worth a guessed year range.
-- =============================================================================


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


-- The helpers were only needed while loading. Dropping them leaves the database
-- with nothing but the data.
drop schema if exists seed_util cascade;
