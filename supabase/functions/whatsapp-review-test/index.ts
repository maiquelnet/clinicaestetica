import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { countTemplateBodyParameters, MetaRequestError, parseTemplateBodyParameters, performAuditedReviewSend, reviewSenderIsAllowed, templateSupportsBodyTextSend } from '../_shared/meta-safety.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Action = 'status' | 'send-test'
type MetaMessageResponse = { messages?: Array<{ id?: string }> }
type ReviewIntegration = {
  appId: string
  wabaId: string
  phoneNumberId: string
  accessToken: string
  appSecret: string
  graphVersion: string
  templateName: string
  templateLanguage: string
  templateBodyParametersJson: string
}

const ALLOWED_RECIPIENT = '5551986603385'
const MANUAL_RECONCILIATION_STATUSES = new Set([
  'pending',
  'outcome_unknown',
  'accepted_unreconciled',
  'accepted_audit_update_failed',
])

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
  const version = env('WHATSAPP_REVIEW_GRAPH_VERSION')
  return version.startsWith('v') ? version : `v${version}`
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const normalized = digits.startsWith('00') ? digits.slice(2) : digits
  if (normalized !== ALLOWED_RECIPIENT) {
    throw new Error('O teste de App Review está restrito ao destinatário autorizado +55 51 98660-3385.')
  }
  return normalized
}

function missingSecrets() {
  return [
    'WHATSAPP_REVIEW_ACCESS_TOKEN',
    'WHATSAPP_REVIEW_APP_ID',
    'WHATSAPP_REVIEW_APP_SECRET',
    'WHATSAPP_REVIEW_WABA_ID',
    'WHATSAPP_REVIEW_PHONE_NUMBER_ID',
    'WHATSAPP_REVIEW_GRAPH_VERSION',
    'WHATSAPP_REVIEW_TEMPLATE_NAME',
    'WHATSAPP_REVIEW_TEMPLATE_LANGUAGE',
    'WHATSAPP_REVIEW_TEMPLATE_PARAMETERS_JSON',
  ].filter((name) => !env(name))
}

