// Wardrobe UI. Storage comes from createStore(): IndexedDB on this device
// (store-local.js) or Supabase via the hub login (store-hub.js); build.mjs
// picks one per target and injects DEFAULT_PROFILE from profile.json.
import {
  CATEGORIES, SUBTYPES, LEVELS, WEATHER, SLOTS, SLOT_LABELS, bandForTemp, nearestColours, colourById, sub,
  formality, zoneOf, slotFor, occasionById, isSuede, evaluate, generate, buyNext, coverage, outfitGain, outfitKey,
  suggestSlot, slotOwned, fillFormula, partsFromItems, planWeek, demoWardrobe, lightness, virtualPieces, validateProfile,
} from './engine.js'
import { createStore } from './store-local.js'

// ---------- small helpers ----------

const $ = (s, el = document) => el.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayISO = () => iso(new Date())
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function mondayOf(d) {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : w.endsWith('s') ? 'es' : 's'}`

const LOCATIONS = {
  malta: { label: 'Malta', lat: 35.8989, lon: 14.5146 },
  nl: { label: 'Netherlands', lat: 52.3676, lon: 4.9041 },
  ie: { label: 'Ireland', lat: 53.3498, lon: -6.2603 },
}
const DEFAULT_WEEK = ['office-2', 'office-1', 'office-1', 'office-2', 'office-1', 'family', 'casual']
const ROLE_LABELS = {
  core: 'Core neutrals', white: 'Whites', lower: 'Lower half only', blue: 'Blues and denim', accent: 'Accents',
  statement: 'Statement (one at a time)', leather: 'Leather', metal: 'Metals', avoid: 'Avoid',
}
const VERDICT_TEXT = { ok: 'Works', warn: 'Caution', block: 'Off-palette', casual: 'Casual only' }

// ---------- storage ----------

const store = createStore()
const HUB = store.kind === 'hub'
let storageOk = true
let gate = null // hub only: { kind: 'signed-out' | 'pending' | 'setup' | 'error', message }
const photos = new Map()
let state
let saveTimer
let dirty = false
let lastSync = null

function freshState() {
  return { version: 1, profile: structuredClone(DEFAULT_PROFILE), items: [], outfits: [], weeks: {}, location: 'malta' }
}

function save() {
  dirty = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      lastSync = await store.saveState(state)
      dirty = false
      if (!storageOk) { storageOk = true; render() }
    } catch {
      if (storageOk) { storageOk = false; render() }
    }
  }, 400)
}

async function setPhoto(id, data) {
  if (data) photos.set(id, data)
  else photos.delete(id)
  try {
    if (data) await store.putPhoto(id, data)
    else await store.deletePhoto(id)
  } catch {
    storageOk = false
    toast('Photo not saved')
  }
}

async function boot() {
  try {
    const r = await store.init()
    state = r.state || freshState()
    for (const [k, v] of r.photos) photos.set(k, v)
    lastSync = r.updatedAt
    if (!r.state && HUB) save()
  } catch (e) {
    state = freshState()
    if (HUB) gate = { kind: e.code || 'error', message: e.message }
    else storageOk = false
  }
  render()
}

// Pick up changes made on another device when the page comes back into view.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !store.refresh || gate || dirty) return
  try {
    const r = await store.refresh()
    if (r && r.updatedAt !== lastSync && !dirty) {
      state = r.state
      lastSync = r.updatedAt
      ui.gen.results = null
      ui.buy = null
      render()
    }
  } catch {}
})

// ---------- UI state ----------

const ui = {
  tab: 'wardrobe',
  filter: 'all',
  outTab: 'generate',
  gen: { occasion: 'smart-casual', band: 'mild', rain: false, results: null, shown: [] },
  build: {},
  weekStart: mondayOf(new Date()),
  sheet: null,
  buy: null,
  busy: null,
}

const P = () => state.profile
const itemMap = () => new Map(state.items.map((it) => [it.id, it]))
const available = () => state.items.filter((it) => it.status !== 'laundry')

function genCtx(date = todayISO()) {
  const occasion = occasionById(P(), ui.gen.occasion)
  return { profile: P(), occasion, level: occasion.level, weather: { band: ui.gen.band, rain: ui.gen.rain }, today: date }
}

function partsToIds(parts) {
  const out = {}
  for (const k of SLOTS) if (parts[k]) out[k] = parts[k].id
  return out
}

function idsToParts(ids) {
  const m = itemMap()
  const out = {}
  for (const k of SLOTS) out[k] = ids?.[k] ? m.get(ids[k]) || null : null
  return out
}

const partsList = (parts) => SLOTS.map((k) => parts[k]).filter(Boolean)
const outfitName = (parts) => partsList(parts).map((it) => it.name).join(', ')

function toast(msg) {
  const el = $('#toast')
  el.textContent = msg
  el.classList.remove('hide')
  clearTimeout(toast.t)
  toast.t = setTimeout(() => el.classList.add('hide'), 2600)
}

// ---------- garment drawings (used when there is no photo) ----------

const SHAPES = {
  tee: '<path d="M28 20 L41 14 Q50 22 59 14 L72 20 L88 34 L78 45 L70 39 L70 88 L30 88 L30 39 L22 45 L12 34 Z"/>',
  polo: '<path d="M28 20 L41 14 Q50 22 59 14 L72 20 L88 34 L78 45 L70 39 L70 88 L30 88 L30 39 L22 45 L12 34 Z"/><path class="d" d="M41 14 L45 25 L50 22 L55 25 L59 14"/><path class="l" d="M50 22 L50 36"/>',
  shirt: '<path d="M30 18 L42 13 L50 22 L58 13 L70 18 L84 30 L90 82 L80 84 L72 44 L72 90 L28 90 L28 44 L20 84 L10 82 L16 30 Z"/><path class="d" d="M42 13 L45 25 L50 22 L55 25 L58 13"/><path class="l" d="M50 22 L50 90"/>',
  camp: '<path d="M28 20 L41 14 L50 30 L59 14 L72 20 L88 34 L78 45 L70 39 L70 88 L30 88 L30 39 L22 45 L12 34 Z"/><path class="l" d="M50 30 L50 88"/>',
  knit: '<path d="M30 18 L42 14 Q50 22 58 14 L70 18 L84 30 L90 82 L80 84 L72 44 L72 90 L28 90 L28 44 L20 84 L10 82 L16 30 Z"/><path class="l" d="M28 85 L72 85 M11 78 L20 80 M89 78 L80 80"/>',
  rollneck: '<path d="M30 18 L42 14 L58 14 L70 18 L84 30 L90 82 L80 84 L72 44 L72 90 L28 90 L28 44 L20 84 L10 82 L16 30 Z"/><path class="d" d="M41 5 L59 5 L59 17 L41 17 Z"/><path class="l" d="M28 85 L72 85"/>',
  halfzip: '<path d="M30 18 L42 14 Q50 22 58 14 L70 18 L84 30 L90 82 L80 84 L72 44 L72 90 L28 90 L28 44 L20 84 L10 82 L16 30 Z"/><path class="d" d="M42 9 L58 9 L58 17 L42 17 Z"/><path class="l" d="M50 17 L50 42 M28 85 L72 85"/>',
  vest: '<path d="M34 16 L44 14 L50 36 L56 14 L66 16 L71 32 L71 88 L29 88 L29 32 Z"/><path class="l" d="M50 36 L50 88"/>',
  blazer: '<path d="M30 16 L42 12 L50 20 L58 12 L70 16 L84 28 L90 84 L80 86 L72 44 L72 94 L28 94 L28 44 L20 86 L10 84 L16 28 Z"/><path class="l" d="M42 12 L45 40 L50 58 L55 40 L58 12 M33 72 L42 72 M58 72 L67 72"/><circle class="b" cx="50" cy="64" r="1.8"/><circle class="b" cx="50" cy="76" r="1.8"/>',
  overshirt: '<path d="M30 17 L42 13 L50 21 L58 13 L70 17 L84 29 L90 84 L80 86 L72 44 L72 90 L28 90 L28 44 L20 86 L10 84 L16 29 Z"/><path class="d" d="M42 13 L45 24 L50 21 L55 24 L58 13"/><path class="l" d="M50 21 L50 90 M33 32 L45 32 L45 44 L33 44 Z M55 32 L67 32 L67 44 L55 44 Z"/>',
  jacket: '<path d="M30 17 L42 13 L50 19 L58 13 L70 17 L84 29 L90 80 L80 82 L72 44 L72 84 L28 84 L28 44 L20 82 L10 80 L16 29 Z"/><path class="d" d="M28 78 L72 78 L72 86 L28 86 Z M42 13 L44 20 L50 19 L56 20 L58 13"/><path class="l" d="M50 19 L50 78"/>',
  quilted: '<path d="M30 17 L42 13 Q50 20 58 13 L70 17 L84 29 L90 80 L80 82 L72 44 L72 86 L28 86 L28 44 L20 82 L10 80 L16 29 Z"/><path class="l" d="M50 18 L50 86 M30 30 L70 70 M30 50 L58 78 M42 22 L70 50 M70 30 L30 70 M70 50 L42 78 M58 22 L30 50"/>',
  coat: '<path d="M30 14 L42 10 L50 18 L58 10 L70 14 L84 26 L90 80 L80 82 L72 40 L75 98 L25 98 L28 40 L20 82 L10 80 L16 26 Z"/><path class="l" d="M42 10 L45 36 L50 50 L55 36 L58 10 M50 50 L50 98"/><circle class="b" cx="46" cy="58" r="1.8"/><circle class="b" cx="46" cy="72" r="1.8"/>',
  shirtbd: '<path d="M30 18 L42 13 L50 22 L58 13 L70 18 L84 30 L90 82 L80 84 L72 44 L72 90 L28 90 L28 44 L20 84 L10 82 L16 30 Z"/><path class="d" d="M42 13 L45 25 L50 22 L55 25 L58 13"/><path class="l" d="M50 22 L50 90 M34 34 L42 34 L42 42 L34 42"/><circle class="b" cx="45" cy="24" r="1.2"/><circle class="b" cx="55" cy="24" r="1.2"/>',
  field: '<path d="M30 17 L42 13 L50 19 L58 13 L70 17 L84 29 L90 80 L80 82 L72 44 L72 88 L28 88 L28 44 L20 82 L10 80 L16 29 Z"/><path class="d" d="M42 13 L44 21 L50 19 L56 21 L58 13"/><path class="l" d="M50 19 L50 88 M32 34 L45 34 L45 46 L32 46 Z M55 34 L68 34 L68 46 L55 46 Z M31 60 L46 60 L46 76 L31 76 Z M54 60 L69 60 L69 76 L54 76 Z"/>',
  mac: '<path d="M30 14 L42 10 L50 18 L58 10 L70 14 L84 26 L90 80 L80 82 L72 40 L75 98 L25 98 L28 40 L20 82 L10 80 L16 26 Z"/><path class="d" d="M27 54 L73 54 L73 60 L27 60 Z"/><path class="l" d="M42 10 L45 34 L50 44 L55 34 L58 10 M50 44 L50 98 M16 26 L30 32 M84 26 L70 32"/><circle class="b" cx="44" cy="50" r="1.6"/><circle class="b" cx="56" cy="50" r="1.6"/>',
  tailored: '<path d="M30 8 L70 8 L74 94 L56 94 L50 34 L44 94 L26 94 Z"/><path class="l" d="M30 14 L70 14 M50 14 L50 30 M36 16 L35 94 M64 16 L65 94"/>',
  oxfordshoe: '<path d="M10 64 Q12 50 28 48 L46 46 Q56 56 74 56 Q90 58 90 68 L90 72 L10 72 Z"/><path class="d" d="M10 72 L90 72 L90 77 L10 77 Z"/><path class="l" d="M70 56 Q66 64 72 72 M38 48 L48 56"/>',
  desert: '<path d="M22 38 L46 36 L50 54 Q66 56 80 59 Q90 61 90 68 L90 72 L20 72 Z"/><path class="d" d="M20 72 L90 72 L90 77 L20 77 Z"/><path class="l" d="M40 40 L46 50 M38 44 L44 47 M40 49 L46 52"/>',
  trousers: '<path d="M30 8 L70 8 L74 94 L56 94 L50 34 L44 94 L26 94 Z"/><path class="l" d="M30 14 L70 14 M50 14 L50 30"/>',
  jeans: '<path d="M30 8 L70 8 L74 94 L56 94 L50 34 L44 94 L26 94 Z"/><path class="l" d="M30 14 L70 14 M50 14 L50 30 M31 15 Q38 26 46 22 M69 15 Q62 26 54 22"/>',
  shorts: '<path d="M28 22 L72 22 L76 66 L54 68 L50 42 L46 68 L24 66 Z"/><path class="l" d="M28 28 L72 28"/>',
  shoe: '<path d="M10 64 Q12 50 28 48 L46 46 Q56 56 74 56 Q90 58 90 68 L90 72 L10 72 Z"/><path class="d" d="M10 72 L90 72 L90 77 L10 77 Z"/><path class="l" d="M34 48 L46 58"/>',
  loafer: '<path d="M10 64 Q12 54 28 52 L48 52 Q60 58 76 58 Q90 60 90 68 L90 72 L10 72 Z"/><path class="d" d="M10 72 L90 72 L90 76 L10 76 Z"/><path class="l" d="M52 55 L66 60"/>',
  boot: '<path d="M22 22 L46 22 L48 52 Q64 54 80 58 Q90 60 90 68 L90 72 L20 72 Z"/><path class="d" d="M20 72 L90 72 L90 77 L20 77 Z M32 26 L42 26 L43 50 L33 50 Z"/>',
  trainer: '<path d="M10 62 Q12 50 28 48 L44 46 Q56 54 74 55 Q90 57 90 66 L90 70 L10 70 Z"/><path class="s" d="M8 69 L92 69 L92 78 L8 78 Z"/><path class="l" d="M32 50 L46 58"/>',
  slide: '<path class="d" d="M10 66 Q50 60 90 66 L90 72 Q50 68 10 72 Z"/><path d="M30 66 Q46 44 64 64 Z"/>',
  belt: '<path d="M8 44 L92 44 L92 56 L8 56 Z"/><path class="m" d="M60 40 L74 40 L74 60 L60 60 Z"/>',
  watch: '<path d="M42 10 L58 10 L58 90 L42 90 Z"/><circle class="m" cx="50" cy="50" r="17"/><circle class="f" cx="50" cy="50" r="13"/>',
  scarf: '<path d="M30 10 L52 10 L52 90 L44 96 L30 90 Z"/><path d="M52 10 L70 10 L70 60 L52 60 Z"/>',
  tie: '<path d="M44 10 L56 10 L54 20 L60 76 L50 90 L40 76 L46 20 Z"/>',
  bag: '<path d="M18 36 L82 36 L82 84 L18 84 Z"/><path class="l" d="M36 36 Q50 16 64 36"/>',
  glasses: '<path d="M14 42 L44 42 L42 60 Q30 66 16 58 Z M56 42 L86 42 L84 58 Q70 66 58 60 Z"/><path class="l" d="M44 46 Q50 42 56 46"/>',
  cap: '<path d="M22 60 Q22 30 50 28 Q78 30 78 60 Z"/><path class="d" d="M50 60 L94 66 L78 56 Z"/>',
  beanie: '<path d="M24 64 Q24 26 50 24 Q76 26 76 64 Z"/><path class="d" d="M22 58 L78 58 L78 74 L22 74 Z"/>',
}

let svgSeq = 0
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)))
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => ch(c).toString(16).padStart(2, '0')).join('')
}

function garmentSVG(item) {
  const s = sub(item)
  const hex = colourById(P(), item.colour).hex
  const light = lightness(hex) > 45
  const stroke = shade(hex, light ? -0.42 : 0.35)
  const detail = shade(hex, light ? -0.16 : 0.14)
  const id = `p${++svgSeq}`
  let fill = hex
  let defs = ''
  if (item.pattern === 'stripe') {
    const horiz = s.shape === 'tee'
    defs = `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"${horiz ? '' : ' patternTransform="rotate(90)"'}><rect width="6" height="6" fill="${hex}"/><rect width="6" height="2" fill="${light ? '#2f4a6b' : '#f2f2ee'}"/></pattern>`
    fill = `url(#${id})`
  } else if (item.pattern === 'check') {
    defs = `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${hex}"/><rect width="8" height="3" fill="${shade(hex, light ? -0.18 : 0.2)}" opacity=".8"/><rect width="3" height="8" fill="${shade(hex, light ? -0.18 : 0.2)}" opacity=".6"/></pattern>`
    fill = `url(#${id})`
  }
  if (isSuede(item) && item.pattern === 'solid') {
    defs = `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="${hex}"/><circle cx="1" cy="1" r=".6" fill="${detail}"/><circle cx="3.5" cy="3" r=".5" fill="${detail}"/></pattern>`
    fill = `url(#${id})`
  }
  const body = (SHAPES[s.shape] || SHAPES.bag)
    .replace(/<path d=/g, `<path fill="${fill}" stroke="${stroke}" d=`)
    .replace(/<path class="d"/g, `<path fill="${detail}" stroke="${stroke}"`)
    .replace(/<path class="l"/g, `<path fill="none" stroke="${stroke}"`)
    .replace(/<path class="s"/g, `<path fill="#f4f4f0" stroke="#9a9d9a"`)
    .replace(/<path class="m"/g, `<path fill="none" stroke="#8d9296" stroke-width="3"`)
    .replace(/<circle class="b"/g, `<circle fill="${stroke}"`)
    .replace(/<circle class="m"/g, `<circle fill="#9ba0a4" stroke="#6d7276"`)
    .replace(/<circle class="f"/g, `<circle fill="${hex}"`)
  return `<svg viewBox="0 0 100 100" aria-hidden="true" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><defs>${defs}</defs>${body}</svg>`
}

