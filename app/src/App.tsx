import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ClinicProvider } from './contexts/ClinicContext'
import { useAuth } from './contexts/useAuth'
import { useClinic } from './contexts/useClinic'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const ClientsPage = lazy(() => import('./pages/ClientsPage').then((module) => ({ default: module.ClientsPage })))
const ServicesPage = lazy(() => import('./pages/ServicesPage').then((module) => ({ default: module.ServicesPage })))
const SchedulePage = lazy(() => import('./pages/SchedulePage').then((module) => ({ default: module.SchedulePage })))
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((module) => ({ default: module.MessagesPage })))
const WaitlistPage = lazy(() => import('./pages/admin/agenda/WaitlistPage').then((module) => ({ default: module.WaitlistPage })))
const EquipmentPage = lazy(() => import('./pages/admin/assets/EquipmentPage').then((module) => ({ default: module.EquipmentPage })))
const TreatmentPlansPage = lazy(() => import('./pages/admin/treatments/TreatmentPlansPage').then((module) => ({ default: module.TreatmentPlansPage })))
const FinancePage = lazy(() => import('./pages/admin/finance/FinancePage').then((module) => ({ default: module.FinancePage })))
const StockItemsPage = lazy(() => import('./pages/admin/stock/StockItemsPage').then((module) => ({ default: module.StockItemsPage })))
const SuppliersPage = lazy(() => import('./pages/admin/stock/SuppliersPage').then((module) => ({ default: module.SuppliersPage })))
const CampaignsPage = lazy(() => import('./pages/admin/marketing/CampaignsPage').then((module) => ({ default: module.CampaignsPage })))
const DispatchesPage = lazy(() => import('./pages/admin/marketing/DispatchesPage').then((module) => ({ default: module.DispatchesPage })))
const SatisfactionPage = lazy(() => import('./pages/admin/marketing/SatisfactionPage').then((module) => ({ default: module.SatisfactionPage })))
const SettingsPage = lazy(() => import('./pages/admin/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const UsersPage = lazy(() => import('./pages/admin/settings/UsersPage').then((module) => ({ default: module.UsersPage })))

function ProtectedApp() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageStatus title="Carregando sessão" />

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <ClinicProvider>
      <ClinicGate />
    </ClinicProvider>
  )
}

function ClinicGate() {
  const { activeClinic, loading, error, profile } = useClinic()

  if (loading) return <FullPageStatus title="Carregando clínica" />

  if (error) {
    return (
      <FullPageStatus
        title="Não foi possível carregar o contexto"
        description={error.message}
      />
    )
  }

  if (!profile || !activeClinic) {
    return (
      <FullPageStatus
        title="Acesso sem clínica vinculada"
        description="Seu login está ativo, mas ainda não existe um perfil e vínculo de clínica liberado no Supabase."
      />
    )
  }

  return (
    <AppLayout>
      <Suspense fallback={<FullPageStatus title="Carregando modulo" />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/clientes" element={<ClientsPage />} />
          <Route path="/servicos" element={<ServicesPage />} />
          <Route path="/agenda" element={<SchedulePage />} />
          <Route path="/agenda/fila-espera" element={<WaitlistPage />} />
          <Route path="/equipamentos" element={<EquipmentPage />} />
          <Route path="/planos-tratamento" element={<TreatmentPlansPage />} />
          <Route path="/financeiro/fluxo-caixa" element={<FinancePage mode="cashflow" />} />
          <Route path="/financeiro/contas-a-receber" element={<FinancePage mode="receivable" />} />
          <Route path="/financeiro/contas-a-pagar" element={<FinancePage mode="payable" />} />
          <Route path="/estoque/itens" element={<StockItemsPage />} />
          <Route path="/estoque/fornecedores" element={<SuppliersPage />} />
          <Route path="/mensagens" element={<MessagesPage />} />
          <Route path="/marketing/campanhas" element={<CampaignsPage />} />
          <Route path="/marketing/disparos" element={<DispatchesPage />} />
          <Route path="/marketing/satisfacao" element={<SatisfactionPage />} />
          <Route path="/configuracoes/parametros" element={<SettingsPage />} />
          <Route path="/configuracoes/usuarios" element={<UsersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  )
}

function FullPageStatus({ title, description }: { title: string; description?: string }) {
  return (
    <main className="status-page">
      <div className="brand-lockup">
        <span className="brand-mark">TS</span>
        <span>Thais Schneider Estética</span>
      </div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </main>
  )
}

function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route path="/*" element={<ProtectedApp />} />
    </Routes>
  )
}

export default App
