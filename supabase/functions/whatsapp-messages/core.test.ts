import assert from 'node:assert/strict'
import {
  createWhatsAppHandler,
  HttpError,
  normalizeBrazilianPhone,
  type CycleLog,
  type ProviderStatusUpdate,
  type WhatsAppContext,
  type WhatsAppReminder,
  type WhatsAppRepository,
} from './core.ts'

const NOW = '2026-08-05T15:00:00.000Z'
const FUNCTION_URL = 'https://project.supabase.co/functions/v1/whatsapp-messages'

class FakeRepository implements WhatsAppRepository {
  authorizationCalls: Array<{ token: string; clinicId: string }> = []
  statusResult = {
    automaticRules: 2,
    pendingMessages: 3,
    failedMessages: 1,
    recentFailures: [],
    scheduler: { cronActive: true, vaultConfigured: true, lastRunStatus: 'succeeded', lastRunAt: NOW },
  }
  due: WhatsAppReminder[] = []
  contexts = new Map<string, WhatsAppContext | null>()
  cycleLogs = new Map<string, CycleLog>()
  reserveCalls: Array<{
    clinicId: string
    clientId: string
    appointmentId: string
    templateId: string
    cycle: string
    text: string
    workerId: string
  }> = []
  logUpdates: Array<{ id: string; changes: Record<string, unknown> }> = []
  reminderUpdates: Array<{ id: string; changes: Record<string, unknown> }> = []
  providerUpdates: ProviderStatusUpdate[] = []
  authorizationError: Error | null = null

  async authorizeAdmin(token: string, clinicId: string) {
    this.authorizationCalls.push({ token, clinicId })
    if (this.authorizationError) throw this.authorizationError
  }

  async automationStatus(_clinicId: string) {
    return structuredClone(this.statusResult)
  }

  async claimDue(limit: number, workerId: string) {
    assert.equal(limit, 5)
    assert.equal(workerId, '11111111-1111-4111-8111-111111111111')
    return structuredClone(this.due)
  }

  async getContext(reminder: WhatsAppReminder) {
    return structuredClone(this.contexts.get(reminder.id) ?? null)
  }

  async findCycleLog(clinicId: string, cycle: string) {
    return structuredClone(this.cycleLogs.get(`${clinicId}:${cycle}`) ?? null)
  }

  async reserveLog(input: {
    clinicId: string
    clientId: string
    appointmentId: string
    templateId: string
    cycle: string
    text: string
    workerId: string
  }) {
    this.reserveCalls.push(structuredClone(input))
    const key = `${input.clinicId}:${input.cycle}`
    const existing = this.cycleLogs.get(key)
    if (existing) return { created: false, log: structuredClone(existing) }
    const log = { id: `log-${this.reserveCalls.length}`, canal: 'whatsapp', status: 'processando' }
    this.cycleLogs.set(key, log)
    return { created: true, log: structuredClone(log) }
  }

  async updateLog(id: string, changes: Record<string, unknown>) {
    this.logUpdates.push({ id, changes: structuredClone(changes) })
  }

  async releaseLogReservation(logId: string, _workerId: string) {
    this.cycleLogs.forEach((log, key) => {
      if (log.id === logId) this.cycleLogs.delete(key)
    })
  }

  async updateReminder(id: string, changes: Record<string, unknown>, _expectedWorkerId?: string) {
    this.reminderUpdates.push({ id, changes: structuredClone(changes) })
    return true
  }

  async finalizeAccepted(input: {
    logId: string
    reminderId: string
    workerId: string
    providerMessageId: string
    sentAt: string
  }) {
    this.logUpdates.push({
      id: input.logId,
      changes: { status: 'enviado', provider_message_id: input.providerMessageId },
    })
    this.reminderUpdates.push({
      id: input.reminderId,
      changes: { status: 'enviado', provider_message_id: input.providerMessageId },
    })
    return true
  }

  async applyProviderStatus(update: ProviderStatusUpdate) {
    this.providerUpdates.push(structuredClone(update))
  }
}

class FakeMeta {
  calls: Array<{
    url: string
    method: string
    headers: Headers
    body: Record<string, unknown>
  }> = []
  responseStatus = 200
  responseBody: Record<string, unknown> = { messages: [{ id: 'wamid.test-message' }] }

  fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
    this.calls.push({
      url: String(input),
      method: init.method || 'GET',
      headers,
      body,
    })
    return Response.json(structuredClone(this.responseBody), { status: this.responseStatus })
  }
}

type FixtureOverrides = Partial<{
  validateSendConfiguration: () => void
  missingSecrets: () => string[]
  cronSecret: string | undefined
}>

function createFixture(overrides: FixtureOverrides = {}) {
  const repository = new FakeRepository()
  const meta = new FakeMeta()
  const logs: Array<{ level: string; event: string; details?: unknown }> = []
  const handler = createWhatsAppHandler({
    repository,
    accessToken: () => 'system-user-token',
    phoneNumberId: () => '123456789012345',
    wabaId: () => '987654321098765',
    graphApiVersion: () => 'v25.0',
    webhookVerifyToken: () => 'verify-token',
    appSecret: () => 'meta-app-secret',
    validateSendConfiguration: overrides.validateSendConfiguration || (() => {}),
    missingSecrets: overrides.missingSecrets || (() => []),
    cronSecret: Object.prototype.hasOwnProperty.call(overrides, 'cronSecret')
      ? overrides.cronSecret
      : 'cron-secret',
    allowedOrigins: ['https://app.example.com'],
    allowedOriginPatterns: [/^https:\/\/deploy-[a-z0-9-]+\.example\.com$/],
    fetch: meta.fetch,
    crypto: globalThis.crypto,
    now: () => new Date(NOW),
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
    logger: {
      info(event: string, details?: unknown) {
        logs.push({ level: 'info', event, details })
      },
      warn(event: string, details?: unknown) {
        logs.push({ level: 'warn', event, details })
      },
      error(event: string, details?: unknown) {
        logs.push({ level: 'error', event, details })
      },
    },
  })
  return { repository, meta, handler, logs }
}

function actionRequest(
  action: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return new Request(FUNCTION_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-admin-token',
      Origin: 'https://app.example.com',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ action, clinicId: 'clinic-1', ...body }),
  })
}

function reminder(id: string, dedupeKey: string): WhatsAppReminder {
  const item: WhatsAppReminder = {
    id,
    clinica_id: 'clinic-1',
    agendamento_id: `appointment-${id}`,
    cliente_id: `client-${id}`,
    modelo_mensagem_id: 'template-1',
    regra_mensagem_id: 'rule-1',
    tipo: 'lembrete_agendamento',
    dedupe_key: dedupeKey,
    bloqueado_por: '11111111-1111-4111-8111-111111111111',
    metadata: {
      appointment_start: '2026-08-06T18:30:00.000Z',
      appointment_client_id: `client-${id}`,
      schedule_revision: 1,
    },
  }
  return item
}

function contextFor(item: WhatsAppReminder, consent: 'accepted' | 'missing' | 'opted-out'): WhatsAppContext {
  return {
    appointment: {
      id: item.agendamento_id,
      clinica_id: item.clinica_id,
      cliente_id: item.cliente_id!,
      inicio_em: '2026-08-06T18:30:00.000Z',
      status: 'confirmado',
      whatsapp_schedule_revision: 1,
      arquivado_em: null,
    },
    client: {
      id: item.cliente_id!,
      clinica_id: item.clinica_id,
      nome: '  Maria da Silva  ',
      telefone: '(51) 99999-9999',
      ativo: true,
      arquivado_em: null,
      whatsapp_opt_in_status: consent === 'missing' ? 'pendente' : 'aceito',
      whatsapp_opt_in_em: consent === 'missing' ? null : '2026-08-01T12:00:00.000Z',
      whatsapp_opt_out_em: consent === 'opted-out' ? '2026-08-04T12:00:00.000Z' : null,
    },
    clinic: {
      id: item.clinica_id,
      nome_publico: 'Estetica Schneider',
      fuso_horario: 'America/Sao_Paulo',
    },
    template: {
      id: 'template-1',
      clinica_id: item.clinica_id,
      tipo: item.tipo,
      ativo: true,
      whatsapp_template_name: 'lembrete_agendamento_v1',
      whatsapp_template_language: 'pt_BR',
    },
    rule: {
      id: item.regra_mensagem_id!,
      clinica_id: item.clinica_id,
      modelo_mensagem_id: 'template-1',
      gatilho: 'inicio_agendamento',
      canal_padrao: 'whatsapp_business',
      ativo: true,
      automacao_iniciada_em: '2026-08-01T12:00:00.000Z',
    },
  }
}

