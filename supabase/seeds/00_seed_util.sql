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
