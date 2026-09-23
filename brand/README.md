# AutoLoom — brand kit

Everything here is generated from one vector file. Change `brand/mark.mjs` or
`brand/system.mjs`, run `node scripts/brand-assets.mjs` from `app/`, and every
icon, lockup and badge is rebuilt together. Nothing is hand-exported, so the
app icon can never quietly fall a year behind the logo.

---

## The mark

A chunky **A** leaning forward 14°, with two thick grille louvres cut through
it. It reads as the letter first, then as a radiator grille, then as speed.

Three things make it feel like metal rather than clip-art, and all three are
geometry rather than filters:

- **The 14° lean.** A static letter does not move; a leaning one does. Every
  automotive wordmark that feels fast is italic.
- **A real extruded edge** — eleven stacked copies stepping down-right into
  near-black. Metal has thickness. A drop shadow does not.
- **A chrome rim on the upper-left only**, because that is the one edge light
  would actually catch. A rim on all four sides reads as an outline.

**Two louvres, not four.** Four looked richer at poster size and turned to mush
at 48px, which is where a logo is actually seen most — a home screen, a browser
tab, a WhatsApp avatar. The mark was chosen on the small sizes, not the big one.

---

## Three lockups. Use the right one.

| | Use it for | Do not |
|---|---|---|
| **Mark** — the A alone | App icon, favicon, avatar, anything under ~64px, anywhere the name is already written next to it | — |
| **Lockup** — mark + wordmark, horizontal | App header, website nav, top of a bill, email signature, letterhead | Squash it to fit; give it its own line |
| **Badge** — the full circle | Shop board, shutter, WhatsApp display picture, visiting card, sticker, invoice header | **Never** as the app icon or favicon |

That last "never" is the one that matters. Shrinking the badge onto a phone
home screen is exactly what makes a good identity look cheap — the ring, the
two text sizes and the strapline all collapse into a smudge. That is the whole
reason the mark exists separately instead of as "the logo, smaller".

---

## Colour

| | Hex | Where |
|---|---|---|
| Signal red | `#D2141E` | The mark, actions, the WHOLESALER banner |
| Red highlight | `#FF6168` | Top of the mark's gradient only |
| Garage black | `#0B0D10` | Backgrounds, the badge field |
| Chrome | `#FFFFFF` → `#79828E` | Ring and bevel gradients |
| Steel | `#8A929C` | Secondary text on dark |

Red is for the mark and for the one thing on a screen you want tapped. When
everything is red, nothing is.

## Type

- **Bricolage Grotesque ExtraBold** — wordmark, headings, money figures
- **IBM Plex Mono** — straplines, labels, anything letterspaced and uppercase

The wordmark stays upright while the mark leans. Leaning both is how a logo
starts to look like a 1990s car decal; one leaning element reads as intent.

---

## Slogans

**"Drive Better" is retired.** It spoke to a car owner. AutoLoom sells to other
shops, garages and installers — people who care about stock, fitment and rate,
not about their own driving. That mismatch is why it never felt right.

Two lines, aimed at two different people. Keep them apart.

### The business line — **HAR GAADI KA MAAL**

Goes on the badge, the shop board, the splash, under the wordmark, on the bill.
Trade language, and it answers the only question a shopkeeper walking past has:
*do you have the part for my customer's car?*

Alternatives if you want it less colloquial:

| Line | Reads as |
|---|---|
| **HAR GAADI KA MAAL** *(recommended)* | Everything for every car. Trade-native, memorable, how your customers already talk |
| HAR GAADI KE LIYE | Softer, more retail-facing |
| POORA MAAL, EK JAGAH | Emphasises range over fitment |
| FITMENT PAKKA, RATE PAKKA | Emphasises trust — good if competitors are unreliable on fitment |

### The website line — **Har gaadi ka maal, ek jagah.**

For the hero of `theautoloom.in`, where you have room for a full sentence.
English version for a trade or export page: **"Every fitment. One supplier."**

### The app line — unchanged

*"Har bill, khata aur stock is phone par — signal ho ya na ho."*

This one is about the app, not the shop, and it already does its job: it names
the three things the app replaces and the one thing nobody else offers, which
is that it works with no signal.

---

## Files

Regenerate everything: `cd app && node scripts/brand-assets.mjs`

| File | What it is |
|---|---|
| `out/badge-2048.png` | **Give this to the sign painter / printer.** 2048px |
| `out/badge.png` | WhatsApp display picture, social avatar. 900px |
| `out/lockup-ink.png` / `lockup-light.png` | Letterhead, website nav, email footer |
| `out/mark-1024.png` | The mark alone, transparent |
| `../app/assets/images/` | App icon, Android adaptive layers, splash, favicon |
| `../app/public/pwa-*.png`, `apple-touch-icon.png` | Home-screen icons for the web app |

Review sheets, for checking a change did not break the small sizes:
`node scripts/brand-variants.mjs` and `node scripts/brand-preview.mjs`.

---

## Don't

- Don't re-colour the mark. It is red on dark or red on white; for one-colour
  printing use `markMono()` rather than flattening the gradient by hand.
- Don't add a gear, a wheel, a car silhouette or a row of service icons. They
  were in the reference this replaced, and they are why it could not shrink.
- Don't outline the mark or put it in a box. It already has an edge.
- Don't stretch the lockup. Scale it.
- Don't use the badge under about 200px.
