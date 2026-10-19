import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveClinicIntegration, type ClinicMetaIntegration } from '../_shared/meta-safety.ts'

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
type MetaContact = { wa_id?: string; profile?: { name?: string } }
type MetaIncomingMessage = {
  id?: string
  from?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  button?: { text?: string; payload?: string }
  interactive?: { type?: string; button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string; description?: string } }
  image?: { caption?: string; id?: string; mime_type?: string; sha256?: string }
  video?: { caption?: string; id?: string; mime_type?: string; sha256?: string }
  audio?: { id?: string; mime_type?: string; sha256?: string; voice?: boolean }
  document?: { filename?: string; caption?: string; id?: string; mime_type?: string; sha256?: string }
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
}
type MetaChangeValue = { metadata?: { phone_number_id?: string }; contacts?: MetaContact[]; statuses?: MetaStatus[]; messages?: MetaIncomingMessage[] }
type MetaWebhook = { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: MetaChangeValue }> }> }
type IntegrationRow = ClinicMetaIntegration & {
  clinic_id: string
  app_id: string
  waba_id: string
  phone_number_id: string
  access_token: string | null
  app_secret: string | null
  verify_token: string | null
}

async function getIntegrations(admin: SupabaseClient): Promise<IntegrationRow[]> {
  const { data, error } = await admin.rpc('get_meta_whatsapp_integrations')
  if (error) throw new Error(`Não foi possível carregar as integrações Meta: ${error.message}`)
  return ((data || []) as IntegrationRow[]).map((row) => ({
    ...row,
    clinicId: row.clinic_id,
    appId: row.app_id,
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    accessToken: row.access_token,
    appSecret: row.app_secret,
    verifyToken: row.verify_token,
  }))
}

function incomingMessageText(message: MetaIncomingMessage) {
  const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title
  if (text?.trim()) return text.trim()
  const type = message.type || 'unknown'
  if (type === 'image') return '[Imagem recebida]'
  if (type === 'video') return '[Vídeo recebido]'
  if (type === 'audio') return '[Áudio recebido]'
  if (type === 'document') return `[Documento recebido${message.document?.filename ? `: ${message.document.filename}` : ''}]`
  if (type === 'location') return '[Localização recebida]'
  return `[Mensagem ${type} recebida]`
}

function contactName(value: MetaChangeValue, from: string) {
  return value.contacts?.find((contact) => contact.wa_id === from)?.profile?.name || null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })

  const supabaseUrl = env('SUPABASE_URL')
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Configuração do webhook Meta ausente no servidor.' }, 503)
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  if (request.method === 'GET') {
    const url = new URL(request.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode !== 'subscribe' || !token || !challenge) return new Response('Forbidden', { status: 403, headers })
    try {
      const integrations = await getIntegrations(admin)
      const authorized = integrations.some((integration) =>
        Boolean(integration.verifyToken) && constantTimeEqual(token, integration.verifyToken || '')
      )
      if (!authorized) return new Response('Forbidden', { status: 403, headers })
      return new Response(challenge, { headers: { ...headers, 'Content-Type': 'text/plain' } })
    } catch (error) {
      console.error('meta-whatsapp-webhook verification configuration error', error instanceof Error ? error.message : error)
      return json({ error: 'Não foi possível verificar a configuração Meta por clínica.' }, 503)
    }
  }

  if (request.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405)

  const rawBody = await request.text()
  let body: MetaWebhook
  try {
    body = JSON.parse(rawBody) as MetaWebhook
  } catch {
    return json({ error: 'Payload JSON inválido.' }, 400)
  }
  if (body.object !== 'whatsapp_business_account') return json({ received: true, ignored: true })

  let integrations: IntegrationRow[]
  try {
    integrations = await getIntegrations(admin)
  } catch (error) {
    console.error('meta-whatsapp-webhook integration lookup error', error instanceof Error ? error.message : error)
    return json({ error: 'Não foi possível carregar o roteamento Meta por clínica.' }, 503)
  }

  const candidateSecrets = [...new Set(integrations.map((integration) => integration.appSecret).filter((secret): secret is string => Boolean(secret)))]
  const matchingSecrets: string[] = []
  for (const secret of candidateSecrets) {
    if (await verifySignature(rawBody, request.headers.get('X-Hub-Signature-256'), secret)) matchingSecrets.push(secret)
  }
  if (matchingSecrets.length !== 1) return json({ error: 'Assinatura Meta inválida ou ambígua.' }, 401)
  const signedAppSecret = matchingSecrets[0]

  const routedChanges: Array<{ clinicId: string; entryId: string; change: NonNullable<NonNullable<MetaWebhook['entry']>[number]['changes']>[number] }> = []
  let ignored = 0
  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') {
          ignored++
          continue
        }
        const hasEvents = Boolean(change.value?.messages?.length || change.value?.statuses?.length)
        if (!hasEvents) {
          ignored++
          continue
        }
        const integration = resolveClinicIntegration(integrations, {
          phoneNumberId: change.value?.metadata?.phone_number_id,
          wabaId: entry.id,
        })
        if (integration.appSecret !== signedAppSecret) throw new Error('A assinatura não pertence ao app responsável pelo Phone Number ID recebido.')
        routedChanges.push({ clinicId: integration.clinicId, entryId: entry.id || 'unknown', change })
      }
    }
  } catch (error) {
    console.error('meta-whatsapp-webhook routing rejected', error instanceof Error ? error.message : error)
    return json({ error: error instanceof Error ? error.message : 'Roteamento Meta ambíguo ou desconhecido.' }, 409)
  }

  let processed = 0
  for (const routed of routedChanges) {
    const { change } = routed
    const phoneNumberId = change.value?.metadata?.phone_number_id
    const contacts = change.value?.contacts || []
    for (const message of change.value?.messages || []) {
      const messageId = message.id?.trim()
      const from = message.from?.trim()
      if (!messageId || !from) {
        ignored++
        continue
      }
      const eventId = `meta:${routed.entryId}:${messageId}:inbound`
      const { error } = await admin.rpc('record_meta_whatsapp_inbound', {
        p_event_id: eventId,
        p_clinica_id: routed.clinicId,
        p_phone_number_id: phoneNumberId || null,
        p_from: from,
        p_wa_id: contacts.find((contact) => contact.wa_id === from)?.wa_id || from,
        p_contact_name: contactName(change.value || {}, from),
        p_message_id: messageId,
        p_message_type: message.type || 'unknown',
        p_message_text: incomingMessageText(message),
        p_payload: message,
        p_event_time: eventTime(message.timestamp),
      })
      if (error) {
        console.error('meta-whatsapp-webhook inbound processing error', error.message)
        return json({ error: 'Nao foi possivel registrar a mensagem recebida.' }, 500)
      }
      processed++
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
      const eventId = `meta:${routed.entryId}:${messageId}:${statusName}:${status.timestamp || 'none'}:${errorCode || ''}`
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

  return json({ received: true, processed, ignored })
})