const settings = () => ({ visual: 'drawings', keepPhotos: true, ...state.settings })

// Number among pieces of the same type and colour (two navy merino crews
// show as 1 and 2), or 0 when the piece is the only one.
function twinNumber(item) {
  if (!item || item.virtual) return 0
  const twins = state.items.filter((it) => it.subtype === item.subtype && it.colour === item.colour)
  return twins.length > 1 ? twins.indexOf(item) + 1 : 0
}

// Drawings are the default look everywhere; photos show in lists only when
// chosen in Profile, and always in the piece's own sheet.
function tile(item, size = '', { photo = settings().visual === 'photos' } = {}) {
  const src = photo && item && !item.virtual ? photos.get(item.id) : null
  const inner = !item ? '' : src ? `<img src="${src}" alt="${esc(item.name)}" loading="lazy">` : garmentSVG(item)
  const n = twinNumber(item)
  return `<div class="tile ${size}">${inner}${n ? `<span class="twin" title="One of several ${esc(sub(item).label.toLowerCase())}s in this colour">${n}</span>` : ''}</div>`
}

const label = (it) => (it.detail ? `${it.name} (${it.detail})` : it.name)

const dot = (colourId) => `<i class="dot" style="background:${colourById(P(), colourId).hex}"></i>`

// ---------- icons ----------

