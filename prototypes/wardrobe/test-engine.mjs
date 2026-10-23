// node --test prototypes/wardrobe/test-engine.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as E from './engine.js'

const profile = JSON.parse(readFileSync(new URL('./profile.json', import.meta.url)))
const piece = (id, subtype, colour, extra = {}) => ({ id, name: id, subtype, colour, pattern: 'solid', status: 'available', wears: [], ...extra })
const ctx = (occasion, band = 'mild', rain = false, today) => {
  const o = E.occasionById(profile, occasion)
  return { profile, occasion: o, level: o.level, weather: { band, rain }, today }
}

const shirt = piece('shirt', 'oxford', 'white')
const chinos = piece('chinos', 'chinos', 'navy')
const derby = piece('derby', 'derby', 'espresso')
const loafersTan = piece('tan-loafers', 'loafers', 'tan')
const blazer = piece('blazer', 'blazer', 'navy')
const mac = piece('mac', 'mac', 'navy')
const merino = piece('merino', 'merino-crew', 'navy')

test('the bundled profile is valid', () => {
  assert.deepEqual(E.validateProfile(profile), [])
})

test('validation catches unknown colours and types', () => {
  const bad = structuredClone(profile)
  bad.slots[0].colours.push('lilac')
  bad.formulas[0].parts[0][0] = 'cape'
  const errs = E.validateProfile(bad).join('\n')
  assert.match(errs, /unknown colour lilac/)
  assert.match(errs, /unknown type cape/)
})

test('a plain office outfit passes', () => {
  const e = E.evaluate({ base: shirt, bottom: chinos, shoes: derby, outer: blazer }, ctx('office-2'))
  assert.equal(e.ok, true, e.blocks.join('; '))
})

test('off-palette colours near the face are blocked', () => {
  const e = E.evaluate({ base: piece('camel-knit', 'roll-neck', 'camel'), bottom: chinos, shoes: derby }, ctx('smart-casual'))
  assert.equal(e.ok, false)
  assert.ok(e.blocks.some((b) => /Golden camel/.test(b)))
})

test('tan shoes are casual only', () => {
  const casual = E.evaluate({ base: shirt, bottom: chinos, shoes: loafersTan, mid: merino }, ctx('casual'))
  const smart = E.evaluate({ base: shirt, bottom: chinos, shoes: loafersTan, mid: merino }, ctx('smart-casual'))
  assert.equal(casual.warns.some((w) => /casual looks/.test(w)), false)
  assert.equal(smart.warns.some((w) => /casual looks/.test(w)), true)
})

test('two statement colours are blocked', () => {
  const e = E.evaluate({ base: piece('emerald-polo', 'polo-knit', 'emerald'), bottom: piece('red-chinos', 'chinos', 'cool-red'), shoes: derby }, ctx('smart-casual'))
  assert.ok(e.blocks.includes('More than one statement colour'))
})

test('weather rules', () => {
  assert.ok(E.evaluate({ base: shirt, bottom: chinos, shoes: derby }, ctx('smart-casual', 'cold')).blocks.includes('Needs a jacket or coat'))
  assert.equal(E.evaluate({ base: shirt, bottom: chinos, shoes: derby, coat: mac }, ctx('smart-casual', 'cold')).ok, true)
  assert.equal(E.evaluate({ base: shirt, mid: merino, bottom: chinos, shoes: derby }, ctx('smart-casual', 'hot')).ok, false)
  const rain = E.evaluate({ base: shirt, bottom: chinos, shoes: derby, coat: mac }, ctx('smart-casual', 'mild', true))
  assert.ok(rain.pros.includes('Rainproof outer layer'))
  assert.equal(E.itemBlocks(piece('desert', 'desert-boot', 'espresso-suede'), ctx('casual', 'mild', true)).length > 0, true)
})

test('suits and required tailoring', () => {
  const jacket = piece('suit-j', 'suit-jacket', 'navy')
  const trousers = piece('suit-t', 'suit-trousers', 'navy')
  const poplin = piece('poplin', 'poplin', 'white')
  const oxfords = piece('oxfords', 'oxford-shoe', 'black-leather')
  assert.ok(E.evaluate({ base: poplin, outer: jacket, bottom: piece('wool', 'wool-trousers', 'charcoal'), shoes: oxfords }, ctx('wedding')).blocks.includes('Suit jacket without its trousers'))
  assert.ok(E.evaluate({ base: poplin, bottom: trousers, shoes: oxfords }, ctx('wedding')).blocks.includes('Needs a tailored jacket'))
  assert.equal(E.evaluate({ base: poplin, outer: jacket, bottom: trousers, shoes: oxfords }, ctx('wedding')).ok, true)
})

test('office excludes tees and shorts', () => {
  assert.ok(E.itemBlocks(piece('tee', 'tee', 'navy'), ctx('office-1')).some((r) => /not office wear/.test(r)))
})

test('generate only returns wearable, distinct outfits and skips laundry', () => {
  const items = E.demoWardrobe(profile, 2)
  items.find((it) => it.subtype === 'blazer').status = 'laundry'
  const { results } = E.generate(items, ctx('office-2', 'mild', true), { limit: 6 })
  assert.equal(results.length, 6)
  for (const r of results) {
    assert.equal(r.ok, true)
    assert.equal(Object.values(r.parts).some((it) => it?.status === 'laundry'), false)
  }
  assert.equal(new Set(results.map((r) => r.key)).size, results.length)
})

test('week plan never repeats a top when there are enough', () => {
  const items = E.demoWardrobe(profile, 2)
  const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((date) => ({ date, occasion: 'office-1', weather: { band: 'mild', rain: false } }))
  const plan = E.planWeek(items, profile, days)
  assert.equal(plan.every(Boolean), true)
  const tops = plan.map((p) => p.parts.base.id)
  assert.equal(new Set(tops).size, tops.length)
})

test('week plan keeps locked days and honours exclude', () => {
  const items = E.demoWardrobe(profile, 2)
  const first = E.planWeek(items, profile, [{ date: '2026-10-19', occasion: 'casual', weather: { band: 'mild' } }])[0]
  const locked = { base: shirt, bottom: chinos, shoes: derby }
  const plan = E.planWeek(items, profile, [
    { date: '2026-10-19', occasion: 'casual', weather: { band: 'mild' }, exclude: first.key },
    { date: '2026-10-20', occasion: 'casual', weather: { band: 'mild' }, locked },
  ])
  assert.notEqual(plan[0].key, first.key)
  assert.equal(plan[1].parts, locked)
})

test('buy-next ranks by outfits unlocked, zero from an empty wardrobe', () => {
  assert.equal(E.buyNext(profile, []).every((b) => b.gain === 0), true)
  const ranked = E.buyNext(profile, E.demoWardrobe(profile, 2))
  assert.ok(ranked[0].gain > 0)
  assert.ok(ranked[0].gain >= ranked[ranked.length - 1].gain)
})

test('colour detection maps to the nearest palette colour', () => {
  assert.equal(E.nearestColours(profile, [31, 42, 68], 1)[0].colour.id, 'navy')
  assert.equal(E.nearestColours(profile, [35, 72, 80], 1)[0].colour.id, 'deep-teal')
})

test('guide formulas fill from owned pieces', () => {
  const fill = E.fillFormula(profile.formulas[1], [blazer, piece('poplin', 'poplin', 'white'), piece('grey', 'wool-trousers', 'mid-grey'), derby])
  assert.deepEqual(fill.map((f) => f.match), ['exact', 'exact', 'exact', 'exact'])
})
