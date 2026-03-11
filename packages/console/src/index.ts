// Router abstraction
export {
  ConsoleRouterProvider,
  useConsoleRouter,
  useLink,
  useNavigate,
  useLocation,
  useSearchParams,
} from './router'
export type { ConsoleRouter } from './router'

// React Router adapter
export { reactRouterAdapter } from './adapters/react-router'

// Layout
export { AppLayout } from './components/layout/AppLayout'
export type { AppLayoutProps } from './components/layout/AppLayout'
export { ConnectionScreen } from './components/layout/ConnectionScreen'

// Sidebar
export {
  Sidebar,
  DEFAULT_NAV_SECTIONS,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
} from './components/project/Sidebar'
export type {
  NavItem,
  NavSection,
  SidebarProps,
  SidebarBranding,
} from './components/project/Sidebar'

// Search
export { SpotlightSearch, spotlight } from './components/search/SpotlightSearch'

// Contexts / Providers
export { ThemeProvider } from './context/ThemeProvider'
export { QueryClientProvider } from './context/QueryClientProvider'
export {
  PikkuHTTPProvider,
  PikkuRPCProvider,
  usePikkuHTTP,
  usePikkuRPC,
  getServerUrl,
  setServerUrl,
} from './context/PikkuRpcProvider'
export { PikkuMetaProvider, usePikkuMeta } from './context/PikkuMetaContext'

// Pages
export { OverviewPage } from './pages/OverviewPage'
export { FunctionsPage } from './pages/FunctionsPage'
export { WorkflowsPage } from './pages/WorkflowPage'
export { ApisPage } from './pages/ApisPage'
export { JobsPage } from './pages/JobsPage'
export { RuntimePage } from './pages/RuntimePage'
export { ConfigPage } from './pages/ConfigPage'
export { AgentsPage } from './pages/AgentsPage'
export { AgentPlaygroundPage } from './pages/AgentPlaygroundPage'
export { PackagesPage } from './pages/PackagesPage'
export { NotFoundTitle } from './components/NotFoundTitle'
