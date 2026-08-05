export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type WhatsAppReminder = {
  id: string
  clinica_id: string
  agendamento_id: string
  cliente_id: string | null
  modelo_mensagem_id: string | null
  regra_mensagem_id: string | null
  tipo: string
  dedupe_key: string | null
  bloqueado_por?: string | null
  metadata?: {
    appointment_start?: string
    appointment_client_id?: string
    schedule_revision?: number
  } | null
}

export type WhatsAppContext = {
  appointment: {
    id: string
    clinica_id: string
    cliente_id: string
    inicio_em: string
    status: string
    whatsapp_schedule_revision: number
    arquivado_em?: string | null
  }
  client: {
    id: string
    clinica_id: string
    nome: string
    telefone: string
    ativo: boolean
    arquivado_em?: string | null
    whatsapp_opt_in_status?: string | null
    whatsapp_opt_in_em?: string | null
    whatsapp_opt_out_em?: string | null
  }
  clinic: {
    id: string
    nome_publico?: string | null
    fuso_horario?: string | null
  }
  template: {
    id: string
    clinica_id: string
    tipo: string
    ativo: boolean
    whatsapp_template_name?: string | null
    whatsapp_template_language?: string | null
  }
  rule: {
    id: string
    clinica_id: string
    modelo_mensagem_id: string
    gatilho: string
    canal_padrao: string
    ativo: boolean
    automacao_iniciada_em?: string | null
  }
}

export type CycleLog = {
  id: string
  canal: string
  status: string
  provider_message_id?: string | null
}

export type ProviderStatusUpdate = {
  providerMessageId: string
  providerStatus: string
  occurredAt: string
  status: 'enviado' | 'entregue' | 'lido' | 'erro'
  errorCode?: string | null
  errorDetails?: string | null
}

export type WhatsAppRepository = {
  authorizeAdmin(token: string, clinicId: string): Promise<void>
  automationStatus(clinicId: string): Promise<{
    automaticRules: number
    pendingMessages: number
    failedMessages: number
    recentFailures: Array<{
      id: string
      type: string
      scheduledAt: string
      attempts: number
      error: string | null
    }>
    scheduler: {
      cronActive: boolean
      vaultConfigured: boolean
      lastRunStatus: string | null
      lastRunAt: string | null
    }
  }>
  claimDue(limit: number, workerId: string): Promise<WhatsAppReminder[]>
  getContext(reminder: WhatsAppReminder): Promise<WhatsAppContext | null>
  findCycleLog(clinicId: string, cycle: string): Promise<CycleLog | null>
  reserveLog(input: {
    clinicId: string
    clientId: string
    appointmentId: string
    templateId: string
    cycle: string
    text: string
    workerId: string
  }): Promise<{ created: boolean; log: CycleLog }>
  releaseLogReservation(logId: string, workerId: string): Promise<void>
  updateLog(id: string, changes: Record<string, unknown>): Promise<void>
  updateReminder(id: string, changes: Record<string, unknown>, expectedWorkerId?: string): Promise<boolean>
  finalizeAccepted(input: {
    logId: string
    reminderId: string
    workerId: string
    providerMessageId: string
    sentAt: string
  }): Promise<boolean>
  applyProviderStatus(update: ProviderStatusUpdate): Promise<void>
}

type Runtime = {
  repository: WhatsAppRepository
  accessToken: () => string
  phoneNumberId: () => string
  wabaId: () => string
  graphApiVersion: () => string
  webhookVerifyToken: () => string
  appSecret: () => string
  validateSendConfiguration: () => void
  missingSecrets: () => string[]
  cronSecret?: string
  allowedOrigins: string[]
  allowedOriginPatterns: RegExp[]
  fetch: typeof fetch
  crypto: Crypto
  now: () => Date
  randomUUID: () => string
  logger: Pick<Console, 'info' | 'warn' | 'error'>
}

type MetaStatus = {
  id?: string
  status?: string
  timestamp?: string
  errors?: Array<{ code?: number | string; title?: string; message?: string; error_data?: { details?: string } }>
}

