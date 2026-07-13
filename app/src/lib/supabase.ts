import { createClient } from '@supabase/supabase-js'
import { appEnv } from './env'

export const supabase = createClient(appEnv.supabaseUrl, appEnv.supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
