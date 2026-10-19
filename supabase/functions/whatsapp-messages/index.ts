import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { MetaRequestError, appointmentMaySend, queueFailureDisposition, type ClinicMetaIntegration } from '../_shared/meta-safety.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-whatsapp-cron-secret',
}

type Action = 'status' | 'send-test' | 'validate-template' | 'process'
type Template = { id: string; tipo: string; nome: string; texto: string; ativo: boolean; prioridade: number; whatsapp_template_name: string | null; whatsapp_template_language: string | null }
type Rule = { id: string; modelo_mensagem_id: string; gatilho: string; quantidade: number | null; unidade: string | null; direcao: string | null; canal_padrao: string; ativo: boolean }
type Appointment = { id: string; cliente_id: string; servico_id: string | null; inicio_em: string; criado_em: string; status: string }
type Client = { id: string; nome: string; telefone: string; whatsapp_opt_in_status: string; ativo: boolean }
type Service = { id: string; nome: string }
type QueueItem = { id: string; modelo_mensagem_id: string; cliente_id: string; agendamento_id: string | null; ciclo: string; payload: Record<string, string>; tentativas: number }
type MetaMessageResponse = { messages?: Array<{ id?: string }> }
type OutboundIntegrationRow = ClinicMetaIntegration & {
  clinic_id: string
  app_id: string
  waba_id: string
  phone_number_id: string
  access_token: string | null
}
type OutboundIntegration = { clinicId: string; appId: string; wabaId: string; phoneNumberId: string; accessToken: string }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function env(name: string) { return Deno.env.get(name)?.trim() || '' }

function graphVersion() {
  const version = env('WHATSAPP_GRAPH_VERSION') || 'v23.0'
  return version.startsWith('v') ? version : `v${version}`
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  let normalized = digits.startsWith('00') ? digits.slice(2) : digits
  if (normalized.length < 8 || normalized.length > 15) throw new Error('Informe um telefone em formato internacional E.164, por exemplo +5511999999999.')
  // A base aceita telefones brasileiros sem DDI; converta-os antes de chamar a Meta.
  if ((normalized.length === 10 || normalized.length === 11) && !normalized.startsWith('55')) normalized = `55${normalized}`
  return normalized
}

function dateValue(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date)
}

function timeValue(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function templateParameters(templateText: string, values: Record<string, string>) {
  const matches = [...templateText.matchAll(/\{\{?\s*([a-z0-9_]+)\s*\}?\}/gi)]
  return matches.map((match, index) => {
    const name = match[1]?.toLowerCase() || ''
    return { type: 'text', text: values[name] ?? values[String(index + 1)] ?? '' }
  })
}

async function graphRequest(integration: OutboundIntegration, path: string, init: RequestInit = {}, onRequestStart?: () => void) {
  let response: Response
  try {
    onRequestStart?.()
    response = await fetch(`https://graph.facebook.com/${graphVersion()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${integration.accessToken}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    })
  } catch {
    throw new MetaRequestError('A conexão caiu antes de confirmar o resultado da Meta; reconciliação necessária.', 'unknown')
  }
  let body: Record<string, unknown>
  try {
    body = await response.json() as Record<string, unknown>
  } catch {
    if (response.ok) throw new MetaRequestError('A Meta aceitou a chamada HTTP, mas não retornou uma resposta legível; reconciliação necessária.', 'unknown', response.status)
    body = {}
  }
  if (!response.ok) {
    const error = body.error as { message?: string; error_user_msg?: string } | string | undefined
    const message = typeof error === 'string' ? error : error?.message
    throw new MetaRequestError(message || (typeof error === 'object' ? error?.error_user_msg : '') || (typeof body.message === 'string' ? body.message : 'A Meta recusou a chamada do WhatsApp.'), 'rejected', response.status)
  }
  return body
}

async function sendTemplate(integration: OutboundIntegration, phone: string, template: Template, values: Record<string, string>, onRequestStart?: () => void) {
  if (!template.whatsapp_template_name) throw new Error(`O modelo ${template.nome} nao possui nome aprovado na Meta.`)
  const bodyParameters = templateParameters(template.texto, values)
  const components = bodyParameters.length ? [{ type: 'body', parameters: bodyParameters }] : undefined
  return graphRequest(integration, `/${encodeURIComponent(integration.phoneNumberId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(phone),
      type: 'template',
      template: { name: template.whatsapp_template_name, language: { code: template.whatsapp_template_language || 'pt_BR' }, ...(components ? { components } : {}) },
    }),
  }, onRequestStart)
}

async function loadClinicIntegration(admin: SupabaseClient, clinicId: string) {
  const { data, error } = await admin.rpc('get_meta_whatsapp_outbound_integrations')
  if (error) return { integration: null, missing: ['get_meta_whatsapp_outbound_integrations'], error: error.message }
  const rows = ((data || []) as OutboundIntegrationRow[]).filter((row) => row.clinic_id === clinicId && row.active !== false)
  if (rows.length > 1) return { integration: null, missing: ['associação Meta ambígua para a clínica'], error: 'Mais de uma integração Meta ativa foi encontrada para a clínica.' }
  if (!rows.length) return { integration: null, missing: ['integração Meta por clínica no Vault'], error: null }
  const row = rows[0]
  const missing = [
    !row.app_id && 'App ID',
    !row.waba_id && 'WABA ID',
    !row.phone_number_id && 'Phone Number ID',
    !row.access_token && 'token Meta no Vault',
  ].filter((field): field is string => Boolean(field))
  if (missing.length) return { integration: null, missing, error: null }
  return {
    integration: {
      clinicId: row.clinic_id,
      appId: row.app_id,
      wabaId: row.waba_id,
      phoneNumberId: row.phone_number_id,
      accessToken: row.access_token!,
    } satisfies OutboundIntegration,
    missing: [],
    error: null,
  }
}

async function assertAdmin(admin: SupabaseClient, request: Request, clinicId: string) {
  const authorization = request.headers.get('Authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Sua sessao expirou. Entre novamente antes de configurar o WhatsApp.')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) throw new Error('Sua sessao expirou. Entre novamente antes de configurar o WhatsApp.')
  const { data: membership, error } = await admin.from('usuarios_clinicas').select('papel').eq('clinica_id', clinicId).eq('perfil_id', userData.user.id).eq('ativo', true).maybeSingle()
  if (error || !membership || !['proprietario', 'administrador'].includes(membership.papel)) throw new Error('Apenas proprietarios e administradores podem configurar o WhatsApp.')
}