const encoder = new TextEncoder()
const successfulStatuses = new Set(['enviado', 'entregue', 'lido'])

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isAllowedOrigin(runtime: Runtime, origin: string) {
  return runtime.allowedOrigins.includes(origin)
    || runtime.allowedOriginPatterns.some((pattern) => pattern.test(origin))
}

function corsHeaders(request: Request, runtime: Runtime) {
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret, x-hub-signature-256',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  })
  const origin = request.headers.get('Origin') || ''
  if (origin && isAllowedOrigin(runtime, origin)) headers.set('Access-Control-Allow-Origin', origin)
  return headers
}

function json(request: Request, runtime: Runtime, body: unknown, status = 200) {
  const headers = corsHeaders(request, runtime)
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers })
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  if (leftBytes.length !== rightBytes.length) return false
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index]
  }
  return difference === 0
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function validMetaSignature(runtime: Runtime, rawBody: string, signatureHeader: string) {
  const expectedPrefix = 'sha256='
  if (!signatureHeader.startsWith(expectedPrefix)) return false
  const key = await runtime.crypto.subtle.importKey(
    'raw',
    encoder.encode(runtime.appSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await runtime.crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  return timingSafeEqual(signatureHeader.slice(expectedPrefix.length).toLowerCase(), bytesToHex(digest))
}

export function normalizeBrazilianPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const normalized = digits.length === 10 || digits.length === 11
    ? `55${digits}`
    : digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')
      ? digits
      : ''
  if (!/^55\d{10,11}$/.test(normalized)) {
    throw new HttpError(400, 'Telefone invalido. Use DDD e numero, por exemplo: (51) 99999-9999.')
  }
  return normalized
}

function safeTemplateName(value: string | null | undefined) {
  if (!value || !/^[a-z0-9_]+$/.test(value)) throw new Error('Modelo WhatsApp nao configurado ou invalido.')
  return value
}

function safeLanguage(value: string | null | undefined) {
  const language = value || 'pt_BR'
  if (!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)) throw new Error('Idioma do modelo WhatsApp invalido.')
  return language
}

function formatAppointment(startValue: string, timezone: string) {
  const start = new Date(startValue)
  if (Number.isNaN(start.getTime())) throw new Error('Horario do agendamento invalido.')
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(start)
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(start)
  return { date, time, start }
}

function templateParameters(context: WhatsAppContext) {
  const timezone = context.clinic.fuso_horario || 'America/Sao_Paulo'
  const appointment = formatAppointment(context.appointment.inicio_em, timezone)
  return {
    appointment,
    values: [context.client.nome.trim(), appointment.date, appointment.time],
  }
}

function metaApiUrl(runtime: Runtime) {
  const version = runtime.graphApiVersion()
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('META_GRAPH_API_VERSION invalida.')
  const phoneNumberId = runtime.phoneNumberId()
  if (!/^\d+$/.test(phoneNumberId)) throw new Error('WHATSAPP_PHONE_NUMBER_ID invalido.')
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`
}

function metaWabaUrl(runtime: Runtime, path: string) {
  const version = runtime.graphApiVersion()
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('META_GRAPH_API_VERSION invalida.')
  const wabaId = runtime.wabaId()
  if (!/^\d+$/.test(wabaId)) throw new Error('WHATSAPP_WABA_ID invalido.')
  return `https://graph.facebook.com/${version}/${wabaId}/${path}`
}

