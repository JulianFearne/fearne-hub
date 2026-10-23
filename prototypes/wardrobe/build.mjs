// Bundles the wardrobe into self-contained HTML files:
//   node prototypes/wardrobe/build.mjs
//     -> prototypes/wardrobe/dist/wardrobe.html   standalone, IndexedDB on the device
//     -> public/wardrobe/index.html               fearne.org/wardrobe/, Supabase via the hub login
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const here = (f) => new URL(f, import.meta.url)
const read = (f) => readFileSync(here(f), 'utf8')
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js'

const profile = JSON.parse(read('profile.json'))
const engine = read('engine.js').replace(/^export /gm, '')
const app = read('app.js')
  .replace(/^import \{[\s\S]*?\} from '\.\/engine\.js'\n/m, '')
  .replace(/^import \{ createStore \} from '\.\/store-local\.js'\n/m, '')

// Hub keys come from the hub's own client so there is one source of truth.
const client = readFileSync(new URL('../../src/supabaseClient.js', import.meta.url), 'utf8')
const SUPABASE_URL = client.match(/SUPABASE_URL = '([^']+)'/)[1]
const SUPABASE_ANON_KEY = client.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1]

function bundle({ store, head, eyebrow, prelude = '' }) {
  const storeCode = read(store).replace(/^export /gm, '')
  const script = `${prelude}const DEFAULT_PROFILE = ${JSON.stringify(profile)};\n${engine}\n${storeCode}\n${app}`.replace(/<\/script/gi, '<\\/script')
  return read('template.html')
    .replace('/*HEAD*/', () => head)
    .replace('/*EYEBROW*/', () => eyebrow)
    .replace('/*CSS*/', () => read('styles.css'))
    .replace('/*SCRIPT*/', () => script)
}

const targets = [
  {
    out: 'dist/wardrobe.html',
    html: bundle({ store: 'store-local.js', head: '', eyebrow: 'Wardrobe · prototype' }),
  },
  {
    out: '../../public/wardrobe/index.html',
    html: bundle({
      store: 'store-hub.js',
      head: `<meta name="robots" content="noindex">\n<link rel="icon" href="/icon-192.png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<script src="${SUPABASE_JS}" crossorigin="anonymous"></script>`,
      eyebrow: 'Fearne Hub · private',
      prelude: `const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};\nconst SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};\n`,
    }),
  },
]

for (const t of targets) {
  const url = here(t.out)
  mkdirSync(new URL('./', url), { recursive: true })
  writeFileSync(url, t.html)
  console.log(`${t.out} ${(t.html.length / 1024).toFixed(0)} KB`)
}
