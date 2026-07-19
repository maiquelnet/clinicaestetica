import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const ENCRYPTION_SECRET = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY')!
const SITE_URL = Deno.env.get('SITE_URL') || 'https://esteticaschneider.com.br'
const FUNCTION_URL = Deno.env.get('GOOGLE_FUNCTION_URL') || `${SUPABASE_URL}/functions/v1/google-calendar-sync`
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret, x-goog-channel-id, x-goog-channel-token, x-goog-resource-state',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const bytesToBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const base64UrlToBytes = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0))

async function cryptoKey(usage: KeyUsage[]) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ENCRYPTION_SECRET))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, usage)
}
async function encrypt(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(['encrypt']), new TextEncoder().encode(JSON.stringify(value)))
  const result = new Uint8Array(iv.length + encrypted.byteLength)
  result.set(iv); result.set(new Uint8Array(encrypted), iv.length)
  return bytesToBase64Url(result)
}
async function decrypt(value: string) {
  const data = base64UrlToBytes(value)
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, await cryptoKey(['decrypt']), data.slice(12))
  return JSON.parse(new TextDecoder().decode(clear))
}
async function signState(clinicId: string) {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ clinicId, exp: Date.now() + 600_000 })))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(ENCRYPTION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`
}
async function verifyState(state: string) {
  const [payload, signature] = state.split('.')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(ENCRYPTION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const valid = payload && signature && await crypto.subtle.verify('HMAC', key, base64UrlToBytes(signature), new TextEncoder().encode(payload))
  if (!valid) throw new Error('Invalid OAuth state.')
  const value = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)))
  if (value.exp < Date.now()) throw new Error('Estado OAuth expirado.')
  return value.clinicId as string
}

type Connection = {
  id: string; clinica_id: string; calendar_id: string; tokens_encrypted: string; sync_token?: string | null
  channel_id?: string | null; channel_token?: string | null; channel_expires_at?: string | null
}

async function connectionForClinic(clinicId: string) {
  const { data, error } = await db.from('google_calendar_connections').select('*').eq('clinica_id', clinicId).eq('ativo', true).maybeSingle()
  if (error) throw error
  return data as Connection | null
}

async function validAccessToken(connection: Connection) {
  const token = await decrypt(connection.tokens_encrypted)
  if (token.access_token && token.expires_at > Date.now() + 60_000) return token.access_token as string
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: token.refresh_token, grant_type: 'refresh_token' }),
  })
  if (!response.ok) throw new Error(`Falha ao renovar OAuth: ${await response.text()}`)
  const refreshed = await response.json()
  token.access_token = refreshed.access_token
  token.expires_at = Date.now() + refreshed.expires_in * 1000
  const tokens_encrypted = await encrypt(token)
  await db.from('google_calendar_connections').update({ tokens_encrypted }).eq('id', connection.id)
  connection.tokens_encrypted = tokens_encrypted
  return token.access_token as string
}

async function google(connection: Connection, path: string, init: RequestInit = {}, allowMissing = false) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await validAccessToken(connection)}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (allowMissing && [404, 410].includes(response.status)) return null
  if (!response.ok) throw Object.assign(new Error(`Google Calendar ${response.status}: ${await response.text()}`), { status: response.status })
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function pushAppointments(connection: Connection) {
  const { data: appointments, error } = await db.from('agendamentos')
    .select('*,clientes(nome,telefone,email),servicos(nome)')
    .eq('clinica_id', connection.clinica_id).in('google_sync_status', ['pendente', 'erro'])
    .order('atualizado_em').limit(100)
  if (error) throw error
  for (const appointment of appointments || []) {
    try {
      if (appointment.status === 'cancelado') {
        if (appointment.google_event_id) await google(connection, `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(appointment.google_event_id)}`, { method: 'DELETE' }, true)
        await db.from('agendamentos').update({ google_sync_status: 'sincronizado', google_sync_erro: null, google_ultima_sincronizacao_em: new Date().toISOString() }).eq('id', appointment.id)
        continue
      }
      const eventBody = {
        summary: `${appointment.servicos?.nome || 'Atendimento'} â€” ${appointment.clientes?.nome || 'Cliente'}`,
        description: [appointment.clientes?.telefone && `Telefone: ${appointment.clientes.telefone}`,
          appointment.clientes?.email && `E-mail: ${appointment.clientes.email}`, appointment.observacoes].filter(Boolean).join('\n'),
        start: { dateTime: appointment.inicio_em, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: appointment.fim_em, timeZone: 'America/Sao_Paulo' },
        extendedProperties: { private: { source: 'clinicaestetica', appointmentId: appointment.id, clinicId: appointment.clinica_id } },
      }
      const path = appointment.google_event_id
        ? `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(appointment.google_event_id)}`
        : `/calendars/${encodeURIComponent(connection.calendar_id)}/events`
      const event = await google(connection, path, { method: appointment.google_event_id ? 'PATCH' : 'POST', body: JSON.stringify(eventBody) })
      await db.from('agendamentos').update({ google_event_id: event.id, google_sync_status: 'sincronizado', google_sync_erro: null,
        google_atualizado_em: event.updated, google_ultima_sincronizacao_em: new Date().toISOString() }).eq('id', appointment.id)
    } catch (error) {
      await db.from('agendamentos').update({ google_sync_status: 'erro', google_sync_erro: String(error).slice(0, 1000) }).eq('id', appointment.id)
    }
  }
}

async function applyGoogleEvent(connection: Connection, event: any) {
  const appointmentId = event.extendedProperties?.private?.appointmentId
  if (appointmentId) {
    const changes: Record<string, unknown> = { google_event_id: event.id, google_sync_status: 'sincronizado', google_sync_erro: null,
      google_atualizado_em: event.updated, google_ultima_sincronizacao_em: new Date().toISOString() }
    if (event.status === 'cancelled') changes.status = 'cancelado'
    else {
      if (event.start?.dateTime) changes.inicio_em = event.start.dateTime
      if (event.end?.dateTime) changes.fim_em = event.end.dateTime
    }
    await db.from('agendamentos').update(changes).eq('id', appointmentId).eq('clinica_id', connection.clinica_id)
    return
  }
  if (event.status === 'cancelled') {
    await db.from('bloqueios_agenda').delete().eq('clinica_id', connection.clinica_id).eq('google_event_id', event.id)
    return
  }
  const inicio = event.start?.dateTime || event.start?.date
  const fim = event.end?.dateTime || event.end?.date
  if (!inicio || !fim || event.transparency === 'transparent') return
  await db.from('bloqueios_agenda').upsert({ clinica_id: connection.clinica_id, titulo: event.summary || 'Ocupado no Google Agenda',
    motivo: event.description || 'Evento importado do Google Agenda', inicio_em: inicio, fim_em: fim, google_event_id: event.id,
    origem: 'google', google_atualizado_em: event.updated }, { onConflict: 'clinica_id,google_event_id' })
}

async function pullEvents(connection: Connection, reset = false) {
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  do {
    const query = new URLSearchParams({ showDeleted: 'true', singleEvents: 'true', maxResults: '2500', eventTypes: 'default' })
    if (pageToken) query.set('pageToken', pageToken)
    if (connection.sync_token && !reset) query.set('syncToken', connection.sync_token)
    if (!connection.sync_token && !reset) query.set('timeMin', new Date(Date.now() - 365 * 86_400_000).toISOString())
    let result
    try { result = await google(connection, `/calendars/${encodeURIComponent(connection.calendar_id)}/events?${query}`) }
    catch (error) {
      if ((error as { status?: number }).status === 410) {
        await db.from('google_calendar_connections').update({ sync_token: null }).eq('id', connection.id)
        return pullEvents({ ...connection, sync_token: null }, true)
      }
      throw error
    }
    for (const event of result.items || []) await applyGoogleEvent(connection, event)
    pageToken = result.nextPageToken
    nextSyncToken = result.nextSyncToken || nextSyncToken
  } while (pageToken)
  if (nextSyncToken) await db.from('google_calendar_connections').update({ sync_token: nextSyncToken }).eq('id', connection.id)
}

async function ensureWatch(connection: Connection) {
  if (connection.channel_expires_at && new Date(connection.channel_expires_at).getTime() > Date.now() + 86_400_000) return
  const channelId = crypto.randomUUID()
  const channelToken = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const channel = await google(connection, `/calendars/${encodeURIComponent(connection.calendar_id)}/events/watch?eventTypes=default`, {
    method: 'POST', body: JSON.stringify({ id: channelId, type: 'web_hook', address: FUNCTION_URL, token: channelToken, params: { ttl: '604800' } }),
  })
  await db.from('google_calendar_connections').update({ channel_id: channelId, channel_token: channelToken,
    resource_id: channel.resourceId, channel_expires_at: new Date(Number(channel.expiration)).toISOString() }).eq('id', connection.id)
}

async function synchronize(connection: Connection) {
  await pushAppointments(connection)
  await pullEvents(connection)
  const current = await connectionForClinic(connection.clinica_id)
  if (current) await ensureWatch(current)
  await db.from('google_calendar_connections').update({ ultima_sincronizacao_em: new Date().toISOString() }).eq('id', connection.id)
}

async function authorizeUser(request: Request, clinicId: string) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Not authenticated.')
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) throw new Error('Invalid session.')
  const { data: membership } = await db.from('usuarios_clinicas').select('papel').eq('clinica_id', clinicId).eq('perfil_id', user.id).eq('ativo', true).maybeSingle()
  if (!membership || !['proprietario', 'administrador'].includes(membership.papel)) throw new Error('Administrator access required.')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  try {
    const url = new URL(request.url)
    if (url.searchParams.has('code')) {
      const clinicId = await verifyState(url.searchParams.get('state') || '')
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: url.searchParams.get('code')!, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: FUNCTION_URL, grant_type: 'authorization_code' }) })
      if (!response.ok) throw new Error(`Google OAuth: ${await response.text()}`)
      const raw = await response.json()
      if (!raw.refresh_token) throw new Error('Refresh token not received; revoke the previous access and reconnect.')
      const tokens_encrypted = await encrypt({ access_token: raw.access_token, refresh_token: raw.refresh_token, expires_at: Date.now() + raw.expires_in * 1000 })
      const { data, error } = await db.from('google_calendar_connections').upsert({ clinica_id: clinicId, calendar_id: 'primary', tokens_encrypted,
        sync_token: null, ativo: true }, { onConflict: 'clinica_id' }).select().single()
      if (error) throw error
      await synchronize(data as Connection)
      return Response.redirect(`${SITE_URL}/dashboard/configuracoes?googleCalendar=connected`, 302)
    }

    const channelId = request.headers.get('x-goog-channel-id')
    if (channelId) {
      const { data: connection } = await db.from('google_calendar_connections').select('*').eq('channel_id', channelId).eq('ativo', true).maybeSingle()
      if (!connection || request.headers.get('x-goog-channel-token') !== connection.channel_token) return json({ error: 'Invalid webhook.' }, 401)
      if (request.headers.get('x-goog-resource-state') !== 'sync') EdgeRuntime.waitUntil(synchronize(connection as Connection))
      return new Response(null, { status: 204, headers: cors })
    }

    const { action, clinicId } = await request.json()
    if (action === 'sync-all') {
      const expected = Deno.env.get('GOOGLE_SYNC_CRON_SECRET')
      if (!expected || request.headers.get('x-cron-secret') !== expected) return json({ error: 'Cron unauthorized.' }, 401)
      const { data: connections, error } = await db.from('google_calendar_connections').select('*').eq('ativo', true)
      if (error) throw error
      for (const connection of connections || []) await synchronize(connection as Connection)
      return json({ synchronized: connections?.length || 0 })
    }
    if (!clinicId) return json({ error: 'clinicId required.' }, 400)
    await authorizeUser(request, clinicId)
    if (action === 'connect') {
      const query = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: FUNCTION_URL, response_type: 'code', access_type: 'offline',
        prompt: 'consent', include_granted_scopes: 'true', scope: 'https://www.googleapis.com/auth/calendar', state: await signState(clinicId) })
      return json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}` })
    }
    const connection = await connectionForClinic(clinicId)
    if (action === 'status') return json(connection ? { connected: true, calendarId: connection.calendar_id,
      lastSyncAt: (connection as any).ultima_sincronizacao_em, channelExpiresAt: connection.channel_expires_at } : { connected: false })
    if (action === 'sync') {
      if (!connection) return json({ error: 'Google Calendar is not connected.' }, 409)
      await synchronize(connection)
      return json({ synchronized: true })
    }
    return json({ error: 'Invalid action.' }, 400)
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500)
  }
})
