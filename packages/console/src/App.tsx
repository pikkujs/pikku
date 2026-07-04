import { Routes, Route, Navigate, Outlet } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { AuthGate } from './components/auth/AuthGate'
import { ImpersonationBanner } from './components/auth/ImpersonationBanner'
import { NotFoundTitle } from './components/NotFoundTitle'

import { OverviewPage } from './pages/OverviewPage'
import { FunctionsPage } from './pages/FunctionsPage'
import { WorkflowsPage } from './pages/WorkflowPage'
import { ApisPage } from './pages/ApisPage'
import { JobsPage } from './pages/JobsPage'
import { RuntimePage } from './pages/RuntimePage'
import { EmailsPage } from './pages/EmailsPage'
import { SecretsPage } from './pages/SecretsPage'
import { VariablesPage } from './pages/VariablesPage'
import { AgentsPage } from './pages/AgentsPage'
import { AgentPlaygroundPage } from './pages/AgentPlaygroundPage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { PackagesPage } from './pages/PackagesPage'
import { CredentialsPage } from './pages/CredentialsPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { RenderWorkflowPage } from './pages/RenderWorkflowPage'
import { ChangesPage } from './pages/ChangesPage'
import { TestsPage } from './pages/TestsPage'
import { UserFlowsPage } from './pages/UserFlowsPage'
import { DatabasePage } from './pages/DatabasePage'
import { AuthProvidersPage } from './pages/AuthProvidersPage'
import { SecurityPage } from './pages/SecurityPage'

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/render/workflow" element={<RenderWorkflowPage />} />
      <Route
        element={
          <AuthGate>
            <ImpersonationBanner />
            <AppLayout>
              <Outlet />
            </AppLayout>
          </AuthGate>
        }
      >
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/functions" element={<FunctionsPage />} />
        <Route path="/workflow" element={<WorkflowsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/playground" element={<AgentPlaygroundPage />} />
        <Route path="/changes" element={<ChangesPage />} />
        <Route path="/tests" element={<TestsPage showRunButton />} />
        <Route path="/tests/userflows" element={<UserFlowsPage />} />
        <Route path="/database" element={<DatabasePage />} />
        <Route path="/apis" element={<ApisPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/runtime" element={<RuntimePage />} />
        <Route path="/emails" element={<EmailsPage />} />
        <Route path="/secrets" element={<SecretsPage />} />
        <Route path="/variables" element={<VariablesPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/config" element={<Navigate to="/secrets" replace />} />
        <Route path="/credentials" element={<CredentialsPage />} />
        <Route path="/users" element={<AdminUsersPage />} />
        <Route path="/auth-providers" element={<AuthProvidersPage />} />
        <Route path="/addons" element={<PackagesPage />} />
        <Route path="*" element={<NotFoundTitle />} />
      </Route>
    </Routes>
  )
}
