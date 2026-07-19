import { supabase } from './supabase'

type CalendarStatus = {
  connected: boolean
  calendarId?: string
  lastSyncAt?: string | null
  channelExpiresAt?: string | null
}

async function invoke<T>(action: string, clinicId: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action, clinicId },
  })
  if (error) throw error
  return data as T
}

export const getGoogleCalendarStatus = (clinicId: string) =>
  invoke<CalendarStatus>('status', clinicId)

export const connectGoogleCalendar = async (clinicId: string) => {
  const result = await invoke<{ authorizationUrl: string }>('connect', clinicId)
  window.location.assign(result.authorizationUrl)
}

export const requestGoogleCalendarSync = (clinicId: string) =>
  invoke<{ synchronized: boolean }>('sync', clinicId)