async function validateApprovedTemplate(runtime: Runtime, templateName: string, language: string) {
  const fields = encodeURIComponent('name,status,category,language,components')
  const response = await runtime.fetch(`${metaWabaUrl(runtime, 'message_templates')}?fields=${fields}&limit=100`, {
    headers: { Authorization: `Bearer ${runtime.accessToken()}` },
    signal: AbortSignal.timeout(10_000),
  })
  const result = await response.json().catch(() => ({})) as {
    data?: Array<{
      name?: string
      status?: string
      category?: string
      language?: string
      components?: Array<{ type?: string; text?: string; [key: string]: unknown }>
    }>
  }
  if (!response.ok) throw new HttpError(502, 'A Meta nao permitiu consultar os modelos desta conta WhatsApp.')
  const template = (result.data || []).find((item) => item.name === templateName && item.language === language)
  if (!template) throw new HttpError(409, `O modelo ${templateName} (${language}) nao foi encontrado na Meta.`)
  if (template.status !== 'APPROVED' || template.category !== 'UTILITY') {
    throw new HttpError(409, 'O modelo precisa estar aprovado na categoria UTILITY antes de ativar a automacao.')
  }

  const body = (template.components || []).find((component) => component.type?.toUpperCase() === 'BODY')
  const bodyParameters = Array.from(body?.text?.matchAll(/\{\{(\d+)\}\}/g) || [], (match) => Number(match[1]))
  const otherParameters = (template.components || [])
    .filter((component) => component !== body)
    .some((component) => /\{\{\d+\}\}/.test(JSON.stringify(component)))
  if (otherParameters || bodyParameters.join(',') !== '1,2,3') {
    throw new HttpError(409, 'O modelo aprovado deve ter exatamente tres parametros no corpo: nome, data e horario.')
  }
  return { approved: true, category: template.category, status: template.status }
}