const ICONS = {
  wardrobe: '<path d="M12 7.5a2 2 0 1 1 2-2c0 1-2 1.5-2 3v1.2"/><path d="M12 9.7 3.2 16.4c-.9.7-.4 2.1.7 2.1h16.2c1.1 0 1.6-1.4.7-2.1L12 9.7Z"/>',
  outfits: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z"/>',
  week: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  buy: '<path d="M5 8h14l-1.2 12.5H6.2Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  profile: '<circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="10" r="1.3"/><circle cx="12" cy="7.5" r="1.3"/><circle cx="15.5" cy="10" r="1.3"/><path d="M12 20.5c-1.5 0-2-1.2-1.2-2.2.8-1 .3-2.3-1-2.3H8"/>',
}
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`

const TABS = [
  ['wardrobe', 'Wardrobe'],
  ['outfits', 'Outfits'],
  ['week', 'Week'],
  ['buy', 'Buy list'],
  ['profile', 'Profile'],
]

// ---------- render ----------

const STORAGE_BANNER = HUB
  ? '<div class="banner">Changes are not saving to Fearne Hub right now. Check your connection, or sign in again on the hub.</div>'
  : '<div class="banner">This browser is blocking storage, so nothing will be kept after you close the page. Open the file directly in Safari or Chrome to keep your wardrobe.</div>'

function viewGate() {
  const g = gate
  const body = {
    'signed-out': ['Sign in to Fearne Hub', 'Your wardrobe is private to your hub account. Sign in, then come back to this page.', '<a class="btn" href="/login">Sign in</a>'],
    pending: ['Waiting for approval', 'A family admin needs to approve your hub account first.', '<a class="btn ghost" href="/">Back to the hub</a>'],
    setup: ['Not set up yet', 'The wardrobe tables are missing in Supabase. Run _reference/wardrobe-state-schema.sql in the Supabase SQL editor, then reload.', '<button class="btn" data-act="reload">Reload</button>'],
    error: ['Could not load your wardrobe', g.message || 'Something went wrong.', '<button class="btn" data-act="reload">Try again</button>'],
  }[g.kind] || ['Could not load your wardrobe', g.message, '<button class="btn" data-act="reload">Try again</button>']
  return `<div class="empty"><h2>${esc(body[0])}</h2><p class="serif">${esc(body[1])}</p><div class="row" style="justify-content:center">${body[2]}</div></div>`
}

function render() {
  document.title = 'Wardrobe'
  $('#back').innerHTML = HUB ? '<a href="/" class="small">‹ Fearne Hub</a>' : ''
  if (gate) {
    $('#main').innerHTML = viewGate()
    $('#tabs').innerHTML = ''
    return
  }
  $('#main').innerHTML = (storageOk ? '' : STORAGE_BANNER) + VIEWS[ui.tab]()
  $('#tabs').innerHTML = `<div class="inner">${TABS.map(([id, label]) => `<button data-act="tab" data-v="${id}"${ui.tab === id ? ' aria-current="page"' : ''}>${icon(id)}${label}</button>`).join('')}</div>`
  $('#subtitle').textContent = P().meta?.name || 'Style profile'
  renderSheet()
}

function renderSheet() {
  const el = $('#sheet')
  if (!ui.sheet) { el.classList.remove('open'); el.innerHTML = ''; return }
  el.classList.add('open')
  const scroll = el.querySelector('.panel-s')?.scrollTop || 0
  el.innerHTML = `<div class="scrim" data-act="closeSheet"></div><div class="panel-s" role="dialog" aria-modal="true">${SHEETS[ui.sheet.kind]()}</div>`
  el.querySelector('.panel-s').scrollTop = scroll
}

// ---------- wardrobe tab ----------

function viewWardrobe() {
  const items = state.items
  if (!items.length) {
    return `<div class="empty"><div class="eyebrow" style="justify-content:center">Digital wardrobe</div>
      <h2>Start with what you own</h2>
      <p class="serif">Photograph each piece on a plain background. The app reads its colour, checks it against your palette and links it to your buy list.</p>
      <div class="row" style="justify-content:center">
        <button class="btn" data-act="newItem">Add a piece</button>
        <button class="btn ghost" data-act="loadDemo">Try with a demo wardrobe</button>
      </div>
      <p class="small muted" style="margin-top:14px">The demo fills Tiers 1 and 2 of your buy list in their best colours, so you can try outfits and the week planner straight away.</p></div>`
  }
  const today = todayISO()
  const laundry = items.filter((it) => it.status === 'laundry').length
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, items.filter((it) => sub(it).cat === c.id).length]))
  const shown = items.filter((it) => ui.filter === 'all' || (ui.filter === 'laundry' ? it.status === 'laundry' : sub(it).cat === ui.filter))
  const demo = items.some((it) => it.demo)

  const worn = items.filter((it) => it.wears?.length)
  const stale = items.filter((it) => {
    const last = (it.wears || []).slice().sort().pop()
    const since = last || it.createdAt
    return since && (Date.parse(today) - Date.parse(since)) / 86400000 >= 30
  })
  const cpw = items.filter((it) => it.price && it.wears?.length).map((it) => ({ it, v: it.price / it.wears.length })).sort((a, b) => b.v - a.v)

  return `
    <div class="stats">
      <div class="stat"><b>${items.length}</b><span>pieces</span></div>
      <div class="stat"><b>${state.outfits.length}</b><span>saved outfits</span></div>
      <div class="stat"><b>${laundry}</b><span>in the wash</span></div>
    </div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn" data-act="newItem">Add a piece</button>
      <button class="btn ghost" data-act="checkItem">Check before buying</button>
      ${demo ? '<button class="btn quiet sm" data-act="clearDemo">Remove demo pieces</button>' : ''}
    </div>
    <div class="chips">
      <button class="chip" data-act="filter" data-v="all" aria-pressed="${ui.filter === 'all'}">All ${items.length}</button>
      ${CATEGORIES.filter((c) => counts[c.id]).map((c) => `<button class="chip" data-act="filter" data-v="${c.id}" aria-pressed="${ui.filter === c.id}">${c.label} ${counts[c.id]}</button>`).join('')}
      ${laundry ? `<button class="chip" data-act="filter" data-v="laundry" aria-pressed="${ui.filter === 'laundry'}">In the wash ${laundry}</button>` : ''}
    </div>
    <div class="grid">${shown.map(itemCard).join('')}</div>
    ${stale.length || cpw.length ? `<div class="section"><h2>Insights</h2><div class="panel stack small">
      ${stale.length ? `<div><span class="label">Not worn in 30+ days</span><div>${stale.slice(0, 8).map((it) => esc(it.name)).join(', ')}</div></div>` : ''}
      ${cpw.length ? `<div><span class="label">Cost per wear, highest first</span><div>${cpw.slice(0, 5).map(({ it, v }) => `${esc(it.name)} €${v.toFixed(2)}`).join(' · ')}</div></div>` : ''}
      ${!worn.length ? '' : `<div class="muted">Logged wears: ${worn.reduce((n, it) => n + it.wears.length, 0)}</div>`}
    </div></div>` : ''}`
}

function itemCard(it) {
  const c = colourById(P(), it.colour)
  return `<button class="card-item" data-act="openItem" data-id="${it.id}">
    ${tile(it)}
    ${it.status === 'laundry' ? '<span class="badge">In the wash</span>' : ''}
    ${it.demo ? '<span class="badge demo">Demo</span>' : ''}
    <div class="meta"><div class="name">${esc(it.name)}</div>${it.detail ? `<div class="detail">${esc(it.detail)}</div>` : ''}
    <div class="sub">${dot(it.colour)}${esc(c.name)}${it.wears?.length ? ` · worn ${it.wears.length}×` : ''}</div></div>
  </button>`
}

// ---------- item sheet (add, edit, check before buying) ----------

function draftFor(it, mode) {
  const base = it || { subtype: 'oxford', colour: 'white', pattern: 'solid' }
  return {
    mode,
    id: it?.id || null,
    name: base.name || '',
    detail: base.detail || '',
    subtype: base.subtype,
    colour: base.colour,
    pattern: base.pattern || 'solid',
    slotId: base.slotId ?? (it ? '' : null),
    f: base.f || null,
    warmth: base.warmth || null,
    waterproof: base.waterproof ?? null,
    price: base.price || '',
    photo: it ? photos.get(it.id) || null : null,
    suggestions: null,
    result: null,
  }
}

function openItemSheet(it, mode = 'edit', preset) {
  const draft = draftFor(it, mode)
  if (preset) Object.assign(draft, preset)
  ui.sheet = { kind: 'item', draft }
  renderSheet()
}

function verdictFor(colourId, subtype) {
  const c = colourById(P(), colourId)
  const z = zoneOf({ subtype })
  const v = c[z]
  const where = z === 'face' ? 'near the face' : z === 'lower' ? 'on the lower half' : 'on the feet'
  const role = ROLE_LABELS[c.role] || c.role
  if (v === 'block') return `<div class="verdict block"><b>${esc(c.name)} is off-palette ${where}.</b> ${esc(c.note || 'It fights your cool colouring.')}</div>`
  if (v === 'warn') return `<div class="verdict warn"><b>${esc(c.name)} ${where}: use with care.</b> ${esc(c.note || '')}</div>`
  if (v === 'casual') return `<div class="verdict warn"><b>${esc(c.name)}: casual looks only.</b> ${esc(c.note || '')}</div>`
  return `<div class="verdict ok"><b>${esc(c.name)} works ${where}.</b> ${esc(role)}.</div>`
}

function subtypeOptions(selected) {
  return CATEGORIES.map((c) => `<optgroup label="${c.label}">${Object.entries(SUBTYPES).filter(([, s]) => s.cat === c.id).map(([id, s]) => `<option value="${id}"${id === selected ? ' selected' : ''}>${s.label}</option>`).join('')}</optgroup>`).join('')
}

function colourOptions(selected) {
  const roles = [...new Set(P().palette.map((c) => c.role))]
  return roles.map((r) => `<optgroup label="${ROLE_LABELS[r] || r}">${P().palette.filter((c) => c.role === r).map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${c.name}</option>`).join('')}</optgroup>`).join('')
}

