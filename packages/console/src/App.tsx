import { Routes, Route, Navigate, Outlet } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
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
import { RenderWorkflowPage } from './pages/RenderWorkflowPage'
import { ChangesPage } from './pages/ChangesPage'

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/render/workflow" element={<RenderWorkflowPage />} />
      <Route
        element={
          <AppLayout>
            <Outlet />
          </AppLayout>
        }
      >
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/functions" element={<FunctionsPage />} />
        <Route path="/workflow" element={<WorkflowsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/playground" element={<AgentPlaygroundPage />} />
        <Route path="/changes" element={<ChangesPage />} />
        <Route path="/apis" element={<ApisPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/runtime" element={<RuntimePage />} />
        <Route path="/emails" element={<EmailsPage />} />
        <Route path="/secrets" element={<SecretsPage />} />
        <Route path="/variables" element={<VariablesPage />} />
        <Route path="/config" element={<Navigate to="/secrets" replace />} />
        <Route path="/credentials" element={<CredentialsPage />} />
        <Route path="/users" element={<Navigate to="/credentials" replace />} />
        <Route path="/addons" element={<PackagesPage />} />
        <Route path="*" element={<NotFoundTitle />} />
      </Route>
    </Routes>
  )
}
