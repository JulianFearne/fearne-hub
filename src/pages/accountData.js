import { supabase } from '../supabaseClient'

export function displayName(profile, fallbackEmail) {
  const email = profile?.email ?? fallbackEmail
  return profile?.display_name || email?.split('@')[0] || 'Someone'
}

export async function updateProfile(updates) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userData.user.id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Stored at a fixed path per user (no extension) so re-uploading just
// overwrites it — no orphaned old images piling up in the bucket. The
// public URL never changes, so a cache-busting query param is appended
// on every upload to make sure viewers see the new image straight away.
export async function uploadAvatar(file) {
  const { data: userData } = await supabase.auth.getUser()
  const path = `${userData.user.id}/avatar`
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) throw uploadError
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return updateProfile({ avatar_url: `${data.publicUrl}?v=${Date.now()}` })
}
