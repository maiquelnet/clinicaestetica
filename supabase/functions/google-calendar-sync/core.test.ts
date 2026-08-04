import assert from 'node:assert/strict'
import test from 'node:test'
import { createGoogleCalendarHandler } from './core.ts'

type Store = Record<string, Array<Record<string, any>>>

class FakeQuery implements PromiseLike<any> {
  private database: FakeDatabase
  private table: string
  private operation: 'select' | 'update' | 'upsert' | 'delete' = 'select'
  private values: Record<string, any> | undefined
  private equalFilters: Array<[string, any]> = []
  private inFilters: Array<[string, any[]]> = []
  private resultMode: 'many' | 'maybeSingle' | 'single' = 'many'
  private maximum?: number
  private conflictColumns: string[] = []

  constructor(database: FakeDatabase, table: string) {
    this.database = database
    this.table = table
  }

  select(_columns = '*') {
    if (this.operation === 'select') this.operation = 'select'
    return this
  }

  update(values: Record<string, any>) {
    this.operation = 'update'
    this.values = values
    return this
  }

  upsert(values: Record<string, any>, options?: { onConflict?: string }) {
    this.operation = 'upsert'
    this.values = values
    this.conflictColumns = (options?.onConflict || 'id').split(',').map((column) => column.trim())
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  eq(column: string, value: any) {
    this.equalFilters.push([column, value])
    return this
  }

  in(column: string, values: any[]) {
    this.inFilters.push([column, values])
    return this
  }

  order(_column: string) {
    return this
  }

  limit(maximum: number) {
    this.maximum = maximum
    return this
  }

  maybeSingle() {
    this.resultMode = 'maybeSingle'
    return this
  }

  single() {
    this.resultMode = 'single'
    return this
  }

  private matches(row: Record<string, any>) {
    return this.equalFilters.every(([column, value]) => row[column] === value)
      && this.inFilters.every(([column, values]) => values.includes(row[column]))
  }

  private enrich(row: Record<string, any>) {
    const copy = structuredClone(row)
    if (this.table === 'agendamentos') {
      copy.servicos = this.database.store.servicos.find((service) => service.id === row.servico_id) || null
    }
    return copy
  }

  private execute() {
    const rows = this.database.store[this.table] ||= []
    if (this.operation === 'select') {
      let data = rows.filter((row) => this.matches(row)).map((row) => this.enrich(row))
      if (this.maximum !== undefined) data = data.slice(0, this.maximum)
      if (this.resultMode === 'maybeSingle') return { data: data[0] || null, error: null }
      if (this.resultMode === 'single') return data.length === 1
        ? { data: data[0], error: null }
        : { data: null, error: new Error(`Expected one ${this.table} row`) }
      return { data, error: null }
    }

    if (this.operation === 'update') {
      const updated: Record<string, any>[] = []
      for (const row of rows) {
        if (!this.matches(row)) continue
        Object.assign(row, structuredClone(this.values))
        updated.push(this.enrich(row))
      }
      return { data: updated, error: null }
    }

    if (this.operation === 'upsert') {
      let row = rows.find((candidate) => this.conflictColumns.every((column) => candidate[column] === this.values?.[column]))
      if (row) Object.assign(row, structuredClone(this.values))
      else {
        row = { id: `${this.table}-${rows.length + 1}`, criado_em: this.database.now, ...structuredClone(this.values) }
        rows.push(row)
      }
      return { data: this.enrich(row), error: null }
    }

    const deleted = rows.filter((row) => this.matches(row))
    this.database.store[this.table] = rows.filter((row) => !this.matches(row))
    return { data: deleted, error: null }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }
}

class FakeDatabase {
  now = '2026-08-04T15:00:00.000Z'
  store: Store = {
    google_calendar_connections: [],
    agendamentos: [],
    bloqueios_agenda: [],
    usuarios_clinicas: [{ clinica_id: 'clinic-1', perfil_id: 'user-1', papel: 'proprietario', ativo: true }],
    clientes: [{ id: 'client-1', nome: 'Cliente Teste', telefone: '5511999999999', email: 'cliente@example.com' }],
    servicos: [{ id: 'service-1', nome: 'Procedimento Teste' }],
  }

  auth = {
    getUser: async (token: string) => token === 'valid-token'
      ? { data: { user: { id: 'user-1' } }, error: null }
      : { data: { user: null }, error: new Error('invalid token') },
  }

  from(table: string) {
    return new FakeQuery(this, table)
  }
}

class FakeGoogle {
  calls: Array<{ url: string; method: string; body?: any }> = []
  events = new Map<string, Record<string, any>>()
  pullItems: Record<string, any>[] = []
  syncCounter = 0

  fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    const method = init.method || 'GET'
    const contentType = new Headers(init.headers).get('Content-Type') || ''
    const body = typeof init.body === 'string' && contentType.includes('application/json')
      ? JSON.parse(init.body)
      : undefined
    this.calls.push({ url, method, body })

    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600, token_type: 'Bearer' })
    }
    if (url.endsWith('/calendars/primary')) return Response.json({ id: 'primary' })
    if (url.endsWith('/channels/stop')) return new Response(null, { status: 204 })
    if (url.includes('/events/watch')) {
      return Response.json({ resourceId: 'resource-1', expiration: String(Date.parse('2026-08-11T15:00:00.000Z')) })
    }
    if (url.includes('/events?') && method === 'GET') {
      this.syncCounter += 1
      const items = structuredClone(this.pullItems)
      this.pullItems = []
      return Response.json({ items, nextSyncToken: `sync-${this.syncCounter}` })
    }
    if (url.endsWith('/events') && method === 'POST') {
      if (this.events.has(body.id)) return Response.json({ error: 'duplicate' }, { status: 409 })
      const event = { ...body, updated: '2026-08-04T15:01:00.000Z' }
      this.events.set(body.id, event)
      return Response.json(event)
    }

    const eventId = decodeURIComponent(url.split('/events/')[1] || '')
    if (eventId && method === 'PATCH') {
      const event = { ...(this.events.get(eventId) || {}), ...body, id: eventId, updated: '2026-08-04T15:02:00.000Z' }
      this.events.set(eventId, event)
      return Response.json(event)
    }
    if (eventId && method === 'DELETE') {
      this.events.delete(eventId)
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected Google request: ${method} ${url}`)
  }
}

function createFixture(secretOverrides: Partial<{
  googleClientId: () => string
  googleClientSecret: () => string
  tokenEncryptionSecret: () => string
}> = {}) {
  const database = new FakeDatabase()
  const google = new FakeGoogle()
  const background: Promise<unknown>[] = []
  const handler = createGoogleCalendarHandler({
    db: database,
    googleClientId: secretOverrides.googleClientId || (() => 'client-id'),
    googleClientSecret: secretOverrides.googleClientSecret || (() => 'client-secret'),
    tokenEncryptionSecret: secretOverrides.tokenEncryptionSecret || (() => 'test-secret-with-at-least-32-bytes'),
    siteUrl: 'https://app.example.com',
    functionUrl: 'https://project.supabase.co/functions/v1/google-calendar-sync',
    defaultCalendarId: 'primary',
    cronSecret: 'cron-secret',
    allowedOrigins: ['https://app.example.com'],
    allowedOriginPatterns: [],
    fetch: google.fetch,
    crypto: globalThis.crypto,
    now: () => new Date(database.now),
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
    waitUntil: (promise) => background.push(promise),
    logger: { info() {}, warn() {}, error() {} },
  })
  return { database, google, handler, background }
}

test('OPTIONS e status nao dependem dos secrets Google', async () => {
  let secretReads = 0
  const unavailableSecret = () => {
    secretReads += 1
    throw new Error('Google secret ausente')
  }
  const fixture = createFixture({
    googleClientId: unavailableSecret,
    googleClientSecret: unavailableSecret,
    tokenEncryptionSecret: unavailableSecret,
  })

  const optionsResponse = await fixture.handler(new Request(
    'https://project.supabase.co/functions/v1/google-calendar-sync',
    { method: 'OPTIONS', headers: { Origin: 'https://app.example.com' } },
  ))
  assert.equal(optionsResponse.status, 204)
  assert.equal(optionsResponse.headers.get('access-control-allow-origin'), 'https://app.example.com')

  const statusResponse = await fixture.handler(actionRequest('status'))
  assert.equal(statusResponse.status, 200)
  assert.deepEqual(await statusResponse.json(), { connected: false })
  assert.equal(secretReads, 0)
})

function actionRequest(action: string) {
  return new Request('https://project.supabase.co/functions/v1/google-calendar-sync', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token',
      Origin: 'https://app.example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, clinicId: 'clinic-1' }),
  })
}

async function connect(fixture: ReturnType<typeof createFixture>) {
  const startResponse = await fixture.handler(actionRequest('connect'))
  assert.equal(startResponse.status, 200)
  const { authorizationUrl } = await startResponse.json() as { authorizationUrl: string }
  const oauthUrl = new URL(authorizationUrl)
  assert.equal(oauthUrl.origin, 'https://accounts.google.com')
  assert.equal(oauthUrl.searchParams.get('client_id'), 'client-id')
  assert.equal(oauthUrl.searchParams.get('redirect_uri'), 'https://project.supabase.co/functions/v1/google-calendar-sync')

  const callback = new URL('https://project.supabase.co/functions/v1/google-calendar-sync')
  callback.searchParams.set('code', 'authorization-code')
  callback.searchParams.set('state', oauthUrl.searchParams.get('state')!)
  const callbackResponse = await fixture.handler(new Request(callback))
  assert.equal(callbackResponse.status, 302)
  assert.match(callbackResponse.headers.get('location') || '', /googleCalendar=connected/)
}

test('conecta via OAuth e cria uma conexao ativa', async () => {
  const fixture = createFixture()
  await connect(fixture)
  assert.equal(fixture.database.store.google_calendar_connections.length, 1)
  const connection = fixture.database.store.google_calendar_connections[0]
  assert.equal(connection.ativo, true)
  assert.equal(connection.calendar_id, 'primary')
  assert.ok(connection.tokens_encrypted)
  assert.equal(connection.channel_id, '11111111-1111-4111-8111-111111111111')
})

test('envia um agendamento pendente ao Google sem duplicar o ID', async () => {
  const fixture = createFixture()
  await connect(fixture)
  fixture.database.store.agendamentos.push({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    clinica_id: 'clinic-1',
    cliente_id: 'client-1',
    servico_id: 'service-1',
    inicio_em: '2026-08-05T13:00:00.000Z',
    fim_em: '2026-08-05T14:00:00.000Z',
    status: 'confirmado',
    google_sync_status: 'pendente',
    atualizado_em: '2026-08-04T15:00:00.000Z',
  })

  const response = await fixture.handler(actionRequest('sync'))
  assert.equal(response.status, 200)
  const appointment = fixture.database.store.agendamentos[0]
  assert.equal(appointment.google_event_id, 'ceaaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa')
  assert.equal(appointment.google_sync_status, 'sincronizado')
  assert.ok(fixture.google.events.has(appointment.google_event_id))
  const googleEvent = fixture.google.events.get(appointment.google_event_id)!
  assert.equal(googleEvent.summary, 'Procedimento Teste')
  assert.equal(JSON.stringify(googleEvent).includes('Cliente Teste'), false)
  assert.equal(JSON.stringify(googleEvent).includes('cliente@example.com'), false)
  assert.equal(JSON.stringify(googleEvent).includes('5511999999999'), false)
})

test('importa evento externo como bloqueio da agenda', async () => {
  const fixture = createFixture()
  await connect(fixture)
  fixture.google.pullItems = [{
    id: 'external-event',
    summary: 'Compromisso particular',
    updated: '2026-08-04T16:00:00.000Z',
    start: { dateTime: '2026-08-06T12:00:00.000Z' },
    end: { dateTime: '2026-08-06T13:00:00.000Z' },
  }]

  const response = await fixture.handler(actionRequest('sync'))
  assert.equal(response.status, 200)
  assert.equal(fixture.database.store.bloqueios_agenda.length, 1)
  assert.equal(fixture.database.store.bloqueios_agenda[0].google_event_id, 'external-event')
  assert.equal(fixture.database.store.bloqueios_agenda[0].origem, 'google')
})

test('propaga cancelamento do sistema e do Google', async () => {
  const fixture = createFixture()
  await connect(fixture)
  fixture.google.events.set('system-event', { id: 'system-event' })
  fixture.database.store.agendamentos.push({
    id: 'appointment-system-cancel',
    clinica_id: 'clinic-1',
    cliente_id: 'client-1',
    servico_id: 'service-1',
    inicio_em: '2026-08-07T12:00:00.000Z',
    fim_em: '2026-08-07T13:00:00.000Z',
    status: 'cancelado',
    google_event_id: 'system-event',
    google_sync_status: 'pendente',
    atualizado_em: '2026-08-04T15:00:00.000Z',
  }, {
    id: 'appointment-google-cancel',
    clinica_id: 'clinic-1',
    cliente_id: 'client-1',
    servico_id: 'service-1',
    inicio_em: '2026-08-08T12:00:00.000Z',
    fim_em: '2026-08-08T13:00:00.000Z',
    status: 'confirmado',
    google_event_id: 'google-event',
    google_sync_status: 'sincronizado',
    google_atualizado_em: '2026-08-04T14:00:00.000Z',
    atualizado_em: '2026-08-04T15:00:00.000Z',
  })
  fixture.google.pullItems = [{
    id: 'google-event',
    status: 'cancelled',
    updated: '2026-08-04T16:00:00.000Z',
    extendedProperties: { private: { appointmentId: 'appointment-google-cancel', clinicId: 'clinic-1' } },
  }]

  const response = await fixture.handler(actionRequest('sync'))
  assert.equal(response.status, 200)
  assert.equal(fixture.google.events.has('system-event'), false)
  assert.equal(fixture.database.store.agendamentos[0].google_sync_status, 'sincronizado')
  assert.equal(fixture.database.store.agendamentos[1].status, 'cancelado')
})
