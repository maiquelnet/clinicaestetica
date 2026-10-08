import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = { 'Content-Type': 'application/json' }

function env(name: string) {
  return Deno.env.get(name)?.trim() || ''
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers })
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function verifySignature(payload: string, signatureHeader: string | null, appSecret: string) {
  const signature = (signatureHeader || '').replace(/^sha256=/i, '').trim()
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
  return constantTimeEqual(signature.toLowerCase(), expected)
}

function eventTime(timestamp: string | undefined) {
  const seconds = Number(timestamp)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null
}

type MetaError = { code?: number | string; title?: string; message?: string; error_data?: { details?: string } }
type MetaStatus = { id?: string; status?: string; timestamp?: string; errors?: MetaError[] }
type MetaChangeValue = { metadata?: { phone_number_id?: string }; statuses?: MetaStatus[] }
type MetaWebhook = { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: MetaChangeValue }> }> }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })

  if (request.method === 'GET') {
    const url = new URL(request.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode !== 'subscribe' || !token || token !== env('META_WEBHOOK_VERIFY_TOKEN') || !challenge) return new Response('Forbidden', { status: 403, headers })
    return new Response(challenge, { headers: { ...headers, 'Content-Type': 'text/plain' } })
  }

  if (request.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405)

  const appSecret = env('META_APP_SECRET')
  const supabaseUrl = env('SUPABASE_URL')
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!appSecret || !supabaseUrl || !serviceRoleKey) return json({ error: 'Configuracao do webhook Meta ausente no servidor.' }, 503)

  const rawBody = await request.text()
  if (!(await verifySignature(rawBody, request.headers.get('X-Hub-Signature-256'), appSecret))) return json({ error: 'Assinatura Meta invalida.' }, 401)

  const body = JSON.parse(rawBody) as MetaWebhook
  if (body.object !== 'whatsapp_business_account') return json({ received: true, ignored: true })

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  let processed = 0
  let ignored = 0

  for (const entry of body.entry || []) {
    if (entry.id && env('WHATSAPP_BUSINESS_ACCOUNT_ID') && entry.id !== env('WHATSAPP_BUSINESS_ACCOUNT_ID')) {
      ignored += entry.changes?.reduce((count, change) => count + (change.value?.statuses?.length || 0), 0) || 0
      continue
    }
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') {
        ignored++
        continue
      }

      const phoneNumberId = change.value?.metadata?.phone_number_id
      if (phoneNumberId && env('WHATSAPP_PHONE_NUMBER_ID') && phoneNumberId !== env('WHATSAPP_PHONE_NUMBER_ID')) {
        ignored += change.value?.statuses?.length || 0
        continue
      }

      for (const status of change.value?.statuses || []) {
        const statusName = (status.status || '').toLowerCase()
        const messageId = status.id?.trim()
        if (!messageId || !['sent', 'delivered', 'read', 'failed'].includes(statusName)) {
          ignored++
          continue
        }

        const firstError = status.errors?.[0]
        const errorCode = firstError?.code == null ? null : String(firstError.code)
        const errorMessage = firstError?.message || firstError?.title || firstError?.error_data?.details || null
        const eventId = `meta:${entry.id || 'unknown'}:${messageId}:${statusName}:${status.timestamp || 'none'}:${errorCode || ''}`
        const { error } = await admin.rpc('record_meta_webhook_event', {
          p_event_id: eventId,
          p_event_type: `messages.status.${statusName}`,
          p_meta_message_id: messageId,
          p_provider_status: statusName,
          p_error_code: errorCode,
          p_error_message: errorMessage,
          p_event_time: eventTime(status.timestamp),
        })
        if (error) {
          console.error('meta-whatsapp-webhook processing error', error.message)
          return json({ error: 'Nao foi possivel registrar o evento Meta.' }, 500)
        }
        processed++
      }
    }
  }

  return json({ received: true, processed, ignored })
})
