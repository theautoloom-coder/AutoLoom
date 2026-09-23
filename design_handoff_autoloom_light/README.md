# Handoff: AutoLoom light design pass (mobile + web)

## Overview

A visual evolution of the existing AutoLoom app (Expo / React Native Web, khata-first).
Brand red stays; the type pairing, surface treatment and figure hierarchy change.
Seven screens are designed: four phone, three desktop/web.

## About the design files

`AutoLoom Screens.dc.html` in this bundle is a **design reference**, not production code.
It is plain HTML/CSS drawn to show intended look, hierarchy and copy. Do not port the
HTML into the app. Recreate it with the app's existing React Native components
(`app/src/ui/*`, Expo Router screens) — the point of this pass is that almost all of it
lands in `app/src/ui/theme.ts` plus small edits to the shared components, not in rewrites
of individual screens.

**Fidelity: high.** Colours, type sizes, radii, borders and copy are final. Match them.

## How to apply it (order matters)

1. **Fonts.** Copy `fonts.ts` → `app/src/ui/fonts.ts`, install the four packages listed
   in its header, and gate `app/src/app/_layout.tsx` on `useAppFonts()`.
   For web, add to the Google Fonts stylesheet in `app/+html.tsx` (or your web template):
   `Bricolage+Grotesque:wght@700;800`, `IBM+Plex+Sans:wght@400;500;600`,
   `IBM+Plex+Mono:wght@400;500;600`.
2. **Tokens.** Copy `theme.ts` → `app/src/ui/theme.ts` (drop-in: every key the app
   already imports still exists). New exports: `palette.*.keyline`, `shadow.key`,
   `spine`, `type.hero`, `type.mono`, `type.rowTitle`, and `fontFamily` on every
   `type` entry — so all existing `<Text variant="…">` call sites pick the new type
   up with no edits.
3. **`app/src/ui/index.tsx`** — the four changes that carry the look:
   - `Card`: default `borderWidth: 1, borderColor: t.border, borderRadius: radius.md`,
     `shadow.none`. Add a `keyline` prop → `borderWidth: 1.5, borderColor: t.keyline`
     + `shadow.key`. **One keyline card per screen, maximum.**
   - Add a `spine` prop (`'accent' | 'warn' | 'ok'`) → `borderLeftWidth: spine`,
     `borderLeftColor`, and asymmetric radius `4 / 13 / 13 / 4`.
   - `Badge`/`Chip`: `warn` = amber `#C7791A`, `ok` = green `#1E8E5A`. Money that is
     *late* is amber, money that is *paid* is green. Never red — red is action only.
   - `Amount`: use `type.mono` (or `type.number` at ≥18px) so every figure is
     tabular IBM Plex Mono.
4. **`app/src/app/(tabs)/index.tsx`** — this is the only screen that needs real work:
   it is currently dark/full-bleed ("night garage"). Rebuild it light per **P1** below.
   Keep `useCountUp` on the takings figure and `Enter` on the panels exactly as they are.
5. **`app/src/app/(tabs)/_layout.tsx`** — rail active item: `accentSoft` plate plus
   `borderLeftWidth: 3, borderLeftColor: t.accent`; bottom tab active item gets a 2px
   red top border. Rail width stays 236.
6. Everything else (customer, invoice editor, reminders, product, stock) inherits the
   new tokens. Then apply the per-screen notes below.

## Design tokens

Ground `#EDEEF1` · paper `#FFFFFF` · row header `#F7F7F9` · hairline `#DEE0E6`
strong border `#CBCCD4` · keyline/ink `#0B0D10` · text `#12151A` · muted `#5B5E68`
faint `#8D8F99` · red `#D91E2E` · red deep `#AE1120` · red soft `#FBE4E4`
green `#1E8E5A` (soft `#EDF7EE`) · amber `#C7791A` (soft `#FBECD5`) · danger `#B3111A`
link/UPI blue `#1E5FA8` · overlay `rgba(11,13,16,0.44)`

Radii 9 / 13 / 16 / 22 / pill. Spacing 4 / 8 / 12 / 16 / 24 / 32.
Keyline card: `1.5px #0B0D10` border + `3px 3px 0 #0B0D10` shadow, radius 16.
Spine: 3px left border, radius `4 13 13 4`.
Photo placeholder: `repeating-linear-gradient(135deg,#F3F4F6 0 7px,#E8E9ED 7px 14px)`
with a mono uppercase caption; real photos replace it with no layout change.