function dueAt(base: string, rule: Rule) {
  const date = new Date(base)
  const amount = Number(rule.quantidade || 0)
  const direction = rule.direcao === 'antes' ? -1 : 1
  if (rule.unidade === 'dias') date.setDate(date.getDate() + direction * amount)
  else date.setHours(date.getHours() + direction * amount)
  return date
}

async function processMessages(admin: SupabaseClient, clinicId: string, integration: OutboundIntegration) {
  const [rulesResult, appointmentsResult, clientsResult, servicesResult, templatesResult, logsResult, dismissedResult, clinicResult] = await Promise.all([
    admin.from('regras_mensagens').select('*').eq('clinica_id', clinicId).eq('ativo', true).eq('canal_padrao', 'whatsapp_business'),
    admin.from('agendamentos').select('id,cliente_id,servico_id,inicio_em,criado_em,status').eq('clinica_id', clinicId).is('arquivado_em', null).order('inicio_em').limit(500),
    admin.from('clientes').select('id,nome,telefone,whatsapp_opt_in_status,ativo').eq('clinica_id', clinicId).eq('ativo', true).is('arquivado_em', null),
    admin.from('servicos').select('id,nome').eq('clinica_id', clinicId).is('arquivado_em', null),
    admin.from('modelos_mensagens').select('id,tipo,nome,texto,ativo,prioridade,whatsapp_template_name,whatsapp_template_language').eq('clinica_id', clinicId).eq('ativo', true).is('arquivado_em', null),
    admin.from('logs_mensagens').select('ciclo,status').eq('clinica_id', clinicId).eq('canal', 'whatsapp_business').eq('status', 'enviado').order('criado_em', { ascending: false }).limit(2000),
    admin.from('mensagens_dispensadas').select('ciclo').eq('clinica_id', clinicId).order('dispensado_em', { ascending: false }).limit(2000),
    admin.from('clinicas').select('link_google_avaliacao').eq('id', clinicId).maybeSingle(),
  ])
  const resultError = [rulesResult, appointmentsResult, clientsResult, servicesResult, templatesResult, logsResult, dismissedResult, clinicResult].find((result) => result.error)?.error
  if (resultError) throw resultError
  const rules = (rulesResult.data || []) as Rule[]
  const appointments = (appointmentsResult.data || []) as Appointment[]
  const clients = new Map((clientsResult.data || [] as Client[]).map((client) => [client.id, client as Client]))
  const services = new Map((servicesResult.data || [] as Service[]).map((service) => [service.id, service as Service]))
  const templates = new Map((templatesResult.data || [] as Template[]).map((template) => [template.id, template as Template]))
  const sent = new Set((logsResult.data || []).map((log) => log.ciclo).filter(Boolean))
  const dismissed = new Set((dismissedResult.data || []).map((item) => item.ciclo).filter(Boolean))
  const link = clinicResult.data?.link_google_avaliacao || ''
  const now = new Date()
  const queueRows: Array<Record<string, unknown>> = []
  let skipped = 0

  for (const rule of rules) {
    const template = templates.get(rule.modelo_mensagem_id)
    if (!template) continue
    for (const appointment of appointments) {
      if (!['agendamento_criado', 'inicio_agendamento'].includes(rule.gatilho)) continue
      const client = clients.get(appointment.cliente_id)
      if (appointment.status === 'cancelado' || !client || client.whatsapp_opt_in_status !== 'aceito') { skipped++; continue }
      const base = rule.gatilho === 'agendamento_criado' ? appointment.criado_em : appointment.inicio_em
      const due = dueAt(base, rule)
      if (now < due) continue
      const cycle = `${template.tipo}:agendamento:${appointment.id}`
      if (sent.has(cycle) || dismissed.has(cycle)) continue
      const appointmentDate = new Date(appointment.inicio_em)
      const values = {
        nome: client.nome,
        data: dateValue(appointmentDate),
        hora: timeValue(appointmentDate),
        servico: services.get(appointment.servico_id || '')?.nome || 'atendimento',
        link_avaliacao_google: link,
        campanha: 'esta campanha',
        '1': client.nome,
        '2': dateValue(appointmentDate),
        '3': timeValue(appointmentDate),
        '4': services.get(appointment.servico_id || '')?.nome || 'atendimento',
        '5': link,
      }
      queueRows.push({ clinica_id: clinicId, cliente_id: client.id, agendamento_id: appointment.id, modelo_mensagem_id: template.id, canal: 'whatsapp_business', tipo: template.tipo, ciclo: cycle, payload: values, provider: 'meta' })
    }
  }

  if (queueRows.length) {
    const { error } = await admin.from('fila_mensagens').upsert(queueRows, { onConflict: 'clinica_id,canal,ciclo', ignoreDuplicates: true })
    if (error) throw error
  }

  const { data: claimed, error: claimError } = await admin.rpc('claim_whatsapp_message_queue', { p_clinica_id: clinicId, p_limit: 25 })
  if (claimError) throw claimError
  const queue = (claimed || []) as QueueItem[]
  let sentCount = 0; let failed = 0
  for (const item of queue) {
    const template = templates.get(item.modelo_mensagem_id)
    let requestStarted = false
    try {
      if (!template) throw new Error('Modelo de mensagem nao encontrado ou inativo.')
      const client = clients.get(item.cliente_id)
      if (!client) throw new Error('Cliente nao encontrado ou inativo.')

      let appointmentStatus: string | null = null
      if (item.agendamento_id) {
        const { data: appointment, error: appointmentError } = await admin
          .from('agendamentos')
          .select('status')
          .eq('id', item.agendamento_id)
          .eq('clinica_id', clinicId)
          .maybeSingle()
        if (appointmentError) throw appointmentError
        appointmentStatus = appointment?.status || null
      }
      const appointmentCanSend = appointmentMaySend(item.agendamento_id, appointmentStatus)
      if (!appointmentCanSend || client.whatsapp_opt_in_status !== 'aceito') {
        const { data: canceled, error: cancelError } = await admin
          .from('fila_mensagens')
          .update({ status: 'cancelado', processando_em: null, atualizado_em: new Date().toISOString() })
          .eq('id', item.id)
          .eq('status', 'processando')
          .select('id')
          .maybeSingle()
        if (cancelError || !canceled?.id) throw cancelError || new Error('Não foi possível cancelar o item da fila antes do envio.')
        skipped++
        continue
      }

      const response = await sendTemplate(integration, client.telefone, template, item.payload || {}, () => { requestStarted = true }) as MetaMessageResponse
      const metaMessageId = response.messages?.[0]?.id || null
      const acceptedAt = new Date().toISOString()
      const acceptedDescription = metaMessageId
        ? `Meta WAMID: ${metaMessageId}; aceite pela Cloud API.`
        : 'A Meta aceitou a solicitação, mas não retornou WAMID; reconciliação necessária.'

      const { error: logError } = await admin.from('logs_mensagens').insert({
        clinica_id: clinicId,
        cliente_id: client.id,
        agendamento_id: item.agendamento_id,
        modelo_mensagem_id: template.id,
        fila_mensagem_id: item.id,
        canal: 'whatsapp_business',
        texto: template.texto,
        ciclo: item.ciclo,
        status: 'enviado',
        enviado_em: acceptedAt,
        provider: 'meta',
        provider_message_id: metaMessageId,
        meta_message_id: metaMessageId,
        provider_status: metaMessageId ? 'accepted' : 'accepted_unreconciled',
        observacao: acceptedDescription,
      })
      if (logError) {
        await markQueueForReconciliation(admin, item, metaMessageId, acceptedAt, `Meta aceitou a mensagem, mas o log não foi persistido: ${logError.message}`)
        failed++
        continue
      }

      if (!metaMessageId) {
        await markQueueForReconciliation(admin, item, null, acceptedAt, acceptedDescription)
        failed++
        continue
      }

      const { error: completeError } = await admin.rpc('complete_whatsapp_message_queue', { p_id: item.id, p_meta_message_id: metaMessageId })
      if (completeError) {
        await markQueueForReconciliation(admin, item, metaMessageId, acceptedAt, `Meta aceitou, mas a conclusão da fila falhou: ${completeError.message}`)
        failed++
        continue
      }

      const { error: metadataError } = await admin.from('fila_mensagens').update({
        provider: 'meta',
        provider_message_id: metaMessageId,
        provider_status: 'accepted',
        provider_updated_at: acceptedAt,
        atualizado_em: acceptedAt,
      }).eq('id', item.id).eq('status', 'enviado')
      if (metadataError) {
        await markQueueForReconciliation(admin, item, metaMessageId, acceptedAt, `Meta aceitou, mas os metadados da fila falharam: ${metadataError.message}`)
        failed++
        continue
      }
      sentCount++
    } catch (error) {
      failed++
      const message = error instanceof Error ? error.message : 'Falha de transporte ao enviar pela Meta Cloud API.'
      const certainty = error instanceof MetaRequestError ? error.certainty : null
      const disposition = queueFailureDisposition({
        requestStarted,
        definitiveRejection: certainty === 'rejected',
      })
      if (disposition === 'reconcile') {
        await markQueueForReconciliation(admin, item, null, new Date().toISOString(), message, certainty === 'rejected' ? 'rejected' : 'outcome_unknown')
      } else {
        const { error: failError } = await admin.rpc('fail_whatsapp_message_queue', { p_id: item.id, p_error: message, p_retry_seconds: 300 })
        if (failError) console.error('whatsapp-messages queue failure update failed', failError.message)
      }
      const client = clients.get(item.cliente_id)
      if (client && templates.get(item.modelo_mensagem_id)) {
        const { error: logError } = await admin.from('logs_mensagens').insert({ clinica_id: clinicId, cliente_id: client.id, agendamento_id: item.agendamento_id, modelo_mensagem_id: item.modelo_mensagem_id, fila_mensagem_id: item.id, canal: 'whatsapp_business', texto: templates.get(item.modelo_mensagem_id)?.texto || '', ciclo: item.ciclo, status: 'erro', provider: 'meta', provider_status: disposition === 'reconcile' ? 'outcome_unknown' : 'rejected_or_preflight_error', observacao: message })
        if (logError) console.error('whatsapp-messages error log persistence failed', logError.message)
      }
    }
  }
  return { enqueued: queueRows.length, processed: queue.length, sent: sentCount, failed, skipped }
}

