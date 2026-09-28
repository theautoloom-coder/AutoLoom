-- =============================================================================
-- 0020 ITEM PHOTOS
--
-- `product_images` has existed since the first migration and has never had a
-- picture in it: there was no bucket to put one in and no screen to add one.
-- A shop that sells forty kinds of black floor mat cannot work from SKUs
-- alone — the counter hand needs to see which one the customer is pointing at.
--
-- The bucket is PUBLIC, unlike payment-proofs. That is deliberate:
--
--   · A search result shows thirty items. Signing thirty URLs, each expiring
--     in an hour, means thirty round trips on a 300ms link every time the list
--     is opened, and nothing cached between openings.
--   · A public URL is stable, so expo-image keeps it on disk. Once a photo has
--     been seen on a phone it is there the next morning with no signal — which
--     is the whole point of this app.
--   · There is nothing to protect. It is a photograph of a floor mat.
--
-- Writing is still staff-only. Anyone may look; only the shop may add.
-- =============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('item-photos', 'item-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do update set public = true;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute $p$create policy "item_photos_public_read" on storage.objects for select using (bucket_id = 'item-photos')$p$;
    execute $p$create policy "item_photos_staff_write" on storage.objects for insert to authenticated with check (bucket_id = 'item-photos' and public.is_active_staff())$p$;
    -- DELETE takes USING, not WITH CHECK: the row already exists, so the
    -- predicate decides which rows may go, not what a new one may contain.
    execute $p$create policy "item_photos_staff_delete" on storage.objects for delete to authenticated using (bucket_id = 'item-photos' and public.has_permission('catalog.edit'))$p$;
  end if;
exception when duplicate_object then null;
end;
$$;

-- -----------------------------------------------------------------------------
-- The row that points at the file.
--
-- product_images already syncs to devices, but it was never writable from one:
-- no RLS policies existed, so every insert a phone made was accepted locally
-- and then silently reverted by the server. Anyone who can edit the catalogue
-- can add a photo; anyone signed in can see one.
-- -----------------------------------------------------------------------------
alter table public.product_images enable row level security;

do $$
begin
  execute $p$create policy product_images_read on public.product_images
    for select to authenticated using (public.is_active_staff())$p$;
  execute $p$create policy product_images_ins on public.product_images
    for insert to authenticated with check (public.has_permission('catalog.edit'))$p$;
  execute $p$create policy product_images_upd on public.product_images
    for update to authenticated using (public.has_permission('catalog.edit'))$p$;
  execute $p$create policy product_images_del on public.product_images
    for delete to authenticated using (public.has_permission('catalog.edit'))$p$;
exception when duplicate_object then null;
end;
$$;

grant select, insert, update, delete on public.product_images to authenticated;
grant select on public.product_images to powersync_role;

-- One photo per variant is the common case and the one the list screens read,
-- so make finding it cheap.
create index if not exists product_images_variant_idx on public.product_images (variant_id, sort_order);
create index if not exists product_images_product_idx on public.product_images (product_id, sort_order);