Type: Bricolage Grotesque 800 for titles/hero figures (letter-spacing −0.03em to −0.045em);
IBM Plex Sans 400/500/600 for body and rows; IBM Plex Mono 500/600 for every rupee
figure, quantity, SKU, doc number and section label (labels 10px, uppercase,
letter-spacing 1). Hero figure 46px phone / 52px web. Minimum text size 10px
(mono labels only); body never below 12.5px.

## Motion

Unchanged from `app/src/ui/motion.tsx` — the pass is deliberately restrained:
- `useEntrance`: 380ms `Easing.out(cubic)`, 55ms stagger, capped at 8 items.
- `useCountUp`: 700ms, only on the one hero figure per screen.
- Press: `scale 0.97`, ~120ms. Sheets: spring in from bottom, ~260ms.
- Nothing ambient, nothing looping.

## Screens

### P1 · Home — "aaj ka hisaab" (`app/src/app/(tabs)/index.tsx`)
Light ground, not dark. Order top to bottom: date label (mono, uppercase) + "Namaste,
{first name}" in Bricolage 25px, sync pill on the right (green dot + label);
**keyline card** with "Aaj ka maal gaya" label, `₹1,42,300` at 46px Bricolage tabular
(count-up), and three grey `#EDEEF1` inner tiles (18 bill / ₹64,500 aayi / ₹86,000
kharida); action row — red pill "Naya bill" (flex 1) + white bordered "Payment aayi";
two half-width figure cards (Customer pending, amber spine, `₹9.80L` + "₹2.10L overdue";
Stock value, plain, `₹38.6L` + "cost par · 3 location"); then hairline panels
"Pending khata" (rows with name, sub, amber amount, bordered "Remind" pill) and
"Stock kam hai" (product · variant, mono SKU, `8 / 15` amber, `2 / 6` danger).
Panel headers are mono uppercase with the count beside them and a red text action right.

### P2 · Naya bill (`app/src/app/invoice/edit.tsx`)
White header strip with back chevron, title "Naya bill" (or "Naya invoice" when GST is
on), `draft` in mono right. Body: customer card with **red spine** (name 16px, type ·
city · mobile, "Badlo" pill) and a credit block — "Pehle ka udhaar ₹84,000" left,
"Limit bachi ₹16,000" right, 5px amber progress bar at 84%. Search field + black
46px scan button. One card per line: title, mono SKU · unit, remove ✕, then
Qty / **Rate (keylined box — the only keylined field on the screen)** / Line total,
then chips: red-soft `last price ₹1,550`, grey `dealer ₹1,650`, grey `stock 25 · Main`.
Footer pinned, `borderTop: 1.5px #0B0D10`: Maal / (GST row when enabled) / Round off /
**Total** in Bricolage 17px with the figure at 27px mono, then "Udhaar rakho" (ink
outline) + "Paid + slip bhejo" (red, flex 1.25).

### P3 · Khata + payment sheet (`app/src/app/customer/[id].tsx`, `app/src/app/payment/edit.tsx`)
Header: back, name in Bricolage 21px, "Dealer · Sector 63, Noida · mobile", ink initials
circle. **Keyline card**: "Khata baaki" label, `₹84,000` at 40px in amber, right-aligned
"38 din purana / limit ₹1,00,000", then red "Payment aayi" + outline "Remind" + square
QR icon button. Segmented control (Khata / Bills / Gaadi) on `#E2E3E8` track, white
active pill. Ledger table with mono column headers (Entry / Amount / Baaki) on `#F7F7F9`,
rows showing `+20,300` (ink), `−35,000` (green), running balance in muted mono.
**Payment sheet** over a `rgba(11,13,16,0.44)` scrim: 22px top radius, 1.5px ink top
border, grab handle, "Payment aayi" + customer name, keylined amount box `₹84,000` at
24px mono with a "Poora" pill, four mode buttons (Online selected = red fill), remembered
account chips ("HDFC current" = ink fill), 58px dashed proof slot with upload glyph and
"Private storage mein jaata hai" note, "Purane bill pehle settle" row with a green
toggle, and a full-width red "₹84,000 mila — save karo" button.

### P4 · Reminders (`app/src/app/reminders.tsx`)
"Shaam 7:10 · 11 Sep" label, "Kisse paise lene hain" in Bricolage 25px. **Keyline card**:
total pending `₹1,36,000` at 34px + "6 customer · 2 overdue", red "Sabko bhejo" pill on
the right. Filter chips (Sab / Aaj bill hua / Overdue; selected = ink fill). Rows: name,
mono "mobile · purana bill 05 Aug", amount in amber with "38 DIN" under it, then a 38px
QR icon button + outline "Paid" + red "Remind". A sent row swaps Remind for a green
outline "Bhej diya" with a tick and stays in place. Bottom: "Message jo jayega" card with
the Hinglish template in a `#EDF7EE` bubble (`border #D6E9D8`, radius `12 12 12 4`),
the UPI link in `#1E5FA8` underlined, and a red "Badlo" action to edit the template.

