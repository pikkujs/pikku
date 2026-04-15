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

// Shared UI Components
export { MetaRow } from './components/ui/MetaRow'
export type { MetaRowProps } from './components/ui/MetaRow'
export { SectionLabel } from './components/ui/SectionLabel'
export type { SectionLabelProps } from './components/ui/SectionLabel'
export { ListDetailLayout } from './components/ui/ListDetailLayout'
export type { ListDetailLayoutProps } from './components/ui/ListDetailLayout'
export { GridHeader } from './components/ui/GridHeader'
export type { GridHeaderProps, GridColumn } from './components/ui/GridHeader'
export { ListItem } from './components/ui/ListItem'
export type { ListItemProps } from './components/ui/ListItem'
export { DetailHeader } from './components/ui/DetailHeader'
export type { DetailHeaderProps } from './components/ui/DetailHeader'
export { EmptyState } from './components/ui/EmptyState'
export type { EmptyStateProps } from './components/ui/EmptyState'
export { SearchInput } from './components/ui/SearchInput'
export type { SearchInputProps } from './components/ui/SearchInput'
export { TagBadge, ServiceBadge } from './components/ui/TagBadge'
export type { TagBadgeProps, ServiceBadgeProps } from './components/ui/TagBadge'
export { ValText } from './components/ui/ValText'
export type { ValTextProps } from './components/ui/ValText'
export { CopyableCode } from './components/ui/CopyableCode'

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
