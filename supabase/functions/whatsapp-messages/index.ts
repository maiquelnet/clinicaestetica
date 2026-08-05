import { createClient } from 'npm:@supabase/supabase-js@2.110.0'
import {
  createWhatsAppHandler,
  HttpError,
  type ProviderStatusUpdate,
  type WhatsAppReminder,
  type WhatsAppRepository,
} from './core.ts'

function optionalEnv(...names: string[]) {
  return names.map((name) => Deno.env.get(name)?.trim()).find(Boolean)
}

function requiredEnv(...names: string[]) {
  const value = optionalEnv(...names)
  if (!value) throw new Error(`Missing ${names.join(' or ')} environment variable`)
  return value
}

function serviceRoleKey() {
  const legacyKey = optionalEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (legacyKey) return legacyKey

  const secretKeys = optionalEnv('SUPABASE_SECRET_KEYS')
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys) as Record<string, string>
    const key = parsed.default || Object.values(parsed)[0]
    if (key) return key
  }
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS environment variable')
}

const secretDefinitions = [
  { name: 'WHATSAPP_SYSTEM_USER_ACCESS_TOKEN', aliases: ['WHATSAPP_SYSTEM_USER_ACCESS_TOKEN', 'WHATSAPP_ACCESS_TOKEN'] },
  { name: 'WHATSAPP_PHONE_NUMBER_ID', aliases: ['WHATSAPP_PHONE_NUMBER_ID'] },
  { name: 'WHATSAPP_WABA_ID', aliases: ['WHATSAPP_WABA_ID'] },
  { name: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN', aliases: ['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] },
  { name: 'META_APP_SECRET', aliases: ['META_APP_SECRET'] },
  { name: 'WHATSAPP_CRON_SECRET', aliases: ['WHATSAPP_CRON_SECRET'] },
] as const

function missingSecrets() {
  return secretDefinitions
    .filter((definition) => !optionalEnv(...definition.aliases))
    .map((definition) => definition.name)
}

function whatsappSecret(name: string, ...aliases: string[]) {
  const value = optionalEnv(...aliases)
  if (value) return value
  console.error('whatsapp_configuration_missing', { names: [name] })
  throw new HttpError(500, `Configuracao ausente em Edge Functions > Secrets: ${name}.`)
}

function validateSendConfiguration() {
  const requiredForSend = [
    { name: 'WHATSAPP_SYSTEM_USER_ACCESS_TOKEN', aliases: ['WHATSAPP_SYSTEM_USER_ACCESS_TOKEN', 'WHATSAPP_ACCESS_TOKEN'] },
    { name: 'WHATSAPP_PHONE_NUMBER_ID', aliases: ['WHATSAPP_PHONE_NUMBER_ID'] },
  ]
  const missing = requiredForSend.filter((item) => !optionalEnv(...item.aliases)).map((item) => item.name)
  if (missing.length) {
    console.error('whatsapp_configuration_missing', { names: missing })
    throw new HttpError(500, `Configuracao ausente em Edge Functions > Secrets: ${missing.join(', ')}.`)
  }
  const graphVersion = optionalEnv('META_GRAPH_API_VERSION') || 'v25.0'
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new HttpError(500, 'META_GRAPH_API_VERSION invalida.')
  }
}

const supabaseUrl = requiredEnv('SUPABASE_URL')
const database = createClient(supabaseUrl, serviceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})

function ensureResult<T>(result: { data: T; error: unknown }, operation: string) {
  if (result.error) {
    console.error('whatsapp_database_error', { operation, error: result.error })
    throw result.error
  }
  return result.data
}