function sheetItem() {
  const d = ui.sheet.draft
  const s = SUBTYPES[d.subtype]
  const isNew = !d.id
  const check = d.mode === 'check'
  const [lo, hi] = d.f || s.f || [1, 5]
  const w = d.warmth || s.warmth || 1
  const wearable = s.cat !== 'accessory'
  const preview = { id: d.id, subtype: d.subtype, colour: d.colour, pattern: d.pattern, name: d.name || s.label }
  const others = state.items.filter((it) => it.id !== d.id)
  const slots = P().slots.filter((sl) => sl.subtypes.includes(d.subtype))
  const autoSlot = d.slotId === null ? suggestSlot(P(), others, d.subtype, d.colour) : null
  const slotValue = d.slotId === null ? autoSlot?.id || '' : d.slotId
  const item = d.id ? state.items.find((x) => x.id === d.id) : null
  const title = check ? 'Check before buying' : isNew ? 'Add a piece' : 'Edit piece'

  return `<div class="head"><h2>${title}</h2><button class="x" data-act="closeSheet" aria-label="Close">×</button></div>
    ${check ? '<p class="serif muted" style="margin-top:-4px">Photograph it in the shop. You get a palette verdict, whether it fills a gap on your buy list, and how many new outfits it unlocks.</p>' : ''}
    <div class="row" style="align-items:flex-start;gap:14px;margin-bottom:12px">
      ${d.photo ? `<div class="compare"><div><div class="tile lg"><img src="${d.photo}" alt=""></div><div class="cap">Photo</div></div><div><div class="tile lg">${garmentSVG(preview)}</div><div class="cap">Drawing</div></div></div>` : `<div style="width:132px;flex:none"><div class="tile lg">${garmentSVG(preview)}</div></div>`}
      <div style="flex:1;min-width:170px">
        <label class="btn ghost sm" style="cursor:pointer">${d.photo ? 'Change photo' : 'Take or choose photo'}
          <input type="file" accept="image/*" capture="environment" data-change="photo" class="hide"></label>
        ${d.photo ? '<button class="btn quiet sm" data-act="dropPhoto" style="margin-left:4px">Remove</button>' : ''}
        ${d.suggestions ? `<div style="margin-top:10px"><span class="label">Colour read from photo</span><div class="chips wrap" style="margin-top:4px">${d.suggestions.map((id) => `<button class="chip" data-act="pickColour" data-v="${id}" aria-pressed="${d.colour === id}">${dot(id)}${esc(colourById(P(), id).name)}</button>`).join('')}</div></div>` : `<p class="small muted" style="margin-top:8px">Lay it flat on a plain, light surface and fill the frame.${settings().keepPhotos ? '' : ' The photo is only used to read the colour, then discarded.'}</p>`}
        ${d.photo && !settings().keepPhotos && !check ? '<p class="small muted" style="margin-top:6px">Not kept: only the colour is saved.</p>' : ''}
      </div>
    </div>
    <label class="field"><span class="label">Type</span><select data-bind="subtype" data-rerender="1">${subtypeOptions(d.subtype)}</select></label>
    <label class="field"><span class="label">Colour</span><select data-bind="colour" data-rerender="1">${colourOptions(d.colour)}</select></label>
    ${verdictFor(d.colour, d.subtype)}
    <div class="two" style="margin-top:12px">
      <label class="field"><span class="label">Name</span><input data-bind="name" value="${esc(d.name)}" placeholder="${esc(colourById(P(), d.colour).name.split(' / ')[0] + ' ' + s.label.toLowerCase())}"></label>
      <label class="field"><span class="label">Pattern</span><select data-bind="pattern" data-rerender="1">${['solid', 'stripe', 'check'].map((p) => `<option${p === d.pattern ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span class="label">Detail (optional)</span><input data-bind="detail" value="${esc(d.detail)}" placeholder="e.g. fine gauge, button-down, raw denim" maxlength="40"></label>
    ${check ? '' : `<label class="field"><span class="label">Buy-list slot</span><select data-bind="slotId">
      <option value="">Not on the buy list</option>
      ${slots.map((sl) => { const n = slotOwned(sl, others).length; return `<option value="${sl.id}"${sl.id === slotValue ? ' selected' : ''}>Tier ${sl.tier} · ${esc(sl.name)} (${n}/${sl.qty})</option>` }).join('')}
    </select></label>`}
    ${wearable ? `<div class="two">
      <label class="field"><span class="label">Formality from</span><select data-bind="flo">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === lo ? ' selected' : ''}>${n} ${LEVELS[n]}</option>`).join('')}</select></label>
      <label class="field"><span class="label">to</span><select data-bind="fhi">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === hi ? ' selected' : ''}>${n} ${LEVELS[n]}</option>`).join('')}</select></label>
    </div>
    <div class="two">
      <label class="field"><span class="label">Warmth</span><select data-bind="warmth">${['Light', 'Mid', 'Heavy'].map((l, i) => `<option value="${i + 1}"${i + 1 === w ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${check ? '' : '<label class="field"><span class="label">Price (€, optional)</span><input data-bind="price" inputmode="decimal" value="' + esc(d.price) + '" placeholder="for cost per wear"></label>'}
    </div>
    ${s.cat === 'outer' ? `<label class="check" style="margin-bottom:12px"><input type="checkbox" data-bind="waterproof"${(d.waterproof ?? !!s.waterproof) ? ' checked' : ''}> Rainproof</label>` : ''}` : ''}
    ${check ? checkResult() : ''}
    <div class="row end" style="margin-top:8px">
      ${check ? `<button class="btn ghost" data-act="runCheck">Check it</button><button class="btn" data-act="boughtIt">Bought it: add</button>` : `
      ${item ? `<button class="btn danger sm" data-act="deleteItem">Delete</button>
        <button class="btn quiet sm" data-act="toggleWash">${item.status === 'laundry' ? 'Back from the wash' : 'In the wash'}</button>
        <button class="btn quiet sm" data-act="wearItem">Worn today</button>` : ''}
      <button class="btn" data-act="saveItem">${isNew ? 'Add to wardrobe' : 'Save'}</button>`}
    </div>
    ${item?.wears?.length ? `<p class="small muted" style="margin-top:10px">Worn ${item.wears.length}×, last ${esc(item.wears.slice().sort().pop())}${item.price ? ` · €${(item.price / item.wears.length).toFixed(2)} per wear` : ''}</p>` : ''}`
}

function draftToItem(d) {
  const s = SUBTYPES[d.subtype]
  const others = state.items.filter((it) => it.id !== d.id)
  const slotId = d.slotId === null ? suggestSlot(P(), others, d.subtype, d.colour)?.id || '' : d.slotId
  const it = {
    id: d.id || uid(),
    name: d.name.trim() || `${colourById(P(), d.colour).name.split(' / ')[0]} ${s.label.toLowerCase()}`,
    subtype: d.subtype,
    colour: d.colour,
    pattern: d.pattern,
    slotId: slotId || null,
    ...(d.detail.trim() ? { detail: d.detail.trim() } : {}),
    status: 'available',
    wears: [],
    createdAt: todayISO(),
  }
  const def = s.f || [1, 5]
  if (d.f && (d.f[0] !== def[0] || d.f[1] !== def[1])) it.f = d.f
  if (d.warmth && d.warmth !== s.warmth) it.warmth = d.warmth
  if (d.waterproof !== null && d.waterproof !== !!s.waterproof) it.waterproof = d.waterproof
  const price = parseFloat(String(d.price).replace(',', '.'))
  if (price > 0) it.price = price
  return it
}

function checkResult() {
  const r = ui.sheet.draft.result
  if (!r) return ''
  return `<div class="panel stack" style="margin:12px 0">
    <div><span class="label">Fit with your palette</span>${r.verdict}</div>
    <div><span class="label">Buy list</span><div>${r.slot ? `Fills an open slot: <b>Tier ${r.slot.tier} · ${esc(r.slot.name)}</b>${r.slot.best.includes(r.colour) ? ' in its best colour' : r.slot.colours.includes(r.colour) ? ' in a listed variant' : ', but not in a listed colour'}.` : 'Not on your buy list. Ask whether it replaces something or adds noise.'}</div></div>
    ${r.dupes.length ? `<div class="verdict warn">You already own ${r.dupes.map((x) => esc(x.name)).join(', ')}.</div>` : ''}
    <div><span class="label">Outfits it unlocks</span><div><b>+${r.gain.toLocaleString('en-GB')}</b> outfit combinations across eight everyday situations${r.base ? ` (+${Math.round((r.gain / r.base) * 100)}% on today)` : ''}.</div>
    ${r.gain === 0 ? '<div class="small muted">Zero usually means you are missing a piece it needs (a top, bottoms or shoes at the same formality), or it is blocked by the palette.</div>' : ''}</div>
  </div>`
}

// ---------- outfits tab ----------

function ctxControls({ forecast = true } = {}) {
  const g = ui.gen
  return `<div class="label" style="margin-bottom:4px">Occasion</div>
    <div class="chips">${P().occasions.map((o) => `<button class="chip" data-act="setGen" data-k="occasion" data-v="${o.id}" aria-pressed="${g.occasion === o.id}">${esc(o.label)}</button>`).join('')}</div>
    <div class="label" style="margin:6px 0 4px">Weather</div>
    <div class="chips wrap">${WEATHER.map((w) => `<button class="chip" data-act="setGen" data-k="band" data-v="${w.id}" aria-pressed="${g.band === w.id}">${w.label} <span class="muted small">${w.hint}</span></button>`).join('')}
      <button class="chip" data-act="toggleRain" aria-pressed="${g.rain}">Rain</button>
      ${forecast ? `<button class="chip" data-act="todayForecast">${ui.busy === 'forecast' ? 'Fetching…' : `Today in ${LOCATIONS[state.location].label}`}</button>` : ''}
    </div>`
}

function reasons(e, max = 6) {
  return `<ul class="reasons">${e.blocks.map((r) => `<li class="block">${esc(r)}</li>`).join('')}${e.warns.map((r) => `<li class="warn">${esc(r)}</li>`).join('')}${e.pros.slice(0, max).map((r) => `<li class="pro">${esc(r)}</li>`).join('')}</ul>`
}

function outfitCard(parts, e, actions, title) {
  return `<div class="outfit">
    <div class="spread">${title ? `<b>${esc(title)}</b>` : '<span></span>'}${e ? `<span class="score">${e.ok ? 'score ' + e.score : 'not wearable'}</span>` : ''}</div>
    <div class="thumbs" style="margin-top:6px">${partsList(parts).map((it) => tile(it, 'sm')).join('')}</div>
    <div class="names">${partsList(parts).map((it) => `<span>${esc(label(it))}</span>`).join(' · ')}</div>
    ${e ? reasons(e) : ''}
    ${actions ? `<div class="row" style="margin-top:10px">${actions}</div>` : ''}
  </div>`
}

function viewOutfits() {
  if (!state.items.length) return emptyNeedItems('Outfits come from your wardrobe')
  const cur = ui.outTab
  const tabs = [['generate', 'Generate'], ['build', 'Build'], ['saved', `Saved ${state.outfits.length || ''}`], ['guide', 'From your guide']]
  return `<div class="subtabs">${tabs.map(([id, l]) => `<button data-act="outTab" data-v="${id}" aria-pressed="${cur === id}">${l}</button>`).join('')}</div>
    ${cur === 'generate' ? viewGenerate() : cur === 'build' ? viewBuild() : cur === 'saved' ? viewSaved() : viewGuide()}`
}

function emptyNeedItems(title) {
  return `<div class="empty"><h2>${title}</h2><p class="serif">Add a few pieces first: at least a top, bottoms and shoes.</p>
    <div class="row" style="justify-content:center"><button class="btn" data-act="newItem">Add a piece</button><button class="btn ghost" data-act="loadDemo">Use the demo wardrobe</button></div></div>`
}

