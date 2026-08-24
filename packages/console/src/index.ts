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

// Users — presentation-only table shared by AdminUsersPage and external hosts
// (e.g. Fabric's server-brokered stage Users tab).
export { UsersTable } from './components/users/UsersTable'
export type {
  UsersTableUser,
  UsersTableLabels,
  UsersTableProps,
} from './components/users/UsersTable'

// Layout
export { AppLayout } from './components/layout/AppLayout'
export type { AppLayoutProps } from './components/layout/AppLayout'
export { ConnectionScreen } from './components/layout/ConnectionScreen'
export {
  PageContainer,
  PageHeader,
  PanelCard,
  StatePage,
  ViewportStatePage,
  ListPageHeader,
  PageHeaderControls,
  PageToolbar,
  PageActionBar,
  PageRow,
} from './components/layout/PageLayout'
export {
  MOBILE_QUERY,
  COMPACT_QUERY,
  usePhone,
  useCompact,
} from './lib/breakpoints'

// Shell — the side panel system. A secondary surface is a sibling card, not a
// column inside the page card and never a drawer: an EdgePanel pins itself to
// one edge of the content area and the page card shrinks to make room. The
// screen's list takes the start edge, its selection's detail the end edge.
export { ContentArea } from './components/shell/ContentArea'
export { EdgePanel } from './components/shell/EdgePanel'
export { ConsolePanel } from './components/shell/ConsolePanel'
export type { ConsolePanelWidth } from './components/shell/ConsolePanel'
export { ConsoleListPanel } from './components/shell/ConsoleListPanel'
export { ConsoleSidePanel } from './components/shell/ConsoleSidePanel'
export { CollapsiblePanel } from './components/shell/CollapsiblePanel'
export { PanelHeaderBand } from './components/shell/PanelHeaderBand'
export { PanelInsetProvider, usePanelInset } from './context/PanelInsetProvider'
export type { PanelSide } from './context/PanelInsetProvider'
export {
  ConsoleScreen,
  ConsolePanelHost,
  ConsoleScreenCard,
} from './components/shell/ConsoleScreen'
export { ConsoleDetailPanel } from './components/shell/ConsoleDetailPanel'

// Nav dock — the console's navigation. `NavDock` is presentational: it draws the
// zones it is handed, so an embedding app builds its own model from its routes
// and gets the same row. `ConsoleNavDock` is the console's own model.
export { NavDock } from './components/nav-dock/NavDock'
export type { NavDockProps } from './components/nav-dock/NavDock'
export { ConsoleNavDock } from './components/nav-dock/ConsoleNavDock'
export { DockFlyout } from './components/nav-dock/DockFlyout'
// The dock's own preferences, so an embedding app can offer the menu that moves
// it from ITS account tile — the console's lives inside `ConsoleNavDock`, which
// such an app replaces wholesale. Without this the app's only way to reach them
// is to restate the storage keys and hope they never change.
export {
  DOCK_SCALE_MAX,
  DOCK_SCALE_MIN,
  DOCK_SCALE_STEP,
  DOCK_SIDES,
  isVerticalDock,
  useDockPrefs,
} from './components/nav-dock/useDockPrefs'
export type { DockSide } from './components/nav-dock/useDockPrefs'
export { isSep } from './components/nav-dock/model'
export type {
  DockBadge,
  DockEntry,
  DockEnv,
  DockMenu,
  DockTile,
  FlyoutRow,
  FlyoutSection,
  IconComponent,
} from './components/nav-dock/model'

// Phone — one gesture for every surface the bottom bar opens. Below the phone
// breakpoint a second column cannot exist, so a side panel becomes a MobileSheet
// raised from MobileTabBar rather than a squeezed or hidden column.
export { MobileSheet, closeMobileSheets } from './components/shell/MobileSheet'
export { MobileTabBar } from './components/shell/MobileTabBar'
export type { MobileTab } from './components/shell/MobileTabBar'
export { PageOptionsPortal } from './components/shell/PageOptionsPortal'
export {
  PageOptionsProvider,
  usePageOptions,
  usePageOptionsDismiss,
  usePageAction,
} from './context/PageOptionsProvider'
export type { PageAction } from './context/PageOptionsProvider'
export {
  SidebarModeProvider,
  useSidebarMode,
} from './context/SidebarModeProvider'
export type { SidebarMode } from './context/SidebarModeProvider'

