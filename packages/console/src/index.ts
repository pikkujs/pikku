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

// Page gate context (host apps use this to inject a body override while keeping headers visible)
export { PageGateContext } from './context/PageGateContext'

// Layout
export { AppLayout } from './components/layout/AppLayout'
export type { AppLayoutProps } from './components/layout/AppLayout'
export { ConnectionScreen } from './components/layout/ConnectionScreen'
export {
  PageContainer,
  PageHeader,
  ListPageHeader,
  PageHeaderControls,
  PageToolbar,
  PageActionBar,
  PageRow,
} from './components/layout/PageLayout'

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
  PikkuRPCContext,
  usePikkuHTTP,
  usePikkuRPC,
  getServerUrl,
  setServerUrl,
} from './context/PikkuRpcProvider'
export { pikku } from './pikku/http'
export { PikkuMetaProvider, usePikkuMeta } from './context/PikkuMetaContext'
export {
  OSSConsoleNavigator,
  useConsoleNavigator,
  ConsoleNavigatorCtx,
} from './context/ConsoleNavigatorContext'
export type {
  ConsoleNavigator,
  ConsoleSection,
} from './context/ConsoleNavigatorContext'

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
export { ComposerShell, composerStyles } from './components/ui/ComposerShell'

// Pages
export { OverviewPage } from './pages/OverviewPage'
export { FunctionsPage } from './pages/FunctionsPage'
export type { FunctionExtraColumn } from './pages/FunctionsPage'
export { WorkflowsPage } from './pages/WorkflowPage'
export type { WorkflowExtraColumn } from './components/project/WorkflowsList'
export { ApisPage } from './pages/ApisPage'
export { JobsPage } from './pages/JobsPage'
export { RuntimePage } from './pages/RuntimePage'
export { ConfigPage } from './pages/ConfigPage'
export { AgentsPage } from './pages/AgentsPage'
export type { AgentExtraColumn } from './pages/AgentsPage'
export { AgentPlaygroundPage } from './pages/AgentPlaygroundPage'
export { PackagesPage } from './pages/PackagesPage'
export { ChangesPage } from './pages/ChangesPage'
export { SecretsPage } from './pages/SecretsPage'
export { VariablesPage } from './pages/VariablesPage'
export { EmailsPage } from './pages/EmailsPage'
export { CredentialsPage } from './pages/CredentialsPage'
export { AuditPage } from './pages/AuditPage'
export { TestsPage } from './pages/TestsPage'
export { NotFoundTitle } from './components/NotFoundTitle'
export { ConsoleEditableProvider } from './context/ConsoleEditableContext'
