import { supabase } from './supabase'

type CalendarStatus = {
  connected: boolean
  calendarId?: string
  lastSyncAt?: string | null
  channelExpiresAt?: string | null
}

async function invoke<T>(action: string, clinicId: string): Promise<T> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session) {
    throw new Error('Sua sessao expirou. Entre novamente antes de acessar o Google Agenda.')
  }

  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action, clinicId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    let message = error.message
    const context = 'context' in error ? error.context : null
    if (context instanceof Response) {
      const body = await context.clone().json().catch(() => null) as { error?: string } | null
      if (body?.error) message = body.error
    }
    throw new Error(message)
  }
  return data as T
}

export const getGoogleCalendarStatus = (clinicId: string) =>
  invoke<CalendarStatus>('status', clinicId)

export const connectGoogleCalendar = async (clinicId: string) => {
  const result = await invoke<{ authorizationUrl: string }>('connect', clinicId)
  const authorizationUrl = new URL(result.authorizationUrl)
  if (authorizationUrl.origin !== 'https://accounts.google.com') {
    throw new Error('O servidor retornou uma URL de autorizacao invalida.')
  }
  window.location.assign(authorizationUrl.toString())
}

export const requestGoogleCalendarSync = (clinicId: string) =>
  invoke<{ synchronized: boolean }>('sync', clinicId)