async function metaSignature(rawBody: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('meta-app-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return `sha256=${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

Deno.test('normaliza telefones brasileiros e rejeita formatos incompletos', () => {
  assert.equal(normalizeBrazilianPhone('(51) 99999-9999'), '5551999999999')
  assert.equal(normalizeBrazilianPhone('+55 (51) 99999-9999'), '5551999999999')
  assert.equal(normalizeBrazilianPhone('(51) 3333-4444'), '555133334444')
  assert.equal(normalizeBrazilianPhone('(55) 99999-9999'), '5555999999999')

  assert.throws(
    () => normalizeBrazilianPhone('9999-9999'),
    (error: unknown) => error instanceof HttpError && error.status === 400 && /Telefone invalido/.test(error.message),
  )
})

Deno.test('aplica CORS apenas a origens permitidas e exige autenticacao administrativa', async () => {
  const fixture = createFixture()
  const allowed = await fixture.handler(new Request(FUNCTION_URL, {
    method: 'OPTIONS',
    headers: { Origin: 'https://deploy-preview.example.com' },
  }))
  assert.equal(allowed.status, 204)
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://deploy-preview.example.com')
  assert.match(allowed.headers.get('access-control-allow-headers') || '', /authorization/)
  assert.equal(allowed.headers.get('vary'), 'Origin')

  const denied = await fixture.handler(new Request(FUNCTION_URL, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example' },
  }))
  assert.equal(denied.status, 204)
  assert.equal(denied.headers.has('access-control-allow-origin'), false)

  const unauthenticated = await fixture.handler(new Request(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status', clinicId: 'clinic-1' }),
  }))
  assert.equal(unauthenticated.status, 401)
  assert.deepEqual(await unauthenticated.json(), {
    error: 'Sessao nao encontrada. Entre novamente no sistema.',
  })
  assert.equal(fixture.repository.authorizationCalls.length, 0)

  fixture.repository.authorizationError = new HttpError(403, 'Acesso administrativo negado.')
  const forbidden = await fixture.handler(actionRequest('status'))
  assert.equal(forbidden.status, 403)
  assert.deepEqual(await forbidden.json(), { error: 'Acesso administrativo negado.' })
  assert.deepEqual(fixture.repository.authorizationCalls, [{ token: 'valid-admin-token', clinicId: 'clinic-1' }])
})

Deno.test('status informa configuracao e contadores sem validar secrets de envio', async () => {
  let validationCalls = 0
  const fixture = createFixture({
    validateSendConfiguration: () => {
      validationCalls += 1
      throw new Error('nao deveria validar envio no status')
    },
    missingSecrets: () => ['WHATSAPP_SYSTEM_USER_ACCESS_TOKEN', 'META_APP_SECRET'],
  })

  const response = await fixture.handler(actionRequest('status'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    configured: false,
    sendReady: false,
    missingSecrets: ['WHATSAPP_SYSTEM_USER_ACCESS_TOKEN', 'META_APP_SECRET'],
    automaticRules: 2,
    pendingMessages: 3,
    failedMessages: 1,
    recentFailures: [],
    scheduler: { cronActive: true, vaultConfigured: true, lastRunStatus: 'succeeded', lastRunAt: NOW },
  })
  assert.equal(validationCalls, 0)
})

Deno.test('send-test envia hello_world pela Graph API com telefone normalizado', async () => {
  let validationCalls = 0
  const fixture = createFixture({
    validateSendConfiguration: () => {
      validationCalls += 1
    },
  })

  const response = await fixture.handler(actionRequest('send-test', { recipient: '(51) 99999-9999' }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { sent: true, messageId: 'wamid.test-message' })
  assert.equal(validationCalls, 1)
  assert.equal(fixture.meta.calls.length, 1)

  const call = fixture.meta.calls[0]
  assert.equal(call.url, 'https://graph.facebook.com/v25.0/123456789012345/messages')
  assert.equal(call.method, 'POST')
  assert.equal(call.headers.get('authorization'), 'Bearer system-user-token')
  assert.deepEqual(call.body, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '5551999999999',
    type: 'template',
    template: {
      name: 'hello_world',
      language: { code: 'en_US' },
    },
  })
  assert.equal(fixture.logs.some((entry) => entry.event === 'whatsapp_test_message_sent'), true)
})

