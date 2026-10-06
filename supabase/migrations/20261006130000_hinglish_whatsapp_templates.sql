-- =============================================================================
-- WhatsApp messages in the shop's words.
--
-- The owner asked (6 Oct 2026) for "payment reminder… pending balance" to be
-- Hinglish. The three templates are owner-editable from Admin, so each is
-- replaced only while it is still exactly the old default: a shop that wrote
-- its own wording keeps it. Same text as DEFAULT_TEMPLATES in
-- app/src/lib/whatsapp.ts.
-- =============================================================================

update public.app_settings
   set value = to_jsonb(E'Namaste {name} ji 🙏\n{shop} se aaj ka maal:\n{items}\nBill {bill_no} · Kul ₹{total}\nAapka kul baaki: ₹{pending}\n{upi_line}\nDhanyavaad!'::text)
 where id = 'wa_template_slip'
   and value = to_jsonb(E'Namaste {name} ji 🙏\n{shop} se aaj ka maal:\n{items}\nBill {bill_no} · Total ₹{total}\nAapka total pending: ₹{pending}\n{upi_line}\nDhanyavaad!'::text);

update public.app_settings
   set value = to_jsonb(E'Namaste {name} ji 🙏\n{shop} ki taraf se yaad dila rahe hain.\nAapka baaki: ₹{pending}\n{upi_line}\nPaisa bhejne ke baad screenshot bhej dijiye. Dhanyavaad! 🙏'::text)
 where id = 'wa_template_reminder'
   and value = to_jsonb(E'Namaste {name} ji 🙏\n{shop} ki taraf se payment reminder.\nAapka pending balance: ₹{pending}\n{upi_line}\nPayment karne ke baad screenshot bhej dijiye. Dhanyavaad! 🙏'::text);

update public.app_settings
   set value = to_jsonb(E'Namaste {name} ji 🙏\n₹{amount} mil gaye ({mode}). Dhanyavaad!\nAb baaki: ₹{pending}'::text)
 where id = 'wa_template_paid'
   and value = to_jsonb(E'Namaste {name} ji 🙏\n₹{amount} payment mil gayi ({mode}). Dhanyavaad!\nAb pending: ₹{pending}'::text);
