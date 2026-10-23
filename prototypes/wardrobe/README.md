# Wardrobe prototype

The wardrobe app. The plan is in [`docs/wardrobe/PLAN.md`](../../docs/wardrobe/PLAN.md).

One source, two builds:
- `dist/wardrobe.html`: standalone, stores everything in IndexedDB on the device (not committed).
- `public/wardrobe/index.html`: served at fearne.org/wardrobe/. It uses the hub's existing login and stores everything privately in Supabase (`_reference/wardrobe-state-schema.sql`). Commit it after rebuilding.

| File | Role |
|---|---|
| `profile.json` | Julian's style profile: palette, rules, occasions, buy-list slots, the dossier's looks, known contradictions |
| `engine.js` | Pure rules engine: catalogue, outfit scoring, generator, week planner, buy-next, profile validation. Moves into the hub unchanged |
| `app.js`, `styles.css`, `template.html` | The UI (vanilla JS) |
| `store-local.js`, `store-hub.js` | Storage adapters: IndexedDB on the device, or Supabase via the hub session |
| `build.mjs` | Bundles both builds, each one self-contained HTML file |
| `validate-profile.mjs` | CLI check for a profile JSON |
| `test-engine.mjs` | Engine tests |

```bash
node prototypes/wardrobe/build.mjs          # -> dist/wardrobe.html and public/wardrobe/index.html
node --test prototypes/wardrobe/test-engine.mjs   # engine tests
node prototypes/wardrobe/validate-profile.mjs prototypes/wardrobe/profile.json
```

Standalone: open `dist/wardrobe.html` in Safari or Chrome. Data stays in that browser. To move it to the hub, use Profile, then Export backup, then Restore backup on fearne.org/wardrobe/.

Network calls: Google Fonts and the Open-Meteo forecast, plus Supabase and the supabase-js script from jsDelivr in the hub build.