function viewGenerate() {
  const r = ui.gen.results
  return `${ctxControls()}
    <div class="row" style="margin:10px 0 14px"><button class="btn" data-act="generate">Generate outfits</button>
      ${r?.length ? '<button class="btn quiet" data-act="generateMore">Show different ones</button>' : ''}</div>
    ${r ? (r.length ? r.map((o, i) => outfitCard(o.parts, o, `<button class="btn sm" data-act="wearGen" data-i="${i}">Wear today</button><button class="btn ghost sm" data-act="saveGen" data-i="${i}">Save</button><button class="btn quiet sm" data-act="editGen" data-i="${i}">Tweak</button>`)).join('')
      : `<div class="panel"><b>Nothing passes the rules for this.</b><p class="small muted" style="margin:6px 0 0">${noResultHint()}</p></div>`) : '<p class="serif muted">Pick an occasion and the weather. Every suggestion passes your colour lock, formality and weather rules, and says why it works.</p>'}`
}

function noResultHint() {
  const ctx = genCtx()
  const pool = available()
  const need = []
  for (const [slot, label] of [['base', 'top'], ['bottom', 'bottoms'], ['shoes', 'shoes']]) {
    if (!pool.some((it) => slotFor(it) === slot && formality(it)[0] <= ctx.level && formality(it)[1] >= ctx.level)) need.push(label)
  }
  if (ctx.occasion.require === 'tailoring' && !pool.some((it) => sub(it).kind === 'tailoring')) need.push('a tailored jacket')
  if (ctx.weather.band === 'cold' && !pool.some((it) => sub(it).cat === 'outer')) need.push('a jacket or coat')
  return need.length ? `You have no ${need.join(', ')} at ${LEVELS[ctx.level].toLowerCase()} level available.` : 'Try another weather setting, or check what is in the wash.'
}

function viewBuild() {
  const parts = idsToParts(ui.build)
  const e = evaluate(parts, genCtx())
  const rows = SLOTS.map((slot) => {
    const options = state.items.filter((it) => (slot === 'mid' ? sub(it).cat === 'knit' && sub(it).layer !== 'base' : slotFor(it) === slot))
    if (!options.length) return ''
    return `<div class="pickrow"><span class="label">${SLOT_LABELS[slot]}${slot === 'mid' ? ' (over a shirt)' : ''}</span><div class="scroller">
      <button class="pick none" data-act="buildPick" data-slot="${slot}" data-id="" aria-pressed="${!ui.build[slot]}"><div class="tile">–</div><span>None</span></button>
      ${options.map((it) => `<button class="pick" data-act="buildPick" data-slot="${slot}" data-id="${it.id}" aria-pressed="${ui.build[slot] === it.id}">${tile(it)}<span>${esc(label(it))}</span></button>`).join('')}
    </div></div>`
  }).join('')
  return `${ctxControls({ forecast: false })}
    <div style="margin-top:14px">${rows}</div>
    <div class="outfit buildbar">
      <div class="spread"><b>${partsList(parts).length ? 'This outfit' : 'Pick pieces above'}</b><span class="score">${e.ok ? `score ${e.score} · ${plural(e.pros.length, 'plus')}` : partsList(parts).length ? 'not wearable yet' : ''}</span></div>
      ${partsList(parts).length ? reasons(e, 0) : ''}
      <div class="row" style="margin-top:10px"><button class="btn sm" data-act="wearBuild"${e.ok ? '' : ' disabled'}>Wear today</button><button class="btn ghost sm" data-act="saveBuild"${partsList(parts).length ? '' : ' disabled'}>Save</button><button class="btn quiet sm" data-act="clearBuild">Clear</button></div>
    </div>`
}

function viewSaved() {
  if (!state.outfits.length) return '<p class="serif muted">Saved outfits appear here. Save from Generate or Build.</p>'
  return state.outfits.map((o) => {
    const parts = idsToParts(o.parts)
    const occ = occasionById(P(), o.occasion)
    const e = evaluate(parts, { profile: P(), occasion: occ, level: occ.level, weather: { band: o.band || 'mild', rain: !!o.rain } })
    return outfitCard(parts, e, `<button class="btn sm" data-act="wearSaved" data-id="${o.id}">Wear today</button><button class="btn ghost sm" data-act="editSaved" data-id="${o.id}">Tweak</button><button class="btn quiet sm" data-act="deleteSaved" data-id="${o.id}">Delete</button>`, `${occ.label}${o.band ? ' · ' + o.band : ''}`)
  }).join('')
}

function viewGuide() {
  return `<p class="serif muted">The looks from your dossier, filled from what you own. Exact means right piece and colour; close means right piece, different colour.</p>` +
    P().formulas.map((f, i) => {
      const fill = fillFormula(f, state.items)
      const missing = fill.filter((x) => x.match === 'missing')
      const parts = partsFromItems(fill.filter((x) => x.item).map((x) => x.item))
      const occ = occasionById(P(), f.occasion)
      const e = missing.length ? null : evaluate(parts, { profile: P(), occasion: occ, level: occ.level, weather: { band: 'mild', rain: false } })
      return `<div class="outfit"><div class="spread"><b>${esc(f.name)}</b><span class="score">${missing.length ? `${fill.length - missing.length}/${fill.length} owned` : 'ready'}</span></div>
        <p class="small muted serif" style="margin:4px 0 8px">${esc(f.why)}</p>
        <div class="chips wrap">${fill.map((x) => `<span class="sw${x.match === 'exact' ? ' best' : ''}" title="${x.match}">${dot(x.colour)}${esc(SUBTYPES[x.subtypes[0]]?.label || x.subtypes[0])}${x.match === 'missing' ? ' · missing' : x.match === 'close' ? ' · close' : ''}</span>`).join('')}</div>
        ${e ? reasons(e, 3) : ''}
        <div class="row" style="margin-top:8px">${missing.length ? '<button class="btn quiet sm" data-act="tab" data-v="buy">See buy list</button>' : `<button class="btn ghost sm" data-act="guideBuild" data-i="${i}">Open in builder</button>`}</div></div>`
    }).join('')
}

// ---------- week tab ----------

function weekKey() { return iso(ui.weekStart) }

function getWeek(create = true) {
  const k = weekKey()
  if (!state.weeks[k] && create) {
    state.weeks[k] = { days: DEFAULT_WEEK.map((occasion) => ({ occasion, band: state.location === 'malta' ? 'warm' : 'mild', rain: false, parts: null, locked: false })) }
  }
  return state.weeks[k]
}

function viewWeek() {
  if (!state.items.length) return emptyNeedItems('Plan a week of outfits')
  const w = getWeek()
  const today = todayISO()
  const end = addDays(ui.weekStart, 6)
  return `<div class="spread" style="margin-bottom:10px">
      <div class="row"><button class="btn quiet sm" data-act="weekNav" data-v="-7" aria-label="Previous week">‹</button><b>${fmtDate(ui.weekStart)} to ${fmtDate(end)}</b><button class="btn quiet sm" data-act="weekNav" data-v="7" aria-label="Next week">›</button>
      <button class="btn quiet sm" data-act="weekNav" data-v="0">This week</button></div>
    </div>
    <div class="row" style="margin-bottom:12px">
      <select class="inline" style="width:auto" data-change="location">${Object.entries(LOCATIONS).map(([id, l]) => `<option value="${id}"${state.location === id ? ' selected' : ''}>${l.label}</option>`).join('')}</select>
      <button class="btn ghost sm" data-act="weekForecast">${ui.busy === 'week-forecast' ? 'Fetching…' : 'Use the forecast'}</button>
      <button class="btn sm" data-act="planWeek">${ui.busy === 'plan' ? 'Planning…' : 'Plan the week'}</button>
    </div>
    <p class="small muted serif" style="margin-top:-4px">No top repeats in a week, trousers and shoes rotate, locked days stay put. Laundry is left out.</p>
    ${w.days.map((d, i) => dayCard(d, i, iso(addDays(ui.weekStart, i)) === today)).join('')}`
}

