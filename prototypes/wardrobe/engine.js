// Wardrobe engine: garment catalogue, outfit rules, generator, week planner
// and buy-next maths. Pure functions, no DOM, so it can move into the hub
// unchanged (src/lib/wardrobe/engine.js) and be tested in Node.

// ---------- catalogue ----------

export const CATEGORIES = [
  { id: 'top', label: 'Tops & shirts' },
  { id: 'knit', label: 'Knitwear' },
  { id: 'outer', label: 'Jackets & coats' },
  { id: 'bottom', label: 'Trousers & shorts' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'accessory', label: 'Accessories' },
]

// f: formality range the piece can be worn at (1 off-duty ... 5 formal).
// warmth: 1 light, 2 mid, 3 heavy. layer: base | mid | both (knits).
// kind (outer only): tailoring | jacket | coat.
export const SUBTYPES = {
  tee: { label: 'Crew tee', cat: 'top', layer: 'base', f: [1, 3], warmth: 1, shape: 'tee' },
  'polo-knit': { label: 'Knitted polo', cat: 'top', layer: 'base', f: [2, 4], warmth: 1, shape: 'polo' },
  oxford: { label: 'Oxford shirt', cat: 'top', layer: 'base', f: [2, 4], warmth: 1, shape: 'shirtbd', shirt: true },
  poplin: { label: 'Poplin shirt', cat: 'top', layer: 'base', f: [3, 5], warmth: 1, shape: 'shirt', shirt: true },
  'pattern-shirt': { label: 'Check / stripe shirt', cat: 'top', layer: 'base', f: [2, 4], warmth: 1, shape: 'shirt', shirt: true, pattern: 'check' },
  'linen-shirt': { label: 'Linen shirt', cat: 'top', layer: 'base', f: [2, 4], warmth: 1, shape: 'shirt', shirt: true, linen: true },
  'camp-shirt': { label: 'Camp-collar shirt', cat: 'top', layer: 'base', f: [1, 3], warmth: 1, shape: 'camp', linen: true },
  'flannel-shirt': { label: 'Flannel / brushed shirt', cat: 'top', layer: 'base', f: [2, 4], warmth: 2, shape: 'shirt', shirt: true },
  'merino-crew': { label: 'Merino crew', cat: 'knit', layer: 'both', f: [2, 4], warmth: 2, shape: 'knit' },
  'roll-neck': { label: 'Roll neck', cat: 'knit', layer: 'base', f: [3, 4], warmth: 2, shape: 'rollneck' },
  'half-zip': { label: 'Half-zip', cat: 'knit', layer: 'both', f: [2, 4], warmth: 2, shape: 'halfzip' },
  'chunky-knit': { label: 'Chunky knit', cat: 'knit', layer: 'both', f: [2, 3], warmth: 3, shape: 'knit' },
  'knit-vest': { label: 'Knitted waistcoat', cat: 'knit', layer: 'mid', f: [2, 4], warmth: 1, shape: 'vest' },
  overshirt: { label: 'Overshirt', cat: 'outer', kind: 'jacket', f: [2, 3], warmth: 2, shape: 'overshirt' },
  blazer: { label: 'Blazer', cat: 'outer', kind: 'tailoring', f: [3, 5], warmth: 2, shape: 'blazer' },
  'linen-blazer': { label: 'Linen blazer', cat: 'outer', kind: 'tailoring', f: [3, 4], warmth: 1, shape: 'blazer', linen: true },
  'suit-jacket': { label: 'Suit jacket', cat: 'outer', kind: 'tailoring', f: [4, 5], warmth: 2, shape: 'blazer', suit: true },
  harrington: { label: 'Harrington', cat: 'outer', kind: 'jacket', f: [2, 3], warmth: 2, shape: 'jacket' },
  'suede-blouson': { label: 'Suede blouson', cat: 'outer', kind: 'jacket', f: [2, 3], warmth: 2, shape: 'jacket', suede: true },
  'waxed-jacket': { label: 'Waxed jacket', cat: 'outer', kind: 'jacket', f: [1, 3], warmth: 2, shape: 'field', waterproof: true },
  quilted: { label: 'Quilted liner', cat: 'outer', kind: 'jacket', f: [2, 4], warmth: 2, shape: 'quilted' },
  overcoat: { label: 'Overcoat', cat: 'outer', kind: 'coat', f: [3, 5], warmth: 3, shape: 'coat' },
  mac: { label: 'Mac / trench', cat: 'outer', kind: 'coat', f: [2, 5], warmth: 2, shape: 'mac', waterproof: true },
  'wool-trousers': { label: 'Wool trousers', cat: 'bottom', f: [3, 5], warmth: 2, shape: 'tailored' },
  'suit-trousers': { label: 'Suit trousers', cat: 'bottom', f: [4, 5], warmth: 2, shape: 'tailored', suit: true },
  chinos: { label: 'Chinos', cat: 'bottom', f: [2, 4], warmth: 2, shape: 'trousers' },
  'cotton-trousers': { label: 'Smart cotton trousers', cat: 'bottom', f: [2, 4], warmth: 1, shape: 'trousers' },
  'linen-trousers': { label: 'Linen trousers', cat: 'bottom', f: [2, 4], warmth: 1, shape: 'trousers', linen: true },
  jeans: { label: 'Jeans', cat: 'bottom', f: [1, 3], warmth: 2, shape: 'jeans' },
  shorts: { label: 'Tailored shorts', cat: 'bottom', f: [1, 2], warmth: 1, shape: 'shorts' },
  trainers: { label: 'Leather trainers', cat: 'shoes', f: [1, 3], warmth: 1, shape: 'trainer' },
  derby: { label: 'Derby shoes', cat: 'shoes', f: [3, 5], warmth: 2, shape: 'shoe' },
  'oxford-shoe': { label: 'Oxford shoes', cat: 'shoes', f: [4, 5], warmth: 2, shape: 'oxfordshoe' },
  loafers: { label: 'Loafers', cat: 'shoes', f: [2, 4], warmth: 1, shape: 'loafer' },
  chelsea: { label: 'Chelsea boots', cat: 'shoes', f: [2, 4], warmth: 2, shape: 'boot', boot: true },
  'desert-boot': { label: 'Desert boots', cat: 'shoes', f: [2, 3], warmth: 2, shape: 'desert', boot: true, suede: true },
  slides: { label: 'Slides / sandals', cat: 'shoes', f: [1, 1], warmth: 1, shape: 'slide' },
  belt: { label: 'Belt', cat: 'accessory', shape: 'belt' },
  watch: { label: 'Watch', cat: 'accessory', shape: 'watch' },
  scarf: { label: 'Scarf', cat: 'accessory', shape: 'scarf' },
  tie: { label: 'Tie', cat: 'accessory', shape: 'tie' },
  bag: { label: 'Bag', cat: 'accessory', shape: 'bag' },
  sunglasses: { label: 'Sunglasses', cat: 'accessory', shape: 'glasses' },
  cap: { label: 'Cap', cat: 'accessory', shape: 'cap' },
  beanie: { label: 'Beanie', cat: 'accessory', shape: 'beanie' },
  swim: { label: 'Swim shorts', cat: 'accessory', shape: 'shorts' },
}