// Sidebar — superseded by the dock on a pointer, and still the phone's nav
// sheet, which a row of hover-raised tiles cannot be.
export {
  Sidebar,
  useDefaultNavSections,
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
  usePikkuSSE,
} from './context/PikkuRpcProvider'
export { getServerUrl, setServerUrl } from './context/serverUrl'
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
export { PikkuSwitch } from './components/ui/PikkuSwitch'
export type { PikkuSwitchOption } from './components/ui/PikkuSwitch'
export { ShellHeader } from './components/ui/ShellHeader'
export type {
  ShellHeaderProps,
  ShellHeaderSelection,
  ShellHeaderFilter,
  ShellHeaderFilterOption,
  ShellHeaderSearch,
  ShellHeaderAction,
} from './components/ui/ShellHeader'
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

// A knowledge note is rendered outside this console too — the fabric console
// draws the same notes on its own screen — and a second `<ReactMarkdown>` there
// is a second vocabulary: the diagram, the callout, the scenario and the
// decision either render in both or the format quietly means two things.
export { Markdown, asMarkdownContent } from './components/ui/Markdown'

export { SearchInput } from './components/ui/SearchInput'
export type { SearchInputProps } from './components/ui/SearchInput'
export { TagBadge, ServiceBadge } from './components/ui/TagBadge'
export type { TagBadgeProps, ServiceBadgeProps } from './components/ui/TagBadge'
export { ValText } from './components/ui/ValText'
export type { ValTextProps } from './components/ui/ValText'
export { CopyableCode } from './components/ui/CopyableCode'
export { ComposerShell, composerStyles } from './components/ui/ComposerShell'
export { EntityCardList } from './components/layout/EntityCardList'
export type {
  EntityCardItem,
  EntityCardBadge,
} from './components/layout/EntityCardList'

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
export { ScorersPage } from './pages/ScorersPage'
export { PackagesPage } from './pages/PackagesPage'
export { ChangesPage } from './pages/ChangesPage'
export { ScenariosPage } from './pages/ScenariosPage'
export type { ScenariosPageProps } from './pages/ScenariosPage'
export { VirtualUsersPage } from './pages/VirtualUsersPage'
export { VirtualUsersWorkspace } from './components/virtual-users/VirtualUsersWorkspace'
export { toVirtualUserDocs } from './components/virtual-users/virtual-user-model'
export type { VirtualUserDoc } from './components/virtual-users/virtual-user-model'
export { useVirtualUsers } from './hooks/useVirtualUsers'
export { KnowledgePage } from './pages/KnowledgePage'
export type { KnowledgePageProps } from './pages/KnowledgePage'
export { KnowledgeWorkspace } from './components/knowledge/KnowledgeWorkspace'
export type { KnowledgeWorkspaceProps } from './components/knowledge/KnowledgeWorkspace'
export { KnowledgeBrowseRail } from './components/knowledge/KnowledgeBrowseRail'
export type { KnowledgeBrowseRailProps } from './components/knowledge/KnowledgeBrowseRail'
export { useKnowledgeBrowse } from './hooks/useKnowledgeBrowse'
export type { KnowledgeBrowse } from './hooks/useKnowledgeBrowse'
export { resolveNoteLink } from './lib/knowledge'
export type {
  KnowledgeBundle,
  KnowledgeFinding,
  KnowledgeNote,
  KnowledgeSection,
  KnowledgeSelection,
} from './lib/knowledge'
export { SecretsPage } from './pages/SecretsPage'
export { VariablesPage } from './pages/VariablesPage'
export { EmailsPage } from './pages/EmailsPage'
export type { EmailsPageProps } from './pages/EmailsPage'
export { EmailsComposePanel } from './components/emails/EmailsComposePanel'
export type { EmailsComposePanelProps } from './components/emails/EmailsComposePanel'
export { useEmailsCompose } from './hooks/useEmailsCompose'
export type { EmailsCompose } from './hooks/useEmailsCompose'
export { WebhooksPage } from './pages/WebhooksPage'
export { CredentialsPage } from './pages/CredentialsPage'
export { AuditPage } from './pages/AuditPage'
export { SecurityPage } from './pages/SecurityPage'
export { SecurityAuditView } from './components/security/SecurityAuditView'
export type {
  SecurityAuditViewProps,
  SecurityLens,
} from './components/security/SecurityAuditView'
export { UpdateDependencyButton } from './components/security/UpdateDependencyButton'
export {
  classifyAdvisory,
  type AdvisoryCategory,
} from './components/security/security-classify'
export {
  useSecurityAudit,
  useRunSecurityAudit,
  useUpdateDependency,
} from './hooks/useSecurityAudit'
export type {
  SecurityAuditReport,
  SecurityAuditIssue,
  SecurityAuditUpdate,
  SecuritySeverity,
  SecurityUpdateLevel,
} from './hooks/useSecurityAudit'
export { AuthProvidersPage, AUTH_PROVIDERS } from './pages/AuthProvidersPage'
export type {
  AuthProviderDef,
  AuthProviderField,
} from './pages/AuthProvidersPage'
export { NotFoundTitle } from './components/NotFoundTitle'
export { ConsoleEditableProvider } from './context/ConsoleEditableContext'
// Detail-panel system: lets an embedder (e.g. a canvas/graph view) open the
// same right-hand configuration panels the pages use, by wire type + id.
export { PanelProvider, usePanelContext } from './context/PanelContext'
export type { PanelType, PanelData } from './context/PanelContext'
export { PanelContainer } from './components/panel/PanelContainer'
// Needed by an embedder that opens the workflow panel outside a workflow page:
// the workflow panels read their graph from this context (feed it meta.workflows[id]).
export { WorkflowProvider } from './context/WorkflowContext'
export { WorkflowGraphView } from './components/project/WorkflowGraphView'
export type { WorkflowGraphViewProps } from './components/project/WorkflowGraphView'

