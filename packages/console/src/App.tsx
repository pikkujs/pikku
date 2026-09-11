import { Routes, Route, Navigate, Outlet } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { AuthGate } from './components/auth/AuthGate'
import { ImpersonationBanner } from './components/auth/ImpersonationBanner'
import { NotFoundTitle } from './components/NotFoundTitle'
import { AddonGate } from './components/console/AddonGate'

import { OverviewPage } from './pages/OverviewPage'
import { FunctionsPage } from './pages/FunctionsPage'
import { WorkflowsPage } from './pages/WorkflowPage'
import { HttpPage } from './pages/HttpPage'
import { ChannelsPage } from './pages/ChannelsPage'
import { McpPage } from './pages/McpPage'
import { CliPage } from './pages/CliPage'
import { GatewaysPage } from './pages/GatewaysPage'
import { SchedulersPage } from './pages/SchedulersPage'
import { QueuesPage } from './pages/QueuesPage'
import { TriggersPage } from './pages/TriggersPage'
import { RuntimePage } from './pages/RuntimePage'
import { EmailsPage } from './pages/EmailsPage'
import { WebhooksPage } from './pages/WebhooksPage'
import { SecretsPage } from './pages/SecretsPage'
import { VariablesPage } from './pages/VariablesPage'
import { AgentsPage } from './pages/AgentsPage'
import { AgentPlaygroundPage } from './pages/AgentPlaygroundPage'
import { ScorersPage } from './pages/ScorersPage'
import { PackagesPage } from './pages/PackagesPage'
import { CredentialsPage } from './pages/CredentialsPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { ScopesPage } from './pages/ScopesPage'
import { RolesPage } from './pages/RolesPage'
import { RenderWorkflowPage } from './pages/RenderWorkflowPage'
import { ChangesPage } from './pages/ChangesPage'
import { ScenariosPage } from './pages/ScenariosPage'
import { PersonasPage } from './pages/PersonasPage'
import { VirtualUsersPage } from './pages/VirtualUsersPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { ProjectSurfacePage } from './pages/ProjectSurfacePage'
import { DatabasePage } from './pages/DatabasePage'
import { AuthProvidersPage } from './pages/AuthProvidersPage'
import { SecurityPage } from './pages/SecurityPage'
import { AuditPage } from './pages/AuditPage'

export const App: React.FC = () => {
  return (
    <Routes>
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
        <Route path="/config" element={<Navigate to="/secrets" replace />} />

        {/* The console UI is a static bundle every deployment serves, but
            the addons behind these screens are wired per app — the console
            one usually in development only. Gating by group keeps a missing
            addon a single explanation rather than whichever of the screen's
            requests happened to fire first. */}
        <Route
          element={
            <AddonGate addon="console">
              <Outlet />
            </AddonGate>
          }
        >
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/functions" element={<FunctionsPage />} />
          <Route path="/workflow" element={<WorkflowsPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/playground" element={<AgentPlaygroundPage />} />
          <Route path="/scorers" element={<ScorersPage />} />
          <Route path="/changes" element={<ChangesPage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/personas" element={<PersonasPage />} />
          <Route path="/virtual-users" element={<VirtualUsersPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/surface" element={<ProjectSurfacePage />} />
          <Route path="/database" element={<DatabasePage />} />
          <Route path="/wires/http" element={<HttpPage />} />
          <Route path="/wires/channel" element={<ChannelsPage />} />
          <Route path="/wires/mcp" element={<McpPage />} />
          <Route path="/wires/cli" element={<CliPage />} />
          <Route path="/wires/gateway" element={<GatewaysPage />} />
          <Route path="/async/scheduler" element={<SchedulersPage />} />
          <Route path="/async/queue" element={<QueuesPage />} />
          <Route path="/async/trigger" element={<TriggersPage />} />
          <Route path="/runtime" element={<RuntimePage />} />
          <Route path="/emails" element={<EmailsPage />} />
          <Route path="/webhooks" element={<WebhooksPage />} />
          <Route path="/secrets" element={<SecretsPage />} />
          <Route path="/variables" element={<VariablesPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/auth-providers" element={<AuthProvidersPage />} />
          <Route path="/addons" element={<PackagesPage />} />
        </Route>

        <Route
          element={
            <AddonGate addon="admin">
              <Outlet />
            </AddonGate>
          }
        >
          <Route path="/credentials" element={<CredentialsPage />} />
          <Route path="/users" element={<AdminUsersPage />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/scopes" element={<ScopesPage />} />
          <Route path="/audit" element={<AuditPage />} />
        </Route>

        <Route path="*" element={<NotFoundTitle />} />
      </Route>
    </Routes>
  )
}
