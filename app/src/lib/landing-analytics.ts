import { isAnalyticsMeasurementId } from './landing.ts'

export type AnalyticsConsent = 'granted' | 'denied' | 'unset'

export type LandingEventName =
  | 'generate_lead'
  | 'whatsapp_click'
  | 'service_interest'
  | 'faq_open'
  | 'scroll_depth'

type EventParameters = Record<string, string | number | boolean>

const CONSENT_KEY = 'thais-estetica-analytics-consent'
const measurementId = (import.meta as ImportMeta & {
  env?: { VITE_GA_MEASUREMENT_ID?: string }
}).env?.VITE_GA_MEASUREMENT_ID?.trim()

declare global {
  interface Window {
    dataLayer?: unknown[][]
    gtag?: (...args: unknown[]) => void
  }
}

export function analyticsConfigured() {
  return isAnalyticsMeasurementId(measurementId)
}

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return 'unset'

  const stored = window.localStorage.getItem(CONSENT_KEY)
  return stored === 'granted' || stored === 'denied' ? stored : 'unset'
}

export function saveAnalyticsConsent(consent: Exclude<AnalyticsConsent, 'unset'>) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(CONSENT_KEY, consent)

  if (consent === 'granted') {
    initializeAnalytics()
  } else {
    window.gtag?.('consent', 'update', { analytics_storage: 'denied' })
  }
}

export function clearAnalyticsConsent() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(CONSENT_KEY)
}

export function initializeAnalytics() {
  if (
    typeof window === 'undefined' ||
    !isAnalyticsMeasurementId(measurementId) ||
    readAnalyticsConsent() !== 'granted'
  ) {
    return false
  }

  window.dataLayer = window.dataLayer ?? []
  window.gtag =
    window.gtag ??
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args)
    }

  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'granted',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })

  const selector = `script[data-ga-measurement-id="${measurementId}"]`
  if (!document.querySelector(selector)) {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
    script.dataset.gaMeasurementId = measurementId
    document.head.append(script)
  }

  window.gtag('js', new Date())
  window.gtag('config', measurementId, {
    anonymize_ip: true,
    allow_google_signals: false,
    send_page_view: true,
  })

  return true
}

export function trackLandingEvent(name: LandingEventName, parameters: EventParameters = {}) {
  if (
    typeof window === 'undefined' ||
    !analyticsConfigured() ||
    readAnalyticsConsent() !== 'granted'
  ) {
    return false
  }

  if (!window.gtag && !initializeAnalytics()) return false

  window.gtag?.('event', name, parameters)
  return true
}