// Workflow building blocks. `WorkflowSurface` mounts every workflow-scoped
// context; the panels below read from it and can then be arranged in any
// order, anywhere in the tree — a host with its own navigation composes these
// rather than embedding WorkflowsPage and prop-drilling holes into it.
export { WorkflowSurface } from './components/workflow/WorkflowSurface'
export type { WorkflowSurfaceProps } from './components/workflow/WorkflowSurface'
export {
  useWorkflowSurface,
  useWorkflowSurfaceSafe,
} from './context/WorkflowSurfaceContext'
export type { WorkflowSurfaceContextType } from './context/WorkflowSurfaceContext'
export { WorkflowRunsPanel } from './components/workflow/WorkflowRunsPanel'
export { WorkflowGraphPanel } from './components/workflow/WorkflowGraphPanel'
export { WorkflowInspectorPanel } from './components/workflow/WorkflowInspectorPanel'
export type { WorkflowInspectorPanelProps } from './components/workflow/WorkflowInspectorPanel'
export { WorkflowCanvasDrawer } from './components/workflow/WorkflowCanvasDrawer'
export { WorkflowListPanel } from './components/workflow/WorkflowListPanel'
export type { WorkflowListPanelProps } from './components/workflow/WorkflowListPanel'
export { WorkflowThreePane } from './components/workflow/WorkflowThreePane'
export type { WorkflowThreePaneProps } from './components/workflow/WorkflowThreePane'

// Query keys and invalidation for the workflow-run domain — so a host that
// learns a run has advanced out-of-band refreshes the panels through a
// supported API instead of hardcoding key tuples against the QueryClient.
export {
  workflowQueryKeys,
  ACTIVE_RUN_STATUSES,
  ACTIVE_STEP_STATUSES,
  isRunActive,
  isStepActive,
  hasActiveStep,
} from './hooks/workflow-query-keys'
export { useWorkflowRunRefresh } from './hooks/useWorkflowRuns'
export type { FlowDirection } from './context/FlowDirectionContext'

// The same building-block treatment, applied across the rest of the console.
// `ConsoleSurface` mounts the panel context every list panel and inspector
// reads from, and defers to a host-supplied one rather than nesting a second,
// so panels drawn from several surfaces share one selection.
export { ConsoleSurface } from './components/console/ConsoleSurface'
export type { ConsoleSurfaceProps } from './components/console/ConsoleSurface'
export { ConsoleInspectorPanel } from './components/console/ConsoleInspectorPanel'
export type { ConsoleInspectorPanelProps } from './components/console/ConsoleInspectorPanel'
export { usePanelContextSafe } from './context/PanelContext'

