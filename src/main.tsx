import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { Dashboard } from './pages/Dashboard'
import { EditorPage } from './pages/EditorPage'
import { ClientView } from './pages/ClientView'
import { SettingsPage } from './pages/SettingsPage'
import { LoginPage } from './pages/LoginPage'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './components/RequireAuth'
import { AuthProvider } from './lib/auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public — no auth needed */}
          <Route path="/c/:token" element={<ClientView />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Authed — wrapped in RequireAuth + the persistent AppLayout shell */}
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/p/:id" element={<EditorPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
