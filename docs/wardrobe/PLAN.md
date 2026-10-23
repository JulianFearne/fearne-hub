# Wardrobe: plan

A private wardrobe app for Julian, built on the style dossier and buy list. It holds the wardrobe, runs the buy list, and suggests outfits and week plans that follow the style rules. Start as a local prototype, then become a private section of Fearne Hub.

Status: **live for a two-week test at fearne.org/wardrobe/** (phase 2a). Same app as the prototype, saved privately to Supabase through the hub login.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Where it lives | Fearne Hub, as a private per-user section | Auth, Supabase, JSON import, weekly planner and lists already exist there |
| How the style guide gets in | Converted once to a **style profile JSON** by Claude, then imported | One guide, rarely changes. Parsing prose in the app is the hardest and least valuable part |
| Buy list vs wardrobe | **One model.** Buy-list items are *slots*; owned pieces fill them | Ticking off is automatic, and "what to buy next" can be calculated |
| Outfit generation | **Rules engine first**, an AI stylist later | The dossier is already rules. Deterministic, instant, free, offline and explainable |
| Occasion presets | **Formality level 1 to 5** plus occasion flags plus weather | "Office", "casual" and "smart" are not one axis. New presets cost nothing |
| Photos | On-device colour reading in v1, Claude vision tagging later | Free, private, works in a shop with poor signal |
| Weather | Open-Meteo, no key | Free; Malta, NL and IE are presets |

## What the prototype does

- **Wardrobe:** add pieces with a phone photo. Colour is read from the photo and matched to the palette, with a verdict (works / caution / off-palette) for where the piece sits. Pieces link to buy-list slots. You can log wears, mark items as in the wash, and record price for cost per wear. Insights flag pieces not worn in 30+ days.
- **Check before buying:** photograph something in a shop and get the palette verdict, the buy-list slot it fills, any duplicates you own, and how many new outfit combinations it adds.
- **Outfits:**
  - *Generate:* pick an occasion and the weather (or today's forecast). You get six distinct outfits, each with its reasons and warnings.
  - *Build:* pick pieces slot by slot, checked live against the rules.
  - *Saved:* outfits you've kept.
  - *From your guide:* the dossier's 12 looks, filled from what you own, with missing pieces shown.
- **Week:** plans Monday to Sunday with no repeated top and rotated trousers and shoes. You can lock a day, swap a day, apply the forecast for your location, and log "wore it".
- **Buy list:** the six tiers, with progress. *Best next buys* ranks every open slot by how many new outfits it unlocks across eight everyday situations.
- **Profile:** the palette with face, lower and feet verdicts, occasions, the guide's contradictions, and import/export. A copy-prompt button handles converting a new guide. Backup and restore include photos.

Everything is stored in IndexedDB on the device. Nothing leaves the device except the weather request.

## Flows and agents

| # | Flow | Runs where | State |
|---|---|---|---|
| 1 | **Style profile converter**: guide (HTML, PDF, text) to profile JSON, validated | Claude (chat or Claude Code skill `wardrobe-profile`) + `validate-profile.mjs` | Built |
| 2 | **Stylist engine**: rules, scoring, generator, week planner, buy-next | `engine.js`, in the app | Built, 15 tests |
| 3 | **Colour reader**: photo to dominant colour to nearest palette colours | In the app (canvas, k-means) | Built |
| 4 | **Forecast**: location and dates to weather band and rain per day | Open-Meteo from the browser | Built |
| 5 | **Vision tagger**: photo to type, colour, pattern, formality guess | Supabase Edge Function calling Claude (vision) | Phase 3 |
| 6 | **Stylist chat**: "garden wedding in Valletta, 28°C", answered from your wardrobe | Edge Function calling Claude, with the engine as a tool so answers stay within the rules | Phase 3 |
| 7 | **Profile review**: after the daylight test, update palette verdicts and resolve conflicts | Claude, re-running flow 1 on the edited guide | When needed |

Rule of thumb: Claude interprets (guides, photos, open questions) and the engine decides (what is wearable). The AI never invents an outfit the rules would block.

## How the engine judges an outfit

An outfit is `base` (top or knit) + optional `mid` (knit over a shirt) + optional `outer` (jacket or tailoring) + optional `coat` + `bottom` + `shoes`.

- **Blocks** (unwearable):
  - formality outside a piece's range
  - office exclusions (tees, shorts, slides, camp shirts)
  - an off-palette colour in its zone (face, lower half, feet)
  - more than one statement colour
  - a suit jacket without its trousers
  - no tailoring where it's required
  - weather: knits or coats in the heat, no jacket in the cold, suede or slides in the rain
  - anything in the wash
- **Warnings** (minus 3 each): caution colours (stone, ecru or black near the face, burgundy), tan shoes above casual, two patterns, black shoes with brown leather, the wrong weight for the weather, nothing rainproof in the rain.
- **Plus points:**
  - colour at the face over neutrals below
  - clear light/dark contrast
  - a knit and a proper coat in the cold
  - rainproof in the rain
  - light fabrics in the heat
  - pieces close to the occasion's formality
  - rotation (pieces worn in the last few days score lower)

All thresholds come from the profile (`rules`, palette verdicts, occasions), so updating the guide doesn't need code changes.

## Phases

### Phase 1: prototype (done)
Local single-file app plus engine, profile, tests and docs. **Exit:** Julian uses it with real photos for two weeks and notes what's missing or wrong.

### Phase 2a: two-week test on the hub (now)
- The same single-file app is built a second time with a Supabase storage adapter and served from `public/wardrobe/`, the same way CARVE and Marginalia are hosted.
- It shares fearne.org's origin, so the hub login carries over.
- Data goes in one owner-only row (`wardrobe_state`) and photos in a private bucket. Setup: run `_reference/wardrobe-state-schema.sql` once.
- A Wardrobe tile appears on Home only for users who have opened it.
- **During the test, note:** what was tedious to add, outfits that were wrong (and which rule should have caught them), anything missing, and how often you opened it.
- **Exit:** decide whether it earns the full React port below, needs rule changes only, or should be dropped.

### Phase 2b: fit card (proposed)
Store fit data privately in the same row, never in the repo:
- body measurements: chest, waist, shoulder, sleeve, inseam, neck, shoe size
- more useful: the flat measurements of the three or four garments that fit best (chest pit to pit, shoulder, sleeve, body length, trouser rise and inseam)

The shop check then compares a product's size chart against those reference garments, e.g. "sleeve 2 cm shorter than your best shirt: size up or budget for alteration". Body numbers alone predict ready-to-wear fit poorly. Reference garments are what make the advice reliable.

### Phase 2: full React section in Fearne Hub (if the test earns it)
1. Run `_reference/wardrobe-schema.sql` in Supabase (tables and a private `wardrobe` storage bucket, all RLS owner-only).
2. Move `engine.js` to `src/lib/wardrobe/engine.js` unchanged, with tests alongside.
3. `src/pages/wardrobeData.js` follows the `recipesData.js` / `mealPlanData.js` pattern.
4. Pages:
   - `/wardrobe` (grid, add, check)
   - `/wardrobe/outfits`
   - `/wardrobe/week` (reuses the Meal Planner grid pattern)
   - `/wardrobe/buy`
   - `/wardrobe/profile` (import modelled on `ImportRecipes.jsx`)
5. Build the UI from the hub's design-system components (`Sheet`, `Chip`, `Field`, `Card`, `Button`), with the petrol accent scoped to the section.
6. Photos: shrink on the phone (900 px JPEG, about 150 KB) and upload to storage. A signed URL per view, because the bucket is private.
7. Import a prototype backup JSON so nothing is re-entered.
8. Add a home-screen tile and route headers in `App.jsx`. Not in the bottom tab bar, which is family-wide.

**Exit:** the same features on any device, signed in, with the prototype data migrated.

### Phase 3: AI flows
Vision tagger and stylist chat as Edge Functions, using the Claude API key held as a Supabase secret, never in the client. Both are optional on top of the rules engine. **Exit:** adding a piece needs only a photo and one confirmation tap.

### Later, only if wanted
- Pack for a trip (dates plus location gives a capsule and a packing list in Lists).
- Laundry reminders.
- Outfit photos ("what I wore").
- A second family member's profile.
- Optional background removal on photos.

## Risks and how they are handled

| Risk | Mitigation |
|---|---|
| Cataloguing fatigue kills it | Only three fields are required (photo, type, colour), and the colour comes from the photo. The demo wardrobe means the app is useful before day one |
| Palette is unconfirmed | Verdicts live in one JSON. After the daylight test, change it and re-import, with no code change |
| Guide contradicts itself | Listed on the Profile tab and modelled as warnings until decided (see below) |
| Personal data | The section is private per user (RLS owner-only, private bucket). The committed profile holds style rules only. Body or fit data goes in the private row, never the public repo |
| Combination counts look huge | Shown as a percentage of current coverage. Raw counts are secondary |
| Browser storage cleared (prototype) | Backup and restore including photos. Phase 2 removes the risk |

## Open decisions for Julian

1. **Tan:** allowed on casual shoes (as modelled), or banned outright as the colour lock says?
2. **Stone and ecru near the face:** the stone mac, stone linen blazer and ecru chunky knit all break the checklist's colour lock. Keep them as warnings, or change those slots to navy or charcoal?
3. **Overshirt:** greige (dossier) or charcoal (checklist)?
4. **Ireland:** the checklist mentions it. Is it a real location, or should it be dropped?
5. **Daylight test:** emerald vs dusty slate-blue, to settle Winter vs Soft Summer before buying statement colours.
