import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Action = 'status' | 'send-test'

function env(name: string) {
  return Deno.env.get(name)?.trim() || ''
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function graphVersion() {
  const version = env('WHATSAPP_REVIEW_GRAPH_VERSION') || 'v23.0'
  return version.startsWith('v') ? version : `v${version}`
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  let normalized = digits.startsWith('00') ? digits.slice(2) : digits
  if (normalized.length < 8 || normalized.length > 15) {
    throw new Error('Informe o destinatário em formato internacional E.164.')
  }
  if ((normalized.length === 10 || normalized.length === 11) && !normalized.startsWith('55')) normalized = `55${normalized}`
  return normalized
}

function missingSecrets() {
  return ['WHATSAPP_REVIEW_ACCESS_TOKEN', 'WHATSAPP_REVIEW_PHONE_NUMBER_ID']
    .filter((name) => !env(name))
}

async function assertAdmin(admin: SupabaseClient, request: Request, clinicId: string) {
  const authorization = request.headers.get('Authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.')

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) throw new Error('Sua sessão expirou. Entre novamente.')

  const { data: membership, error } = await admin
    .from('usuarios_clinicas')
    .select('papel')
    .eq('clinica_id', clinicId)
    .eq('perfil_id', userData.user.id)
    .eq('ativo', true)
    .maybeSingle()

  if (error || !membership || !['proprietario', 'administrador'].includes(membership.papel)) {
    throw new Error('Apenas proprietários e administradores podem executar o teste.')
  }
}

async function graphRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env('WHATSAPP_REVIEW_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const error = body.error as { message?: string; error_user_msg?: string } | string | undefined
    const message = typeof error === 'string' ? error : error?.message || error?.error_user_msg
    throw new Error(message || 'A Meta recusou a chamada de homologação.')
  }
  return body
}

async function sendReviewTemplate(recipient: string) {
  const templateName = env('WHATSAPP_REVIEW_TEMPLATE_NAME') || 'hello_world'
  const language = env('WHATSAPP_REVIEW_TEMPLATE_LANGUAGE') || 'en_US'

  return graphRequest(`/${encodeURIComponent(env('WHATSAPP_REVIEW_PHONE_NUMBER_ID'))}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(recipient),
      type: 'template',
      template: { name: templateName, language: { code: language } },
    }),
  }) as Promise<{ messages?: Array<{ id?: string }> }>
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const supabaseUrl = env('SUPABASE_URL')
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Configuração do Supabase ausente no servidor.' }, 503)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const body = await request.json().catch(() => ({})) as { action?: Action; clinicId?: string; recipient?: string }
  const action = body.action

  if (!action || !['status', 'send-test'].includes(action)) return json({ error: 'Ação de homologação inválida.' }, 400)
  if (!body.clinicId) return json({ error: 'Clínica não informada.' }, 400)

  try {
    await assertAdmin(admin, request, body.clinicId)
    const missing = missingSecrets()

    if (action === 'status') {
      return json({
        environment: 'meta_review_sandbox',
        configured: missing.length === 0,
        sendReady: missing.length === 0,
        missingSecrets: missing,
        senderConfigured: Boolean(env('WHATSAPP_REVIEW_PHONE_NUMBER_ID')),
        template: {
          name: env('WHATSAPP_REVIEW_TEMPLATE_NAME') || 'hello_world',
          language: env('WHATSAPP_REVIEW_TEMPLATE_LANGUAGE') || 'en_US',
        },
      })
    }

    if (missing.length) return json({ error: `Configure no Supabase Edge Function Secrets: ${missing.join(', ')}.` }, 503)
    if (!body.recipient) return json({ error: 'Informe o número autorizado para o teste.' }, 400)

    const recipient = normalizePhone(body.recipient)
    const testId = crypto.randomUUID()
    await admin.from('whatsapp_testes').insert({
      id: testId,
      clinica_id: body.clinicId,
      destinatario: recipient,
      provider: 'meta_review_sandbox',
      provider_status: 'pending',
    })

    try {
      const response = await sendReviewTemplate(recipient)
      const messageId = response.messages?.[0]?.id || null
      if (!messageId) throw new Error('A Meta aceitou a chamada, mas não retornou o WAMID.')

      await admin.from('whatsapp_testes').update({
        provider_message_id: messageId,
        meta_message_id: messageId,
        provider_status: 'accepted',
        atualizado_em: new Date().toISOString(),
      }).eq('id', testId)

      return json({ sent: true, status: 'accepted', provider: 'meta_review_sandbox', testId, messageId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no teste da Meta.'
      await admin.from('whatsapp_testes').update({
        provider_status: 'transport_error',
        erro: message,
        atualizado_em: new Date().toISOString(),
      }).eq('id', testId)
      throw error
    }
  } catch (error) {
    console.error('whatsapp-review-test error', error instanceof Error ? error.message : error)
    return json({ error: error instanceof Error ? error.message : 'Não foi possível concluir o teste da Meta.' }, 400)
  }
})
