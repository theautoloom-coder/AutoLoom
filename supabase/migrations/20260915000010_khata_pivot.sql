-- =============================================================================
-- 0010 KHATA PIVOT
-- Payment proof + remarks, "last price" as a price source, faulty-return notes,
-- WhatsApp / UPI settings, storage bucket for proofs.
-- =============================================================================

-- Payment proof screenshot (Supabase Storage path) and where the money landed.
alter table public.payments
  add column if not exists proof_path text,
  add column if not exists remarks text;

-- Price typed once for a customer is offered again next time.
alter table public.sales_invoice_lines drop constraint if exists sales_invoice_lines_price_source_check;
alter table public.sales_invoice_lines
  add constraint sales_invoice_lines_price_source_check
  check (price_source in ('retail','dealer','wholesale','price_list','customer','manual','last'));

-- Return reason / condition notes per line.
alter table public.sales_invoice_lines add column if not exists return_note text;

-- Company-level WhatsApp / UPI configuration (admin screen).
alter table public.company_settings
  add column if not exists whatsapp_number text,
  add column if not exists upi_payee_name text;

insert into public.app_settings (id, value, description) values
  ('gst_enabled', 'false', 'Print GST on bills and compute tax. Off = plain bill / slip.'),
  ('wa_template_slip',
   to_jsonb('Namaste {name} ji 🙏
{shop} se aaj ka maal:
{items}
Bill {bill_no} · Total ₹{total}
Aapka total pending: ₹{pending}
{upi_line}
Dhanyavaad!'::text),
   'WhatsApp message for a bill / slip. Placeholders: {name} {shop} {items} {bill_no} {total} {pending} {upi_line} {date}'),
  ('wa_template_reminder',
   to_jsonb('Namaste {name} ji 🙏
{shop} ki taraf se payment reminder.
Aapka pending balance: ₹{pending}
{upi_line}
Payment karne ke baad screenshot bhej dijiye. Dhanyavaad! 🙏'::text),
   'Day-end reminder message. Placeholders: {name} {shop} {pending} {upi_line} {date}'),
  ('wa_template_paid',
   to_jsonb('Namaste {name} ji 🙏
₹{amount} payment mil gayi ({mode}). Dhanyavaad!
Ab pending: ₹{pending}'::text),
   'Sent when a payment is marked. Placeholders: {name} {amount} {mode} {pending}')
on conflict (id) do nothing;

-- Storage bucket for payment proof screenshots (private; read via signed URLs).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
    on conflict (id) do nothing;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute $p$create policy "proofs_staff_read" on storage.objects for select to authenticated using (bucket_id = 'payment-proofs' and public.is_active_staff())$p$;
    execute $p$create policy "proofs_staff_write" on storage.objects for insert to authenticated with check (bucket_id = 'payment-proofs' and public.is_active_staff())$p$;
  end if;
exception when duplicate_object then null;
end;
$$;
