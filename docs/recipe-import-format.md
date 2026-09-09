# Recipe import format

This is the JSON format the "Import" page (`/import`, `ImportRecipes.jsx`)
accepts for bulk-adding recipes — handy for asking Claude (or anyone else) to
write up a batch of recipes and dropping the resulting file straight into the
cookbook. `ImportRecipes.jsx` validates every recipe client-side before
anything is saved; this document describes what it checks.

## Shape

The file must be a **JSON array** at the top level, even for a single
recipe:

```json
[
  {
    "title": "Spaghetti and Meatballs",
    "category": "main",
    "emoji": "🍝",
    "serves": 4,
    "time": "45 min",
    "difficulty": "Medium",
    "tags": ["Comfort Food", "Kid-Friendly"],
    "ingredients": [
      { "group": "Meatballs" },
      { "name": "Minced beef", "amount": "500g" },
      { "name": "Garlic cloves, minced", "amount": "2" },
      { "group": "Sauce" },
      { "name": "Tomato passata", "amount": "500g" }
    ],
    "steps": [
      "Brown the meatballs in a hot pan, about 8 minutes.",
      "Add the sauce and simmer for 20 minutes."
    ],
    "notes": "Freezes well before the pasta is added."
  }
]
```

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | |
| `category` | string | yes | One of `starter`, `main`, `dessert`, `snack`, `drink` (see `CATEGORIES` in `src/pages/recipesData.js`; `all` is a UI filter, not a valid category). |
| `emoji` | string | no | Defaults to 🍽️ if missing or blank. |
| `serves` | number | no | Must be a number if present. |
| `time` | string | no | Free text, e.g. `"45 min"`. |
| `difficulty` | string | no | `Easy`, `Medium`, or `Hard` if present. |
| `tags` | array of strings | no | |
| `ingredients` | array | yes | At least one entry. See [Ingredients](#ingredients). |
| `steps` | array of strings | yes | At least one entry, each a plain string describing one step. |
| `notes` | string | no | |

### Ingredients

Each entry is either:

- a **group header** — `{ "group": "Sauce" }` — used to break the ingredient
  list into labelled sections in the UI, or
- an **ingredient** — `{ "name": "Tomato passata", "amount": "500g" }` —
  `amount` is optional.

Every entry needs either `name` or `group`; anything else fails validation.

### Cook Mode timers

Steps aren't structured beyond plain text, but `CookMode.jsx` scans each
step's text for a duration (patterns like `"20 minutes"`, `"1 hr 30 mins"`,
`"45 secs"`, or a range like `"10-12 mins"`) and, if found, offers an
automatic countdown timer for that step. Mentioning a time naturally in the
step text is enough — no special syntax needed.

## Validation behaviour

On upload, every recipe in the array is checked; if **any** recipe has a
problem, the whole file is rejected with a list of every issue found (nothing
is imported). Once the file passes validation:

- Unknown/extra fields are stripped before saving.
- The tool checks recipe titles against what's already in the cookbook
  (case-insensitive) and warns about likely duplicates, but doesn't block the
  import — recipes are matched by title only, so importing again adds
  duplicates rather than replacing.
- Recipes are saved one at a time; if a save fails partway through, the
  titles already saved are reported so they don't need re-importing.
