-- =============================================================================
-- Staff ask for any catalogue change; an old app cannot write (owner, 8 Oct 2026)
--
-- "User ko jo stock data hai usme har cheez mein edit ka function do, final
-- approval owner hi karega — gaadi model galat ho sakti hai, specification
-- galat ho sakti hai."
--
--   · change_requests carries two more kinds: edit_kism (a kism's details,
--     cars, rate) and edit_item (the item's name, category, shared details).
--     The owner approves them like a new item, seeing what was and what is
--     asked side by side.
--
--   · Uploads say which build of the app made them. On 8 Oct a browser tab
--     left open since the day before ran an old kism form whose save deleted
--     every spec and car of the whole item — seven kisms' worth, written by
--     staff that afternoon. An app that old must not write at all.
--     apply_crud_v2(ops, app_build) refuses a build below
--     app_settings.min_app_build; the original apply_crud (what older apps
--     call) is now the same with build 0. The refusal is a retryable error
--     (P0001), so the old app keeps its unsent work and sends it once it has
--     updated — nothing is thrown away.
-- =============================================================================

alter table public.change_requests drop constraint if exists change_requests_kind_check;
alter table public.change_requests add constraint change_requests_kind_check
  check (kind in ('new_item', 'edit_kism', 'edit_item'));

insert into public.app_settings (id, value, description)
values ('min_app_build', '0'::jsonb, 'Isse purane app ki entry server nahi lega — update karna padega')
on conflict (id) do nothing;

-- The body every upload runs, unchanged, under a name of its own.
do $$
begin
  if to_regprocedure('public.apply_crud_inner(jsonb)') is null then
    alter function public.apply_crud(jsonb) rename to apply_crud_inner;
  end if;
end $$;

create or replace function public.apply_crud_v2(ops jsonb, app_build int)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  min_build int;
begin
  select coalesce((value #>> '{}')::int, 0) into min_build from public.app_settings where id = 'min_app_build';
  if coalesce(app_build, 0) < coalesce(min_build, 0) then
    raise exception 'Purana app — naya version lagao (app band karke kholo, ya page reload karo). Entry phone par safe hai, update ke baad apne aap jayegi.'
      using errcode = 'P0001';
  end if;
  return public.apply_crud_inner(ops);
end;
$$;

-- What apps from before this call: the same, as build 0.
create or replace function public.apply_crud(ops jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
begin
  return public.apply_crud_v2(ops, 0);
end;
$$;

grant execute on function public.apply_crud(jsonb) to authenticated;
grant execute on function public.apply_crud_v2(jsonb, int) to authenticated;
grant execute on function public.apply_crud_inner(jsonb) to authenticated;