export const LEVELS = ['', 'Off-duty', 'Casual', 'Smart casual', 'Smart', 'Formal']

export const WEATHER = [
  { id: 'hot', label: 'Hot', hint: '25°C+' },
  { id: 'warm', label: 'Warm', hint: '19 to 24°C' },
  { id: 'mild', label: 'Mild', hint: '13 to 18°C' },
  { id: 'cold', label: 'Cold', hint: '12°C or below' },
]

export function bandForTemp(t) {
  if (t >= 25) return 'hot'
  if (t >= 19) return 'warm'
  if (t >= 13) return 'mild'
  return 'cold'
}

export const SLOTS = ['base', 'mid', 'outer', 'coat', 'bottom', 'shoes']
export const SLOT_LABELS = { base: 'Top', mid: 'Knit layer', outer: 'Jacket', coat: 'Coat', bottom: 'Bottoms', shoes: 'Shoes' }

const SHIRT_BASES = new Set(['tee', 'oxford', 'poplin', 'pattern-shirt', 'linen-shirt', 'flannel-shirt'])

// ---------- colour maths ----------

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToLab([r, g, b]) {
  const lin = (c) => {
    c /= 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const R = lin(r), G = lin(g), B = lin(b)
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

export function hexToLab(hex) {
  return rgbToLab(hexToRgb(hex))
}

export function lightness(hex) {
  return hexToLab(hex)[0]
}

export function deltaE(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

// Nearest palette colours to a measured RGB, best first. Metals are skipped:
// a photo of a garment is never "steel".
export function nearestColours(profile, rgb, n = 3) {
  const lab = rgbToLab(rgb)
  return profile.palette
    .filter((c) => c.role !== 'metal')
    .map((c) => ({ colour: c, d: deltaE(lab, hexToLab(c.hex)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
}

// ---------- lookups ----------

const paletteCache = new WeakMap()
export function colourById(profile, id) {
  let map = paletteCache.get(profile)
  if (!map) {
    map = new Map(profile.palette.map((c) => [c.id, c]))
    paletteCache.set(profile, map)
  }
  return map.get(id) || { id, name: id, hex: '#999999', role: 'core', face: 'ok', lower: 'ok', feet: 'ok' }
}

export function sub(item) {
  return SUBTYPES[item.subtype] || { label: item.subtype, cat: 'accessory', shape: 'bag' }
}

export function formality(item) {
  return item.f || sub(item).f || [1, 5]
}

export function warmth(item) {
  return item.warmth || sub(item).warmth || 1
}

export function zoneOf(item) {
  const c = sub(item).cat
  if (c === 'bottom') return 'lower'
  if (c === 'shoes') return 'feet'
  return 'face'
}

export function isSuede(item) {
  return !!sub(item).suede || /suede/.test(item.colour || '')
}

export function isWaterproof(item) {
  return !!(item.waterproof ?? sub(item).waterproof)
}

export function slotFor(item) {
  const s = sub(item)
  if (s.cat === 'top') return 'base'
  if (s.cat === 'knit') return s.layer === 'mid' ? 'mid' : 'base'
  if (s.cat === 'outer') return s.kind === 'coat' ? 'coat' : 'outer'
  if (s.cat === 'bottom') return 'bottom'
  if (s.cat === 'shoes') return 'shoes'
  return null
}

export function occasionById(profile, id) {
  return profile.occasions.find((o) => o.id === id) || profile.occasions[0]
}

// ---------- item-level checks ----------

// Reasons a single piece can't be worn in this context at all. Used to prune
// the generator's search and to explain blocks in the manual builder.
export function itemBlocks(item, ctx) {
  const out = []
  const s = sub(item)
  const [lo, hi] = formality(item)
  const { level, occasion, weather, profile } = ctx
  if (item.status === 'laundry') out.push(`${item.name} is in the wash`)
  if (level < lo || level > hi) out.push(`${item.name} is ${LEVELS[lo]}${hi > lo ? ' to ' + LEVELS[hi] : ''}, not ${LEVELS[level]}`)
  if (occasion?.office && (profile.office_excludes || []).includes(item.subtype)) out.push(`${s.label} is not office wear`)
  if (weather) {
    if (weather.band === 'hot' && warmth(item) >= 3) out.push(`${item.name} is too heavy for the heat`)
    if (weather.band === 'cold' && (item.subtype === 'shorts' || item.subtype === 'slides')) out.push(`${s.label} in the cold`)
    if (weather.rain && s.cat === 'shoes' && (isSuede(item) || item.subtype === 'slides')) out.push(`${item.name} will not survive the rain`)
  }
  const c = colourById(profile, item.colour)
  if (c[zoneOf(item)] === 'block') out.push(`${c.name} ${zoneOf(item) === 'face' ? 'near the face' : 'on ' + s.label.toLowerCase()} is off-palette`)
  return out
}

// ---------- outfit evaluation ----------

function pick(outfit, items) {
  const o = {}
  for (const k of SLOTS) o[k] = outfit[k] ? items.get(outfit[k]) || null : null
  return o
}

function daysBetween(aISO, bISO) {
  return Math.round((Date.parse(bISO) - Date.parse(aISO)) / 86400000)
}

// Scores one outfit. `o` maps slot -> item (or null). Returns blocks (rules
// that make it unwearable), warns (allowed but costs points), pros and score.
export function evaluate(o, ctx) {
  const { profile, level, occasion, weather = { band: 'mild', rain: false }, today } = ctx
  const rules = profile.rules || {}
  const blocks = []
  const warns = []
  const pros = []
  let score = 10

  if (!o.base) blocks.push('Needs a top')
  if (!o.bottom) blocks.push('Needs trousers or shorts')
  if (!o.shoes) blocks.push('Needs shoes')

  const worn = SLOTS.map((k) => o[k]).filter(Boolean)
  for (const it of worn) for (const r of itemBlocks(it, ctx)) blocks.push(r)

  // structure
  if (o.base && sub(o.base).layer === 'mid') blocks.push(`${o.base.name} needs a shirt under it`)
  if (o.mid) {
    if (!o.base || !SHIRT_BASES.has(o.base.subtype)) blocks.push(`${o.mid.name} layers over a shirt or tee, not ${o.base ? sub(o.base).label.toLowerCase() : 'nothing'}`)
    else if (o.mid.subtype === 'knit-vest' && o.base.subtype === 'tee') blocks.push('A knitted waistcoat wants a collared shirt')
  }
  if (o.outer && o.coat) {
    if (weather.band !== 'cold' && !(weather.band === 'mild' && weather.rain)) warns.push('Coat over a jacket is overkill in this weather')
    else if (sub(o.outer).kind !== 'tailoring') warns.push('A coat over a casual jacket looks bulky')
  }

  // suits and required pieces
  const jacket = o.outer
  if (jacket && sub(jacket).suit && !(o.bottom && sub(o.bottom).suit && o.bottom.colour === jacket.colour)) blocks.push('Suit jacket without its trousers')
  if (occasion?.require === 'tailoring' && !(jacket && sub(jacket).kind === 'tailoring')) blocks.push('Needs a tailored jacket')

  // colour
  let statements = 0
  let colourPieces = 0
  let patterns = 0
  for (const it of worn) {
    const c = colourById(profile, it.colour)
    const z = zoneOf(it)
    const v = c[z]
    if (v === 'warn') warns.push(`${c.name} ${z === 'face' ? 'near the face' : 'here'}${c.note ? ': ' + c.note.split('.')[0] : ''}`)
    if (v === 'casual' && level > 2) warns.push(`${c.name} ${sub(it).label.toLowerCase()} are for casual looks`)
    if (sub(it).cat !== 'shoes') {
      if (c.role === 'statement') statements++
      if (c.role === 'statement' || c.role === 'accent') colourPieces++
    }
    if (it.pattern && it.pattern !== 'solid') patterns++
  }
  if (statements > (rules.max_statement ?? 1)) blocks.push('More than one statement colour')
  if (colourPieces > (rules.max_colour_pieces ?? 2)) warns.push('Too many colours competing')
  const maxP = rules.max_patterns ?? 1
  if (patterns > maxP + 1) blocks.push('Too many patterns')
  else if (patterns > maxP) warns.push('Two patterns at once: keep one plain')

  // leather harmony
  if (o.shoes && o.shoes.colour === 'black-leather' && worn.some((it) => it !== o.shoes && /espresso|tan/.test(it.colour))) warns.push('Black shoes with brown leather or suede')

  // weather
  const band = weather.band
  const layered = !!(o.mid || o.outer || o.coat || (o.base && sub(o.base).cat === 'knit'))
  if (band === 'hot') {
    if (o.mid) blocks.push('No knit layers in the heat')
    if (o.coat) blocks.push('No coat in the heat')
    if (o.outer && warmth(o.outer) > 1) blocks.push(`${o.outer.name} is too warm for the heat`)
    if (o.base && sub(o.base).cat === 'knit') blocks.push(`${o.base.name} in the heat`)
    if (o.bottom && warmth(o.bottom) > 1 && o.bottom.subtype !== 'wool-trousers') warns.push(`${o.bottom.name} is heavy for the heat`)
    if (o.shoes && sub(o.shoes).boot) warns.push('Boots in the heat')
    if (o.base && warmth(o.base) === 1 && o.bottom && warmth(o.bottom) === 1) { score += 1; pros.push('Light, breathable fabrics for the heat') }
  } else if (band === 'warm') {
    if (o.coat) warns.push('Coat is probably unnecessary')
    if (o.mid) warns.push('A knit may be too warm')
  } else if (band === 'mild') {
    if (o.bottom?.subtype === 'shorts') warns.push('Shorts are optimistic at this temperature')
    if (!layered) warns.push('Add a layer for a mild day')
  } else if (band === 'cold') {
    if (!o.outer && !o.coat) blocks.push('Needs a jacket or coat')
    if (worn.some((it) => sub(it).linen)) warns.push('Linen in the cold')
    if (o.mid || (o.base && sub(o.base).cat === 'knit')) { score += 1; pros.push('A knit for warmth and texture') }
    if (o.coat && warmth(o.coat) >= 3) { score += 1; pros.push('A proper coat, and your height carries it') }
  }
  if (weather.rain && band !== 'hot') {
    const shell = [o.outer, o.coat].filter(Boolean)
    if (shell.some(isWaterproof)) { score += 2; pros.push('Rainproof outer layer') }
    else warns.push('Nothing rainproof on top')
    if (shell.some((it) => isSuede(it))) warns.push('Suede in the rain')
  }

  // style bonuses drawn from the profile
  const faceItem = o.mid || o.base
  if (rules.colour_at_face_bonus !== false && faceItem && o.bottom) {
    const fc = colourById(profile, faceItem.colour)
    const bc = colourById(profile, o.bottom.colour)
    if ((fc.role === 'accent' || fc.role === 'statement') && !['accent', 'statement'].includes(bc.role)) {
      score += 1
      pros.push('Colour at the face, neutrals below')
    }
  }
  if (faceItem && o.bottom) {
    const diff = Math.abs(lightness(colourById(profile, faceItem.colour).hex) - lightness(colourById(profile, o.bottom.colour).hex))
    const outerDiff = o.outer ? Math.abs(lightness(colourById(profile, o.outer.colour).hex) - lightness(colourById(profile, faceItem.colour).hex)) : 0
    if (diff >= (rules.contrast_bonus_min ?? 28) || outerDiff >= (rules.contrast_bonus_min ?? 28)) {
      score += 1
      pros.push('Clear contrast, which suits your colouring')
    }
  }

  // fit to the occasion
  for (const it of worn) {
    const [lo, hi] = formality(it)
    score -= 0.4 * Math.abs((lo + hi) / 2 - level)
  }

  // rotation
  if (today) {
    let fresh = 0
    for (const it of worn) {
      const last = (it.wears || []).filter((d) => d <= today).sort().pop()
      if (last) {
        const gap = daysBetween(last, today)
        if (gap <= 2) score -= 2
        else if (gap <= 6) score -= 0.7
        else if (gap >= 30) fresh++
      }
    }
    if (fresh >= 2) { score += 0.5; pros.push('Rotates in pieces you have not worn lately') }
  }

  score -= 3 * warns.length
  return { ok: blocks.length === 0, blocks: [...new Set(blocks)], warns: [...new Set(warns)], pros, score: Math.round(score * 10) / 10 }
}

// ---------- generation ----------

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Candidate pieces per slot after item-level pruning. Knits that can be worn
// alone or over a shirt sit in both the base and mid lists.
function dims(pool, ctx) {
  const d = { base: [], mid: [null], outer: [null], coat: [null], bottom: [], shoes: [] }
  for (const it of pool) {
    const slot = slotFor(it)
    if (!slot) continue
    if (itemBlocks(it, ctx).length) continue
    if (slot === 'base' && sub(it).cat === 'knit' && sub(it).layer === 'both') d.mid.push(it)
    d[slot].push(it)
  }
  if (ctx.weather?.band === 'hot') { d.mid = [null]; d.coat = [null] }
  return { d }
}

function* combos(d) {
  for (const base of d.base)
    for (const mid of d.mid) {
      if (mid && (mid === base || !SHIRT_BASES.has(base.subtype))) continue
      for (const outer of d.outer)
        for (const coat of d.coat)
          for (const bottom of d.bottom)
            for (const shoes of d.shoes) yield { base, mid, outer, coat, bottom, shoes }
    }
}

export function outfitKey(o) {
  return SLOTS.map((k) => (o[k] ? o[k].id : '-')).join('|')
}
const key = outfitKey

function overlap(a, b) {
  let n = 0
  for (const k of SLOTS) if (a[k] && a[k] === b[k]) n++
  return n
}

// Best outfits for one context, made diverse: each pick differs from the
// ones already chosen in at least two pieces.
export function generate(items, ctx, { limit = 6, seed = 1, jitter = 0.6, exclude = [] } = {}) {
  const { d } = dims(items, ctx)
  const rng = mulberry32(seed)
  const skip = new Set(exclude)
  const all = []
  for (const o of combos(d)) {
    const k = key(o)
    if (skip.has(k)) continue
    const e = evaluate(o, ctx)
    if (!e.ok) continue
    all.push({ parts: o, key: k, ...e, rank: e.score + rng() * jitter })
  }
  all.sort((a, b) => b.rank - a.rank)
  const picked = []
  for (const c of all) {
    if (picked.every((p) => SLOTS.filter((k) => p.parts[k] || c.parts[k]).length - overlap(p.parts, c.parts) >= 2)) picked.push(c)
    if (picked.length >= limit) break
  }
  return { results: picked, total: all.length }
}

// Count of valid outfits in a context; with `fixed`, only those using it.
export function countOutfits(items, ctx, fixed) {
  const pool = fixed ? [...items, fixed] : items
  const { d } = dims(pool, ctx)
  if (fixed) {
    const slot = slotFor(fixed)
    if (!slot || itemBlocks(fixed, ctx).length) return 0
    const variants = [{ ...d, [slot]: [fixed] }]
    if (slot === 'base' && sub(fixed).layer === 'both') variants.push({ ...d, base: d.base.filter((x) => x !== fixed), mid: [fixed] })
    let n = 0
    for (const v of variants) for (const o of combos(v)) if (evaluate(o, ctx).ok) n++
    return n
  }
  let n = 0
  for (const o of combos(d)) if (evaluate(o, ctx).ok) n++
  return n
}

// Everyday spread of contexts used to judge how useful a piece is.
export const SCENARIOS = [
  { occasion: 'casual', band: 'mild' },
  { occasion: 'family', band: 'hot' },
  { occasion: 'smart-casual', band: 'mild' },
  { occasion: 'date', band: 'cold' },
  { occasion: 'office-1', band: 'warm' },
  { occasion: 'office-2', band: 'mild' },
  { occasion: 'office-2', band: 'cold', rain: true },
  { occasion: 'wedding', band: 'warm' },
]

export function scenarioCtx(profile, s) {
  const occasion = occasionById(profile, s.occasion)
  return { profile, occasion, level: occasion.level, weather: { band: s.band, rain: !!s.rain } }
}

// How many extra outfits a set of new pieces would add across SCENARIOS.
// Pieces are counted in order, each against the wardrobe plus the pieces
// after it, so outfits using two new pieces are not counted twice.
export function outfitGain(items, profile, newPieces) {
  let gain = 0
  newPieces.forEach((piece, i) => {
    const pool = [...items, ...newPieces.slice(i + 1)]
    for (const s of SCENARIOS) gain += countOutfits(pool, scenarioCtx(profile, s), piece)
  })
  return gain
}

export function coverage(items, profile) {
  return SCENARIOS.map((s) => ({ ...s, label: occasionById(profile, s.occasion).label, n: countOutfits(items, scenarioCtx(profile, s)) }))
}

// ---------- buy list ----------

export function slotOwned(slot, items) {
  return items.filter((it) => it.slotId === slot.id)
}

export function suggestSlot(profile, items, subtype, colour) {
  const open = profile.slots.filter((s) => s.subtypes.includes(subtype) && slotOwned(s, items).length < s.qty)
  return open.find((s) => s.colours.includes(colour)) || open[0] || null
}

// Virtual pieces representing an unfilled slot, in its best colours.
export function virtualPieces(slot, items) {
  const owned = slotOwned(slot, items)
  const pieces = []
  const isSet = slot.subtypes.includes('suit-jacket') && slot.subtypes.includes('suit-trousers')
  if (isSet) {
    if (owned.length) return []
    const colour = slot.best[0]
    return [
      { id: `v-${slot.id}-j`, name: `${slot.name} jacket`, subtype: 'suit-jacket', colour, virtual: true },
      { id: `v-${slot.id}-t`, name: `${slot.name} trousers`, subtype: 'suit-trousers', colour, virtual: true },
    ]
  }
  const ownedColours = new Set(owned.map((o) => o.colour))
  const colours = [...slot.best, ...slot.colours].filter((c, i, a) => a.indexOf(c) === i && !ownedColours.has(c))
  for (let i = owned.length; i < slot.qty; i++) {
    const colour = colours.shift() || slot.best[0]
    pieces.push({ id: `v-${slot.id}-${i}`, name: slot.name, subtype: slot.subtypes[0], colour, virtual: true })
  }
  return pieces
}

export function buyNext(profile, items) {
  const wearable = items.filter((it) => it.status !== 'laundry')
  return profile.slots
    .map((slot) => {
      const pieces = virtualPieces(slot, items)
      if (!pieces.length) return null
      const first = pieces.slice(0, sub(pieces[0]).suit ? 2 : 1)
      return { slot, pieces: first, gain: outfitGain(wearable, profile, first) }
    })
    .filter(Boolean)
    .sort((a, b) => b.gain - a.gain || a.slot.tier - b.slot.tier)
}

// ---------- formulas from the guide ----------

export function fillFormula(formula, items) {
  return formula.parts.map(([subs, colour]) => {
    const subtypes = subs.split('|')
    const exact = items.find((it) => subtypes.includes(it.subtype) && it.colour === colour)
    const close = exact ? null : items.find((it) => subtypes.includes(it.subtype))
    return { subtypes, colour, item: exact || close, match: exact ? 'exact' : close ? 'close' : 'missing' }
  })
}

// Turns a loose list of pieces into slots: a shirt plus a knit becomes base
// and mid layer; a knit on its own is the base.
export function partsFromItems(list) {
  const parts = {}
  const tops = list.filter((it) => sub(it).cat === 'top')
  const knits = list.filter((it) => sub(it).cat === 'knit')
  if (tops.length) {
    parts.base = tops[0]
    if (knits.length) parts.mid = knits[0]
  } else if (knits.length) {
    parts.base = knits[0]
  }
  for (const it of list) {
    const slot = slotFor(it)
    if (slot && slot !== 'base' && slot !== 'mid') parts[slot] = it
  }
  return parts
}

// Starter wardrobe built from the buy list (best colours), for trying the
// app before photographing anything.
export function demoWardrobe(profile, maxTier = 2) {
  const items = []
  for (const slot of profile.slots) {
    if (slot.tier > maxTier) continue
    for (const p of virtualPieces(slot, items)) {
      const c = colourById(profile, p.colour)
      items.push({
        id: `demo-${slot.id}-${items.length}`,
        name: `${c.name.split(' / ')[0]} ${sub(p).label.toLowerCase()}`,
        subtype: p.subtype,
        colour: p.colour,
        pattern: sub(p).pattern || 'solid',
        slotId: slot.id,
        status: 'available',
        wears: [],
        demo: true,
      })
    }
  }
  return items
}

// ---------- week planning ----------

// days: [{ date, occasion, weather, locked, exclude }]. locked is a parts
// object kept as is; exclude is an outfit key the day must not repeat.
// Greedy per day with variety penalties, repeated with jitter; best total wins.
export function planWeek(items, profile, days, { restarts = 24, seed = 7 } = {}) {
  const cands = days.map((day) => {
    if (day.locked) return null
    const occasion = occasionById(profile, day.occasion)
    const ctx = { profile, occasion, level: occasion.level, weather: day.weather, today: day.date }
    const { d } = dims(items, ctx)
    const list = []
    for (const o of combos(d)) {
      const e = evaluate(o, ctx)
      if (e.ok) list.push({ parts: o, key: key(o), ...e })
    }
    list.sort((a, b) => b.score - a.score)
    return list.slice(0, 400)
  })

  let best = null
  for (let r = 0; r < restarts; r++) {
    const rng = mulberry32(seed + r * 101)
    const used = new Map()
    const keys = new Set()
    const plan = []
    let total = 0
    const note = (o) => {
      for (const k of SLOTS) if (o[k]) used.set(o[k].id, [...(used.get(o[k].id) || []), k])
      keys.add(key(o))
    }
    days.forEach((day, i) => {
      if (day.locked) {
        plan.push({ parts: day.locked, locked: true })
        note(day.locked)
        return
      }
      let top = null
      let topScore = -Infinity
      for (const c of cands[i]) {
        if (keys.has(c.key) || c.key === day.exclude) continue
        let s = c.score + (r ? rng() * 2.5 : 0)
        for (const k of SLOTS) {
          const it = c.parts[k]
          if (!it) continue
          const n = (used.get(it.id) || []).length
          if (!n) continue
          if (k === 'base') s -= 6 * n
          else if (k === 'mid') s -= 2 * n
          else if (k === 'bottom') s -= n >= 2 ? 3 * (n - 1) : 0.5
          else if (k === 'shoes') s -= n >= 2 ? 1 * (n - 1) : 0
          else s -= 0.3 * n
        }
        if (s > topScore) { topScore = s; top = c }
      }
      plan.push(top)
      if (top) { note(top.parts); total += topScore } else total -= 20
    })
    if (!best || total > best.total) best = { plan, total }
  }
  return best.plan
}

// ---------- profile validation ----------

// Problems with an imported style profile, as readable strings. Empty means
// the profile is safe to use. Shared by the app import and validate-profile.mjs.
export function validateProfile(p) {
  const errs = []
  if (p?.format !== 'fearne-style-profile') errs.push('format must be "fearne-style-profile"')
  if (!Array.isArray(p?.palette) || !p.palette.length) errs.push('palette is missing')
  if (!Array.isArray(p?.occasions) || !p.occasions.length) errs.push('occasions are missing')
  if (!Array.isArray(p?.slots)) errs.push('slots are missing')
  if (errs.length) return errs
  const ids = new Set(p.palette.map((c) => c.id))
  for (const c of p.palette) if (!/^#[0-9a-f]{6}$/i.test(c.hex)) errs.push(`colour ${c.id} has a bad hex`)
  for (const s of p.slots) {
    for (const c of s.colours) if (!ids.has(c)) errs.push(`slot ${s.id} uses unknown colour ${c}`)
    for (const t of s.subtypes) if (!SUBTYPES[t]) errs.push(`slot ${s.id} uses unknown type ${t}`)
  }
  for (const s of p.slots) for (const c of s.best || []) if (!s.colours.includes(c)) errs.push(`slot ${s.id} best colour ${c} is not in its colours`)
  for (const f of p.formulas || []) {
    if (!p.occasions.some((o) => o.id === f.occasion)) errs.push(`look "${f.name}" uses unknown occasion ${f.occasion}`)
    for (const [t, c] of f.parts) {
      if (!ids.has(c)) errs.push(`look "${f.name}" uses unknown colour ${c}`)
      for (const x of t.split('|')) if (!SUBTYPES[x]) errs.push(`look "${f.name}" uses unknown type ${x}`)
    }
  }
  const verdicts = new Set(['ok', 'warn', 'block', 'casual'])
  for (const c of p.palette) for (const z of ['face', 'lower', 'feet']) if (!verdicts.has(c[z])) errs.push(`colour ${c.id} has no valid "${z}" verdict`)
  for (const o of p.occasions) if (!(o.level >= 1 && o.level <= 5)) errs.push(`occasion ${o.id} needs a level from 1 to 5`)
  const slotIds = p.slots.map((s) => s.id)
  for (const id of new Set(slotIds.filter((x, i) => slotIds.indexOf(x) !== i))) errs.push(`slot id ${id} is used twice`)
  return errs
}
