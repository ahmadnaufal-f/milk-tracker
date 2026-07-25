import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from '@/components/ui/sonner'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster position="bottom-center" />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// reload page if the root element is empty after a short delay
const isPWA = window.matchMedia('(display-mode: standalone)').matches;

if (isPWA) {
  setTimeout(() => {
    if (!document.getElementById('root')?.hasChildNodes()) {
      console.warn("PWA load failed, forcing reload...");
      window.location.reload();
    }
  }, 2000);
}