async function sendTemplate(
  runtime: Runtime,
  recipient: string,
  templateName: string,
  language: string,
  parameters: string[],
) {
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      ...(parameters.length ? {
        components: [{
          type: 'body',
          parameters: parameters.map((text) => ({ type: 'text', text })),
        }],
      } : {}),
    },
  }
  const response = await runtime.fetch(metaApiUrl(runtime), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${runtime.accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  const result = await response.json().catch(() => ({})) as {
    messages?: Array<{ id?: string }>
    error?: { code?: number | string; message?: string; error_data?: { details?: string } }
  }
  if (!response.ok) {
    const code = result.error?.code ? ` (${result.error.code})` : ''
    const detail = result.error?.error_data?.details || result.error?.message || 'Falha ao enviar mensagem.'
    throw new Error(`Meta WhatsApp${code}: ${detail}`)
  }
  const messageId = result.messages?.[0]?.id
  if (!messageId) throw new Error('A Meta nao retornou o identificador da mensagem.')
  return messageId
}

function consentGranted(context: WhatsAppContext) {
  return context.client.whatsapp_opt_in_status === 'aceito'
    && Boolean(context.client.whatsapp_opt_in_em)
    && !context.client.whatsapp_opt_out_em
}

function sameInstant(left: string | undefined, right: string) {
  if (!left) return false
  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime
}

function snapshotMatches(reminder: WhatsAppReminder, context: WhatsAppContext) {
  return sameInstant(reminder.metadata?.appointment_start, context.appointment.inicio_em)
    && reminder.metadata?.appointment_client_id === context.appointment.cliente_id
    && Number(reminder.metadata?.schedule_revision) === context.appointment.whatsapp_schedule_revision
}

function updateClaimedReminder(runtime: Runtime, reminder: WhatsAppReminder, changes: Record<string, unknown>) {
  return runtime.repository.updateReminder(reminder.id, changes, reminder.bloqueado_por || undefined)
}

async function synchronizeExistingLog(runtime: Runtime, reminder: WhatsAppReminder, existing: CycleLog) {
  if (successfulStatuses.has(existing.status)) {
    await updateClaimedReminder(runtime, reminder, {
      status: existing.status,
      provider_message_id: existing.provider_message_id || null,
      bloqueado_em: null,
      bloqueado_por: null,
      atualizado_em: runtime.now().toISOString(),
    })
    return
  }
  await updateClaimedReminder(runtime, reminder, {
    status: 'erro',
    ultimo_erro: 'Envio anterior encontrado; revisao manual necessaria para evitar duplicidade.',
    proxima_tentativa_em: null,
    bloqueado_em: null,
    bloqueado_por: null,
    atualizado_em: runtime.now().toISOString(),
  })
}

async function processReminder(runtime: Runtime, reminder: WhatsAppReminder) {
  const now = runtime.now()
  const context = await runtime.repository.getContext(reminder)
  const appointmentStart = context ? new Date(context.appointment.inicio_em).getTime() : Number.NaN
  if (!context
    || context.appointment.id !== reminder.agendamento_id
    || context.appointment.clinica_id !== reminder.clinica_id
    || context.appointment.cliente_id !== reminder.cliente_id
    || context.client.id !== reminder.cliente_id
    || context.client.clinica_id !== reminder.clinica_id
    || context.template.id !== reminder.modelo_mensagem_id
    || context.template.clinica_id !== reminder.clinica_id
    || context.rule.id !== reminder.regra_mensagem_id
    || context.rule.modelo_mensagem_id !== context.template.id
    || context.rule.clinica_id !== reminder.clinica_id
    || context.rule.canal_padrao !== 'whatsapp_business'
    || (context.template.tipo === 'confirmacao_agendamento' && context.rule.gatilho !== 'agendamento_criado')
    || (context.template.tipo === 'lembrete_agendamento' && context.rule.gatilho !== 'inicio_agendamento')
    || !context.rule.ativo
    || !context.rule.automacao_iniciada_em
    || !['agendado', 'confirmado'].includes(context.appointment.status)
    || context.appointment.arquivado_em
    || context.client.arquivado_em
    || !context.client.ativo
    || !context.template.ativo
    || !['confirmacao_agendamento', 'lembrete_agendamento'].includes(context.template.tipo)
    || context.template.tipo !== reminder.tipo
    || !snapshotMatches(reminder, context)
    || !Number.isFinite(appointmentStart)
    || appointmentStart <= now.getTime()) {
    await updateClaimedReminder(runtime, reminder, {
      status: 'cancelado',
      cancelado_em: now.toISOString(),
      bloqueado_em: null,
      bloqueado_por: null,
      atualizado_em: now.toISOString(),
    })
    return 'cancelled'
  }

  if (!consentGranted(context)) {
    await updateClaimedReminder(runtime, reminder, {
      status: 'dispensado',
      ultimo_erro: 'Cliente sem consentimento ativo para mensagens de agendamento no WhatsApp.',
      bloqueado_em: null,
      bloqueado_por: null,
      atualizado_em: now.toISOString(),
    })
    return 'dismissed'
  }

  if (!reminder.dedupe_key) throw new Error('Lembrete sem chave de idempotencia.')
  const claimIsActive = await updateClaimedReminder(runtime, reminder, {
    bloqueado_em: now.toISOString(),
    atualizado_em: now.toISOString(),
  })
  if (!claimIsActive) return 'cancelled'

  const existing = await runtime.repository.findCycleLog(reminder.clinica_id, reminder.dedupe_key)
  if (existing) {
    await synchronizeExistingLog(runtime, reminder, existing)
    return 'duplicate'
  }

  const templateName = safeTemplateName(context.template.whatsapp_template_name)
  const language = safeLanguage(context.template.whatsapp_template_language)
  const { appointment, values } = templateParameters(context)
  const auditText = `Template ${templateName} para agendamento em ${appointment.date} as ${appointment.time}.`
  const reservation = await runtime.repository.reserveLog({
    clinicId: reminder.clinica_id,
    clientId: context.client.id,
    appointmentId: context.appointment.id,
    templateId: context.template.id,
    cycle: reminder.dedupe_key,
    text: auditText,
    workerId: reminder.bloqueado_por || '',
  })
  if (!reservation.created) {
    await synchronizeExistingLog(runtime, reminder, reservation.log)
    return 'duplicate'
  }

  const claimStillActive = await updateClaimedReminder(runtime, reminder, {
    bloqueado_em: runtime.now().toISOString(),
    atualizado_em: runtime.now().toISOString(),
  })
  if (!claimStillActive) {
    await runtime.repository.releaseLogReservation(reservation.log.id, reminder.bloqueado_por || '')
    return 'cancelled'
  }

  let providerMessageId: string
  try {
    providerMessageId = await sendTemplate(
      runtime,
      normalizeBrazilianPhone(context.client.telefone),
      templateName,
      language,
      values,
    )
  } catch (error) {
    const failedAt = runtime.now().toISOString()
    const message = errorMessage(error).slice(0, 1000)
    await runtime.repository.updateLog(reservation.log.id, {
      status: 'erro',
      provider_status: 'failed',
      provider_status_em: failedAt,
      erro_detalhes: message,
      atualizado_em: failedAt,
    })
    await updateClaimedReminder(runtime, reminder, {
      status: 'erro',
      ultimo_erro: `${message} Revisao manual necessaria antes de tentar novamente.`.slice(0, 1000),
      proxima_tentativa_em: null,
      bloqueado_em: null,
      bloqueado_por: null,
      atualizado_em: failedAt,
    })
    runtime.logger.error('whatsapp_message_send_failed', { reminderId: reminder.id, message })
    return 'failed'
  }

  const sentAt = runtime.now().toISOString()
  try {
    const finalized = await runtime.repository.finalizeAccepted({
      logId: reservation.log.id,
      reminderId: reminder.id,
      workerId: reminder.bloqueado_por || '',
      providerMessageId,
      sentAt,
    })
    if (!finalized) throw new Error('A reserva da mensagem nao foi finalizada no banco.')
    return 'sent'
  } catch (error) {
    const message = errorMessage(error).slice(0, 800)
    await updateClaimedReminder(runtime, reminder, {
      status: 'erro',
      provider_message_id: providerMessageId,
      provider_status: 'accepted_unconfirmed',
      provider_status_em: sentAt,
      ultimo_erro: `A Meta aceitou a mensagem, mas a confirmacao no banco falhou: ${message}`.slice(0, 1000),
      proxima_tentativa_em: null,
      bloqueado_em: null,
      bloqueado_por: null,
      atualizado_em: runtime.now().toISOString(),
    })
    runtime.logger.error('whatsapp_message_accepted_persistence_failed', {
      reminderId: reminder.id,
      providerMessageId,
      message,
    })
    return 'failed'
  }
}

async function processDue(runtime: Runtime) {
  runtime.validateSendConfiguration()
  const reminders = await runtime.repository.claimDue(5, runtime.randomUUID())
  const counters = { claimed: reminders.length, sent: 0, dismissed: 0, cancelled: 0, duplicate: 0, failed: 0 }
  for (const reminder of reminders) {
    try {
      const result = await processReminder(runtime, reminder)
      if (result === 'sent') counters.sent += 1
      else if (result === 'dismissed') counters.dismissed += 1
      else if (result === 'cancelled') counters.cancelled += 1
      else if (result === 'duplicate') counters.duplicate += 1
      else counters.failed += 1
    } catch (error) {
      counters.failed += 1
      const message = errorMessage(error).slice(0, 1000)
      await updateClaimedReminder(runtime, reminder, {
        status: 'erro',
        ultimo_erro: message,
        proxima_tentativa_em: null,
        bloqueado_em: null,
        bloqueado_por: null,
        atualizado_em: runtime.now().toISOString(),
      })
      runtime.logger.error('whatsapp_reminder_processing_failed', { reminderId: reminder.id, message })
    }
  }
  return counters
}

async function handleProviderWebhook(runtime: Runtime, request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256') || ''
  if (!signature || !await validMetaSignature(runtime, rawBody, signature)) {
    throw new HttpError(401, 'Assinatura do webhook invalida.')
  }
  const body = JSON.parse(rawBody || '{}') as {
    object?: string
    entry?: Array<{ changes?: Array<{ field?: string; value?: { statuses?: MetaStatus[] } }> }>
  }
  if (body.object !== 'whatsapp_business_account') return

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue
      for (const status of change.value?.statuses || []) {
        if (!status.id || !status.status) continue
        if (!['sent', 'delivered', 'read', 'failed'].includes(status.status)) continue
        const mappedStatus = status.status === 'read'
          ? 'lido'
          : status.status === 'delivered'
            ? 'entregue'
            : status.status === 'failed'
              ? 'erro'
              : 'enviado'
        const firstError = status.errors?.[0]
        const providerTimestamp = status.timestamp ? Number(status.timestamp) * 1000 : Number.NaN
        await runtime.repository.applyProviderStatus({
          providerMessageId: status.id,
          providerStatus: status.status,
          occurredAt: Number.isFinite(providerTimestamp)
            ? new Date(providerTimestamp).toISOString()
            : runtime.now().toISOString(),
          status: mappedStatus,
          errorCode: firstError?.code === undefined ? null : String(firstError.code),
          errorDetails: firstError?.error_data?.details || firstError?.message || firstError?.title || null,
        })
      }
    }
  }
}