// The public surface as documentation. The website mounts the workspace with a
// surface doc and no usage, the console adds the usage it can measure; the
// affordances that read usage simply do not render without it.
export { SurfaceWorkspace } from './components/surface/SurfaceWorkspace'
export type { SurfaceWorkspaceProps } from './components/surface/SurfaceWorkspace'
export { SurfaceNavigator } from './components/surface/SurfaceNavigator'
export { SurfaceLeafDocument } from './components/surface/SurfaceLeafDocument'
export { SurfaceSymbolDetail } from './components/surface/SurfaceSymbolDetail'
export type { SurfaceSymbolDetailProps } from './components/surface/SurfaceSymbolDetail'
export {
  STEPS,
  STEP_ORDER,
  stepsOf,
  exportsIn,
  isEntrypoint,
  entrypointsOf,
} from './components/surface/surface-steps'
export type {
  StepDefinition,
  StepGroup,
} from './components/surface/surface-steps'
export type {
  SurfaceDoc,
  SurfaceEntryPoint,
  SurfaceEntryPointId,
  SurfaceKind,
  SurfaceLeaf,
  SurfaceOrigin,
  SurfaceStep,
  SurfaceSymbol,
  SurfaceSymbolUsage,
  SurfaceUsage,
} from './components/surface/surface.types'

// A host that already cards its screens and has its own end-edge panel wraps the
// console page in `HostConsoleChrome`: the page's surfaces then render flush
// inside the host's card, and the layout stops docking its own panel column, so
// the host can render `PanelContainer` beside the page instead of inside it.
export {
  ConsoleChromeContext,
  HostConsoleChrome,
  useConsoleChrome,
  useListSurfaceClass,
} from './context/ConsoleChromeContext'
export type { ConsoleChrome } from './context/ConsoleChromeContext'

// The shell behind the console's tabbed pages. `activeTab`/`onTabChange` are
// optional: supply them to drive tabs from a host router, omit them to keep the
// OSS `?tab=` search-param behaviour.
export { TabbedSurface } from './components/console/TabbedSurface'
export type {
  TabbedSurfaceProps,
  TabbedSurfaceTab,
} from './components/console/TabbedSurface'

// List panels. Each reads its own data and opens its own inspector panel, so it
// can be mounted on its own — no page, no prop drilling.
export { HttpListPanel } from './components/http/HttpListPanel'
export type { HttpListPanelProps } from './components/http/HttpListPanel'
export { McpListPanel } from './components/mcp/McpListPanel'
export type { McpListPanelProps } from './components/mcp/McpListPanel'
export { QueuesListPanel } from './components/queues/QueuesListPanel'
export type { QueuesListPanelProps } from './components/queues/QueuesListPanel'
export { SchedulersListPanel } from './components/schedulers/SchedulersListPanel'
export type { SchedulersListPanelProps } from './components/schedulers/SchedulersListPanel'
export { TriggersListPanel } from './components/triggers/TriggersListPanel'
export type { TriggersListPanelProps } from './components/triggers/TriggersListPanel'
export { MiddlewareListPanel } from './components/middleware/MiddlewareListPanel'
export type { MiddlewareListPanelProps } from './components/middleware/MiddlewareListPanel'
export { PermissionsListPanel } from './components/permissions/PermissionsListPanel'
export type { PermissionsListPanelProps } from './components/permissions/PermissionsListPanel'
export { ServicesListPanel } from './components/services/ServicesListPanel'
export type { ServicesListPanelProps } from './components/services/ServicesListPanel'
export { WebhooksListPanel } from './components/webhooks/WebhooksListPanel'
export type { WebhooksListPanelProps } from './components/webhooks/WebhooksListPanel'
export { AuthProvidersListPanel } from './components/auth/AuthProvidersListPanel'
export type { AuthProvidersListPanelProps } from './components/auth/AuthProvidersListPanel'
export { VariablesListPanel } from './components/variables/VariablesListPanel'
export type { VariablesListPanelProps } from './components/variables/VariablesListPanel'
export { SecretsListPanel } from './components/secrets/SecretsListPanel'
export type { SecretsListPanelProps } from './components/secrets/SecretsListPanel'
export { FunctionsListPanel } from './components/functions/FunctionsListPanel'
export type { FunctionsListPanelProps } from './components/functions/FunctionsListPanel'
export { PackagesListPanel } from './components/packages/PackagesListPanel'
export type { PackagesListPanelProps } from './components/packages/PackagesListPanel'
export { PackagesBrowseRail } from './components/packages/PackagesBrowseRail'
export type { PackagesBrowseRailProps } from './components/packages/PackagesBrowseRail'
export { UsersDirectoryPanel } from './components/users/UsersDirectoryPanel'
export type { UsersDirectoryPanelProps } from './components/users/UsersDirectoryPanel'
export { AgentListPanel } from './components/agents/AgentListPanel'
export type { AgentListPanelProps } from './components/agents/AgentListPanel'
export { EmailTemplateListPanel } from './components/emails/EmailTemplateListPanel'
export type { EmailTemplateListPanelProps } from './components/emails/EmailTemplateListPanel'
export { SecurityReportPanel } from './components/security/SecurityReportPanel'
export type { SecurityReportPanelProps } from './components/security/SecurityReportPanel'
export { AuditLogPanel } from './components/audit/AuditLogPanel'
export type { AuditLogPanelProps } from './components/audit/AuditLogPanel'

