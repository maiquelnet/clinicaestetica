import { appEnv } from './env'
import { supabase } from './supabase'

type FacebookLoginResponse = {
  status?: string
  authResponse?: { code?: string }
}

type FacebookSdk = {
  init: (options: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void
  login: (callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>) => void
}

type SignupSessionInfo = {
  waba_id?: string
  phone_number_id?: string
  [key: string]: unknown
}

export type WhatsAppOnboardingStatus = {
  configured: boolean
  serverConfigured: boolean
  missingServerSecrets: string[]
  integration: {
    appId: string
    wabaId: string
    phoneNumberId: string
    displayPhoneNumber: string | null
    coexistenceEnabled: boolean
    onboardingEvent: string | null
    completedAt: string | null
    accessTokenExpiresAt: string | null
    active: boolean
  } | null
}

export type WhatsAppOnboardingResult = {
  connected: true
  coexistenceEnabled: true
  appId: string
  wabaId: string
  phoneNumberId: string
  displayPhoneNumber: string | null
  onboardingEvent: string
  completedAt: string
  accessTokenExpiresAt: string | null
  webhookUrl: string
  nextStep: string
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

let facebookSdkPromise: Promise<FacebookSdk> | null = null

function isFacebookOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'facebook.com' || hostname.endsWith('.facebook.com')
  } catch {
    return false
  }
}

function parseSignupMessage(event: MessageEvent) {
  if (!isFacebookOrigin(event.origin)) return null
  const raw = typeof event.data === 'string' ? event.data : event.data
  let data: Record<string, unknown>
  try {
    data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>
  } catch {
    return null
  }
  if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return null
  return {
    event: typeof data.event === 'string' ? data.event : '',
    data: (data.data && typeof data.data === 'object' ? data.data : {}) as SignupSessionInfo,
  }
}

function loadFacebookSdk() {
  if (window.FB) return Promise.resolve(window.FB)
  if (facebookSdkPromise) return facebookSdkPromise

  facebookSdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    if (!appEnv.metaAppId) {
      reject(new Error('Configure VITE_META_APP_ID para habilitar o Embedded Signup.'))
      return
    }

    const timeout = window.setTimeout(() => reject(new Error('A SDK da Meta demorou demais para carregar.')), 15_000)
    window.fbAsyncInit = () => {
      window.clearTimeout(timeout)
      if (!window.FB) {
        reject(new Error('A SDK da Meta carregou sem disponibilizar o Facebook Login.'))
        return
      }
      window.FB.init({ appId: appEnv.metaAppId, cookie: true, xfbml: true, version: appEnv.metaGraphVersion })
      resolve(window.FB)
    }

    const existing = document.getElementById('facebook-jssdk')
    if (existing) return
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.onerror = () => {
      window.clearTimeout(timeout)
      reject(new Error('Não foi possível carregar a SDK da Meta.'))
    }
    document.head.appendChild(script)
  })
  return facebookSdkPromise
}

async function invoke<T>(action: string, clinicId: string, body: Record<string, unknown> = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session) throw new Error('Sua sessão expirou. Entre novamente antes de conectar o WhatsApp.')
  const { data, error } = await supabase.functions.invoke('whatsapp-onboarding', {
    body: { action, clinicId, ...body },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    let message = error.message
    const context = 'context' in error ? error.context : null
    if (context instanceof Response) {
      const responseBody = await context.clone().json().catch(() => null) as { error?: string } | null
      if (responseBody?.error) message = responseBody.error
    }
    throw new Error(message)
  }
  return data as T
}

export const getWhatsAppOnboardingStatus = (clinicId: string) =>
  invoke<WhatsAppOnboardingStatus>('status', clinicId)

export const preloadWhatsAppCoexistenceSignup = () => loadFacebookSdk().then(() => undefined)

export async function launchWhatsAppCoexistenceSignup() {
  if (!appEnv.metaEmbeddedSignupConfigId) throw new Error('Configure VITE_META_EMBEDDED_SIGNUP_CONFIG_ID para habilitar a configuração Meta.')
  // O SDK é pré-carregado ao abrir a tela para que FB.login continue dentro
  // do gesto do usuário e o navegador não bloqueie a janela da Meta.
  const facebook = window.FB || await loadFacebookSdk()

  return new Promise<{ code: string; sessionInfo: SignupSessionInfo; sessionEvent: string }>((resolve, reject) => {
    let code = ''
    let sessionInfo: SignupSessionInfo | null = null
    let sessionEvent = ''
    let settled = false
    const timeout = window.setTimeout(() => finish(new Error('O Embedded Signup não retornou os dados de sessão a tempo.')), 120_000)

    const cleanup = () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
    }
    const finish = (error?: Error) => {
      if (settled) return
      if (error) {
        settled = true
        cleanup()
        reject(error)
        return
      }
      if (!code || !sessionInfo?.waba_id || !sessionInfo.phone_number_id) return
      settled = true
      cleanup()
      resolve({ code, sessionInfo, sessionEvent: sessionEvent || 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' })
    }
    const onMessage = (event: MessageEvent) => {
      const message = parseSignupMessage(event)
      if (!message) return
      if (message.event === 'CANCEL') {
        finish(new Error(`Cadastro cancelado na etapa ${String(message.data.current_step || 'Meta')}.`))
        return
      }
      if (message.event === 'ERROR') {
        finish(new Error(String(message.data.error_message || 'A Meta informou um erro no Embedded Signup.')))
        return
      }
      sessionEvent = message.event || sessionEvent
      sessionInfo = message.data
      finish()
    }
    window.addEventListener('message', onMessage)

    facebook.login((response) => {
      const responseCode = response.authResponse?.code?.trim()
      if (responseCode) {
        code = responseCode
        finish()
        return
      }
      if (response.status !== 'connected') finish(new Error('A autorização do Embedded Signup foi cancelada ou não retornou um código.'))
    }, {
      config_id: appEnv.metaEmbeddedSignupConfigId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        version: 'v4',
        featureType: 'whatsapp_business_app_onboarding',
        sessionInfoVersion: '3',
      },
    })
  })
}

export const completeWhatsAppCoexistenceSignup = (
  clinicId: string,
  input: { code: string; sessionInfo: SignupSessionInfo; sessionEvent: string },
) => invoke<WhatsAppOnboardingResult>('complete', clinicId, input)

