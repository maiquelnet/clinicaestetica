export type Connection = {
  id: string
  clinica_id: string
  calendar_id: string
  tokens_encrypted: string
  sync_token?: string | null
  channel_id?: string | null
  channel_token?: string | null
  resource_id?: string | null
  channel_expires_at?: string | null
  ultima_sincronizacao_em?: string | null
  ativo?: boolean | null
}

type Runtime = {
  db: any
  googleClientId: () => string
  googleClientSecret: () => string
  tokenEncryptionSecret: () => string
  siteUrl: string
  functionUrl: string
  defaultCalendarId: string
  cronSecret?: string
  allowedOrigins: string[]
  allowedOriginPatterns?: RegExp[]
  fetch: typeof fetch
  crypto: Crypto
  now: () => Date
  randomUUID: () => string
  waitUntil: (promise: Promise<unknown>) => void
  logger: Pick<Console, 'info' | 'warn' | 'error'>
}

type GoogleEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  transparency?: string
  updated?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  extendedProperties?: { private?: Record<string, string> }
}

type TokenPayload = {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  scope?: string
  token_type?: string
}

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'HttpError'
  }
}

class GoogleApiError extends HttpError {
  googleStatus: number

  constructor(googleStatus: number, message: string) {
    super(502, message)
    this.googleStatus = googleStatus
    this.name = 'GoogleApiError'
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Erro inesperado.'
}

function publicErrorMessage(error: unknown) {
  return error instanceof HttpError ? error.message : 'Nao foi possivel concluir a operacao com o Google Agenda.'
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0))
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  if (leftBytes.length !== rightBytes.length) return false
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index]
  return difference === 0
}

function deterministicEventId(appointmentId: string) {
  return `ce${appointmentId.replaceAll('-', '').toLowerCase()}`
}