function reviewIntegration(): ReviewIntegration {
  return {
    appId: env('WHATSAPP_REVIEW_APP_ID'),
    appSecret: env('WHATSAPP_REVIEW_APP_SECRET'),
    wabaId: env('WHATSAPP_REVIEW_WABA_ID'),
    phoneNumberId: env('WHATSAPP_REVIEW_PHONE_NUMBER_ID'),
    accessToken: env('WHATSAPP_REVIEW_ACCESS_TOKEN'),
    graphVersion: graphVersion(),
    templateName: env('WHATSAPP_REVIEW_TEMPLATE_NAME'),
    templateLanguage: env('WHATSAPP_REVIEW_TEMPLATE_LANGUAGE'),
    templateBodyParametersJson: env('WHATSAPP_REVIEW_TEMPLATE_PARAMETERS_JSON'),
  }
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

async function graphRequest(integration: ReviewIntegration, path: string, init: RequestInit = {}, appAccessToken?: string) {
  let response: Response
  try {
    response = await fetch(`https://graph.facebook.com/${integration.graphVersion}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${appAccessToken || integration.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    })
  } catch {
    throw new MetaRequestError('Não foi possível confirmar a resposta da Meta; o resultado pode ser incerto.', 'unknown')
  }

  let body: Record<string, unknown>
  try {
    body = await response.json() as Record<string, unknown>
  } catch {
    if (response.ok) throw new MetaRequestError('A Meta respondeu sem um resultado legível; reconciliação necessária.', 'unknown', response.status)
    body = {}
  }

  if (!response.ok) {
    const error = body.error as { message?: string; error_user_msg?: string } | string | undefined
    const message = typeof error === 'string' ? error : error?.message || error?.error_user_msg
    throw new MetaRequestError(message || 'A Meta recusou a chamada de homologação.', 'rejected', response.status)
  }
  return body
}

async function verifyReviewBinding(integration: ReviewIntegration) {
  const issues: string[] = []
  let tokenAppId: string | null = null
  let tokenValid = false
  let messagingPermission = false
  let managementPermission = false
  let phoneInWaba = false
  let displayPhoneNumber: string | null = null
  let templateVerified = false
  let templateStatus: string | null = null
  let expectedBodyParameterCount: number | null = null
  let configuredBodyParameterCount: number | null = null
  let templateStructureSupported = false

  const reviewSenderAllowed = reviewSenderIsAllowed(integration.wabaId, integration.phoneNumberId)
  if (!reviewSenderAllowed) {
    issues.push('O remetente de revisão não pode usar o WABA ou o Phone Number ID real da clínica.')
  }

  try {
    const debug = await graphRequest(
      integration,
      `/debug_token?input_token=${encodeURIComponent(integration.accessToken)}`,
      { method: 'GET' },
      `${integration.appId}|${integration.appSecret}`,
    ) as { data?: { app_id?: string; is_valid?: boolean; scopes?: string[] } }
    tokenAppId = debug.data?.app_id || null
    tokenValid = debug.data?.is_valid === true
    messagingPermission = debug.data?.scopes?.includes('whatsapp_business_messaging') === true
    managementPermission = debug.data?.scopes?.includes('whatsapp_business_management') === true
  } catch {
    issues.push('A Meta não confirmou a qual App ID pertence o token de teste.')
  }

  if (tokenAppId !== integration.appId) issues.push('O App ID do token não corresponde ao App ID configurado para a revisão.')
  if (!tokenValid) issues.push('O token de teste não foi confirmado como válido pela Meta.')
  if (!messagingPermission) issues.push('O token de teste não confirmou a permissão whatsapp_business_messaging.')
  if (!managementPermission) issues.push('O token de teste não confirmou a permissão whatsapp_business_management.')

  try {
    const listing = await graphRequest(
      integration,
      `/${encodeURIComponent(integration.wabaId)}/phone_numbers?fields=id,display_phone_number&limit=100`,
      { method: 'GET' },
    ) as { data?: Array<{ id?: string; display_phone_number?: string }> }
    const sender = listing.data?.find((phone) => phone.id === integration.phoneNumberId)
    phoneInWaba = Boolean(sender)
    displayPhoneNumber = sender?.display_phone_number || null
  } catch {
    issues.push('A Meta não confirmou que o remetente de teste pertence ao WABA configurado.')
  }
  if (!phoneInWaba) issues.push('O Phone Number ID de teste não foi encontrado no WABA configurado.')

  let configuredParameters: string[] = []
  try {
    configuredParameters = parseTemplateBodyParameters(integration.templateBodyParametersJson)
    configuredBodyParameterCount = configuredParameters.length
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'Os parâmetros do modelo de teste são inválidos.')
  }

  try {
    const listing = await graphRequest(
      integration,
      `/${encodeURIComponent(integration.wabaId)}/message_templates?name=${encodeURIComponent(integration.templateName)}&fields=name,language,status,category,components&limit=100`,
      { method: 'GET' },
    ) as { data?: Array<{ name?: string; language?: string; status?: string; components?: Array<{ type?: string; format?: string; text?: string; buttons?: Array<{ type?: string; url?: string }> }> }> }
    const template = listing.data?.find((item) => item.name === integration.templateName && item.language === integration.templateLanguage)
    templateStatus = template?.status || null
    const bodyText = template?.components?.find((component) => component.type === 'BODY')?.text || ''
    expectedBodyParameterCount = countTemplateBodyParameters(bodyText)
    templateStructureSupported = templateSupportsBodyTextSend(template?.components || [])
    templateVerified = Boolean(template && template.status === 'APPROVED' && expectedBodyParameterCount === configuredBodyParameterCount && templateStructureSupported)
    if (!template) issues.push('A Meta não encontrou o modelo com esse nome e idioma neste WABA; confira a tradução exata.')
    else if (template.status !== 'APPROVED') issues.push(`O modelo está com status ${template.status || 'desconhecido'}, não APPROVED.`)
    if (template && expectedBodyParameterCount !== configuredBodyParameterCount) {
      issues.push(`O modelo exige ${expectedBodyParameterCount} parâmetro(s) no corpo, mas foram configurados ${configuredBodyParameterCount ?? 'parâmetros inválidos'}.`)
    }
    if (template && !templateStructureSupported) {
      issues.push('Este teste exige um corpo de texto; aceita cabeçalho textual estático e botões URL estáticos/telefone, mas bloqueia mídia, cabeçalho variável, resposta rápida e componentes não suportados.')
    }
  } catch {
    issues.push('A Meta não confirmou o modelo, idioma e parâmetros no WABA configurado.')
  }

  return {
    verified: tokenAppId === integration.appId && tokenValid && messagingPermission && managementPermission && phoneInWaba && templateVerified && reviewSenderAllowed,
    tokenAppId,
    tokenValid,
    messagingPermission,
    managementPermission,
    phoneInWaba,
    displayPhoneNumber,
    templateVerified,
    templateStatus,
    templateStructureSupported,
    expectedBodyParameterCount,
    configuredBodyParameterCount,
    issues,
  }
}

async function sendReviewTemplate(integration: ReviewIntegration, recipient: string) {
  const parameters = parseTemplateBodyParameters(integration.templateBodyParametersJson)
  return graphRequest(integration, `/${encodeURIComponent(integration.phoneNumberId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: integration.templateName,
        language: { code: integration.templateLanguage },
        ...(parameters.length ? { components: [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }] } : {}),
      },
    }),
  }) as Promise<MetaMessageResponse>
}

