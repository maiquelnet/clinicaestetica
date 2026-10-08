import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = { 'Content-Type': 'application/json' }

function env(name: string) { return Deno.env.get(name)?.trim() || '' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers })
}

function parseSignature(value: string | null) {
  const parts = new Map((value || '').split(',').map((part) => part.trim().split('=').map((item) => item.trim())))
  const timestamp = parts.get('t') || ''
  const signature = parts.get('s') || ''
  return { timestamp, signature }
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

async function verifySignature(payload: string, signatureHeader: string | null, secret: string) {
  const { timestamp, signature } = parseSignature(signatureHeader)
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signedPayload = `${timestamp}.${payload}`
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload)))
  return constantTimeEqual(signature, expected)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405)
  const webhookSecret = env('YCLOUD_WEBHOOK_SECRET')
  const supabaseUrl = env('SUPABASE_URL')
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) return json({ error: 'Configuracao do webhook ausente no servidor.' }, 503)

  const rawBody = await request.text()
  if (!(await verifySignature(rawBody, request.headers.get('YCloud-Signature'), webhookSecret))) return json({ error: 'Assinatura YCloud invalida.' }, 401)

  const body = JSON.parse(rawBody) as {
    id?: string
    type?: string
    createTime?: string
    whatsappMessage?: {
      id?: string
      wamid?: string
      externalId?: string
      status?: string
      errorCode?: string
      errorMessage?: string
      updateTime?: string
      sendTime?: string
      deliverTime?: string
      readTime?: string
    }
  }
  if (!body.id) return json({ error: 'Evento YCloud sem id.' }, 400)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const message = body.whatsappMessage
  const { data, error } = await admin.rpc('record_ycloud_webhook_event', {
    p_event_id: body.id,
    p_event_type: body.type || 'unknown',
    p_provider_message_id: message?.id || null,
    p_meta_message_id: message?.wamid || null,
    p_external_id: message?.externalId || null,
    p_provider_status: message?.status || null,
    p_error_code: message?.errorCode || null,
    p_error_message: message?.errorMessage || null,
    p_event_time: message?.updateTime || message?.readTime || message?.deliverTime || message?.sendTime || body.createTime || null,
  })
  if (error) {
    console.error('ycloud-webhook processing error', error.message)
    return json({ error: 'Nao foi possivel registrar o evento YCloud.' }, 500)
  }
  return json(data || { received: true })
})
