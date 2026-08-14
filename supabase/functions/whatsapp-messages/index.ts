import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function env(name: string) { return Deno.env.get(name)?.trim() || '' }
function requiredSecrets() {
  return ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID']
}
function missingSecrets() { return requiredSecrets().filter((name) => !env(name)) }
function graphVersion() { return env('WHATSAPP_GRAPH_VERSION') || 'v23.0' }

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

function dateValue(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date)
}

function timeValue(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function templateParameters(templateText: string, values: Record<string, string>) {
  const matches = [...templateText.matchAll(/\{([a-z0-9_]+)\}/gi)].map((match) => match[1]?.toLowerCase()).filter((value): value is string => Boolean(value))
  return matches.map((name) => ({ type: 'text', text: values[name] || '' }))
}

async function graphRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env('WHATSAPP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const error = body.error as { message?: string } | undefined
    throw new Error(error?.message || 'A Meta recusou a chamada do WhatsApp.')
  }
  return body
}

async function sendTemplate(phone: string, template: Template, values: Record<string, string>) {
  if (!template.whatsapp_template_name) throw new Error(`O modelo ${template.nome} nao possui nome aprovado na Meta.`)
  const bodyParameters = templateParameters(template.texto, values)
  const components = bodyParameters.length ? [{ type: 'body', parameters: bodyParameters }] : undefined
  return graphRequest(`/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(phone),
      type: 'template',
      template: { name: template.whatsapp_template_name, language: { code: template.whatsapp_template_language || 'pt_BR' }, ...(components ? { components } : {}) },
    }),
  })
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

async function processMessages(admin: SupabaseClient, clinicId: string) {
  const [rulesResult, appointmentsResult, clientsResult, servicesResult, templatesResult, logsResult, dismissedResult, clinicResult] = await Promise.all([
    admin.from('regras_mensagens').select('*').eq('clinica_id', clinicId).eq('ativo', true).eq('canal_padrao', 'whatsapp_business'),
    admin.from('agendamentos').select('id,cliente_id,servico_id,inicio_em,criado_em,status').eq('clinica_id', clinicId).is('arquivado_em', null).neq('status', 'cancelado').order('inicio_em').limit(500),
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
  const appointmentsById = new Map(appointments.map((appointment) => [appointment.id, appointment]))
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
      if (!client || client.whatsapp_opt_in_status !== 'aceito') { skipped++; continue }
      const base = rule.gatilho === 'agendamento_criado' ? appointment.criado_em : appointment.inicio_em
      const due = dueAt(base, rule)
      if (now < due) continue
      const cycle = `${template.tipo}:agendamento:${appointment.id}`
      if (sent.has(cycle) || dismissed.has(cycle)) continue
      const appointmentDate = new Date(appointment.inicio_em)
      const values = { nome: client.nome, data: dateValue(appointmentDate), hora: timeValue(appointmentDate), servico: services.get(appointment.servico_id || '')?.nome || 'atendimento', link_avaliacao_google: link, campanha: 'esta campanha' }
      queueRows.push({ clinica_id: clinicId, cliente_id: client.id, agendamento_id: appointment.id, modelo_mensagem_id: template.id, canal: 'whatsapp_business', tipo: template.tipo, ciclo: cycle, payload: values })
    }
  }

  if (queueRows.length) {
    const { error } = await admin.from('fila_mensagens').upsert(queueRows, { onConflict: 'clinica_id,canal,ciclo', ignoreDuplicates: true })
    if (error) throw error
  }

  const { data: claimed, error: claimError } = await admin.rpc('claim_whatsapp_message_queue', { p_clinica_id: clinicId, p_limit: 25 })
  if (claimError) throw claimError
  const queue = (claimed || []) as QueueItem[]
  const templateById = templates
  let sentCount = 0; let failed = 0
  for (const item of queue) {
    const template = templateById.get(item.modelo_mensagem_id)
    try {
      if (!template) throw new Error('Modelo de mensagem nao encontrado ou inativo.')
      const client = clients.get(item.cliente_id)
      if (!client) throw new Error('Cliente nao encontrado ou inativo.')
      const appointment = item.agendamento_id ? appointmentsById.get(item.agendamento_id) : null
      if (appointment?.status === 'cancelado' || client.whatsapp_opt_in_status !== 'aceito') {
        await admin.from('fila_mensagens').update({ status: 'cancelado', processando_em: null, atualizado_em: new Date().toISOString() }).eq('id', item.id).eq('status', 'processando')
        skipped++
        continue
      }
      const response = await sendTemplate(client.telefone, template, item.payload || {}) as { messages?: Array<{ id?: string }> }
      const metaMessageId = response.messages?.[0]?.id || null
      const { error: completeError } = await admin.rpc('complete_whatsapp_message_queue', { p_id: item.id, p_meta_message_id: metaMessageId })
      if (completeError) throw completeError
      await admin.from('logs_mensagens').insert({ clinica_id: clinicId, cliente_id: client.id, agendamento_id: item.agendamento_id, modelo_mensagem_id: template.id, canal: 'whatsapp_business', texto: template.texto, ciclo: item.ciclo, status: 'enviado', enviado_em: new Date().toISOString(), observacao: metaMessageId ? `Meta message id: ${metaMessageId}` : 'Enviado pela Meta Cloud API' })
      sentCount++
    } catch (error) {
      failed++
      const message = error instanceof Error ? error.message : 'Falha ao enviar pela Meta'
      await admin.rpc('fail_whatsapp_message_queue', { p_id: item.id, p_error: message, p_retry_seconds: 300 })
      const client = clients.get(item.cliente_id)
      if (client && templateById.get(item.modelo_mensagem_id)) {
        await admin.from('logs_mensagens').insert({ clinica_id: clinicId, cliente_id: client.id, agendamento_id: item.agendamento_id, modelo_mensagem_id: item.modelo_mensagem_id, canal: 'whatsapp_business', texto: templateById.get(item.modelo_mensagem_id)?.texto || '', ciclo: item.ciclo, status: 'erro', observacao: message })
      }
    }
  }
  return { enqueued: queueRows.length, processed: queue.length, sent: sentCount, failed, skipped }
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
  const cronAuthorized = action === 'process' && Boolean(env('WHATSAPP_CRON_SECRET')) && request.headers.get('x-whatsapp-cron-secret') === env('WHATSAPP_CRON_SECRET')
  try {
    if (action === 'process' && !cronAuthorized) throw new Error('Processamento automatico nao autorizado.')
    if (!body.clinicId) throw new Error('Clinica nao informada.')
    if (!cronAuthorized) await assertAdmin(admin, request, body.clinicId)
    const missing = missingSecrets()
    if (action === 'status') {
      const automaticRules = await admin.from('regras_mensagens').select('id', { count: 'exact', head: true }).eq('clinica_id', body.clinicId).eq('ativo', true).eq('canal_padrao', 'whatsapp_business')
      const pendingMessages = await admin.from('fila_mensagens').select('id', { count: 'exact', head: true }).eq('clinica_id', body.clinicId).in('status', ['pendente', 'processando', 'erro'])
      const failures = await admin.from('logs_mensagens').select('id,criado_em,observacao').eq('clinica_id', body.clinicId).eq('canal', 'whatsapp_business').eq('status', 'erro').order('criado_em', { ascending: false }).limit(10)
      return json({ configured: missing.length === 0, sendReady: missing.length === 0, missingSecrets: missing, automaticRules: automaticRules.count || 0, pendingMessages: pendingMessages.count || 0, failedMessages: failures.data?.length || 0, recentFailures: (failures.data || []).map((failure) => ({ id: failure.id, type: 'WhatsApp', scheduledAt: failure.criado_em, attempts: 1, error: failure.observacao })), scheduler: { cronActive: Boolean(env('WHATSAPP_FUNCTION_URL') && env('WHATSAPP_CRON_SECRET')), vaultConfigured: Boolean(env('WHATSAPP_FUNCTION_URL') && env('WHATSAPP_CRON_SECRET')), lastRunStatus: null, lastRunAt: null } })
    }
    if (missing.length) return json({ error: `Configure no Supabase Secrets: ${missing.join(', ')}.` }, 503)
    if (action === 'validate-template') {
      if (!body.templateName || !body.language) throw new Error('Informe o nome e o idioma do template.')
      const result = await graphRequest(`/${env('WHATSAPP_BUSINESS_ACCOUNT_ID')}/message_templates?name=${encodeURIComponent(body.templateName)}&language=${encodeURIComponent(body.language)}`) as { data?: Array<{ name?: string; language?: string; status?: string; category?: string }> }
      const template = result.data?.find((item) => item.name === body.templateName && item.language === body.language)
      if (!template || template.status !== 'APPROVED') throw new Error('O template ainda nao esta aprovado pela Meta.')
      return json({ approved: true, category: template.category || 'UTILITY', status: template.status })
    }
    if (action === 'send-test') {
      if (!body.recipient) throw new Error('Informe o numero verificado para o teste.')
      const { data: template } = await admin.from('modelos_mensagens').select('id,tipo,nome,texto,ativo,prioridade,whatsapp_template_name,whatsapp_template_language').eq('clinica_id', body.clinicId).eq('ativo', true).in('tipo', ['confirmacao_agendamento', 'lembrete_agendamento']).order('prioridade').limit(1).maybeSingle()
      if (!template) throw new Error('Ative um modelo de confirmacao ou lembrete antes de enviar o teste.')
      const values = { nome: 'Cliente de teste', data: dateValue(new Date()), hora: timeValue(new Date()), servico: 'atendimento', link_avaliacao_google: '', campanha: 'esta campanha' }
      const response = await sendTemplate(body.recipient, template as Template, values) as { messages?: Array<{ id?: string }> }
      return json({ sent: true, messageId: response.messages?.[0]?.id || '' })
    }
    return json(await processMessages(admin, body.clinicId))
  } catch (error) {
    console.error('whatsapp-messages error', error)
    return json({ error: error instanceof Error ? error.message : 'Nao foi possivel concluir a operacao do WhatsApp.' }, 400)
  }
})
