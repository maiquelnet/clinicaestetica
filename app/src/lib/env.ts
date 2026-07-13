type AppEnvironment = 'development' | 'preview' | 'production'

function resolveAppEnvironment(): AppEnvironment {
  const explicitEnvironment = import.meta.env.VITE_APP_ENV

  if (explicitEnvironment === 'development' || explicitEnvironment === 'preview' || explicitEnvironment === 'production') {
    return explicitEnvironment
  }

  return import.meta.env.PROD ? 'production' : 'development'
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const environment = resolveAppEnvironment()

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
}

export const appEnv = {
  environment,
  isDevelopment: environment === 'development',
  isLocalDevServer: import.meta.env.DEV,
  isPreview: environment === 'preview',
  isProduction: environment === 'production',
  isProductionBuild: import.meta.env.PROD,
  mode: import.meta.env.MODE,
  supabasePublishableKey,
  supabaseUrl,
} as const
