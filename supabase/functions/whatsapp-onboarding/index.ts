import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Action = 'status' | 'complete'
type SessionInfo = {
  waba_id?: string
  phone_number_id?: string
  business_id?: string
  [key: string]: unknown
}
type PhoneNumber = {
  id?: string
  display_phone_number?: string
  verified_name?: string
}
type IntegrationStatus = {
  clinic_id: string
  app_id: string
  waba_id: string
  phone_number_id: string
  display_phone_number: string | null
  coexistence_enabled: boolean
  onboarding_event: string | null
  onboarding_completed_at: string | null
  access_token_expires_at: string | null
  active: boolean
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || ''
}

function graphVersion() {
  const version = env('META_GRAPH_VERSION') || env('WHATSAPP_GRAPH_VERSION') || 'v23.0'
  return version.startsWith('v') ? version : `v${version}`
}

function requiredServerSecrets() {
  return ['META_APP_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN']
    .filter((name) => !env(name))
}

async function assertAdmin(admin: SupabaseClient, request: Request, clinicId: string) {
  const authorization = request.headers.get('Authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Sua sessão expirou. Entre novamente antes de conectar o WhatsApp.')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) throw new Error('Sua sessão expirou. Entre novamente antes de conectar o WhatsApp.')
  const { data: membership, error } = await admin
    .from('usuarios_clinicas')
    .select('papel')
    .eq('clinica_id', clinicId)
    .eq('perfil_id', userData.user.id)
    .eq('ativo', true)
    .maybeSingle()
  if (error || !membership || !['proprietario', 'administrador'].includes(membership.papel)) {
    throw new Error('Apenas proprietários e administradores podem conectar o WhatsApp.')
  }
}

function normalizeId(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value.trim())) throw new Error(`${label} retornado pela Meta é inválido.`)
  return value.trim()
}

function sessionInfoFromBody(value: unknown): SessionInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as SessionInfo
}

function graphError(body: Record<string, unknown>) {
  const error = body.error as { message?: string; error_user_msg?: string } | string | undefined
  return typeof error === 'string'
    ? error
    : error?.message || error?.error_user_msg || (typeof body.message === 'string' ? body.message : 'A Meta recusou a operação de onboarding.')
}