// Scenario flows and personas as two independently-mountable panels, rather
// than two halves of one segmented control.
export { ScenarioFlowsPanel } from './components/flows/ScenarioFlowsPanel'
export type { ScenarioFlowsPanelProps } from './components/flows/ScenarioFlowsPanel'
export { PersonaDetail } from './components/personas/PersonaDetail'
export type { PersonaDetailProps } from './components/personas/PersonaDetail'
export { ScenarioPersonasPanel } from './components/personas/ScenarioPersonasPanel'
export type { ScenarioPersonasPanelProps } from './components/personas/ScenarioPersonasPanel'

// Personas as a surface of their own — the people a product is for, rather than
// the cast of its scenarios. A host mounts the workspace whole, or assembles it
// from the card, the avatar and the role list.
export { PersonasWorkspace } from './components/personas/PersonasWorkspace'
export { PersonasView } from './components/personas/PersonasView'
export { PersonaRow } from './components/personas/PersonaRow'
export type { PersonaRowProps } from './components/personas/PersonaRow'
export { PersonaAvatar } from './components/personas/PersonaAvatar'
export { PersonaRoleList } from './components/personas/PersonaRoleList'
export type { PersonaRoleListProps } from './components/personas/PersonaRoleList'
export { toPersonaEntries } from './components/personas/persona-model'
export type { PersonaModelInput } from './components/personas/persona-model'
export type {
  PersonaEntry,
  PersonaRoleRef,
  PersonaAccountRef,
  PersonaScenarioRef,
  PersonaRef,
} from './components/personas/persona-types'

// What an addon/API contains, as panel content — opened from the catalogue,
// and mountable directly by a host that wants it in its own panel.
export { AddonDetail } from './components/packages/AddonDetail'
export type { AddonDetailProps } from './components/packages/AddonDetail'

// The scenario document: features as pages, scenarios as sections, steps as
// prose. Exported piecewise so a host app can compose its own chrome around
// them — Fabric mounts the document beside its own Personas section.
export { FeatureNavigator } from './components/scenarios/FeatureNavigator'
export { FeatureDocument } from './components/scenarios/FeatureDocument'
// The scenarios feature rail as its own mountable surface, so a host that gives
// every list-driven screen a side panel can put it there instead of leaving it
// as a drawer inside the page. Same shape as the packages browse rail above.
export { ScenariosBrowseRail } from './components/scenarios/ScenariosBrowseRail'
export type { ScenariosBrowseRailProps } from './components/scenarios/ScenariosBrowseRail'
export { useScenariosBrowse } from './hooks/useScenariosBrowse'
export type { ScenariosBrowse } from './hooks/useScenariosBrowse'
export { ScenarioSection } from './components/scenarios/ScenarioSection'
export { ScenarioDocument } from './components/scenarios/ScenarioDocument'
export { ScenarioCast } from './components/scenarios/ScenarioCast'
export { ScenarioLadder } from './components/scenarios/ScenarioLadder'
export { TagFilter } from './components/scenarios/TagFilter'
export {
  buildScenarioDocs,
  filterFeatures,
} from './components/scenarios/scenario-doc-model'
export type {
  ScenarioDoc,
  ScenarioDocs,
  ScenarioDocFilter,
  ScenarioLadderStep,
  ScenarioStepPhase,
  FeatureDoc,
  FeatureDocEntry,
} from './components/scenarios/scenario-doc-model'
export { useScenarioDocs, UNGROUPED_FEATURE_ID } from './hooks/useScenarioDocs'
export type { ScenarioDocsResult } from './hooks/useScenarioDocs'