function dayCard(d, i, isToday) {
  const date = addDays(ui.weekStart, i)
  const parts = d.parts ? idsToParts(d.parts) : null
  const occ = occasionById(P(), d.occasion)
  const e = parts ? evaluate(parts, { profile: P(), occasion: occ, level: occ.level, weather: { band: d.band, rain: d.rain } }) : null
  return `<div class="day${isToday ? ' today' : ''}">
    <div class="spread"><b>${DAY_NAMES[i]} <span class="muted small">${fmtDate(date)}</span></b>${d.temp != null ? `<span class="small muted">${Math.round(d.temp)}°C${d.rain ? ', rain likely' : ''}</span>` : ''}</div>
    <div class="controls">
      <select class="inline" style="width:auto" data-change="dayOcc" data-i="${i}">${P().occasions.map((o) => `<option value="${o.id}"${o.id === d.occasion ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
      <select class="inline" style="width:auto" data-change="dayBand" data-i="${i}">${WEATHER.map((w) => `<option value="${w.id}"${w.id === d.band ? ' selected' : ''}>${w.label}</option>`).join('')}</select>
      <button class="chip" data-act="dayRain" data-i="${i}" aria-pressed="${!!d.rain}">Rain</button>
      ${parts ? `<button class="chip" data-act="dayLock" data-i="${i}" aria-pressed="${!!d.locked}">${d.locked ? 'Locked' : 'Lock'}</button>` : ''}
    </div>
    ${parts ? `<div class="outfit" style="margin:0;background:var(--paper)"><div class="thumbs">${partsList(parts).map((it) => tile(it, 'sm')).join('')}</div>
      <div class="names">${partsList(parts).map((it) => esc(label(it))).join(' · ')}</div>${e && !e.ok ? reasons({ blocks: e.blocks, warns: [], pros: [] }) : ''}
      <div class="row" style="margin-top:8px"><button class="btn quiet sm" data-act="daySwap" data-i="${i}"${d.locked ? ' disabled' : ''}>Swap</button><button class="btn quiet sm" data-act="dayWore" data-i="${i}">${partsList(parts).every((it) => it.wears?.includes(iso(date))) ? 'Logged' : 'Wore it'}</button><button class="btn quiet sm" data-act="dayClear" data-i="${i}">Clear</button></div></div>`
      : `<p class="small muted" style="margin:0">${d.planned === false ? 'No outfit passes the rules for this day. Change the occasion or weather.' : 'Not planned yet.'}</p>`}
  </div>`
}

// ---------- buy list tab ----------

function itemsSignature() {
  return state.items.map((it) => `${it.id}:${it.subtype}:${it.colour}:${it.status}:${it.slotId}:${(it.f || []).join('-')}`).join('|') + JSON.stringify(P().slots.length)
}

function ensureBuy() {
  const sig = itemsSignature()
  if (ui.buy?.sig === sig) return
  ui.buy = { sig, pending: true }
  setTimeout(() => {
    const ranked = buyNext(P(), state.items)
    const cov = coverage(available(), P())
    ui.buy = { sig, ranked, total: cov.reduce((n, c) => n + c.n, 0), cov }
    if (ui.tab === 'buy' || ui.tab === 'profile') render()
  }, 30)
}

function viewBuy() {
  ensureBuy()
  const slots = P().slots
  const units = slots.reduce((n, s) => n + s.qty, 0)
  const owned = slots.reduce((n, s) => n + Math.min(s.qty, slotOwned(s, state.items).length), 0)
  const tiers = [...new Set(slots.map((s) => s.tier))]
  const b = ui.buy
  let next = '<p class="small muted">Working out which buy unlocks the most outfits…</p>'
  if (b && !b.pending) {
    const top = b.ranked.slice(0, 5)
    const anyGain = top.some((x) => x.gain > 0)
    next = anyGain
      ? top.map((x) => `<div class="next">${tile(x.pieces[0], 'xs')}<div><b>${esc(x.slot.name)}</b><div class="small muted">Tier ${x.slot.tier} · in ${esc(colourById(P(), x.pieces[0].colour).name)}</div></div><div class="gain"><b>${b.total ? `+${Math.round((x.gain / b.total) * 100)}%` : `+${x.gain.toLocaleString('en-GB')}`}</b>${b.total ? `${x.gain.toLocaleString('en-GB')} combos` : 'combos'}</div></div>`).join('')
      : '<p class="small muted" style="margin:0">Once you own a top, bottoms and shoes that work together, this ranks every open slot by how many new outfits it unlocks. Until then, buy in tier order.</p>'
  }
  return `<div class="panel">
      <div class="spread"><b>${owned} of ${units} pieces</b><span class="small muted">${Math.round((owned / units) * 100)}%</span></div>
      <div class="bar"><i style="width:${(owned / units) * 100}%"></i></div>
      <p class="small muted" style="margin:0">Pieces tick off when you add one to your wardrobe and link it to a slot.</p>
    </div>
    <div class="section"><h2>Best next buys</h2><div class="panel">${next}</div>
    <p class="small muted" style="margin-top:6px">Ranked by new outfit combinations across eight everyday situations (office, casual, date, wedding; hot, mild, cold, rain), using each slot's best colour.</p></div>
    ${tiers.map((t) => {
      const ts = slots.filter((s) => s.tier === t)
      return `<div class="tier"><span class="eyebrow">Tier ${t}</span>${ts.map(slotRow).join('')}</div>`
    }).join('')}
    <div class="callout" style="margin-top:22px"><b>Fit lock</b><p>Buy for the shoulder, then alter waist, sleeves and hems. On a lean frame that habit beats any upgrade in brand.</p></div>`
}

function slotRow(s) {
  const owned = slotOwned(s, state.items)
  const full = owned.length >= s.qty
  return `<div class="slot${full ? ' full' : ''}"><div>
      <div><span class="sname">${esc(s.name)}</span> <span class="muted small mono">${owned.length}/${s.qty}</span>${s.climate ? `<span class="pill">${s.climate === 'nl' ? 'NL / IE' : 'Malta'}</span>` : ''}</div>
      <div class="spec">${esc(s.material)} · ${esc(s.fit)}</div>
      <div>${s.colours.map((c) => `<span class="sw${s.best.includes(c) ? ' best' : ''}">${dot(c)}${esc(colourById(P(), c).name)}</span>`).join('')}</div>
      ${owned.length ? `<div class="row" style="margin-top:6px">${owned.map((it) => `<button class="pick" style="width:52px" data-act="openItem" data-id="${it.id}">${tile(it, 'xs')}</button>`).join('')}</div>` : ''}
    </div>
    ${full ? '<span class="small muted">Done</span>' : `<button class="btn ghost sm" data-act="addFromSlot" data-id="${s.id}">Add</button>`}
  </div>`
}

// ---------- profile tab ----------

const PROFILE_PROMPT = `You convert a personal style guide into a JSON style profile for a wardrobe app.
Return ONE JSON object, no commentary, with this shape:
{
  "format": "fearne-style-profile", "version": 1,
  "meta": { "name": "", "owner": "", "source": "", "summary": "", "unconfirmed": [""] },
  "palette": [ { "id": "kebab-id", "name": "", "hex": "#RRGGBB", "role": "core|white|lower|blue|accent|statement|leather|metal|avoid",
                 "face": "ok|warn|block", "lower": "ok|warn|block", "feet": "ok|warn|block|casual", "note": "optional" } ],
  "rules": { "max_statement": 1, "max_colour_pieces": 2, "max_patterns": 1, "colour_at_face_bonus": true, "contrast_bonus_min": 28, "notes": [""] },
  "occasions": [ { "id": "", "label": "", "level": 1-5, "office": true?, "require": "tailoring"? } ],
  "office_excludes": ["tee", "shorts", "slides", "camp-shirt"],
  "formulas": [ { "name": "", "occasion": "<occasion id>", "parts": [["<subtype>|<alt subtype>", "<palette id>"]], "why": "" } ],
  "slots": [ { "id": "", "tier": 1, "name": "", "qty": 1, "subtypes": ["<subtype>"], "colours": ["<palette id>"], "best": ["<palette id>"],
               "material": "", "fit": "", "climate": "nl|malta" } ],
  "conflicts": [ "places where the guide contradicts itself" ]
}
Formality levels: 1 off-duty, 2 casual, 3 smart casual, 4 smart, 5 formal.
Subtypes (use only these): ${Object.keys(SUBTYPES).join(', ')}.
Rules: every colour named in the guide goes in the palette with its hex; colours the guide says to avoid get role "avoid" with face "block".
Use "warn" where the guide hedges ("test first", "away from the face"). Every palette id used in formulas or slots must exist.
List genuine contradictions in "conflicts" rather than silently picking a side.`

function viewProfile() {
  const p = P()
  ensureBuy()
  const roles = [...new Set(p.palette.map((c) => c.role))]
  const b = ui.buy
  return `<div class="panel"><div class="eyebrow">Style profile</div><h2 style="margin:8px 0 4px">${esc(p.meta?.name || 'Untitled')}</h2>
      <p class="serif" style="color:var(--slate)">${esc(p.meta?.summary || '')}</p>
      ${p.meta?.unconfirmed?.length ? `<ul class="note-list">${p.meta.unconfirmed.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
    </div>
    ${p.conflicts?.length ? `<div class="section"><h2>Where your guide contradicts itself</h2><div class="panel"><ul class="note-list">${p.conflicts.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <p class="small muted" style="margin:8px 0 0">These are modelled as warnings for now. Decide each one, edit the profile JSON and re-import.</p></div></div>` : ''}
    <div class="section"><h2>Palette and where it may sit</h2><div class="panel" style="overflow-x:auto">
      <table class="pal"><thead><tr><th>Colour</th><th>Face</th><th>Lower</th><th>Feet</th></tr></thead><tbody>
      ${roles.map((r) => `<tr><td colspan="4" class="label" style="padding-top:12px;color:var(--accent)">${ROLE_LABELS[r] || r}</td></tr>` + p.palette.filter((c) => c.role === r).map((c) => `<tr><td><span class="row" style="gap:6px;flex-wrap:nowrap">${dot(c.id)}${esc(c.name)}</span></td>${['face', 'lower', 'feet'].map((z) => `<td class="v-${c[z]}">${VERDICT_TEXT[c[z]] || c[z]}</td>`).join('')}</tr>`).join('')).join('')}
      </tbody></table></div></div>
    <div class="section"><h2>Occasions</h2><div class="panel"><div class="chips wrap">${p.occasions.map((o) => `<span class="sw">${esc(o.label)} · ${o.level} ${LEVELS[o.level]}${o.office ? ' · office' : ''}${o.require ? ' · needs ' + o.require : ''}</span>`).join('')}</div>
      <ul class="note-list" style="margin-top:8px">${(p.rules?.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div></div>
    <div class="section"><h2>What your wardrobe covers</h2><div class="panel small">${b && !b.pending ? b.cov.map((c) => `<div class="spread" style="padding:4px 0;border-bottom:1px solid var(--line-2)"><span>${esc(c.label)} · ${c.band}${c.rain ? ' + rain' : ''}</span><b class="mono">${c.n.toLocaleString('en-GB')}</b></div>`).join('') : 'Counting…'}</div></div>
    <div class="section"><h2>Data</h2><div class="panel stack">
      <div><b>Style profile</b><p class="small muted" style="margin:2px 0 8px">To use a different or updated guide: copy the conversion prompt, paste it into Claude with the guide, and import the JSON it returns.</p>
        <div class="row"><button class="btn ghost sm" data-act="copyPrompt">Copy conversion prompt</button>
        <label class="btn ghost sm" style="cursor:pointer">Import profile JSON<input type="file" accept="application/json,.json" data-change="importProfile" class="hide"></label>
        <button class="btn quiet sm" data-act="exportProfile">Export profile</button></div></div>
      <div><b>Backup</b><p class="small muted" style="margin:2px 0 8px">${HUB ? 'Saved privately to your Fearne Hub account. Restore a backup from the standalone prototype to bring its pieces and photos across.' : 'Everything lives on this device only. Export a backup, including photos, before clearing the browser.'}</p>
        <div class="row"><button class="btn ghost sm" data-act="exportBackup">Export backup</button>
        <label class="btn ghost sm" style="cursor:pointer">Restore backup<input type="file" accept="application/json,.json" data-change="importBackup" class="hide"></label>
        <button class="btn danger sm" data-act="resetAll">Erase everything</button></div></div>
      <div><b>Display</b><p class="small muted" style="margin:2px 0 8px">Drawings keep every list uniform. A piece's own sheet always shows its photo when there is one.</p>
        <div class="row"><span class="small muted">Show</span>${[['drawings', 'Drawings'], ['photos', 'Photos']].map(([v, l]) => `<button class="chip" data-act="setting" data-k="visual" data-v="${v}" aria-pressed="${settings().visual === v}">${l}</button>`).join('')}
        <span class="small muted" style="margin-left:8px">Keep photos</span>${[['yes', 'Yes'], ['no', 'No']].map(([v, l]) => `<button class="chip" data-act="setting" data-k="keepPhotos" data-v="${v}" aria-pressed="${settings().keepPhotos === (v === 'yes')}">${l}</button>`).join('')}</div>
        ${!settings().keepPhotos && photos.size ? `<button class="btn danger sm" style="margin-top:8px" data-act="dropAllPhotos">Delete ${plural(photos.size, 'stored photo')}</button>` : ''}</div>
      <div class="row"><span class="small muted">Theme</span>${['auto', 'light', 'dark'].map((t) => `<button class="chip" data-act="theme" data-v="${t}" aria-pressed="${(document.documentElement.dataset.theme || 'auto') === t}">${t}</button>`).join('')}</div>
    </div></div>`
}

function sheetText() {
  return `<div class="head"><h2>${esc(ui.sheet.title)}</h2><button class="x" data-act="closeSheet" aria-label="Close">×</button></div>
    <p class="small muted">${esc(ui.sheet.hint || '')}</p>
    <label class="field"><textarea readonly>${esc(ui.sheet.text)}</textarea></label>`
}

const VIEWS = { wardrobe: viewWardrobe, outfits: viewOutfits, week: viewWeek, buy: viewBuy, profile: viewProfile }
const SHEETS = { item: sheetItem, text: sheetText }

// ---------- photo processing ----------

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    img.src = url
  })
}

