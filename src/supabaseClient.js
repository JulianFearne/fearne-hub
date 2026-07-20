import { createClient } from '@supabase/supabase-js'

// These values come from Project Settings -> API in your Supabase dashboard.
// The "anon" / "publishable" key is designed to be public-facing (it can only
// do what your Row Level Security policies allow), so it's fine to commit
// this file rather than hide it behind environment variables.
const SUPABASE_URL = 'https://zcfidrjkpobpetxqmjiy.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_5OiN2Gtpt2xAyFa4k4terQ_yv9EPlM_'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
