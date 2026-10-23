# Wardrobe prototype

Local-first prototype of the wardrobe section. The plan is in [`docs/wardrobe/PLAN.md`](../../docs/wardrobe/PLAN.md).

This folder is not part of the hub build and is not deployed.

| File | Role |
|---|---|
| `profile.json` | Julian's style profile: palette, rules, occasions, buy-list slots, the dossier's looks, known contradictions |
| `engine.js` | Pure rules engine: catalogue, outfit scoring, generator, week planner, buy-next, profile validation. Moves into the hub unchanged |
| `app.js`, `styles.css`, `template.html` | The UI (vanilla JS, IndexedDB) |
| `build.mjs` | Bundles everything into `dist/wardrobe.html`, one self-contained file |
| `validate-profile.mjs` | CLI check for a profile JSON |
| `test-engine.mjs` | Engine tests |

```bash
node prototypes/wardrobe/build.mjs          # -> prototypes/wardrobe/dist/wardrobe.html
node --test prototypes/wardrobe/test-engine.mjs   # engine tests
node prototypes/wardrobe/validate-profile.mjs prototypes/wardrobe/profile.json
```

Open `dist/wardrobe.html` in Safari or Chrome, or AirDrop it to a phone and open it there. Data stays in that browser on that device. Use Profile, then Export backup, to move it. The only network calls are Google Fonts and the Open-Meteo forecast.
