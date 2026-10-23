// Storage adapter: Supabase, for the build served at fearne.org/wardrobe/.
// The page shares fearne.org's origin, so supabase-js picks up the session
// the hub already stored: no second login. Everything is owner-only under
// RLS (see _reference/wardrobe-state-schema.sql). SUPABASE_URL and
// SUPABASE_ANON_KEY are injected by build.mjs from src/supabaseClient.js.
export function createStore() {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const BUCKET = 'wardrobe'
  const WEEK = 60 * 60 * 24 * 7
  let user = null

  const fail = (code, message) => Object.assign(new Error(message), { code })

  async function readState() {
    const { data, error } = await sb.from('wardrobe_state').select('state, updated_at').eq('user_id', user.id).maybeSingle()
    if (error) throw fail('setup', error.message)
    return data
  }

  return {
    kind: 'hub',
    async init() {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) throw fail('signed-out', 'Not signed in')
      user = session.user
      const { data: profile } = await sb.from('profiles').select('approved').eq('id', user.id).maybeSingle()
      if (profile && !profile.approved) throw fail('pending', 'Account waiting for approval')

      const row = await readState()
      const photos = new Map()
      const { data: files, error } = await sb.storage.from(BUCKET).list(user.id, { limit: 1000 })
      if (error) throw fail('setup', error.message)
      if (files?.length) {
        const paths = files.map((f) => `${user.id}/${f.name}`)
        const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(paths, WEEK)
        signed?.forEach((s, i) => { if (s.signedUrl) photos.set(files[i].name.replace(/\.jpg$/, ''), s.signedUrl) })
      }
      return { state: row?.state || null, photos, updatedAt: row?.updated_at || null }
    },
    async refresh() {
      const row = await readState()
      return row ? { state: row.state, updatedAt: row.updated_at } : null
    },
    async saveState(state) {
      const updated_at = new Date().toISOString()
      const { error } = await sb.from('wardrobe_state').upsert({ user_id: user.id, state, updated_at })
      if (error) throw error
      return updated_at
    },
    async putPhoto(id, dataURL) {
      const blob = await (await fetch(dataURL)).blob()
      const path = `${user.id}/${id}.jpg`
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      return dataURL
    },
    async deletePhoto(id) {
      await sb.storage.from(BUCKET).remove([`${user.id}/${id}.jpg`])
    },
  }
}