async function getLatestTest(admin: SupabaseClient, clinicId: string) {
  const { data, error } = await admin
    .from('whatsapp_testes')
    .select('id,destinatario,provider_status,provider_message_id,meta_message_id,erro,criado_em')
    .eq('clinica_id', clinicId)
    .eq('provider', 'meta_review_sandbox')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
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
    const latestTest = await getLatestTest(admin, body.clinicId)
    const manualCheckRequired = Boolean(latestTest && MANUAL_RECONCILIATION_STATUSES.has(latestTest.provider_status))
    const integration = reviewIntegration()
    const binding = missing.length === 0 ? await verifyReviewBinding(integration) : null

    if (action === 'status') {
      return json({
        environment: 'meta_review_sandbox',
        configured: missing.length === 0,
        sendReady: missing.length === 0 && binding?.verified === true && !manualCheckRequired,
        missingSecrets: missing,
        integration: {
          appId: integration.appId || null,
          wabaId: integration.wabaId || null,
          phoneNumberId: integration.phoneNumberId || null,
          templateName: integration.templateName || null,
          templateLanguage: integration.templateLanguage || null,
          bindingVerifiedByMeta: binding?.verified === true,
          senderPhoneNumber: binding?.displayPhoneNumber || null,
          templateVerified: binding?.templateVerified === true,
          templateStatus: binding?.templateStatus || null,
          templateStructureSupported: binding?.templateStructureSupported === true,
          expectedBodyParameterCount: binding?.expectedBodyParameterCount ?? null,
          configuredBodyParameterCount: binding?.configuredBodyParameterCount ?? null,
          verificationIssues: binding?.issues || [],
        },
        allowedRecipient: '+55 51 98660-3385',
        manualCheckRequired,
        lastTest: latestTest ? {
          id: latestTest.id,
          recipient: latestTest.destinatario,
          status: latestTest.provider_status,
          messageId: latestTest.provider_message_id || latestTest.meta_message_id,
          error: latestTest.erro,
          createdAt: latestTest.criado_em,
        } : null,
      })
    }

    if (missing.length) return json({ error: `Configure no Supabase Edge Function Secrets: ${missing.join(', ')}.` }, 503)
    if (binding?.verified !== true) return json({ error: 'A Meta não confirmou o vínculo entre App ID, token, WABA e remetente de teste. Nenhuma mensagem foi enviada.', verificationIssues: binding?.issues || [] }, 409)
    if (manualCheckRequired) return json({ error: 'O teste anterior pode ter sido aceito pela Meta. Confira o WhatsApp e a auditoria antes de tentar novamente.', lastTestId: latestTest?.id, lastTestStatus: latestTest?.provider_status }, 409)
    if (!body.recipient) return json({ error: 'Informe o destinatário autorizado para o teste.' }, 400)

    const recipient = normalizePhone(body.recipient)
    const testId = crypto.randomUUID()
    const result = await performAuditedReviewSend({
      createAudit: async () => {
        const { data, error } = await admin.from('whatsapp_testes').insert({
          id: testId,
          clinica_id: body.clinicId,
          destinatario: recipient,
          provider: 'meta_review_sandbox',
          provider_status: 'pending',
        }).select('id').maybeSingle()
        if (error || !data?.id) throw new Error(error?.message || 'Não foi possível criar o registro de auditoria antes do envio.')
      },
      send: async () => {
        const response = await sendReviewTemplate(integration, recipient)
        return { messageId: response.messages?.[0]?.id || null }
      },
      persistAccepted: async (messageId) => {
        const status = messageId ? 'accepted' : 'accepted_unreconciled'
        const { data, error } = await admin.from('whatsapp_testes').update({
          provider_message_id: messageId,
          meta_message_id: messageId,
          provider_status: status,
          erro: messageId ? null : 'A Meta aceitou a chamada, mas não retornou WAMID; reconciliação necessária.',
          atualizado_em: new Date().toISOString(),
        }).eq('id', testId).select('id').maybeSingle()
        if (error || !data?.id) throw new Error(error?.message || 'A atualização da auditoria não confirmou o registro.')
      },
      persistRejected: async (detail) => {
        const { data, error } = await admin.from('whatsapp_testes').update({
          provider_status: 'rejected', erro: detail, atualizado_em: new Date().toISOString(),
        }).eq('id', testId).select('id').maybeSingle()
        if (error || !data?.id) throw new Error(error?.message || 'A auditoria da rejeição não foi confirmada.')
      },
      persistUnknown: async (detail) => {
        const { data, error } = await admin.from('whatsapp_testes').update({
          provider_status: 'outcome_unknown', erro: detail, atualizado_em: new Date().toISOString(),
        }).eq('id', testId).select('id').maybeSingle()
        if (error || !data?.id) throw new Error(error?.message || 'A auditoria do resultado incerto não foi confirmada.')
      },
    })

    if (result.outcome === 'not_sent') {
      return json({ ...result, testId: null, provider: 'meta_review_sandbox' }, 500)
    }
    if (result.outcome === 'accepted' && result.auditPersisted && result.messageId) {
      return json({ ...result, sent: true, testId, provider: 'meta_review_sandbox' })
    }

    console.error('whatsapp-review-test outcome', { testId, outcome: result.outcome, auditPersisted: result.auditPersisted })
    return json({ ...result, sent: result.outcome === 'accepted', testId, provider: 'meta_review_sandbox' }, result.outcome === 'accepted' || result.outcome === 'unknown' ? 202 : 502)
  } catch (error) {
    console.error('whatsapp-review-test error', error instanceof Error ? error.message : error)
    return json({ error: error instanceof Error ? error.message : 'Não foi possível concluir o teste da Meta.' }, 400)
  }
})