Deno.test('valida modelo UTILITY aprovado com tres parametros antes da automacao', async () => {
  const fixture = createFixture()
  fixture.meta.responseBody = {
    data: [{
      name: 'lembrete_agendamento_v1',
      language: 'pt_BR',
      status: 'APPROVED',
      category: 'UTILITY',
      components: [{
        type: 'BODY',
        text: 'Ola, {{1}}. Agendamento em {{2}}, as {{3}}.',
      }],
    }],
  }

  const response = await fixture.handler(actionRequest('validate-template', {
    templateName: 'lembrete_agendamento_v1',
    language: 'pt_BR',
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { approved: true, category: 'UTILITY', status: 'APPROVED' })
  assert.match(fixture.meta.calls[0].url, /987654321098765\/message_templates/)

  fixture.meta.responseBody = {
    data: [{
      name: 'lembrete_agendamento_v1',
      language: 'pt_BR',
      status: 'PENDING',
      category: 'UTILITY',
      components: [{ type: 'BODY', text: '{{1}} {{2}} {{3}}' }],
    }],
  }
  const pending = await fixture.handler(actionRequest('validate-template', {
    templateName: 'lembrete_agendamento_v1',
    language: 'pt_BR',
  }))
  assert.equal(pending.status, 409)
})

Deno.test('verifica o token de cadastro do webhook sem exigir autenticacao administrativa', async () => {
  const fixture = createFixture()
  const validUrl = new URL(FUNCTION_URL)
  validUrl.searchParams.set('hub.mode', 'subscribe')
  validUrl.searchParams.set('hub.verify_token', 'verify-token')
  validUrl.searchParams.set('hub.challenge', 'challenge-123')

  const valid = await fixture.handler(new Request(validUrl))
  assert.equal(valid.status, 200)
  assert.equal(await valid.text(), 'challenge-123')

  validUrl.searchParams.set('hub.verify_token', 'wrong-token')
  const invalid = await fixture.handler(new Request(validUrl))
  assert.equal(invalid.status, 403)
  assert.equal(await invalid.text(), 'Forbidden')
  assert.equal(fixture.repository.authorizationCalls.length, 0)
})

Deno.test('valida assinatura do webhook e converte status da Meta', async () => {
  const fixture = createFixture()
  const rawBody = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          statuses: [
            { id: 'wamid.sent', status: 'sent', timestamp: '1785942000' },
            { id: 'wamid.delivered', status: 'delivered', timestamp: '1785942060' },
            { id: 'wamid.read', status: 'read', timestamp: '1785942120' },
            {
              id: 'wamid.failed',
              status: 'failed',
              timestamp: '1785942180',
              errors: [{ code: 131026, title: 'Undeliverable', error_data: { details: 'Recipient unavailable' } }],
            },
          ],
        },
      }],
    }],
  })
  const signature = await metaSignature(rawBody)

  const response = await fixture.handler(new Request(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: rawBody,
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(fixture.repository.providerUpdates, [
    {
      providerMessageId: 'wamid.sent',
      providerStatus: 'sent',
      occurredAt: new Date(1785942000 * 1000).toISOString(),
      status: 'enviado',
      errorCode: null,
      errorDetails: null,
    },
    {
      providerMessageId: 'wamid.delivered',
      providerStatus: 'delivered',
      occurredAt: new Date(1785942060 * 1000).toISOString(),
      status: 'entregue',
      errorCode: null,
      errorDetails: null,
    },
    {
      providerMessageId: 'wamid.read',
      providerStatus: 'read',
      occurredAt: new Date(1785942120 * 1000).toISOString(),
      status: 'lido',
      errorCode: null,
      errorDetails: null,
    },
    {
      providerMessageId: 'wamid.failed',
      providerStatus: 'failed',
      occurredAt: new Date(1785942180 * 1000).toISOString(),
      status: 'erro',
      errorCode: '131026',
      errorDetails: 'Recipient unavailable',
    },
  ])

  const rejected = await fixture.handler(new Request(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': 'sha256=invalid',
    },
    body: rawBody,
  }))
  assert.equal(rejected.status, 401)
  assert.deepEqual(await rejected.json(), { error: 'Assinatura do webhook invalida.' })
  assert.equal(fixture.repository.providerUpdates.length, 4)
})

