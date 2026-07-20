# Fearne Hub

The Fearne family's shared home base — one login, multiple sections
(workouts, recipes, games, and more to come).

## Stack

- Vite + React + React Router
- Supabase (auth + Postgres database), free tier
- Deployed to GitHub Pages, served at fearne.org

## Run it locally

```bash
npm install
npm run dev
```

Then open the local URL it prints (usually http://localhost:5173).

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

## Project structure

```
src/
  pages/        one file per route (Home, Login, Workouts, Recipes, Games)
  components/   Nav, ProtectedRoute
  context/      AuthContext (wraps Supabase session state)
  supabaseClient.js
public/
  CNAME         custom domain for GitHub Pages
  404.html      SPA routing workaround for GitHub Pages (see comments inside)
```

## Adding a new feature later

1. Add a new page in `src/pages/`
2. Add a new table in Supabase, linked to `auth.users` via a `user_id` column
   with Row Level Security so users only see their own rows
3. Add a route in `src/App.jsx` and a nav link in `src/components/Nav.jsx`
4. Add a pinned card for it on `src/pages/Home.jsx`

## Auth notes

Signup is currently open to anyone who visits `/login`. Since this is a
family-only app, consider turning off public signups in Supabase
(**Authentication → Settings → disable "Allow new users to sign up"**) once
everyone's created their account, and instead invite people manually from the
Supabase dashboard.
