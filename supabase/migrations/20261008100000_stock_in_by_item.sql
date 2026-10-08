-- =============================================================================
-- Stock is written in by item, the kism chosen on the spot (owner, 8 Oct 2026)
--
-- "Ek product/item creation ka rakhte hai alag, jab stock chadhayenge us
-- product ko sidha select karke specifications, car model, qty, date set
-- karke chadate jaye."
--
-- An item (product) is made once, in its own screen. Writing stock in, the
-- person picks the item and then the kism — the socket, the colour, the car
-- and its years. A kism that does not exist yet is made right there, as part
-- of the same entry, instead of sending anyone off to the catalogue.
--
--   · catalog.add_kism: add a kism to an existing item — the variant, its
--     own spec values and its cars. Insert only; changing or removing one
--     stays catalog.edit (the owner). Staff hold it so a stock entry can
--     carry a new kism; the entry itself still waits for approval.
--   · products.default_price / default_cost: an item's usual selling and
--     buying rate, which a new kism starts from.
--   · expense_categories: the kharcha list, kept in app_settings so it can be
--     changed without a new app.
-- =============================================================================

insert into public.role_permissions (role, permission)
select r, 'catalog.add_kism' from unnest(array['owner', 'admin', 'staff']) as r
on conflict (role, permission) do nothing;

drop policy if exists product_variants_kism_ins on public.product_variants;
create policy product_variants_kism_ins on public.product_variants for insert to authenticated
  with check (public.has_permission('catalog.add_kism'));

drop policy if exists spec_values_kism_ins on public.spec_values;
create policy spec_values_kism_ins on public.spec_values for insert to authenticated
  with check (public.has_permission('catalog.add_kism') and variant_id is not null);

drop policy if exists product_fitments_kism_ins on public.product_fitments;
create policy product_fitments_kism_ins on public.product_fitments for insert to authenticated
  with check (public.has_permission('catalog.add_kism') and variant_id is not null);

alter table public.products add column if not exists default_price numeric(14,2);
alter table public.products add column if not exists default_cost numeric(14,4);

-- An item's usual rate starts as its first kism's.
update public.products p
   set default_price = v.retail_price
  from (select distinct on (product_id) product_id, retail_price
          from public.product_variants order by product_id, sort_order, created_at) v
 where v.product_id = p.id and p.default_price is null;

insert into public.app_settings (id, value, description)
values ('expense_categories',
        '["Transport","Petrol","Rent","Bijli","Loading","Packing","Repair","Chai/Pani","Aur kuch"]'::jsonb,
        'Kharcha Likho ke chips — Settings se badlo')
on conflict (id) do nothing;
