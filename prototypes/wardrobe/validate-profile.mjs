// Checks a style profile JSON before it goes into the app.
//   node prototypes/wardrobe/validate-profile.mjs path/to/profile.json
import { readFileSync } from 'node:fs'
import { validateProfile } from './engine.js'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node validate-profile.mjs <profile.json>')
  process.exit(2)
}
let profile
try {
  profile = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  console.error(`Not valid JSON: ${e.message}`)
  process.exit(1)
}
const errs = validateProfile(profile)
if (errs.length) {
  console.error(`${errs.length} problem(s):\n- ${errs.join('\n- ')}`)
  process.exit(1)
}
console.log(`OK: ${profile.palette.length} colours, ${profile.occasions.length} occasions, ${profile.slots.length} buy-list slots, ${(profile.formulas || []).length} looks, ${(profile.conflicts || []).length} conflicts flagged`)
