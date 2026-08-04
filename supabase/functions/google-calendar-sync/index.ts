import { createClient } from 'npm:@supabase/supabase-js@2.110.0'
import { createGoogleCalendarHandler } from './core.ts'

function getRequiredEnv(...names: string[]) {
  const value = names.map((name) => Deno.env.get(name)?.trim()).find(Boolean)
  if (!value) throw new Error(`Missing ${names.join(' or ')} environment variable`)
  return value
}

function getServiceKey() {
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (legacyKey) return legacyKey

  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys) as Record<string, string>
    const key = parsed.default || Object.values(parsed)[0]
    if (key) return key
  }
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS environment variable')
}

function validUrl(value: string, name: string) {
  try {
    return new URL(value).toString().replace(/\/$/, '')
  } catch {
    throw new Error(`${name} must be a valid absolute URL`)
  }
}

const supabaseUrl = getRequiredEnv('SUPABASE_URL')
const siteUrl = validUrl(
  Deno.env.get('SITE_URL') || 'https://clinicaestetica-softolive.vercel.app',
  'SITE_URL',
)
const functionUrl = validUrl(
  Deno.env.get('GOOGLE_FUNCTION_URL') || `${supabaseUrl}/functions/v1/google-calendar-sync`,
  'GOOGLE_FUNCTION_URL',
)
const extraOrigins = (Deno.env.get('CORS_ALLOWED_ORIGINS') || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const db = createClient(supabaseUrl, getServiceKey(), {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const handler = createGoogleCalendarHandler({
  db,
  googleClientId: () => getRequiredEnv('GOOGLE_CLIENT_ID', 'google_client_id'),
  googleClientSecret: () => getRequiredEnv('GOOGLE_CLIENT_SECRET', 'google_client_secret'),
  tokenEncryptionSecret: () => getRequiredEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', 'google_token_encryption_key'),
  siteUrl,
  functionUrl,
  defaultCalendarId: Deno.env.get('GOOGLE_CALENDAR_ID') || Deno.env.get('google_calendar_id') || 'primary',
  cronSecret: Deno.env.get('GOOGLE_SYNC_CRON_SECRET'),
  allowedOrigins: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...extraOrigins,
  ],
  allowedOriginPatterns: [
    /^https:\/\/clinicaestetica(?:-[a-z0-9-]+)?-softolive\.vercel\.app$/,
  ],
  fetch,
  crypto,
  now: () => new Date(),
  randomUUID: () => crypto.randomUUID(),
  waitUntil: (promise) => (globalThis as any).EdgeRuntime.waitUntil(promise),
  logger: console,
})

Deno.serve(handler)
