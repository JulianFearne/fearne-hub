// Bundles the prototype into one self-contained HTML file:
//   node prototypes/wardrobe/build.mjs  ->  prototypes/wardrobe/dist/wardrobe.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const here = (f) => new URL(f, import.meta.url)
const read = (f) => readFileSync(here(f), 'utf8')

const profile = JSON.parse(read('profile.json'))
const engine = read('engine.js').replace(/^export /gm, '')
const app = read('app.js').replace(/^import \{[\s\S]*?\} from '\.\/engine\.js'\n/m, '')
const script = `const DEFAULT_PROFILE = ${JSON.stringify(profile)};\n${engine}\n${app}`.replace(/<\/script/gi, '<\\/script')

const html = read('template.html').replace('/*CSS*/', () => read('styles.css')).replace('/*SCRIPT*/', () => script)
mkdirSync(here('dist/'), { recursive: true })
writeFileSync(here('dist/wardrobe.html'), html)
console.log(`dist/wardrobe.html ${(html.length / 1024).toFixed(0)} KB`)