const repository: WhatsAppRepository = {
  async authorizeAdmin(token, clinicId) {
    const { data: { user }, error: userError } = await database.auth.getUser(token)
    if (userError || !user) throw new HttpError(401, 'Sessao invalida ou expirada. Entre novamente no sistema.')

    const result = await database.from('usuarios_clinicas')
      .select('papel')
      .eq('clinica_id', clinicId)
      .eq('perfil_id', user.id)
      .eq('ativo', true)
      .maybeSingle()
    const membership = ensureResult(result, 'authorize_admin')
    if (!membership || !['proprietario', 'administrador'].includes(membership.papel)) {
      throw new HttpError(403, 'Apenas proprietarios e administradores podem configurar o WhatsApp.')
    }
  },

  async automationStatus(clinicId) {
    const [rules, pending, failed, recentFailures, schedulerResult] = await Promise.all([
      database.from('regras_mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', clinicId)
        .eq('ativo', true)
        .eq('canal_padrao', 'whatsapp_business')
        .not('automacao_iniciada_em', 'is', null),
      database.from('lembretes_agendamentos')
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', clinicId)
        .eq('canal', 'whatsapp_business')
        .in('status', ['pendente', 'processando']),
      database.from('lembretes_agendamentos')
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', clinicId)
        .eq('canal', 'whatsapp_business')
        .eq('status', 'erro'),
      database.from('lembretes_agendamentos')
        .select('id,tipo,lembrar_em,tentativas,ultimo_erro')
        .eq('clinica_id', clinicId)
        .eq('canal', 'whatsapp_business')
        .eq('status', 'erro')
        .order('atualizado_em', { ascending: false })
        .limit(10),
      database.rpc('whatsapp_runtime_status'),
    ])
    if (rules.error) throw rules.error
    if (pending.error) throw pending.error
    if (failed.error) throw failed.error
    if (recentFailures.error) throw recentFailures.error
    if (schedulerResult.error) throw schedulerResult.error
    const scheduler = (schedulerResult.data || {}) as {
      cronActive?: boolean
      vaultConfigured?: boolean
      lastRunStatus?: string | null
      lastRunAt?: string | null
    }
    return {
      automaticRules: rules.count || 0,
      pendingMessages: pending.count || 0,
      failedMessages: failed.count || 0,
      recentFailures: (recentFailures.data || []).map((item) => ({
        id: item.id,
        type: item.tipo,
        scheduledAt: item.lembrar_em,
        attempts: item.tentativas,
        error: item.ultimo_erro,
      })),
      scheduler: {
        cronActive: Boolean(scheduler.cronActive),
        vaultConfigured: Boolean(scheduler.vaultConfigured),
        lastRunStatus: scheduler.lastRunStatus || null,
        lastRunAt: scheduler.lastRunAt || null,
      },
    }
  },

  async claimDue(limit, workerId) {
    const result = await database.rpc('claim_lembretes_whatsapp', {
      p_limit: limit,
      p_worker_id: workerId,
    })
    return (ensureResult(result, 'claim_due') || []) as WhatsAppReminder[]
  },

  async getContext(reminder) {
    const [appointmentResult, clientResult, clinicResult, templateResult, ruleResult] = await Promise.all([
      database.from('agendamentos')
        .select('id,clinica_id,cliente_id,inicio_em,status,whatsapp_schedule_revision,arquivado_em')
        .eq('id', reminder.agendamento_id)
        .maybeSingle(),
      reminder.cliente_id
        ? database.from('clientes')
          .select('id,clinica_id,nome,telefone,ativo,arquivado_em,whatsapp_opt_in_status,whatsapp_opt_in_em,whatsapp_opt_out_em')
          .eq('id', reminder.cliente_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      database.from('clinicas')
        .select('id,nome_publico,fuso_horario')
        .eq('id', reminder.clinica_id)
        .maybeSingle(),
      reminder.modelo_mensagem_id
        ? database.from('modelos_mensagens')
          .select('id,clinica_id,tipo,ativo,whatsapp_template_name,whatsapp_template_language')
          .eq('id', reminder.modelo_mensagem_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      reminder.regra_mensagem_id
        ? database.from('regras_mensagens')
          .select('id,clinica_id,modelo_mensagem_id,gatilho,canal_padrao,ativo,automacao_iniciada_em')
          .eq('id', reminder.regra_mensagem_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    const appointment = ensureResult(appointmentResult, 'appointment_context')
    const client = ensureResult(clientResult, 'client_context')
    const clinic = ensureResult(clinicResult, 'clinic_context')
    const template = ensureResult(templateResult, 'template_context')
    const rule = ensureResult(ruleResult, 'rule_context')
    if (!appointment || !client || !clinic || !template || !rule) return null
    if (appointment.cliente_id !== client.id) return null
    return { appointment, client, clinic, template, rule }
  },

  async findCycleLog(clinicId, cycle) {
    const result = await database.from('logs_mensagens')
      .select('id,canal,status,provider_message_id')
      .eq('clinica_id', clinicId)
      .eq('canal', 'whatsapp_business')
      .eq('ciclo', cycle)
      .maybeSingle()
    return ensureResult(result, 'find_cycle_log')
  },

  async reserveLog(input) {
    const result = await database.from('logs_mensagens').insert({
      clinica_id: input.clinicId,
      cliente_id: input.clientId,
      agendamento_id: input.appointmentId,
      modelo_mensagem_id: input.templateId,
      canal: 'whatsapp_business',
      texto: input.text,
      ciclo: input.cycle,
      status: 'pendente',
      dispatch_worker_id: input.workerId,
      observacao: 'Reserva idempotente antes do envio pela Meta Cloud API',
    }).select('id,canal,status,provider_message_id').single()

    if (!result.error && result.data) return { created: true, log: result.data }
    if ((result.error as { code?: string } | null)?.code !== '23505') {
      console.error('whatsapp_database_error', { operation: 'reserve_log', error: result.error })
      throw result.error
    }
    const existing = await this.findCycleLog(input.clinicId, input.cycle)
    if (!existing) throw result.error
    return { created: false, log: existing }
  },

  async releaseLogReservation(logId, workerId) {
    const result = await database.from('logs_mensagens')
      .delete()
      .eq('id', logId)
      .eq('status', 'pendente')
      .eq('dispatch_worker_id', workerId)
      .is('provider_message_id', null)
    ensureResult(result, 'release_log_reservation')
  },

  async updateLog(id, changes) {
    const result = await database.from('logs_mensagens').update(changes).eq('id', id)
    ensureResult(result, 'update_log')
  },

  async updateReminder(id, changes, expectedWorkerId) {
    let query = database.from('lembretes_agendamentos').update(changes).eq('id', id)
    if (expectedWorkerId) {
      query = query.eq('status', 'processando').eq('bloqueado_por', expectedWorkerId)
    }
    const result = await query.select('id').maybeSingle()
    return Boolean(ensureResult(result, 'update_reminder'))
  },

  async finalizeAccepted(input) {
    const result = await database.rpc('finalize_whatsapp_send', {
      p_log_id: input.logId,
      p_reminder_id: input.reminderId,
      p_worker_id: input.workerId,
      p_provider_message_id: input.providerMessageId,
      p_sent_at: input.sentAt,
    })
    return Boolean(ensureResult(result, 'finalize_accepted'))
  },

  async applyProviderStatus(update: ProviderStatusUpdate) {
    const result = await database.rpc('apply_whatsapp_provider_status', {
      p_provider_message_id: update.providerMessageId,
      p_provider_status: update.providerStatus,
      p_occurred_at: update.occurredAt,
      p_status: update.status,
      p_error_code: update.errorCode || null,
      p_error_details: update.errorDetails || null,
    })
    ensureResult(result, 'apply_provider_status')
  },
}

const extraOrigins = (optionalEnv('CORS_ALLOWED_ORIGINS') || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const handler = createWhatsAppHandler({
  repository,
  accessToken: () => whatsappSecret(
    'WHATSAPP_SYSTEM_USER_ACCESS_TOKEN',
    'WHATSAPP_SYSTEM_USER_ACCESS_TOKEN',
    'WHATSAPP_ACCESS_TOKEN',
  ),
  phoneNumberId: () => whatsappSecret('WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_PHONE_NUMBER_ID'),
  wabaId: () => whatsappSecret('WHATSAPP_WABA_ID', 'WHATSAPP_WABA_ID'),
  graphApiVersion: () => optionalEnv('META_GRAPH_API_VERSION') || 'v25.0',
  webhookVerifyToken: () => whatsappSecret('WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
  appSecret: () => whatsappSecret('META_APP_SECRET', 'META_APP_SECRET'),
  validateSendConfiguration,
  missingSecrets,
  cronSecret: optionalEnv('WHATSAPP_CRON_SECRET'),
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
  logger: console,
})

Deno.serve(handler)
