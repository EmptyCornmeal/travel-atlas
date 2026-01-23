import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// debug only — safe to leave, but you can remove later
;(window as any).__TA_DEBUG__ = {
  base: import.meta.env.BASE_URL,
  supaUrl: import.meta.env.VITE_SUPABASE_URL,
  hasAnon: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