// Every kept photo is the same shape and size: the whole garment centred on
// a square of its own background colour, 480 px, about 40 KB.
function squarePhoto(img, size = 480) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  g.fillStyle = `rgb(${backgroundColour(img).join(',')})`
  g.fillRect(0, 0, size, size)
  const k = Math.min(size / img.naturalWidth, size / img.naturalHeight) * 0.92
  const w = img.naturalWidth * k
  const h = img.naturalHeight * k
  g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
  return c.toDataURL('image/jpeg', 0.75)
}

function backgroundColour(img) {
  const N = 32
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0, N, N)
  const px = g.getImageData(0, 0, N, N).data
  const sum = [0, 0, 0]
  let n = 0
  for (let i = 0; i < N; i++) {
    for (const [x, y] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) {
      const j = (y * N + x) * 4
      sum[0] += px[j]; sum[1] += px[j + 1]; sum[2] += px[j + 2]; n++
    }
  }
  return sum.map((v) => Math.round(v / n))
}

// Dominant garment colour: estimate the background from the border, drop
// pixels close to it, then take the largest of three k-means clusters.
function dominantColour(img) {
  const N = 64
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0, N, N)
  const px = g.getImageData(0, 0, N, N).data
  const at = (x, y) => { const i = (y * N + x) * 4; return [px[i], px[i + 1], px[i + 2]] }
  const border = []
  for (let i = 0; i < N; i++) border.push(at(i, 0), at(i, N - 1), at(0, i), at(N - 1, i))
  const bg = border.reduce((a, p) => a.map((v, j) => v + p[j] / border.length), [0, 0, 0])
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  let pts = []
  for (let y = 8; y < N - 8; y++) for (let x = 8; x < N - 8; x++) { const p = at(x, y); if (dist(p, bg) > 38) pts.push(p) }
  if (pts.length < 60) { pts = []; for (let y = 20; y < N - 20; y++) for (let x = 20; x < N - 20; x++) pts.push(at(x, y)) }
  let cents = [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]]
  let groups = []
  for (let it = 0; it < 8; it++) {
    groups = cents.map(() => [])
    for (const p of pts) { let bi = 0, bd = Infinity; cents.forEach((cc, i) => { const d = dist(p, cc); if (d < bd) { bd = d; bi = i } }); groups[bi].push(p) }
    cents = groups.map((gr, i) => (gr.length ? gr.reduce((a, p) => a.map((v, j) => v + p[j] / gr.length), [0, 0, 0]) : cents[i]))
  }
  const big = groups.map((gr, i) => [gr.length, i]).sort((a, b) => b[0] - a[0])[0][1]
  return cents[big].map(Math.round)
}

// ---------- forecast ----------