async function markQueueForReconciliation(
  admin: SupabaseClient,
  item: QueueItem,
  messageId: string | null,
  occurredAt: string,
  detail: string,
  providerStatus = 'accepted_persistence_pending',
) {
  const { data, error } = await admin.from('fila_mensagens').update({
    status: 'reconciliacao',
    provider: 'meta',
    provider_message_id: messageId,
    meta_message_id: messageId,
    provider_status: providerStatus,
    provider_updated_at: occurredAt,
    processando_em: null,
    ultimo_erro: detail.slice(0, 2000),
    atualizado_em: occurredAt,
  }).eq('id', item.id).in('status', ['processando', 'enviado']).select('id').maybeSingle()
  if (error || !data?.id) console.error('whatsapp-messages reconciliation marker failed', { queueId: item.id, error: error?.message || 'fila não atualizada' })
  return !error && Boolean(data?.id)
}

async function getSchedulerStatus(admin: SupabaseClient) {
  const fallback = { cronActive: false, vaultConfigured: false, lastRunStatus: null, lastRunAt: null }
  const { data, error } = await admin.rpc('get_whatsapp_worker_status')
  if (error || !data || typeof data !== 'object') return fallback
  const status = data as { cronActive?: boolean; vaultConfigured?: boolean; lastRunStatus?: string | null; lastRunAt?: string | null }
  return { cronActive: status.cronActive === true, vaultConfigured: status.vaultConfigured === true, lastRunStatus: status.lastRunStatus || null, lastRunAt: status.lastRunAt || null }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405)
  const supabaseUrl = env('SUPABASE_URL'); const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Configuracao do Supabase ausente no servidor.' }, 503)
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const body = await request.json().catch(() => ({})) as { action?: Action; clinicId?: string; recipient?: string; templateName?: string; language?: string }
  const action = body.action
  if (!action || !['status', 'send-test', 'validate-template', 'process'].includes(action)) return json({ error: 'Acao do WhatsApp invalida.' }, 400)
  const cronAction = action === 'process'
  const cronAuthorized = cronAction && Boolean(env('WHATSAPP_CRON_SECRET')) && request.headers.get('x-whatsapp-cron-secret') === env('WHATSAPP_CRON_SECRET')
  try {
    if (action === 'process' && !cronAuthorized) throw new Error('Processamento automatico nao autorizado.')
    if (!body.clinicId) throw new Error('Clinica nao informada.')
    if (!cronAuthorized) await assertAdmin(admin, request, body.clinicId)
    const clinicMeta = await loadClinicIntegration(admin, body.clinicId)
    const missing = clinicMeta.missing
    const integration = clinicMeta.integration
    if (action === 'status') {
      const [automaticRules, pendingMessages, reconciliationItems, failures, activeTemplate, latestTest] = await Promise.all([
        admin.from('regras_mensagens').select('id', { count: 'exact', head: true }).eq('clinica_id', body.clinicId).eq('ativo', true).eq('canal_padrao', 'whatsapp_business'),
        admin.from('fila_mensagens').select('id', { count: 'exact', head: true }).eq('clinica_id', body.clinicId).in('status', ['pendente', 'processando', 'erro']),
        admin.from('fila_mensagens').select('id', { count: 'exact', head: true }).eq('clinica_id', body.clinicId).eq('status', 'reconciliacao'),
        admin.from('logs_mensagens').select('id,criado_em,observacao,provider_status').eq('clinica_id', body.clinicId).eq('canal', 'whatsapp_business').eq('status', 'erro').order('criado_em', { ascending: false }).limit(10),
        admin.from('modelos_mensagens').select('id,nome,whatsapp_template_name,whatsapp_template_language').eq('clinica_id', body.clinicId).eq('ativo', true).in('tipo', ['confirmacao_agendamento', 'lembrete_agendamento']).order('prioridade').limit(1).maybeSingle(),
        admin.from('whatsapp_testes').select('id,destinatario,provider_message_id,meta_message_id,provider_status,erro,criado_em').eq('clinica_id', body.clinicId).order('criado_em', { ascending: false }).limit(1).maybeSingle(),
      ])
      const scheduler = await getSchedulerStatus(admin)
      const template = activeTemplate.data as { id?: string; nome?: string; whatsapp_template_name?: string | null; whatsapp_template_language?: string } | null
      return json({
        configured: missing.length === 0 && Boolean(integration),
        sendReady: missing.length === 0 && Boolean(integration) && Boolean(template?.whatsapp_template_name),
        missingSecrets: missing,
        provider: { name: 'Meta WhatsApp Cloud API', apiConfigured: missing.length === 0 && Boolean(integration), senderConfigured: Boolean(integration?.phoneNumberId), wabaConfigured: Boolean(integration?.wabaId) },
        integration: integration ? { appId: integration.appId, wabaId: integration.wabaId, phoneNumberId: integration.phoneNumberId } : null,
        template: { configured: Boolean(template?.whatsapp_template_name), name: template?.whatsapp_template_name || null, language: template?.whatsapp_template_language || null, internalName: template?.nome || null, approval: 'requires_meta_validation' },
        automaticRules: automaticRules.count || 0,
        pendingMessages: pendingMessages.count || 0,
        reconciliationItems: reconciliationItems.count || 0,
        failedMessages: failures.data?.length || 0,
        recentFailures: (failures.data || []).map((failure) => ({ id: failure.id, type: 'WhatsApp/Meta', scheduledAt: failure.criado_em, attempts: 1, error: failure.observacao, providerStatus: failure.provider_status || null })),
        lastTest: latestTest.data ? { id: latestTest.data.id, recipient: latestTest.data.destinatario, providerMessageId: latestTest.data.provider_message_id, whatsappMessageId: latestTest.data.meta_message_id, status: latestTest.data.provider_status, error: latestTest.data.erro, createdAt: latestTest.data.criado_em } : null,
        worker: scheduler,
        scheduler,
      })
    }
    if (missing.length || !integration) return json({ error: `Configure a integração Meta desta clínica no Vault: ${missing.join(', ')}.` }, 503)
    if (action === 'validate-template') {
      if (!body.templateName || !body.language) throw new Error('Informe o nome e o idioma do template.')
      const result = await graphRequest(integration, `/${encodeURIComponent(integration.wabaId)}/message_templates?name=${encodeURIComponent(body.templateName)}&language=${encodeURIComponent(body.language)}`) as { data?: Array<{ name?: string; language?: string; status?: string; category?: string }> }
      const template = result.data?.find((item) => item.name === body.templateName && item.language === body.language)
      if (!template || template.status !== 'APPROVED') throw new Error(`O template ${body.templateName} ainda nao esta aprovado pela Meta.`)
      return json({ approved: true, category: template.category || 'UTILITY', status: template.status, provider: 'Meta' })
    }
    if (action === 'send-test') {
      if (!body.recipient) throw new Error('Informe o numero autorizado para o teste.')
      const { data: template, error: templateError } = await admin.from('modelos_mensagens').select('id,tipo,nome,texto,ativo,prioridade,whatsapp_template_name,whatsapp_template_language').eq('clinica_id', body.clinicId).eq('ativo', true).in('tipo', ['confirmacao_agendamento', 'lembrete_agendamento']).order('prioridade').limit(1).maybeSingle()
      if (templateError) throw templateError
      if (!template) throw new Error('Ative um modelo de confirmacao ou lembrete antes de enviar o teste.')
      const testId = crypto.randomUUID()
      const recipient = normalizePhone(body.recipient)
      const { error: auditError } = await admin.from('whatsapp_testes').insert({ id: testId, clinica_id: body.clinicId, destinatario: recipient, provider: 'meta', provider_status: 'pending' })
      if (auditError) throw new Error(`Não foi possível criar a auditoria antes do envio: ${auditError.message}`)
      const testDate = new Date()
      const values = {
        nome: 'Cliente de teste',
        data: dateValue(testDate),
        hora: timeValue(testDate),
        servico: 'atendimento',
        link_avaliacao_google: '',
        campanha: 'esta campanha',
        '1': 'Cliente de teste',
        '2': dateValue(testDate),
        '3': timeValue(testDate),
        '4': 'atendimento',
        '5': '',
      }
      try {
        const response = await sendTemplate(integration, recipient, template as Template, values) as MetaMessageResponse
        const metaMessageId = response.messages?.[0]?.id || null
        if (!metaMessageId) throw new Error('A Meta aceitou a chamada, mas nao retornou o WAMID da mensagem.')
        await admin.from('whatsapp_testes').update({ provider_message_id: metaMessageId, meta_message_id: metaMessageId, provider_status: 'accepted', atualizado_em: new Date().toISOString() }).eq('id', testId)
        return json({ sent: true, messageId: metaMessageId, providerMessageId: metaMessageId, testId, status: 'accepted' })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha de transporte ao enviar o teste pela Meta Cloud API.'
        await admin.from('whatsapp_testes').update({ provider: 'meta', provider_status: 'transport_error', erro: message, atualizado_em: new Date().toISOString() }).eq('id', testId)
        throw error
      }
    }
    return json(await processMessages(admin, body.clinicId, integration))
  } catch (error) {
    console.error('whatsapp-messages error', error instanceof Error ? error.message : error)
    return json({ error: error instanceof Error ? error.message : 'Nao foi possivel concluir a operacao do WhatsApp.' }, 400)
  }
})
