// Sends a push notification and/or email to one hub member. Deployed
// separately from the main app via the Supabase CLI — see
// docs/push-notifications.md for the full setup (VAPID keys, secrets,
// deploy command). Called from the client as
// `supabase.functions.invoke('notify', { body: { userId, title, body, url } })`.
//
// JWT verification is left on (the default), so only a signed-in hub member
// can call this at all; the approval check below closes the remaining gap
// of one member notifying another who hasn't been approved yet.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@fearne.org'
// Optional: email is skipped entirely if this isn't set.
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Fearne Hub <hub@fearne.org>'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const {
    data: { user: caller },
  } = await supabase.auth.getUser(token)
  if (!caller) return new Response('Unauthorized', { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('approved')
    .eq('id', caller.id)
    .single()
  if (!callerProfile?.approved) return new Response('Forbidden', { status: 403 })

  const { userId, title, body, url } = await req.json()
  if (!userId || !title) return new Response('Missing userId or title', { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, notify_push, notify_email')
    .eq('id', userId)
    .single()

  const result = { push: 0, email: false }

  if (profile?.notify_push) {
    const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId)
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url })
        )
        result.push++
      } catch (err) {
        // Expired/unsubscribed endpoints report 404/410 — clean them up
        // rather than retrying forever.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }
  }

  if (profile?.notify_email && profile.email && RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: profile.email, subject: title, text: body }),
    })
    result.email = res.ok
  }

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
})