async function graphRequest<T>(path: string, accessToken: string, init: RequestInit = {}) {
  let response: Response
  try {
    response = await fetch(`https://graph.facebook.com/${graphVersion()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    })
  } catch {
    throw new Error('Não foi possível alcançar a Graph API da Meta.')
  }

  let body: Record<string, unknown>
  try {
    body = await response.json() as Record<string, unknown>
  } catch {
    throw new Error(response.ok ? 'A Meta respondeu sem um resultado legível.' : 'A Meta recusou a operação de onboarding.')
  }
  if (!response.ok) throw new Error(graphError(body))
  return body as T
}

async function exchangeCode(code: string, appId: string, appSecret: string) {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('code', code)
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error('Não foi possível trocar o código do Embedded Signup com a Meta.')
  }
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(graphError(body))
  const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : ''
  if (!accessToken) throw new Error('A Meta não retornou o token de acesso do onboarding.')
  const expiresIn = typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in : null
  return {
    accessToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  }
}

async function getOnboardingStatus(admin: SupabaseClient, clinicId: string) {
  const { data, error } = await admin.rpc('get_meta_whatsapp_onboarding_status', { p_clinic_id: clinicId })
  if (error) throw new Error(`Não foi possível consultar a conexão Meta: ${error.message}`)
  const row = ((data || []) as IntegrationStatus[])[0] || null
  return {
    configured: Boolean(row?.active),
    serverConfigured: requiredServerSecrets().length === 0,
    missingServerSecrets: requiredServerSecrets(),
    integration: row ? {
      appId: row.app_id,
      wabaId: row.waba_id,
      phoneNumberId: row.phone_number_id,
      displayPhoneNumber: row.display_phone_number,
      coexistenceEnabled: row.coexistence_enabled,
      onboardingEvent: row.onboarding_event,
      completedAt: row.onboarding_completed_at,
      accessTokenExpiresAt: row.access_token_expires_at,
      active: row.active,
    } : null,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const supabaseUrl = env('SUPABASE_URL')
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Configuração do Supabase ausente no servidor.' }, 503)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const body = await request.json().catch(() => ({})) as {
    action?: Action
    clinicId?: string
    code?: string
    wabaId?: string
    phoneNumberId?: string
    sessionInfo?: SessionInfo
    sessionEvent?: string
  }
  const action = body.action
  if (!action || !['status', 'complete'].includes(action)) return json({ error: 'Ação de onboarding inválida.' }, 400)

  try {
    if (!body.clinicId) throw new Error('Clínica não informada.')
    await assertAdmin(admin, request, body.clinicId)

    if (action === 'status') return json(await getOnboardingStatus(admin, body.clinicId))

    const missingSecrets = requiredServerSecrets()
    if (missingSecrets.length) return json({ error: `Configure os Secrets da Edge Function: ${missingSecrets.join(', ')}.` }, 503)
    const code = body.code?.trim()
    if (!code) throw new Error('O código temporário da Meta não foi recebido.')

    const appId = env('META_APP_ID')
    const appSecret = env('META_APP_SECRET')
    const verifyToken = env('META_WEBHOOK_VERIFY_TOKEN')
    const sessionInfo = sessionInfoFromBody(body.sessionInfo)
    const wabaId = normalizeId(body.wabaId || sessionInfo.waba_id, 'WABA ID')
    const phoneNumberId = normalizeId(body.phoneNumberId || sessionInfo.phone_number_id, 'Phone Number ID')
    const exchanged = await exchangeCode(code, appId, appSecret)

    const phoneListing = await graphRequest<{ data?: PhoneNumber[] }>(
      `/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`,
      exchanged.accessToken,
    )
    const phone = (phoneListing.data || []).find((item) => item.id === phoneNumberId)
    if (!phone) throw new Error('A Meta não confirmou que o Phone Number ID pertence ao WABA retornado pelo Embedded Signup.')

    const subscription = await graphRequest<{ success?: boolean }>(
      `/${encodeURIComponent(wabaId)}/subscribed_apps`,
      exchanged.accessToken,
      { method: 'POST', body: '{}' },
    )
    if (subscription.success !== true) throw new Error('A Meta não confirmou a assinatura do app à WABA.')

    const { data, error } = await admin.rpc('upsert_meta_whatsapp_integration', {
      p_clinic_id: body.clinicId,
      p_app_id: appId,
      p_waba_id: wabaId,
      p_phone_number_id: phoneNumberId,
      p_display_phone_number: phone.display_phone_number || null,
      p_access_token: exchanged.accessToken,
      p_app_secret: appSecret,
      p_verify_token: verifyToken,
      p_coexistence_enabled: true,
      p_onboarding_event: body.sessionEvent || 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
      p_access_token_expires_at: exchanged.expiresAt,
    })
    if (error) throw new Error(`A conexão Meta foi validada, mas não pôde ser persistida com segurança: ${error.message}`)

    const row = ((data || []) as Array<Record<string, unknown>>)[0] || null
    return json({
      connected: true,
      coexistenceEnabled: true,
      appId,
      wabaId,
      phoneNumberId,
      displayPhoneNumber: phone.display_phone_number || null,
      onboardingEvent: body.sessionEvent || 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
      completedAt: row?.onboarding_completed_at || new Date().toISOString(),
      accessTokenExpiresAt: row?.access_token_expires_at || exchanged.expiresAt,
      webhookUrl: `${supabaseUrl}/functions/v1/meta-whatsapp-webhook`,
      nextStep: 'Confirme no WhatsApp Manager que o callback do webhook está configurado e entregue um evento de teste antes de habilitar automações.',
    })
  } catch (error) {
    console.error('whatsapp-onboarding error', error instanceof Error ? error.message : error)
    return json({ error: error instanceof Error ? error.message : 'Não foi possível concluir o onboarding do WhatsApp.' }, 400)
  }
})

