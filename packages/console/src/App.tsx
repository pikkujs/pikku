import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotFoundTitle } from '@/components/NotFoundTitle'

import { OverviewPage } from '@/pages/OverviewPage'
import { FunctionsPage } from '@/pages/FunctionsPage'
import { WorkflowsPage } from '@/pages/WorkflowPage'
import { HttpPage } from '@/pages/HttpPage'
import { ChannelsPage } from '@/pages/ChannelsPage'
import { McpPage } from '@/pages/McpPage'
import { CliPage } from '@/pages/CliPage'
import { SchedulersPage } from '@/pages/SchedulersPage'
import { QueuesPage } from '@/pages/QueuesPage'
import { TriggersPage } from '@/pages/TriggersPage'
import { ServicesPage } from '@/pages/ServicesPage'
import { MiddlewarePage } from '@/pages/MiddlewarePage'
import { PermissionsPage } from '@/pages/PermissionsPage'
import { SecretsPage } from '@/pages/SecretsPage'
import { VariablesPage } from '@/pages/VariablesPage'
import { AgentsPage } from '@/pages/AgentsPage'
import { AgentPlaygroundPage } from '@/pages/AgentPlaygroundPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { OAuthCallbackPage } from '@/pages/OAuthCallbackPage'
import { PackagesPage } from '@/pages/PackagesPage'

export const App: React.FunctionComponent = () => {
  return (
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
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
        <Route path="/apis/http" element={<HttpPage />} />
        <Route path="/apis/channels" element={<ChannelsPage />} />
        <Route path="/apis/mcp" element={<McpPage />} />
        <Route path="/apis/cli" element={<CliPage />} />
        <Route path="/jobs/schedulers" element={<SchedulersPage />} />
        <Route path="/jobs/queues" element={<QueuesPage />} />
        <Route path="/jobs/triggers" element={<TriggersPage />} />
        <Route path="/runtime/services" element={<ServicesPage />} />
        <Route path="/runtime/middleware" element={<MiddlewarePage />} />
        <Route path="/runtime/permissions" element={<PermissionsPage />} />
        <Route path="/config/secrets" element={<SecretsPage />} />
        <Route path="/config/variables" element={<VariablesPage />} />
        <Route path="/addons" element={<PackagesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundTitle />} />
      </Route>
    </Routes>
  )
}