// Agent playground building blocks, mirroring the workflow surface:
// `AgentPlaygroundSurface` mounts the contexts, the panels read from them, and
// `AgentThreePane` is one arrangement of those panels rather than the only one.
export { AgentPlaygroundSurface } from './components/agent-playground/AgentPlaygroundSurface'
export type { AgentPlaygroundSurfaceProps } from './components/agent-playground/AgentPlaygroundSurface'
export {
  useAgentPlaygroundSurface,
  AgentPlaygroundSurfaceCtx,
} from './context/AgentPlaygroundSurfaceContext'
export type {
  AgentPlaygroundSurfaceContextType,
  AgentPlaygroundSurfaceItem,
} from './context/AgentPlaygroundSurfaceContext'
export { AgentConversationsPanel } from './components/agent-playground/AgentConversationsPanel'
export { AgentChatPanel } from './components/agent-playground/AgentChatPanel'
export { AgentSelector } from './components/agent-playground/AgentSelector'
export { AgentThreePane } from './components/agent-playground/AgentThreePane'
export { AgentRuns } from './components/project/panels/AgentRuns'
export { AgentTabbedPanel } from './components/project/panels/AgentTabbedPanel'
export type { AgentTabbedPanelProps } from './components/project/panels/AgentTabbedPanel'
export { AgentRunCard } from './components/project/panels/AgentRunCard'
export type { AgentRunCardProps } from './components/project/panels/AgentRunCard'
export { ScoreReadout } from './components/project/panels/ScoreReadout'
export type { ScoreReadoutProps } from './components/project/panels/ScoreReadout'
export { useAgentPlaygroundState } from './hooks/useAgentPlaygroundState'
export type { AgentPlaygroundState } from './hooks/useAgentPlaygroundState'
export { AgentCredentialPrompt } from './components/agent-playground/AgentCredentialPrompt'
export type {
  AgentCredentialPromptProps,
  AgentCredentialRequirement,
} from './components/agent-playground/AgentCredentialPrompt'

// The data behind each panel, so a host can drive its own UI from the same
// derivations the console uses rather than re-deriving them from raw meta.
export { useHttpItems } from './hooks/useHttpItems'
export { useMcpItems } from './hooks/useMcpItems'
export { usePackagesBrowse } from './hooks/usePackagesBrowse'
export type { PackagesBrowse, PackagesTab } from './hooks/usePackagesBrowse'
export { useAddonCategories } from './hooks/useAddonCategories'
export { useOpenapiCategories } from './hooks/useOpenapiCategories'
export type { CategoryBucket } from './components/packages/addonCategoryMeta'
export { useQueueItems } from './hooks/useQueueItems'
export type { QueueItem } from './hooks/useQueueItems'
export { useSchedulerItems } from './hooks/useSchedulerItems'
export type { SchedulerItem } from './hooks/useSchedulerItems'
export { useTriggerItems } from './hooks/useTriggerItems'
export type { TriggerPair } from './hooks/useTriggerItems'
export { useMiddlewareItems } from './hooks/useMiddlewareItems'
export type { MiddlewareItem } from './hooks/useMiddlewareItems'
export { usePermissionItems } from './hooks/usePermissionItems'
export type { PermissionItem } from './hooks/usePermissionItems'
export { useServiceItems } from './hooks/useServiceItems'
export type { ServiceItem } from './hooks/useServiceItems'
export {
  useWebhookDeliveries,
  useWebhookDelivery,
} from './hooks/useWebhookDeliveries'
export type {
  WebhookDelivery,
  WebhookAttempt,
} from './hooks/useWebhookDeliveries'
export {
  useFunctionsMeta,
  useFilteredFunctions,
  isPikkuFunction,
} from './hooks/useFunctionsMeta'
export { useAdminUsers } from './hooks/useAdminUsers'
export { useAgentEntries } from './hooks/useAgentEntries'
export type { AgentEntries } from './hooks/useAgentEntries'
export { useAgentItems } from './hooks/useAgentItems'
export {
  useScenarioFlowEntries,
  useScenarioPersonaEntries,
} from './hooks/useScenarioEntries'
export type {
  ScenarioFlowEntries,
  ScenarioPersonaEntries,
} from './hooks/useScenarioEntries'
