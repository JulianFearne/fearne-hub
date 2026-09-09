# Fearne Hub

The Fearne family's shared home base — one login, multiple sections
(workouts, recipes, meal planning, games, and more to come).

## Stack

- Vite + React + React Router
- Supabase (auth + Postgres database, free tier)
- Deployed to GitHub Pages, served at fearne.org

## Run it locally

```bash
npm install
npm run dev
```

Then open the local URL it prints (usually http://localhost:5173).

There's no separate backend to run — the app talks straight to Supabase using
the client in `src/supabaseClient.js`.

## Features

- **Accounts with approval** — anyone can sign up, but new accounts sit in
  "pending" until a family admin approves them (see [Auth &
  accounts](#auth--accounts) below).
- **Recipes** — a shared recipe book with categories, search, a step-by-step
  "Cook Mode" with automatic timers, and JSON import/export for bulk-adding
  recipes (e.g. ones written up by Claude). See
  [`docs/recipe-import-format.md`](docs/recipe-import-format.md).
- **Meal Planner** — a weekly grid (breakfast/lunch/dinner × 7 days), fed by
  the recipe book, that can push its ingredients straight into a shopping
  list.
- **Shopping Lists** — multiple named lists, checkable items, and the
  ability to combine several lists into one before a shop.
- **Workouts** — upload or build a bodyweight-style "progression chain"
  workout, track sets against it, and see history, per-chain progress
  charts, and an optional body-weight tracker (adults/admins only). See
  [`docs/workout-program-format.md`](docs/workout-program-format.md).
- **Games** — "Animal Place Thing", a realtime multiplayer categories game
  (Object/Name/Animal/Place/Food) played with a join code, scored live via
  Supabase Realtime.
- **Admin** — approve sign-ups and manage everyone's role
  (`admin` / `adult` / `kid`).

## Project structure

```
src/
  main.jsx              entry point; also unwinds the GitHub Pages 404 redirect
  App.jsx                route table
  supabaseClient.js       Supabase client (URL + publishable anon key)
  context/
    AuthContext.jsx       wraps Supabase session + the profiles row (role, approved)
  components/
    Nav.jsx                top nav, adapts to sign-in/approval state
    ProtectedRoute.jsx     route guard: requires session, approval, optional role
    RecipeForm.jsx         "add a recipe" form (textarea-based ingredient/step parsing)
    RecipeModal.jsx        recipe detail view
    RecipePickerModal.jsx  recipe search/pick, used by the Meal Planner
    CookMode.jsx            full-screen step-through cooking view with auto timers
  pages/
    Home.jsx                landing page, links into each section
    Login.jsx                sign in / sign up
    PendingApproval.jsx      shown to signed-in-but-not-yet-approved users
    Admin.jsx                 approve users, change roles (requireRole="admin")
    Recipes.jsx / recipesData.js         recipe book + Supabase queries
    ImportRecipes.jsx                     bulk JSON import for recipes
    MealPlanner.jsx / mealPlanData.js    weekly planner + shopping list helpers
    ShoppingLists.jsx                     list management (shares mealPlanData.js)
    WorkoutHub.jsx                        choose / upload / build a workout program
    WorkoutTracker.jsx                    live set-logging against the loaded program
    WorkoutHistory.jsx                    sessions, per-chain progress charts, weight log
    Games.jsx                              games index
    AnimalPlaceThing.jsx / scoring.js     realtime multiplayer game + pure scoring logic
  lib/
    workoutSchema.js         validates/normalises uploaded or built workout JSON
    workoutApi.js             every Supabase call for the workout feature
  data/
    programs/calisthenics-bta.json   built-in starter workout, seeded on first load
  styles/                     global.css + per-feature CSS files
docs/
  database-schema.md          Supabase tables this app expects, inferred from the code
  workout-program-format.md   JSON format for workout programs (upload or hand-write)
  recipe-import-format.md     JSON format for bulk recipe import
public/
  CNAME         custom domain for GitHub Pages
  404.html      SPA routing workaround for GitHub Pages (see comments inside)
```

Note: `src/pages/Workouts.jsx` is an old placeholder left over from before the
workout feature was built (`WorkoutHub.jsx` is what's actually routed at
`/workouts`); it isn't imported anywhere.

## Auth & accounts

Signup is open to anyone who visits `/login`. After confirming their email, a
new user lands on `/pending` until a family admin approves them from
`/admin` — until then `ProtectedRoute` redirects them away from everything
else. Once approved, a `profiles` row carries their `role`
(`admin` / `adult` / `kid`) and `approved` flag; `AuthContext` reads this
alongside the Supabase session on every page.

Since this is a family-only app, once everyone has an account it's worth
turning off public signups in Supabase (**Authentication → Settings →
disable "Allow new users to sign up"**) and inviting people manually from the
Supabase dashboard instead.

## Database

There's no migrations folder in this repo — the schema lives in the Supabase
project itself. [`docs/database-schema.md`](docs/database-schema.md) documents
every table, column and RLS expectation the app code relies on, reverse
engineered from the Supabase queries in `src/pages/*Data.js`,
`src/lib/workoutApi.js` and `src/pages/AnimalPlaceThing.jsx` — use it as the
source of truth when recreating or auditing the schema.

`src/supabaseClient.js` hardcodes the project URL and the **anon /
publishable** key. That key is meant to be public (Supabase's own docs say
so) — everything it can do is governed by Row Level Security policies on the
tables, not by keeping the key secret.

## Deploying

Every push to `main` automatically builds and deploys via the GitHub Actions
workflow in `.github/workflows/deploy.yml` — you don't need to build or
deploy by hand.

One-time setup in the GitHub repo (**Settings → Pages**):
- Under "Build and deployment", set **Source** to "GitHub Actions"
  (not "Deploy from a branch")

## Connecting the domain

The `public/CNAME` file already contains `fearne.org`, so it's included in
every build automatically. At your domain registrar, point DNS at GitHub
Pages:

- Four **A records** at the apex (`fearne.org`) pointing to:
  185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
- A **CNAME record** for `www` → `julianfearne.github.io`

Then in the repo's **Settings → Pages**, enter `fearne.org` as the custom
domain and check "Enforce HTTPS" once DNS has propagated (can take a few
minutes up to 24 hours).

## Adding a new feature later

1. Add a new page in `src/pages/`
2. Add a new table in Supabase, linked to `auth.users` via a `user_id` column
   with Row Level Security so users only see their own rows (see
   [`docs/database-schema.md`](docs/database-schema.md) for the pattern the
   existing tables follow)
3. Add a route in `src/App.jsx` and a nav link in `src/components/Nav.jsx`
4. Add a pinned card for it on `src/pages/Home.jsx`
