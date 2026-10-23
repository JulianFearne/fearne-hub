---
name: wardrobe-profile
description: Convert a personal style guide (HTML, PDF, text) and optional buy list into a validated wardrobe style profile JSON. Use when asked to create, update or fix the wardrobe style profile, or after the style guide changes.
---

# Wardrobe style profile

Turns a style guide into the JSON the wardrobe engine reads. Format and rules live in `docs/wardrobe/style-profile-format.md`. Read it first and follow its conversion prompt exactly.

## Steps

1. Read every file the user gave: the guide, and the buy list if there is one. If there is no buy list, build slots from the guide's capsule or shopping section.
2. If you are updating an existing profile, read `prototypes/wardrobe/profile.json` and keep its ids stable. Pieces in the app link to slot ids, and outfits link to palette ids.
3. Write the profile to `prototypes/wardrobe/profile.json`, or to a path the user names.
4. Validate it:
   ```bash
   node prototypes/wardrobe/validate-profile.mjs prototypes/wardrobe/profile.json
   node --test prototypes/wardrobe/test-engine.mjs
   node prototypes/wardrobe/build.mjs
   ```
   Fix every problem the validator reports, then run it again.
5. Report back:
   - what changed (colours, verdicts, slots, looks)
   - each entry in `conflicts`, phrased as a question the user can answer
   - how to load it: rebuild and reopen `dist/wardrobe.html` (the default profile), or import the JSON on the Profile tab, which keeps existing pieces

## Rules

- Change verdicts only where the guide supports it. Where the guide hedges, use `warn`, not `block`.
- Never delete a slot id that existing pieces might use. Mark it with tier 9 and a note in `conflicts` instead.
- Leave out body measurements and personal details that aren't needed to judge clothes.