export function createGoogleCalendarHandler(runtime: Runtime) {
  const siteOrigin = new URL(runtime.siteUrl).origin
  const allowedOrigins = new Set([siteOrigin, ...runtime.allowedOrigins])

  function corsHeaders(request: Request) {
    const headers = new Headers({
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret, x-goog-channel-id, x-goog-channel-token, x-goog-resource-id, x-goog-resource-state',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Vary': 'Origin',
    })
    const origin = request.headers.get('Origin')
    const originAllowed = origin && (
      allowedOrigins.has(origin)
      || runtime.allowedOriginPatterns?.some((pattern) => pattern.test(origin))
    )
    if (originAllowed) headers.set('Access-Control-Allow-Origin', origin)
    return headers
  }

  function json(request: Request, body: unknown, status = 200) {
    const headers = corsHeaders(request)
    headers.set('Content-Type', 'application/json')
    headers.set('Cache-Control', 'no-store')
    return new Response(JSON.stringify(body), { status, headers })
  }

  function settingsRedirect(result: 'connected' | 'cancelled' | 'error', message?: string) {
    const destination = new URL('/configuracoes/parametros', runtime.siteUrl)
    destination.searchParams.set('googleCalendar', result)
    if (message) destination.searchParams.set('googleCalendarMessage', message)
    return Response.redirect(destination.toString(), 302)
  }

  async function derivedKey(context: 'encryption' | 'state', usage: KeyUsage[]) {
    const material = encoder.encode(`google-calendar:${context}\0${runtime.tokenEncryptionSecret()}`)
    const digest = await runtime.crypto.subtle.digest('SHA-256', material)
    if (context === 'encryption') {
      return runtime.crypto.subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, usage)
    }
    return runtime.crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, usage)
  }

  async function legacyEncryptionKey() {
    const digest = await runtime.crypto.subtle.digest('SHA-256', encoder.encode(runtime.tokenEncryptionSecret()))
    return runtime.crypto.subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  }

  async function encrypt(value: unknown) {
    const iv = runtime.crypto.getRandomValues(new Uint8Array(12))
    const clear = encoder.encode(JSON.stringify(value))
    const encrypted = await runtime.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await derivedKey('encryption', ['encrypt']), clear)
    const result = new Uint8Array(iv.length + encrypted.byteLength)
    result.set(iv)
    result.set(new Uint8Array(encrypted), iv.length)
    return bytesToBase64Url(result)
  }

  async function decrypt(value: string): Promise<TokenPayload> {
    const data = base64UrlToBytes(value)
    if (data.length < 29) throw new HttpError(500, 'Credenciais Google armazenadas em formato invalido.')
    let clear: ArrayBuffer
    try {
      clear = await runtime.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: data.slice(0, 12) },
        await derivedKey('encryption', ['decrypt']),
        data.slice(12),
      )
    } catch {
      // Compatibilidade com tokens gravados antes da separacao das chaves AES/HMAC.
      clear = await runtime.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: data.slice(0, 12) },
        await legacyEncryptionKey(),
        data.slice(12),
      )
    }
    return JSON.parse(decoder.decode(clear)) as TokenPayload
  }

  async function signState(clinicId: string, userId: string) {
    const payload = bytesToBase64Url(encoder.encode(JSON.stringify({
      clinicId,
      userId,
      nonce: runtime.randomUUID(),
      exp: runtime.now().getTime() + 600_000,
    })))
    const signature = await runtime.crypto.subtle.sign('HMAC', await derivedKey('state', ['sign']), encoder.encode(payload))
    return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`
  }

  async function verifyState(state: string) {
    const [payload, signature] = state.split('.')
    if (!payload || !signature) throw new HttpError(400, 'Estado OAuth ausente ou invalido.')
    const valid = await runtime.crypto.subtle.verify(
      'HMAC',
      await derivedKey('state', ['verify']),
      base64UrlToBytes(signature),
      encoder.encode(payload),
    )
    if (!valid) throw new HttpError(400, 'Estado OAuth invalido.')
    const value = JSON.parse(decoder.decode(base64UrlToBytes(payload))) as Record<string, unknown>
    if (typeof value.clinicId !== 'string' || typeof value.userId !== 'string') throw new HttpError(400, 'Estado OAuth incompleto.')
    if (typeof value.exp !== 'number' || value.exp < runtime.now().getTime()) throw new HttpError(400, 'Estado OAuth expirado.')
    return value as { clinicId: string; userId: string }
  }

  async function connectionForClinic(clinicId: string) {
    const { data, error } = await runtime.db
      .from('google_calendar_connections')
      .select('*')
      .eq('clinica_id', clinicId)
      .eq('ativo', true)
      .maybeSingle()
    if (error) throw error
    return data as Connection | null
  }

  async function validAccessToken(connection: Connection) {
    const token = await decrypt(connection.tokens_encrypted)
    const expiresAt = Number(token.expires_at || 0)
    if (token.access_token && expiresAt > runtime.now().getTime() + 60_000) return token.access_token
    if (!token.refresh_token) throw new HttpError(409, 'A conexao Google precisa ser refeita.')

    const response = await runtime.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: runtime.googleClientId(),
        client_secret: runtime.googleClientSecret(),
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    if (!response.ok) {
      runtime.logger.error('google_token_refresh_failed', { status: response.status, details: await response.text() })
      throw new HttpError(502, 'Falha ao renovar a autorizacao do Google.')
    }

    const refreshed = await response.json() as TokenPayload
    if (!refreshed.access_token) throw new HttpError(502, 'O Google nao retornou um access token valido.')
    token.access_token = refreshed.access_token
    token.expires_at = runtime.now().getTime() + Number(refreshed.expires_in || 3600) * 1000
    if (refreshed.scope) token.scope = refreshed.scope
    const tokensEncrypted = await encrypt(token)
    const { error } = await runtime.db.from('google_calendar_connections').update({
      tokens_encrypted: tokensEncrypted,
      atualizado_em: runtime.now().toISOString(),
    }).eq('id', connection.id)
    if (error) throw error
    connection.tokens_encrypted = tokensEncrypted
    return token.access_token
  }

  async function google(connection: Connection, path: string, init: RequestInit = {}, allowMissing = false) {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${await validAccessToken(connection)}`)
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await runtime.fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers,
    })
    if (allowMissing && [404, 410].includes(response.status)) return null
    if (!response.ok) {
      const details = await response.text()
      runtime.logger.error('google_calendar_api_failed', { path, status: response.status, details })
      throw new GoogleApiError(response.status, `Falha na API do Google Agenda (${response.status}).`)
    }
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }

  async function validateGoogleCalendar(accessToken: string, calendarId: string) {
    const response = await runtime.fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) {
      runtime.logger.error('google_calendar_validation_failed', { status: response.status, details: await response.text() })
      throw new HttpError(502, 'Nao foi possivel acessar a agenda Google selecionada.')
    }
  }

  async function pushAppointments(connection: Connection) {
    const { data: appointments, error } = await runtime.db
      .from('agendamentos')
      .select('*,servicos(nome)')
      .eq('clinica_id', connection.clinica_id)
      .in('google_sync_status', ['pendente', 'erro'])
      .order('atualizado_em')
      .limit(100)
    if (error) throw error

    for (const appointment of appointments || []) {
      try {
        const eventId = appointment.google_event_id || deterministicEventId(appointment.id)
        if (appointment.status === 'cancelado' || appointment.arquivado_em) {
          await google(
            connection,
            `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(eventId)}`,
            { method: 'DELETE' },
            true,
          )
          const { error: updateError } = await runtime.db.from('agendamentos').update({
            google_event_id: appointment.google_event_id || eventId,
            google_sync_status: 'sincronizado',
            google_sync_erro: null,
            google_ultima_sincronizacao_em: runtime.now().toISOString(),
          }).eq('id', appointment.id).eq('clinica_id', connection.clinica_id)
          if (updateError) throw updateError
          continue
        }

        const eventBody = {
          id: eventId,
          summary: appointment.servicos?.nome || 'Atendimento',
          description: 'Horario reservado pelo sistema da clinica.',
          start: { dateTime: appointment.inicio_em, timeZone: 'America/Sao_Paulo' },
          end: { dateTime: appointment.fim_em, timeZone: 'America/Sao_Paulo' },
          extendedProperties: {
            private: {
              source: 'clinicaestetica',
              appointmentId: appointment.id,
              clinicId: appointment.clinica_id,
            },
          },
        }

        let event: GoogleEvent
        if (appointment.google_event_id) {
          event = await google(
            connection,
            `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(eventId)}`,
            { method: 'PATCH', body: JSON.stringify(eventBody) },
          ) as GoogleEvent
        } else {
          try {
            event = await google(
              connection,
              `/calendars/${encodeURIComponent(connection.calendar_id)}/events`,
              { method: 'POST', body: JSON.stringify(eventBody) },
            ) as GoogleEvent
          } catch (insertError) {
            if (!(insertError instanceof GoogleApiError) || insertError.googleStatus !== 409) throw insertError
            event = await google(
              connection,
              `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(eventId)}`,
              { method: 'PATCH', body: JSON.stringify(eventBody) },
            ) as GoogleEvent
          }
        }

        const { error: updateError } = await runtime.db.from('agendamentos').update({
          google_event_id: event.id || eventId,
          google_sync_status: 'sincronizado',
          google_sync_erro: null,
          google_atualizado_em: event.updated || runtime.now().toISOString(),
          google_ultima_sincronizacao_em: runtime.now().toISOString(),
        }).eq('id', appointment.id).eq('clinica_id', connection.clinica_id)
        if (updateError) throw updateError
      } catch (appointmentError) {
        runtime.logger.error('google_appointment_push_failed', { appointmentId: appointment.id, message: errorMessage(appointmentError) })
        await runtime.db.from('agendamentos').update({
          google_sync_status: 'erro',
          google_sync_erro: errorMessage(appointmentError).slice(0, 1000),
        }).eq('id', appointment.id).eq('clinica_id', connection.clinica_id)
      }
    }
  }

  async function applyGoogleEvent(connection: Connection, event: GoogleEvent) {
    const privateProperties = event.extendedProperties?.private
    const appointmentId = privateProperties?.appointmentId
    if (privateProperties?.clinicId && privateProperties.clinicId !== connection.clinica_id) {
      runtime.logger.warn('google_event_clinic_mismatch', { eventId: event.id })
      return
    }

    if (appointmentId) {
      const { data: appointment, error: appointmentError } = await runtime.db
        .from('agendamentos')
        .select('id,google_atualizado_em')
        .eq('id', appointmentId)
        .eq('clinica_id', connection.clinica_id)
        .maybeSingle()
      if (appointmentError) throw appointmentError
      if (!appointment) return
      if (
        event.updated
        && appointment.google_atualizado_em
        && new Date(appointment.google_atualizado_em).getTime() >= new Date(event.updated).getTime()
      ) return

      const changes: Record<string, unknown> = {
        google_event_id: event.id,
        google_sync_status: 'sincronizado',
        google_sync_erro: null,
        google_atualizado_em: event.updated || runtime.now().toISOString(),
        google_ultima_sincronizacao_em: runtime.now().toISOString(),
      }
      if (event.status === 'cancelled') changes.status = 'cancelado'
      else {
        if (event.start?.dateTime) changes.inicio_em = event.start.dateTime
        if (event.end?.dateTime) changes.fim_em = event.end.dateTime
      }
      const { error } = await runtime.db.from('agendamentos').update(changes)
        .eq('id', appointmentId)
        .eq('clinica_id', connection.clinica_id)
      if (error) throw error
      return
    }

    if (event.status === 'cancelled' || event.transparency === 'transparent') {
      const { error } = await runtime.db.from('bloqueios_agenda').delete()
        .eq('clinica_id', connection.clinica_id)
        .eq('google_event_id', event.id)
      if (error) throw error
      return
    }

    const start = event.start?.dateTime || event.start?.date
    const end = event.end?.dateTime || event.end?.date
    if (!start || !end) return
    const { error } = await runtime.db.from('bloqueios_agenda').upsert({
      clinica_id: connection.clinica_id,
      titulo: event.summary || 'Ocupado no Google Agenda',
      motivo: event.description || 'Evento importado do Google Agenda',
      inicio_em: start,
      fim_em: end,
      google_event_id: event.id,
      origem: 'google',
      google_atualizado_em: event.updated || runtime.now().toISOString(),
      atualizado_em: runtime.now().toISOString(),
    }, { onConflict: 'clinica_id,google_event_id' })
    if (error) throw error
  }

  async function pullEvents(connection: Connection, reset = false): Promise<void> {
    let pageToken: string | undefined
    let nextSyncToken: string | undefined
    do {
      const query = new URLSearchParams({
        showDeleted: 'true',
        singleEvents: 'true',
        maxResults: '2500',
        eventTypes: 'default',
      })
      if (pageToken) query.set('pageToken', pageToken)
      if (connection.sync_token && !reset) query.set('syncToken', connection.sync_token)
      else query.set('timeMin', new Date(runtime.now().getTime() - 365 * 86_400_000).toISOString())

      let result: { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }
      try {
        result = await google(connection, `/calendars/${encodeURIComponent(connection.calendar_id)}/events?${query}`) as typeof result
      } catch (pullError) {
        if (pullError instanceof GoogleApiError && pullError.googleStatus === 410) {
          const { error } = await runtime.db.from('google_calendar_connections').update({ sync_token: null }).eq('id', connection.id)
          if (error) throw error
          connection.sync_token = null
          return pullEvents(connection, true)
        }
        throw pullError
      }

      for (const event of result.items || []) await applyGoogleEvent(connection, event)
      pageToken = result.nextPageToken
      nextSyncToken = result.nextSyncToken || nextSyncToken
    } while (pageToken)

    if (nextSyncToken) {
      const { error } = await runtime.db.from('google_calendar_connections').update({
        sync_token: nextSyncToken,
        atualizado_em: runtime.now().toISOString(),
      }).eq('id', connection.id)
      if (error) throw error
      connection.sync_token = nextSyncToken
    }
  }

  async function stopWatch(connection: Connection) {
    if (!connection.channel_id || !connection.resource_id) return
    try {
      await google(connection, '/channels/stop', {
        method: 'POST',
        body: JSON.stringify({ id: connection.channel_id, resourceId: connection.resource_id }),
      }, true)
    } catch (error) {
      runtime.logger.warn('google_calendar_channel_stop_failed', { connectionId: connection.id, message: errorMessage(error) })
    }
  }

  async function ensureWatch(connection: Connection) {
    if (connection.channel_expires_at && new Date(connection.channel_expires_at).getTime() > runtime.now().getTime() + 86_400_000) return
    await stopWatch(connection)

    const channelId = runtime.randomUUID()
    const channelToken = bytesToBase64Url(runtime.crypto.getRandomValues(new Uint8Array(32)))
    const channel = await google(
      connection,
      `/calendars/${encodeURIComponent(connection.calendar_id)}/events/watch?eventTypes=default`,
      {
        method: 'POST',
        body: JSON.stringify({
          id: channelId,
          type: 'web_hook',
          address: runtime.functionUrl,
          token: channelToken,
          params: { ttl: '604800' },
        }),
      },
    ) as { resourceId?: string; expiration?: string }
    if (!channel.resourceId || !channel.expiration) throw new HttpError(502, 'O Google nao confirmou o canal de sincronizacao.')

    const expiresAt = new Date(Number(channel.expiration)).toISOString()
    const { error } = await runtime.db.from('google_calendar_connections').update({
      channel_id: channelId,
      channel_token: channelToken,
      resource_id: channel.resourceId,
      channel_expires_at: expiresAt,
      atualizado_em: runtime.now().toISOString(),
    }).eq('id', connection.id)
    if (error) throw error
    Object.assign(connection, {
      channel_id: channelId,
      channel_token: channelToken,
      resource_id: channel.resourceId,
      channel_expires_at: expiresAt,
    })
  }

  async function synchronize(connection: Connection) {
    await pushAppointments(connection)
    await pullEvents(connection)
    const current = await connectionForClinic(connection.clinica_id)
    if (current) await ensureWatch(current)
    const synchronizedAt = runtime.now().toISOString()
    const { error } = await runtime.db.from('google_calendar_connections').update({
      ultima_sincronizacao_em: synchronizedAt,
      atualizado_em: synchronizedAt,
    }).eq('id', connection.id)
    if (error) throw error
  }

  async function authorizeUser(request: Request, clinicId: string) {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) throw new HttpError(401, 'Sessao nao encontrada. Entre novamente no sistema.')
    const { data: { user }, error } = await runtime.db.auth.getUser(token)
    if (error || !user) throw new HttpError(401, 'Sessao invalida ou expirada. Entre novamente no sistema.')
    await authorizeMembership(clinicId, user.id)
    return user.id as string
  }

  async function authorizeMembership(clinicId: string, userId: string) {
    const { data: membership, error } = await runtime.db.from('usuarios_clinicas')
      .select('papel')
      .eq('clinica_id', clinicId)
      .eq('perfil_id', userId)
      .eq('ativo', true)
      .maybeSingle()
    if (error) throw error
    if (!membership || !['proprietario', 'administrador'].includes(membership.papel)) {
      throw new HttpError(403, 'Apenas proprietarios e administradores podem conectar o Google Agenda.')
    }
  }

  async function handleOAuthCallback(url: URL) {
    const googleError = url.searchParams.get('error')
    if (googleError) {
      runtime.logger.warn('google_oauth_denied', { error: googleError })
      return settingsRedirect(googleError === 'access_denied' ? 'cancelled' : 'error', 'Autorizacao do Google nao concluida.')
    }

    const code = url.searchParams.get('code')
    if (!code) throw new HttpError(400, 'Codigo OAuth ausente.')
    const { clinicId, userId } = await verifyState(url.searchParams.get('state') || '')
    await authorizeMembership(clinicId, userId)

    const response = await runtime.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: runtime.googleClientId(),
        client_secret: runtime.googleClientSecret(),
        redirect_uri: runtime.functionUrl,
        grant_type: 'authorization_code',
      }),
    })
    if (!response.ok) {
      runtime.logger.error('google_oauth_exchange_failed', { status: response.status, details: await response.text() })
      throw new HttpError(502, 'O Google recusou a troca do codigo de autorizacao.')
    }

    const raw = await response.json() as TokenPayload
    if (!raw.access_token) throw new HttpError(502, 'O Google nao retornou um access token.')
    const existing = await connectionForClinic(clinicId)
    let refreshToken = raw.refresh_token
    if (!refreshToken && existing) refreshToken = (await decrypt(existing.tokens_encrypted)).refresh_token
    if (!refreshToken) throw new HttpError(409, 'O Google nao retornou um refresh token. Revogue o acesso anterior e tente novamente.')

    await validateGoogleCalendar(raw.access_token, runtime.defaultCalendarId)
    if (existing) await stopWatch(existing)
    const tokensEncrypted = await encrypt({
      access_token: raw.access_token,
      refresh_token: refreshToken,
      expires_at: runtime.now().getTime() + Number(raw.expires_in || 3600) * 1000,
      scope: raw.scope,
      token_type: raw.token_type,
    })

    const { data, error } = await runtime.db.from('google_calendar_connections').upsert({
      clinica_id: clinicId,
      calendar_id: runtime.defaultCalendarId,
      tokens_encrypted: tokensEncrypted,
      sync_token: null,
      channel_id: null,
      channel_token: null,
      resource_id: null,
      channel_expires_at: null,
      ativo: true,
      atualizado_em: runtime.now().toISOString(),
    }, { onConflict: 'clinica_id' }).select().single()
    if (error) throw error

    let syncMessage: string | undefined
    try {
      await synchronize(data as Connection)
    } catch (syncError) {
      runtime.logger.error('google_initial_sync_failed', { clinicId, message: errorMessage(syncError) })
      syncMessage = 'Conta conectada; a primeira sincronizacao sera tentada novamente.'
    }
    runtime.logger.info('google_calendar_connected', { clinicId, calendarId: runtime.defaultCalendarId })
    return settingsRedirect('connected', syncMessage)
  }

  async function handleWebhook(request: Request) {
    const channelId = request.headers.get('x-goog-channel-id')
    const channelToken = request.headers.get('x-goog-channel-token')
    const resourceId = request.headers.get('x-goog-resource-id')
    if (!channelId || !channelToken) return null

    const { data: connection, error } = await runtime.db.from('google_calendar_connections')
      .select('*')
      .eq('channel_id', channelId)
      .eq('ativo', true)
      .maybeSingle()
    if (error) throw error
    if (!connection || !timingSafeEqual(channelToken, connection.channel_token || '')) {
      return json(request, { error: 'Webhook invalido.' }, 401)
    }
    if (resourceId && connection.resource_id && resourceId !== connection.resource_id) {
      return json(request, { error: 'Recurso do webhook invalido.' }, 401)
    }
    if (request.headers.get('x-goog-resource-state') !== 'sync') {
      runtime.waitUntil(synchronize(connection as Connection).catch((syncError) => {
        runtime.logger.error('google_webhook_sync_failed', { connectionId: connection.id, message: errorMessage(syncError) })
      }))
    }
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }

  return async function handler(request: Request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })

    try {
      const url = new URL(request.url)
      if (request.method === 'GET' && (url.searchParams.has('code') || url.searchParams.has('error'))) {
        try {
          return await handleOAuthCallback(url)
        } catch (callbackError) {
          runtime.logger.error('google_oauth_callback_failed', { message: errorMessage(callbackError) })
          return settingsRedirect('error', publicErrorMessage(callbackError))
        }
      }

      const webhookResponse = await handleWebhook(request)
      if (webhookResponse) return webhookResponse
      if (request.method !== 'POST') return json(request, { error: 'Metodo nao permitido.' }, 405)

      const payload = await request.json().catch(() => ({})) as Record<string, unknown>
      const action = typeof payload.action === 'string' ? payload.action : 'status'
      const clinicId = typeof payload.clinicId === 'string'
        ? payload.clinicId
        : typeof payload.clinic_id === 'string' ? payload.clinic_id : undefined

      if (action === 'sync-all') {
        if (!runtime.cronSecret || !timingSafeEqual(request.headers.get('x-cron-secret') || '', runtime.cronSecret)) {
          return json(request, { error: 'Cron nao autorizado.' }, 401)
        }
        const { data: connections, error } = await runtime.db.from('google_calendar_connections').select('*').eq('ativo', true)
        if (error) throw error
        const results = await Promise.allSettled((connections || []).map((connection: Connection) => synchronize(connection)))
        const failed = results.filter((result) => result.status === 'rejected').length
        return json(request, { synchronized: results.length - failed, failed })
      }

      if (!clinicId) return json(request, { error: 'clinicId obrigatorio.' }, 400)
      const userId = await authorizeUser(request, clinicId)
      if (action === 'connect') {
        const query = new URLSearchParams({
          client_id: runtime.googleClientId(),
          redirect_uri: runtime.functionUrl,
          response_type: 'code',
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'true',
          scope: 'https://www.googleapis.com/auth/calendar',
          state: await signState(clinicId, userId),
        })
        return json(request, { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}` })
      }

      const connection = await connectionForClinic(clinicId)
      if (action === 'status') {
        return json(request, connection ? {
          connected: true,
          calendarId: connection.calendar_id,
          lastSyncAt: connection.ultima_sincronizacao_em,
          channelExpiresAt: connection.channel_expires_at,
        } : { connected: false })
      }
      if (action === 'sync') {
        if (!connection) return json(request, { error: 'Google Agenda nao conectado.' }, 409)
        await synchronize(connection)
        return json(request, { synchronized: true })
      }
      return json(request, { error: 'Acao invalida.' }, 400)
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      runtime.logger.error('google_calendar_request_failed', { status, message: errorMessage(error) })
      return json(request, { error: publicErrorMessage(error) }, status)
    }
  }
}
