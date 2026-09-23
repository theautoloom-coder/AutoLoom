-- =============================================================================
-- 0016 CHANGE REQUEST PAYLOAD IS TEXT, NOT JSONB
--
-- The payload was stored as jsonb, and the device sends it as a JSON *string*
-- — PowerSync's local SQLite has no jsonb type, so the column is text there and
-- the client writes `JSON.stringify(proposal)` into it. PostgREST then stored
-- that string as a jsonb string scalar rather than as an object, so reading it
-- back gave a quoted string and one JSON.parse produced a string instead of the
-- proposal. Every field read off it came out undefined, which is why the queue
-- showed a request with no item name, no price and no quantity while the row
-- itself was perfectly correct.
--
-- text is what this column actually is. The app treats the payload as an opaque
-- blob — it is a draft of a future row, never queried by key — so nothing is
-- lost by storing it as the string both ends already use, and the round trip
-- stops depending on two layers agreeing about who does the encoding.
--
-- Existing rows were written double-encoded; `payload::text` on a jsonb string
-- scalar yields the quoted form, so they are unwrapped with #>>'{}' , which
-- returns the string's own contents.
-- =============================================================================

alter table public.change_requests
  alter column payload type text
  using case
    when jsonb_typeof(payload) = 'string' then payload #>> '{}'
    else payload::text
  end;
