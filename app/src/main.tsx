import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LandingPage from './pages/LandingPage'

const root = createRoot(document.getElementById('root')!)

if (window.location.pathname === '/') {
  root.render(
    <StrictMode>
      <LandingPage />
    </StrictMode>,
  )
} else {
  void import('./ApplicationEntry').then(({ default: ApplicationEntry }) => {
    root.render(
      <StrictMode>
        <ApplicationEntry />
      </StrictMode>,
    )
  })
}