async function forecast(start, end) {
  const L = LOCATIONS[state.location]
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${L.lat}&longitude=${L.lon}&daily=temperature_2m_max,precipitation_probability_max&timezone=auto&start_date=${start}&end_date=${end}`
  const r = await fetch(url)
  if (!r.ok) throw new Error('Forecast not available for those dates')
  const j = await r.json()
  return j.daily.time.map((t, i) => ({ date: t, temp: j.daily.temperature_2m_max[i], rain: (j.daily.precipitation_probability_max[i] ?? 0) >= 50 }))
}

// ---------- actions ----------

function wear(itemsList, date = todayISO()) {
  for (const it of itemsList) {
    it.wears = it.wears || []
    if (!it.wears.includes(date)) it.wears.push(date)
  }
  save()
}

function saveOutfit(parts, extra = {}) {
  state.outfits.unshift({ id: uid(), parts: partsToIds(parts), occasion: ui.gen.occasion, band: ui.gen.band, rain: ui.gen.rain, created: todayISO(), ...extra })
  save()
  toast('Outfit saved')
}

function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}

// Hub photos are signed URLs; backups carry the image data itself.
async function asDataURL(src) {
  if (src.startsWith('data:')) return src
  const blob = await (await fetch(src)).blob()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function readJSONFile(file) {
  return file.text().then((t) => JSON.parse(t))
}

function runGenerate(more = false) {
  const ctx = genCtx()
  const exclude = more ? ui.gen.shown : []
  const { results } = generate(available(), ctx, { limit: 6, seed: Date.now() % 100000, jitter: more ? 2 : 0.6, exclude })
  ui.gen.results = results
  ui.gen.shown = more ? [...ui.gen.shown, ...results.map((r) => r.key)] : results.map((r) => r.key)
}

// Plans the whole week (onlyIndex null) or re-rolls one day, keeping every
// other day fixed so the variety rules still see them.
function planDays(onlyIndex = null) {
  const w = getWeek()
  const days = w.days.map((d, i) => {
    const day = { date: iso(addDays(ui.weekStart, i)), occasion: d.occasion, weather: { band: d.band, rain: !!d.rain } }
    const keep = onlyIndex === null ? d.locked && d.parts : i !== onlyIndex
    if (keep) day.locked = d.parts ? idsToParts(d.parts) : {}
    if (i === onlyIndex && d.parts) day.exclude = outfitKey(idsToParts(d.parts))
    return day
  })
  const plan = planWeek(available(), P(), days, { seed: Date.now() % 9973 })
  plan.forEach((p, i) => {
    if (days[i].locked) return
    w.days[i].parts = p ? partsToIds(p.parts) : null
    w.days[i].planned = !!p
  })
  save()
}

const ACTIONS = {
  tab: ({ v }) => { ui.tab = v; ui.sheet = null; window.scrollTo(0, 0); render() },
  filter: ({ v }) => { ui.filter = v; render() },
  newItem: () => openItemSheet(null, 'new'),
  checkItem: () => openItemSheet(null, 'check'),
  openItem: ({ id }) => openItemSheet(state.items.find((it) => it.id === id), 'edit'),
  addFromSlot: ({ id }) => {
    const s = P().slots.find((x) => x.id === id)
    const v = virtualPieces(s, state.items)[0] || { subtype: s.subtypes[0], colour: s.best[0] }
    openItemSheet(null, 'new', { subtype: v.subtype, colour: v.colour, slotId: id, pattern: SUBTYPES[v.subtype].pattern || 'solid' })
  },
  closeSheet: () => { ui.sheet = null; renderSheet() },
  pickColour: ({ v }) => { ui.sheet.draft.colour = v; ui.sheet.draft.result = null; renderSheet() },
  dropPhoto: () => { ui.sheet.draft.photo = null; ui.sheet.draft.suggestions = null; renderSheet() },
  saveItem: async () => {
    const d = ui.sheet.draft
    const it = draftToItem(d)
    const existing = state.items.find((x) => x.id === d.id)
    if (existing) {
      Object.assign(existing, { ...it, wears: existing.wears, status: existing.status, createdAt: existing.createdAt, demo: undefined })
      for (const k of ['f', 'warmth', 'waterproof', 'price']) if (!(k in it)) delete existing[k]
      delete existing.demo
    } else state.items.push(it)
    const photo = settings().keepPhotos ? d.photo : null
    if (photo !== (photos.get(it.id) || null)) await setPhoto(it.id, photo)
    save()
    ui.sheet = null
    ui.gen.results = null
    toast(existing ? 'Saved' : `${it.name} added`)
    render()
  },
  deleteItem: async () => {
    const d = ui.sheet.draft
    if (!confirm('Delete this piece? Saved outfits that use it will lose it.')) return
    state.items = state.items.filter((x) => x.id !== d.id)
    if (photos.has(d.id)) await setPhoto(d.id, null)
    save()
    ui.sheet = null
    ui.gen.results = null
    render()
  },
  toggleWash: () => {
    const it = state.items.find((x) => x.id === ui.sheet.draft.id)
    it.status = it.status === 'laundry' ? 'available' : 'laundry'
    save()
    ui.gen.results = null
    ui.sheet = null
    toast(it.status === 'laundry' ? 'Marked as in the wash' : 'Back in rotation')
    render()
  },
  wearItem: () => {
    const it = state.items.find((x) => x.id === ui.sheet.draft.id)
    wear([it])
    toast('Logged for today')
    renderSheet()
  },
  runCheck: () => {
    const d = ui.sheet.draft
    const piece = { ...draftToItem({ ...d, slotId: null }), id: 'check-piece', virtual: true }
    const pool = available()
    const slot = suggestSlot(P(), state.items, d.subtype, d.colour)
    const dupes = state.items.filter((it) => it.subtype === d.subtype && it.colour === d.colour)
    const base = coverage(pool, P()).reduce((n, c) => n + c.n, 0)
    d.result = { verdict: verdictFor(d.colour, d.subtype), slot, dupes, gain: SUBTYPES[d.subtype].cat === 'accessory' ? 0 : outfitGain(pool, P(), [piece]), base, colour: d.colour }
    renderSheet()
  },
  boughtIt: () => { ui.sheet.draft.mode = 'new'; ui.sheet.draft.slotId = null; ui.sheet.draft.result = null; renderSheet() },
  loadDemo: () => {
    state.items.push(...demoWardrobe(P(), 2).filter((d) => !state.items.some((x) => x.id === d.id)))
    save()
    toast('Demo wardrobe loaded: Tiers 1 and 2')
    render()
  },
  clearDemo: () => {
    state.items = state.items.filter((it) => !it.demo)
    state.outfits = state.outfits.filter((o) => Object.values(o.parts).every((id) => state.items.some((it) => it.id === id)))
    state.weeks = {}
    ui.gen.results = null
    save()
    render()
  },
  outTab: ({ v }) => { ui.outTab = v; render() },
  setGen: ({ k, v }) => { ui.gen[k] = v; ui.gen.results = null; render() },
  toggleRain: () => { ui.gen.rain = !ui.gen.rain; ui.gen.results = null; render() },
  todayForecast: async () => {
    ui.busy = 'forecast'
    render()
    try {
      const [f] = await forecast(todayISO(), todayISO())
      ui.gen.band = bandForTemp(f.temp)
      ui.gen.rain = f.rain
      ui.gen.results = null
      toast(`${LOCATIONS[state.location].label}: ${Math.round(f.temp)}°C${f.rain ? ', rain likely' : ''}`)
    } catch (e) {
      toast('Could not reach the forecast. Set the weather by hand.')
    }
    ui.busy = null
    render()
  },
  generate: () => { runGenerate(false); render() },
  generateMore: () => { runGenerate(true); render() },
  wearGen: ({ i }) => { const o = ui.gen.results[i]; wear(partsList(o.parts)); toast('Logged for today'); render() },
  saveGen: ({ i }) => { saveOutfit(ui.gen.results[i].parts); render() },
  editGen: ({ i }) => { ui.build = partsToIds(ui.gen.results[i].parts); ui.outTab = 'build'; render() },
  buildPick: ({ slot, id }) => {
    if (id) ui.build[slot] = id
    else delete ui.build[slot]
    if (slot === 'base' && id && ui.build.mid === id) delete ui.build.mid
    if (slot === 'mid' && id && ui.build.base === id) delete ui.build.base
    render()
  },
  clearBuild: () => { ui.build = {}; render() },
  saveBuild: () => { saveOutfit(idsToParts(ui.build)); render() },
  wearBuild: () => { wear(partsList(idsToParts(ui.build))); toast('Logged for today'); render() },
  wearSaved: ({ id }) => { const o = state.outfits.find((x) => x.id === id); wear(partsList(idsToParts(o.parts))); toast('Logged for today'); render() },
  editSaved: ({ id }) => {
    const o = state.outfits.find((x) => x.id === id)
    ui.build = { ...o.parts }
    Object.assign(ui.gen, { occasion: o.occasion, band: o.band || 'mild', rain: !!o.rain })
    ui.outTab = 'build'
    render()
  },
  deleteSaved: ({ id }) => { state.outfits = state.outfits.filter((x) => x.id !== id); save(); render() },
  guideBuild: ({ i }) => {
    const f = P().formulas[i]
    const fill = fillFormula(f, state.items)
    ui.build = partsToIds(partsFromItems(fill.filter((x) => x.item).map((x) => x.item)))
    ui.gen.occasion = f.occasion
    ui.outTab = 'build'
    render()
  },
  weekNav: ({ v }) => { ui.weekStart = v === '0' ? mondayOf(new Date()) : addDays(ui.weekStart, Number(v)); render() },
  planWeek: () => {
    ui.busy = 'plan'
    render()
    setTimeout(() => { planDays(); ui.busy = null; render() }, 20)
  },
  daySwap: ({ i }) => { planDays(Number(i)); render() },
  dayLock: ({ i }) => { const d = getWeek().days[i]; d.locked = !d.locked; save(); render() },
  dayRain: ({ i }) => { const d = getWeek().days[i]; d.rain = !d.rain; save(); render() },
  dayClear: ({ i }) => { const d = getWeek().days[i]; d.parts = null; d.locked = false; delete d.planned; save(); render() },
  dayWore: ({ i }) => {
    const d = getWeek().days[i]
    wear(partsList(idsToParts(d.parts)), iso(addDays(ui.weekStart, Number(i))))
    toast('Logged')
    render()
  },
  weekForecast: async () => {
    ui.busy = 'week-forecast'
    render()
    try {
      const w = getWeek()
      const res = await forecast(iso(ui.weekStart), iso(addDays(ui.weekStart, 6)))
      res.forEach((f, i) => { if (w.days[i] && f.temp != null) Object.assign(w.days[i], { band: bandForTemp(f.temp), rain: f.rain, temp: f.temp }) })
      save()
      toast(`Forecast for ${LOCATIONS[state.location].label} applied`)
    } catch {
      toast('Forecast only covers about two weeks either side of today')
    }
    ui.busy = null
    render()
  },
  copyPrompt: async () => {
    try {
      await navigator.clipboard.writeText(PROFILE_PROMPT)
      toast('Prompt copied. Paste it into Claude with your guide.')
    } catch {
      ui.sheet = { kind: 'text', title: 'Conversion prompt', hint: 'Copy this, then paste it into Claude along with your style guide.', text: PROFILE_PROMPT }
      renderSheet()
    }
  },
  exportProfile: () => download('style-profile.json', P()),
  exportBackup: async () => {
    toast('Preparing backup…')
    const out = {}
    for (const [id, src] of photos) {
      try { out[id] = await asDataURL(src) } catch {}
    }
    download(`wardrobe-backup-${todayISO()}.json`, { format: 'fearne-wardrobe-backup', state, photos: out })
  },
  reload: () => location.reload(),
  setting: ({ k, v }) => {
    state.settings = { ...state.settings, [k]: k === 'keepPhotos' ? v === 'yes' : v }
    save()
    render()
  },
  dropAllPhotos: async () => {
    if (!confirm(`Delete ${plural(photos.size, 'stored photo')}? The drawings and colours stay.`)) return
    for (const id of [...photos.keys()]) await setPhoto(id, null)
    toast('Photos deleted')
    render()
  },
  resetAll: async () => {
    if (!confirm('Erase all pieces, outfits, plans and photos on this device?')) return
    for (const id of [...photos.keys()]) await setPhoto(id, null)
    state = freshState()
    ui.gen.results = null
    save()
    render()
  },
  theme: ({ v }) => {
    if (v === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = v
    try { localStorage.setItem('wardrobe-theme', v) } catch {}
    render()
  },
}

const CHANGES = {
  photo: async (el) => {
    const file = el.files?.[0]
    if (!file) return
    try {
      const img = await loadImage(file)
      const d = ui.sheet.draft
      d.photo = squarePhoto(img)
      const near = nearestColours(P(), dominantColour(img), 4)
      d.suggestions = near.map((n) => n.colour.id)
      d.colour = d.suggestions[0]
      d.result = null
      renderSheet()
    } catch (e) {
      toast(e.message)
    }
  },
  location: (el) => { state.location = el.value; save(); render() },
  dayOcc: (el) => { getWeek().days[el.dataset.i].occasion = el.value; save(); render() },
  dayBand: (el) => { const d = getWeek().days[el.dataset.i]; d.band = el.value; delete d.temp; save(); render() },
  importProfile: async (el) => {
    try {
      const p = await readJSONFile(el.files[0])
      const errs = validateProfile(p)
      if (errs.length) { alert('That profile has problems:\n\n' + errs.slice(0, 12).join('\n')); return }
      state.profile = p
      if (!p.occasions.some((o) => o.id === ui.gen.occasion)) ui.gen.occasion = p.occasions[0].id
      save()
      toast('Profile imported')
      render()
    } catch {
      toast('Could not read that file as JSON')
    }
  },
  importBackup: async (el) => {
    try {
      const b = await readJSONFile(el.files[0])
      if (b.format !== 'fearne-wardrobe-backup') throw new Error()
      if (!confirm('Replace everything on this device with this backup?')) return
      for (const id of [...photos.keys()]) await setPhoto(id, null)
      state = b.state
      for (const [id, data] of Object.entries(b.photos || {})) await setPhoto(id, data)
      save()
      toast('Backup restored')
      render()
    } catch {
      toast('That is not a wardrobe backup')
    }
  },
}

function bind(el, typing) {
  const d = ui.sheet?.draft
  if (!d) return
  const k = el.dataset.bind
  const v = el.type === 'checkbox' ? el.checked : el.value
  if (k === 'flo' || k === 'fhi') {
    const cur = d.f || SUBTYPES[d.subtype].f || [1, 5]
    const n = Number(v)
    d.f = k === 'flo' ? [n, Math.max(n, cur[1])] : [Math.min(cur[0], n), n]
    if (!typing) renderSheet()
    return
  }
  if (k === 'warmth') d.warmth = Number(v)
  else d[k] = v
  if (k === 'subtype') { d.f = null; d.warmth = null; d.waterproof = null; d.slotId = d.id ? '' : null; d.pattern = SUBTYPES[v].pattern || 'solid' }
  if (k === 'subtype' || k === 'colour') d.result = null
  if (el.dataset.rerender && !typing) renderSheet()
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]')
  if (!t) return
  const fn = ACTIONS[t.dataset.act]
  if (!fn) return
  e.preventDefault()
  fn(t.dataset, t)
})
document.addEventListener('change', (e) => {
  const t = e.target
  if (t.dataset.change) CHANGES[t.dataset.change](t)
  else if (t.dataset.bind) bind(t, false)
})
document.addEventListener('input', (e) => {
  const t = e.target
  if (t.dataset.bind && (t.tagName === 'INPUT' && t.type !== 'checkbox')) bind(t, true)
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; renderSheet() }
})

try {
  const t = localStorage.getItem('wardrobe-theme')
  if (t && t !== 'auto') document.documentElement.dataset.theme = t
} catch {}
boot()
