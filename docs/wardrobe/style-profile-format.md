# Style profile format and conversion prompt

A style profile is one JSON file that turns a written style guide into rules the wardrobe engine can apply. Julian's is `prototypes/wardrobe/profile.json`.

**To convert a new or updated guide:** paste the prompt at the bottom into a Claude chat together with the guide (HTML, PDF or text), and optionally the buy list. Save the JSON it returns. Check it with:

```bash
node prototypes/wardrobe/validate-profile.mjs path/to/profile.json
```

Then import it on the wardrobe's Profile tab. In Claude Code, the `wardrobe-profile` skill does the conversion and the validation in one go.

## Shape

| Key | What it holds |
|---|---|
| `format`, `version` | Always `"fearne-style-profile"`, `1` |
| `meta` | `name`, `owner`, `source`, `summary`, and `unconfirmed` (judgement calls still to test) |
| `palette` | Every colour named in the guide (see below) |
| `rules` | Outfit-level limits and bonuses (see below) |
| `occasions` | Presets the generator offers (see below) |
| `office_excludes` | Garment types never worn on `office` occasions |
| `formulas` | Named looks from the guide, as `[type, colour]` pairs |
| `slots` | The buy list (see below) |
| `conflicts` | Plain-English list of places the guide contradicts itself |

### Palette

```json
{ "id": "stone", "name": "Stone", "hex": "#C9C2B4", "role": "lower",
  "face": "warn", "lower": "ok", "feet": "ok", "note": "Reserve for trousers and shorts." }
```

- `role`: `core | white | lower | blue | accent | statement | leather | metal | avoid`. Statement and accent roles drive the colour limits.
- `face` covers tops, knits, jackets, coats and scarves. `lower` covers trousers and shorts. `feet` covers shoes.
- Each zone takes a verdict:
  - `ok`
  - `warn`: allowed, costs points, explained to the user
  - `block`: never generated, flagged in the builder
  - `casual` (feet only): fine at formality 2 or below, a warning above

### Rules

| Key | Default | Meaning |
|---|---|---|
| `max_statement` | 1 | More statement colours than this blocks the outfit |
| `max_colour_pieces` | 2 | More accent plus statement pieces than this is a warning |
| `max_patterns` | 1 | One more than this is a warning; two more blocks |
| `colour_at_face_bonus` | true | Reward accent or statement colour on top over neutrals below |
| `contrast_bonus_min` | 28 | Lightness gap (L\*, 0 to 100) that earns the contrast bonus |
| `notes` | | Free text shown on the Profile tab |

### Occasions

```json
{ "id": "office-3", "label": "Office L3", "level": 5, "office": true, "require": "tailoring" }
```

`level` is formality: 1 off-duty, 2 casual, 3 smart casual, 4 smart, 5 formal. Every garment type has a range it can be worn at (see `SUBTYPES` in `engine.js`). A piece can override its range in the app.

### Slots (buy list)

```json
{ "id": "t1-blazer", "tier": 1, "name": "Navy blazer", "qty": 1, "subtypes": ["blazer"],
  "colours": ["navy"], "best": ["navy"], "material": "wool hopsack", "fit": "soft shoulder", "climate": "nl" }
```

- `best` colours must also appear in `colours`.
- A slot with `subtypes: ["suit-jacket", "suit-trousers"]` and `qty: 2` is treated as a suit.
- `climate` is optional: `nl` or `malta`.

### Garment types

`tee, polo-knit, oxford, poplin, pattern-shirt, linen-shirt, camp-shirt, flannel-shirt, merino-crew, roll-neck, half-zip, chunky-knit, knit-vest, overshirt, blazer, linen-blazer, suit-jacket, harrington, suede-blouson, waxed-jacket, quilted, overcoat, mac, wool-trousers, suit-trousers, chinos, cotton-trousers, linen-trousers, jeans, shorts, trainers, derby, oxford-shoe, loafers, chelsea, desert-boot, slides, belt, watch, scarf, tie, bag, sunglasses, cap, beanie, swim`

Accessories are tracked and ticked off on the buy list, but not used in outfit generation.

## Conversion prompt

````text
You convert a personal style guide into a JSON style profile for a wardrobe app.
Return ONE JSON object, no commentary, matching the shape below.

{
  "format": "fearne-style-profile", "version": 1,
  "meta": { "name": "", "owner": "", "source": "", "summary": "", "unconfirmed": [""] },
  "palette": [ { "id": "kebab-id", "name": "", "hex": "#RRGGBB",
                 "role": "core|white|lower|blue|accent|statement|leather|metal|avoid",
                 "face": "ok|warn|block", "lower": "ok|warn|block", "feet": "ok|warn|block|casual",
                 "note": "optional, one sentence" } ],
  "rules": { "max_statement": 1, "max_colour_pieces": 2, "max_patterns": 1,
             "colour_at_face_bonus": true, "contrast_bonus_min": 28, "notes": [""] },
  "occasions": [ { "id": "", "label": "", "level": 1, "office": false, "require": "tailoring" } ],
  "office_excludes": ["tee", "shorts", "slides", "camp-shirt"],
  "formulas": [ { "name": "", "occasion": "<occasion id>",
                  "parts": [["<type>|<alternative type>", "<palette id>"]], "why": "" } ],
  "slots": [ { "id": "", "tier": 1, "name": "", "qty": 1, "subtypes": ["<type>"],
               "colours": ["<palette id>"], "best": ["<palette id>"],
               "material": "", "fit": "", "climate": "nl|malta (optional)" } ],
  "conflicts": [ "" ]
}

Formality levels: 1 off-duty, 2 casual, 3 smart casual, 4 smart, 5 formal.
Garment types (use only these): tee, polo-knit, oxford, poplin, pattern-shirt, linen-shirt,
camp-shirt, flannel-shirt, merino-crew, roll-neck, half-zip, chunky-knit, knit-vest, overshirt,
blazer, linen-blazer, suit-jacket, harrington, suede-blouson, waxed-jacket, quilted, overcoat, mac,
wool-trousers, suit-trousers, chinos, cotton-trousers, linen-trousers, jeans, shorts, trainers,
derby, oxford-shoe, loafers, chelsea, desert-boot, slides, belt, watch, scarf, tie, bag,
sunglasses, cap, beanie, swim.

Rules:
- Every colour the guide names goes in the palette with its hex. Invent a sensible hex only if
  the guide gives none, and say so in its note.
- Colours the guide says to avoid get role "avoid" and face "block".
- Use "warn" where the guide hedges ("test first", "away from the face", "use sparingly").
- Every palette id used in formulas or slots must exist in the palette; every best colour must
  also be in that slot's colours; every formula occasion must exist.
- Turn each named outfit in the guide into a formula. Turn each buy-list item into a slot, keeping
  its tier or priority order.
- Do not resolve contradictions silently: model the safer reading and describe the
  contradiction in "conflicts".
- Leave out body measurements and anything else not needed to judge clothes.
````