function bearerToken(request: Request) {
  return request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || ''
}

export function createWhatsAppHandler(runtime: Runtime) {
  return async function handler(request: Request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, runtime) })

    try {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.searchParams.has('hub.mode')) {
        const mode = url.searchParams.get('hub.mode') || ''
        const verifyToken = url.searchParams.get('hub.verify_token') || ''
        const challenge = url.searchParams.get('hub.challenge') || ''
        if (mode !== 'subscribe' || !timingSafeEqual(verifyToken, runtime.webhookVerifyToken())) {
          return new Response('Forbidden', { status: 403, headers: corsHeaders(request, runtime) })
        }
        return new Response(challenge, { status: 200, headers: corsHeaders(request, runtime) })
      }

      if (request.method === 'POST' && request.headers.has('x-hub-signature-256')) {
        await handleProviderWebhook(runtime, request)
        return new Response(null, { status: 200, headers: corsHeaders(request, runtime) })
      }

      if (request.method !== 'POST') return json(request, runtime, { error: 'Metodo nao permitido.' }, 405)
      const payload = await request.json().catch(() => ({})) as Record<string, unknown>
      if (payload.object === 'whatsapp_business_account') {
        throw new HttpError(401, 'Assinatura do webhook ausente ou invalida.')
      }
      const action = typeof payload.action === 'string' ? payload.action : 'status'

      if (action === 'process-due') {
        if (!runtime.cronSecret || !timingSafeEqual(request.headers.get('x-cron-secret') || '', runtime.cronSecret)) {
          return json(request, runtime, { error: 'Cron nao autorizado.' }, 401)
        }
        return json(request, runtime, await processDue(runtime))
      }

      const clinicId = typeof payload.clinicId === 'string'
        ? payload.clinicId
        : typeof payload.clinic_id === 'string' ? payload.clinic_id : ''
      if (!clinicId) return json(request, runtime, { error: 'clinicId obrigatorio.' }, 400)
      const token = bearerToken(request)
      if (!token) throw new HttpError(401, 'Sessao nao encontrada. Entre novamente no sistema.')
      await runtime.repository.authorizeAdmin(token, clinicId)

      if (action === 'status') {
        const status = await runtime.repository.automationStatus(clinicId)
        const missingSecrets = runtime.missingSecrets()
        return json(request, runtime, {
          configured: missingSecrets.length === 0,
          sendReady: !missingSecrets.some((name) => [
            'WHATSAPP_SYSTEM_USER_ACCESS_TOKEN',
            'WHATSAPP_PHONE_NUMBER_ID',
          ].includes(name)),
          missingSecrets,
          ...status,
        })
      }

      if (action === 'send-test') {
        runtime.validateSendConfiguration()
        const recipient = typeof payload.recipient === 'string' ? normalizeBrazilianPhone(payload.recipient) : ''
        if (!recipient) throw new HttpError(400, 'Telefone de teste obrigatorio.')
        const messageId = await sendTemplate(runtime, recipient, 'hello_world', 'en_US', [])
        runtime.logger.info('whatsapp_test_message_sent', { clinicId, messageId })
        return json(request, runtime, { sent: true, messageId })
      }

      if (action === 'validate-template') {
        runtime.validateSendConfiguration()
        const templateName = safeTemplateName(typeof payload.templateName === 'string' ? payload.templateName : '')
        const language = safeLanguage(typeof payload.language === 'string' ? payload.language : '')
        return json(request, runtime, await validateApprovedTemplate(runtime, templateName, language))
      }

      return json(request, runtime, { error: 'Acao invalida.' }, 400)
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const message = errorMessage(error)
      runtime.logger.error('whatsapp_request_failed', { status, message })
      return json(request, runtime, {
        error: error instanceof HttpError ? message : 'Nao foi possivel processar a integracao do WhatsApp.',
      }, status)
    }
  }
}
