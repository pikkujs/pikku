import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotFoundTitle } from '@/components/NotFoundTitle'

import { OverviewPage } from '@/pages/OverviewPage'
import { FunctionsPage } from '@/pages/FunctionsPage'
import { WorkflowsPage } from '@/pages/WorkflowPage'
import { ApisPage } from '@/pages/ApisPage'
import { JobsPage } from '@/pages/JobsPage'
import { RuntimePage } from '@/pages/RuntimePage'
import { ConfigPage } from '@/pages/ConfigPage'
import { AgentsPage } from '@/pages/AgentsPage'
import { AgentPlaygroundPage } from '@/pages/AgentPlaygroundPage'
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
        <Route path="/apis" element={<ApisPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/runtime" element={<RuntimePage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/addons" element={<PackagesPage />} />
        <Route path="*" element={<NotFoundTitle />} />
      </Route>
    </Routes>
  )
}
