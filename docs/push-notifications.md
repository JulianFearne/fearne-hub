# Push & email notifications

Unlike the rest of the app, this feature needs something deployed outside
the Vite build: a Supabase Edge Function that actually sends the
notification. Everything else (the opt-in toggles in Settings, the
`push_subscriptions` table, the service worker) ships with the app and just
sits there quietly doing nothing until the function exists.

## What's client-side vs. server-side

- **Client** (`src/pages/pushData.js`, `src/lib/notify.js`, `public/sw.js`):
  subscribing/unsubscribing a browser to push, storing that subscription,
  and asking the `notify` function to send one. Ships automatically with
  the app, no extra setup.
- **Server** (`supabase/functions/notify/index.ts`): looks up who a
  notification is for, sends a real push message via the Web Push protocol,
  and optionally sends an email via [Resend](https://resend.com). Needs
  deploying separately with the Supabase CLI.

## One-time setup

1. **Generate a VAPID key pair** (identifies this app to push services —
   generate once, reuse forever):

   ```bash
   npx web-push generate-vapid-keys
   ```

   This prints a public and private key.

2. **Put the public key in the client.** Replace
   `REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY` in `src/pages/pushData.js` with it —
   it's meant to be public, safe to commit.

3. **Set the function's secrets** (from the repo root, with the
   [Supabase CLI](https://supabase.com/docs/guides/cli) installed and
   logged in / linked to the project):

   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=<public key from step 1>
   supabase secrets set VAPID_PRIVATE_KEY=<private key from step 1>
   supabase secrets set VAPID_SUBJECT=mailto:you@fearne.org
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to every Edge
   Function automatically — no need to set those.

4. **(Optional) Enable email** — sign up at
   [resend.com](https://resend.com) (generous free tier), verify a sending
   domain, then:

   ```bash
   supabase secrets set RESEND_API_KEY=<your Resend API key>
   supabase secrets set RESEND_FROM="Fearne Hub <hub@yourdomain>"
   ```

   Leave `RESEND_API_KEY` unset to skip email entirely — the function just
   sends push and no-ops the email half.

5. **Deploy the function:**

   ```bash
   supabase functions deploy notify
   ```

6. **Run the SQL** for `push_subscriptions` and the `profiles` notification
   columns — see [`database-schema.md`](database-schema.md).

That's it — the Settings page's "Turn on" buttons for push/email start
actually doing something as soon as the function is deployed; nothing else
in the app needs to change.

## How it's wired up today

The only place the app currently calls `notify()` is chore assignment
(`Chores.jsx`, right after a chore is created with an assignee) — the
assignee gets a "New chore" notification if they've opted in. Calling
`notify({ userId, title, body, url })` from `src/lib/notify.js` anywhere
else in the app is all that's needed to add another trigger (e.g. a
reminder before a calendar event); that one would need a scheduled job
(e.g. `pg_cron` calling the function on a timer) rather than firing on
creation, since nobody's taking an action right before an event starts —
that's a reasonable next step rather than something built speculatively
here.

## Security note

The function keeps JWT verification on (the default for Edge Functions),
so only a signed-in hub member can call it — then checks the caller's
profile is `approved` before doing anything, closing the gap of an
unapproved account trying to spam a real member. It uses the service role
key internally to read `push_subscriptions` and `profiles` across users,
which is expected and safe for a server-side function — that key must
never reach the client.
