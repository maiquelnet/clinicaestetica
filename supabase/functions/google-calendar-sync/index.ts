import { createClient } from 'npm:@supabase/supabase-js@2.110.0'
import { createGoogleCalendarHandler, HttpError } from './core.ts'

function getOptionalEnv(...names: string[]) {
  return names.map((name) => Deno.env.get(name)?.trim()).find(Boolean)
}

function getRequiredEnv(...names: string[]) {
  const value = getOptionalEnv(...names)
  if (!value) throw new Error(`Missing ${names.join(' or ')} environment variable`)
  return value
}

const googleSecrets: Array<{ name: string; envNames: string[] }> = [
  { name: 'GOOGLE_CLIENT_ID', envNames: ['GOOGLE_CLIENT_ID', 'google_client_id'] },
  { name: 'GOOGLE_CLIENT_SECRET', envNames: ['GOOGLE_CLIENT_SECRET', 'google_client_secret'] },
  { name: 'GOOGLE_TOKEN_ENCRYPTION_KEY', envNames: ['GOOGLE_TOKEN_ENCRYPTION_KEY', 'google_token_encryption_key'] },
]

function getGoogleSecret(name: string, ...envNames: string[]) {
  const value = getOptionalEnv(...envNames)
  if (value) return value
  console.error('google_calendar_configuration_missing', { names: [name] })
  throw new HttpError(500, `Configuracao ausente em Edge Functions > Secrets: ${name}.`)
}

function validateGoogleConfiguration() {
  const missing = googleSecrets
    .filter((secret) => !getOptionalEnv(...secret.envNames))
    .map((secret) => secret.name)
  if (!missing.length) return
  console.error('google_calendar_configuration_missing', { names: missing })
  throw new HttpError(500, `Configuracao ausente em Edge Functions > Secrets: ${missing.join(', ')}.`)
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
  Deno.env.get('SITE_URL') || 'https://www.esteticaschneider.com.br',
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
  googleClientId: () => getGoogleSecret('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID', 'google_client_id'),
  googleClientSecret: () => getGoogleSecret('GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET', 'google_client_secret'),
  tokenEncryptionSecret: () => getGoogleSecret('GOOGLE_TOKEN_ENCRYPTION_KEY', 'GOOGLE_TOKEN_ENCRYPTION_KEY', 'google_token_encryption_key'),
  validateConfiguration: validateGoogleConfiguration,
  siteUrl,
  functionUrl,
  defaultCalendarId: Deno.env.get('GOOGLE_CALENDAR_ID') || Deno.env.get('google_calendar_id') || 'primary',
  cronSecret: Deno.env.get('GOOGLE_SYNC_CRON_SECRET'),
  allowedOrigins: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://www.esteticaschneider.com.br',
    'https://esteticaschneider.com.br',
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