### W1 · Dashboard, desktop (same route, `useIsWide()` branch)
236px white rail: red 34px "AL" tile + AutoLoom / "Drive better" (mono uppercase);
items Home, Search, Billing, Stock, Parties, Reports, Admin — active = `#FBE4E4` plate +
3px red left border + `#AE1120` bold label; footer shows Sync row (green dot) and the
profile row. Content padding 22/26, max 1280. Top bar: date + "Namaste, Ravi" (27px),
320px search field with a `⌘K` hint, red "Naya bill". Hero row: **keyline card** (flex
1.35) with `₹1,42,300` at 52px, "cash 40% · udhaar 60%", and an 8px green/amber split
bar; then three hairline figure cards (Customer pending with amber spine, Supplier ko
dena, Stock value) at 30px mono. Below, a `1.35fr 1fr 1fr` grid: Pending khata table
(Customer / Baaki / Din / Remind), Aaj ke bill list (amount + `UDHAAR`/`PAID` in 9.5px
uppercase), and a stacked column of Stock kam hai + Tez bikne wala.

### W2 · Vehicle search "creta 2024" (`app/src/app/(tabs)/search.tsx`, `app/src/app/vehicle/[id].tsx`)
Keylined search bar containing the query at 15px and a resolved-vehicle chip
("Hyundai Creta · 2024+ facelift", red-soft). "Stock wala hi dikhao" toggle button.
Filter row of chips + "31 SKU is gaadi ke liye · 96 universal" right. Results are
**two shapes on purpose**: Mats as a 4-up card grid (104px photo placeholder, name,
mono SKU, spec chips, price + red "last ₹2,400", stock right — first card keylined as
the best match); Headlight bulbs as a table (SKU / Position / Stock / Dealer /
"XYZ Auto ka rate" / Add), where the customer's negotiated rate is `#AE1120` and a
missing one is an em dash. A dashed "Universal — 96 SKU" strip collapses the rest.
Rail bottom carries a live "Bill ban raha hai · XYZ Auto · 2 item · ₹20,300" card with
an ink "Bill par jao" button.

### W3 · Product detail (`app/src/app/product/[id].tsx`)
Mono breadcrumb. Title in Bricolage 31px, brand tag (ink) + "LED Bulbs · Lighting →
Headlight Bulbs · HSN 8539 · 3 variant", actions right (Compare variants, Edit outline;
"Bill mein daalo" red). Three columns: 264px left — photo placeholder 174px with two
thumbs and a dashed `+`, then product-level specs as label/value rows with hairline
separators; centre — **keyline** variants table (Variant / SKU · Main · Shop · MRP ·
Dealer · Last paid · Margin), selected row on `#FDF6F6` with a red spine; below it a
fitment card grouped by make with the alias note, and a **red-spined price card**:
"XYZ Auto ka rate · H4 60W", `₹1,550` at 33px Bricolage, "special price · 12 Aug se",
then Dealer list / Floor / Last purchase / Avg cost as hairline rows, an ink-outline
"Special price badlo" button, and the approver-PIN note in 11px faint.

## Copy

Hinglish, exactly as in the HTML (`Aaj ka maal gaya`, `Naya bill`, `Payment aayi`,
`Pending khata`, `Stock kam hai`, `Udhaar rakho`, `Kisse paise lene hain`,
`Sabko bhejo`, `Bhej diya`, `Purane bill pehle settle`, `Kis account mein aaya`).
Status words stay lowercase in rows (`udhaar`, `paid`) and uppercase only in the
9.5–10.5px mono tags.

## Assets

No images. Product photos are placeholders — wire them to `product_images`
(Supabase Storage) and keep the 4:3 ratio and grey stripe as the empty state.
Icons are the existing Ionicons set; the QR glyph and the scan glyph in the HTML are
stand-ins for `qr-code-outline` and `barcode-outline`.

## Files in this bundle

- `AutoLoom Screens.dc.html` — the seven designed screens (open in a browser).
- `theme.ts` — drop-in replacement for `app/src/ui/theme.ts`.
- `fonts.ts` — new file for `app/src/ui/fonts.ts`.
