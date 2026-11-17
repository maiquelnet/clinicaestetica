import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

type AppEnvironment = 'development' | 'preview' | 'production'

const validAppEnvironments = new Set<AppEnvironment>(['development', 'preview', 'production'])
const configuredAppEnvironment = process.env.VITE_APP_ENV
const vercelEnvironment = process.env.VERCEL_ENV
const isVercelBuild = process.env.VERCEL === '1' || Boolean(vercelEnvironment)

if (isVercelBuild && !validAppEnvironments.has(configuredAppEnvironment as AppEnvironment)) {
  throw new Error('Vercel builds require VITE_APP_ENV=development, preview, or production.')
}

if (vercelEnvironment && configuredAppEnvironment !== vercelEnvironment) {
  throw new Error(`VITE_APP_ENV (${configuredAppEnvironment}) must match VERCEL_ENV (${vercelEnvironment}).`)
}

if (isVercelBuild && (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error('Vercel builds require VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