Deno.test('process-due respeita consentimento e idempotencia antes de enviar', async () => {
  const fixture = createFixture()
  const sendable = reminder('sendable', 'cycle-sendable')
  const withoutConsent = reminder('without-consent', 'cycle-without-consent')
  const optedOut = reminder('opted-out', 'cycle-opted-out')
  const duplicate = reminder('duplicate', 'cycle-duplicate')
  fixture.repository.due = [sendable, withoutConsent, optedOut, duplicate]
  fixture.repository.contexts.set(sendable.id, contextFor(sendable, 'accepted'))
  fixture.repository.contexts.set(withoutConsent.id, contextFor(withoutConsent, 'missing'))
  fixture.repository.contexts.set(optedOut.id, contextFor(optedOut, 'opted-out'))
  fixture.repository.contexts.set(duplicate.id, contextFor(duplicate, 'accepted'))
  fixture.repository.cycleLogs.set('clinic-1:cycle-duplicate', {
    id: 'existing-log',
    canal: 'whatsapp',
    status: 'entregue',
    provider_message_id: 'wamid.existing',
  })

  const response = await fixture.handler(actionRequest('process-due', {}, {
    'x-cron-secret': 'cron-secret',
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    claimed: 4,
    sent: 1,
    dismissed: 2,
    cancelled: 0,
    duplicate: 1,
    failed: 0,
  })

  assert.equal(fixture.meta.calls.length, 1)
  assert.deepEqual(fixture.meta.calls[0].body, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '5551999999999',
    type: 'template',
    template: {
      name: 'lembrete_agendamento_v1',
      language: { code: 'pt_BR' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: 'Maria da Silva' },
          { type: 'text', text: '06/08/2026' },
          { type: 'text', text: '15:30' },
        ],
      }],
    },
  })

  assert.equal(fixture.repository.reserveCalls.length, 1)
  assert.equal(fixture.repository.reserveCalls[0].cycle, 'cycle-sendable')
  assert.match(fixture.repository.reserveCalls[0].text, /Template lembrete_agendamento_v1/)

  const sentUpdate = fixture.repository.reminderUpdates.find((update) => update.id === sendable.id && update.changes.status === 'enviado')
  assert.equal(sentUpdate?.changes.status, 'enviado')
  assert.equal(sentUpdate?.changes.provider_message_id, 'wamid.test-message')
  const missingConsentUpdate = fixture.repository.reminderUpdates.find((update) => update.id === withoutConsent.id && update.changes.status === 'dispensado')
  assert.equal(missingConsentUpdate?.changes.status, 'dispensado')
  const optedOutUpdate = fixture.repository.reminderUpdates.find((update) => update.id === optedOut.id && update.changes.status === 'dispensado')
  assert.equal(optedOutUpdate?.changes.status, 'dispensado')
  const duplicateUpdate = fixture.repository.reminderUpdates.find((update) => update.id === duplicate.id && update.changes.status === 'entregue')
  assert.equal(duplicateUpdate?.changes.status, 'entregue')
  assert.equal(duplicateUpdate?.changes.provider_message_id, 'wamid.existing')

  assert.equal(fixture.repository.logUpdates.length, 1)
  assert.equal(fixture.repository.logUpdates[0].changes.status, 'enviado')
  assert.equal(fixture.repository.logUpdates[0].changes.provider_message_id, 'wamid.test-message')
})

Deno.test('process-due rejeita segredo de cron incorreto antes de consultar a fila', async () => {
  const fixture = createFixture()
  fixture.repository.due = [reminder('should-not-be-claimed', 'cycle-never')]

  const response = await fixture.handler(actionRequest('process-due', {}, {
    'x-cron-secret': 'wrong-secret',
  }))
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'Cron nao autorizado.' })
  assert.equal(fixture.meta.calls.length, 0)
  assert.equal(fixture.repository.reminderUpdates.length, 0)
})
