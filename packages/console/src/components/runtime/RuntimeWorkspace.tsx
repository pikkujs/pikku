import React, { useMemo, useState } from 'react'
import { ActionIcon, Stack, Text } from '@pikku/mantine/core'
import { ChevronRight, Layers, Server, Shield } from 'lucide-react'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { setUrlHash } from '../../hooks/useUrlHash'
import { useUrlSelection, useUrlState, useUrlWrite } from '../../hooks/url-state'
import { toEnglishName } from '../../lib/strings'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { SummaryCard } from '../ui/SummaryCard'
import { CardRow } from '../ui/CardRow'
import { StatusBadge } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevMono, DevTable } from '../ui/DevDetail'

type Tab = 'services' | 'middleware' | 'permissions'

const TABS: Tab[] = ['services', 'middleware', 'permissions']

const DOCS: Record<Tab, string> = {
  services: 'https://pikku.dev/docs/core-features/services',
  middleware: 'https://pikku.dev/docs/core-features/middleware',
  permissions: 'https://pikku.dev/docs/core-features/permission-guards',
}

const SESSION_WIRES = new Set([
  'session',
  'setSession',
  'clearSession',
  'getSession',
  'hasSessionChanged',
])

const SERVICE_NAMES: Record<string, () => I18nNode> = {
  kysely: m.runtime_page_svc_database,
  logger: m.runtime_page_svc_logs,
  config: m.runtime_page_svc_config,
  variables: m.runtime_page_svc_variables,
  secrets: m.runtime_page_svc_secrets,
  workflowService: m.runtime_page_svc_workflows,
  workflowRunService: m.runtime_page_svc_workflow_runs,
  queueService: m.runtime_page_svc_queues,
  schedulerService: m.runtime_page_svc_schedules,
  eventHub: m.runtime_page_svc_live_updates,
  content: m.runtime_page_svc_files,
  emailService: m.runtime_page_svc_email,
  webhookService: m.runtime_page_svc_webhooks,
  credentialService: m.runtime_page_svc_credentials,
  agentRunner: m.runtime_page_svc_agents,
  agentRunService: m.runtime_page_svc_agent_runs,
  virtualUserRunStore: m.runtime_page_svc_vu_runs,
  virtualUserScheduleStore: m.runtime_page_svc_vu_schedules,
  audit: m.runtime_page_svc_audit,
  analytics: m.runtime_page_svc_analytics,
  scopeService: m.runtime_page_svc_scopes,
  sessionStore: m.runtime_page_svc_sessions,
  jwt: m.runtime_page_svc_jwt,
}

const BUILT_IN_SERVICES = new Set([
  'kysely',
  'schema',
  'jwt',
  'config',
  'logger',
  'variables',
  'secrets',
  'workflowService',
  'queueService',
  'eventHub',
  'schedulerService',
  'deploymentService',
  'agentStorage',
  'content',
  'agentRunner',
  'aiEmbedding',
  'agentRunState',
  'agentRunService',
  'workflowRunService',
  'credentialService',
  'emailService',
  'webhookService',
  'metaService',
  'virtualUserRunStore',
  'virtualUserScheduleStore',
  'coverageService',
  'audit',
  'analyticsService',
  'analyticsIdentity',
  'analytics',
  'auditLog',
  'sessionStore',
  'scopeService',
  'featureFlags',
  'auth',
])

type Group = 'yours' | 'builtin'

const GROUPS: Group[] = ['yours', 'builtin']

interface ServiceEntry {
  name: string
  functions: string[]
  group: Group
}

interface RuleEntry {
  id: string
  defId: string
  name: string
  description?: string
  exportedName?: string
  usesSession: boolean
  group: Group
  uses: number
  appliesTo: string[]
  data: any
}

const matches = (query: string, ...values: (string | undefined)[]) =>
  values.some((value) => value?.toLowerCase().includes(query))

const toRules = (
  groups: any,
  prefix: string,
  functions: any[],
  field: 'middleware' | 'permissions'
): RuleEntry[] => {
  if (!groups) return []
  const instances = Object.entries(groups.instances ?? {}) as [string, any][]
  const httpGroups = Object.entries(groups.httpGroups ?? {}) as [string, any][]
  const tagGroups = Object.entries(groups.tagGroups ?? {}) as [string, any][]
  return (Object.entries(groups.definitions ?? {}) as [string, any][])
    .filter(([, def]) => def.exportedName !== null)
    .map(([defId, def]) => {
      const instanceIds = new Set(
        instances
          .filter(([, inst]) => inst.definitionId === defId)
          .map(([iid]) => iid)
      )
      const uses = (group: any) =>
        group.instanceIds?.some((iid: string) => instanceIds.has(iid))
      const names = new Set([defId, def.exportedName, def.name])
      const onFunctions = functions
        .filter((f) =>
          (f[field] ?? []).some((ref: any) => names.has(ref?.name))
        )
        .map((f) => f.pikkuFuncId as string)
      return {
        id: `${prefix}::def::${defId}`,
        defId,
        name: def.name || def.exportedName || defId,
        description: def.description,
        exportedName: def.exportedName,
        usesSession: (def.wires?.wires ?? []).some((w: string) =>
          SESSION_WIRES.has(w)
        ),
        group:
          def.package || /node_modules|@pikku\//.test(def.sourceFile ?? '')
            ? ('builtin' as Group)
            : ('yours' as Group),
        uses: instanceIds.size + onFunctions.length,
        appliesTo: [
          ...onFunctions,
          ...httpGroups.filter(([, g]) => uses(g)).map(([key]) => key),
          ...tagGroups.filter(([, g]) => uses(g)).map(([key]) => `#${key}`),
        ],
        data: { ...def, _id: defId },
      }
    })
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
}

const TITLES = {
  services: {
    yours: m.runtime_page_services_yours_title,
    builtin: m.runtime_page_services_builtin_title,
  },
  middleware: {
    yours: m.runtime_page_middleware_yours_title,
    builtin: m.runtime_page_middleware_builtin_title,
  },
  permissions: {
    yours: m.runtime_page_permissions_yours_title,
    builtin: m.runtime_page_permissions_builtin_title,
  },
}

const BLURBS = {
  services: {
    yours: m.runtime_page_services_yours_blurb,
    builtin: m.runtime_page_services_builtin_blurb,
  },
  middleware: {
    yours: m.runtime_page_middleware_yours_blurb,
    builtin: m.runtime_page_middleware_builtin_blurb,
  },
  permissions: {
    yours: m.runtime_page_permissions_yours_blurb,
    builtin: m.runtime_page_permissions_builtin_blurb,
  },
}

const serviceTitle = (name: string) =>
  SERVICE_NAMES[name]?.() ?? asI18n(toEnglishName(name))

export const RuntimeWorkspace: React.FC = () => {
  useLocale()
  const { meta, loading } = usePikkuMeta()
  const { openMiddleware, openPermission } = usePanelContext()
  const [linkedTab] = useUrlSelection('tab', TABS)
  const [linkedSearch] = useUrlState('search')
  const writeUrl = useUrlWrite()
  const [searchQuery, setSearchQuery] = useState(() => linkedSearch ?? '')
  const tab: Tab = (TABS as string[]).includes(linkedTab ?? '')
    ? (linkedTab as Tab)
    : 'services'
  const query = searchQuery.trim().toLowerCase()

  const functions = useMemo(
    () => (meta.functions ?? []) as any[],
    [meta.functions]
  )

  const services = useMemo((): ServiceEntry[] => {
    const byName = new Map<string, string[]>()
    for (const func of functions) {
      for (const svc of func.services?.services ?? []) {
        byName.set(svc, [...(byName.get(svc) ?? []), func.pikkuFuncId])
      }
    }
    return [...byName.entries()]
      .map(([name, fns]) => ({
        name,
        functions: fns,
        group: (BUILT_IN_SERVICES.has(name) ? 'builtin' : 'yours') as Group,
      }))
      .sort((a, b) => b.functions.length - a.functions.length)
  }, [functions])

  const middleware = useMemo(
    () =>
      toRules(meta.middlewareGroupsMeta, 'middleware', functions, 'middleware'),
    [meta.middlewareGroupsMeta, functions]
  )
  const permissions = useMemo(
    () =>
      toRules(
        meta.permissionsGroupsMeta,
        'permission',
        functions,
        'permissions'
      ),
    [meta.permissionsGroupsMeta, functions]
  )

  usePanelUrl({
    type: 'middleware',
    items: middleware,
    getId: (item) => item.id,
    open: (id, item) => openMiddleware(id, item.data),
  })
  usePanelUrl({
    type: 'permission',
    items: permissions,
    getId: (item) => item.id,
    open: (id, item) => openPermission(id, item.data),
  })

  const changeTab = (value: Tab) => {
    setSearchQuery('')
    setUrlHash('')
    writeUrl({ tab: value, search: null }, { replace: false })
  }

  const withService = functions.filter(
    (f) => (f.services?.services ?? []).length > 0
  ).length

  const shownServices = services.filter(
    (s) =>
      !query ||
      matches(query, s.name, String(SERVICE_NAMES[s.name]?.() ?? '')) ||
      s.functions.some((f) => f.toLowerCase().includes(query))
  )
  const serviceGroups = GROUPS.filter((g) =>
    services.some((s) => s.group === g)
  )
  const filterRules = (rules: RuleEntry[]) =>
    rules.filter(
      (r) => !query || matches(query, r.name, r.description, r.exportedName)
    )

  const noMatches = (
    <Text size="sm" c="dimmed">
      {m.runtime_page_no_matches({ query: searchQuery.trim() })}
    </Text>
  )

  const usedBy = (count: number) =>
    count === 1
      ? m.runtime_page_used_by_one()
      : m.runtime_page_used_by({ count })

  const applies = (count: number) =>
    count === 0
      ? m.runtime_page_applies_none()
      : count === 1
        ? m.runtime_page_applies_one()
        : m.runtime_page_applies({ count })

  const rulesCards = (
    kind: 'middleware' | 'permissions',
    everything: RuleEntry[],
    open: (id: string, data: any) => void
  ) => {
    const groups = GROUPS.filter((g) => everything.some((r) => r.group === g))
    return (groups.length > 0 ? groups : (['yours'] as Group[])).map((group) =>
      rulesCard(
        kind,
        group,
        everything.filter((r) => r.group === group),
        open
      )
    )
  }

  const rulesCard = (
    kind: 'middleware' | 'permissions',
    group: Group,
    all: RuleEntry[],
    open: (id: string, data: any) => void
  ) => {
    const shown = filterRules(all)
    const Icon = kind === 'middleware' ? Layers : Shield
    return (
      <SectionCard
        key={group}
        testId={`runtime-${kind}-${group}`}
        title={TITLES[kind][group]()}
        subtitle={
          loading
            ? undefined
            : shown.length === 1
              ? m.runtime_page_count_one()
              : m.runtime_page_count({ count: shown.length })
        }
        blurb={BLURBS[kind][group]()}
        footer={
          all.length > 0 ? (
            <ForDevelopers
              attached
              hint={m.runtime_page_dev_hint_rules()}
              testId={`runtime-${kind}-${group}-developers`}
            >
              <DevTable
                columns={[
                  m.runtime_page_dev_col_code(),
                  m.runtime_page_dev_col_export(),
                  m.runtime_page_dev_col_applies(),
                ]}
                rows={all.map((r) => ({
                  key: r.id,
                  cells: [
                    <DevMono key="code" value={r.defId} copy />,
                    <DevMono key="export" value={r.exportedName ?? '—'} />,
                    <DevMono
                      key="applies"
                      value={r.appliesTo.join(', ') || '—'}
                    />,
                  ],
                }))}
              />
            </ForDevelopers>
          ) : undefined
        }
      >
        <Stack gap="xs" mt="md">
          {!loading && all.length === 0 ? (
            <Text size="sm" c="dimmed">
              {kind === 'middleware'
                ? m.middleware_empty_message()
                : m.permissions_empty_message()}
            </Text>
          ) : shown.length === 0 && query ? (
            noMatches
          ) : (
            shown.map((r) => (
              <CardRow
                key={r.id}
                testId={`runtime-${kind}-${r.defId}`}
                leading={
                  <StatusTile tone={r.uses > 0 ? 'info' : 'neutral'}>
                    <Icon size={18} />
                  </StatusTile>
                }
                title={asI18n(toEnglishName(r.name))}
                badges={
                  r.usesSession ? (
                    <StatusBadge tone="neutral" size="sm">
                      {m.runtime_page_badge_session()}
                    </StatusBadge>
                  ) : undefined
                }
                meta={
                  <>
                    {r.description
                      ? asI18n(r.description)
                      : m.runtime_page_no_description()}
                    {asI18n(' · ')}
                    {applies(r.uses)}
                  </>
                }
                trailing={
                  <ActionIcon
                    visibleFrom="sm"
                    variant="subtle"
                    color="gray"
                    aria-label={m.runtime_page_open({ name: r.name })}
                    onClick={() => open(r.id, r.data)}
                  >
                    <ChevronRight size={16} />
                  </ActionIcon>
                }
                onClick={() => open(r.id, r.data)}
              />
            ))
          )}
        </Stack>
      </SectionCard>
    )
  }

  return (
    <ResizablePanelLayout
      header={
        <ListPageHeader<Tab>
          title={m.runtime_title()}
          description={m.runtime_page_description()}
          docsHref={DOCS[tab]}
          search={{
            placeholder:
              tab === 'services'
                ? m.runtime_search_services()
                : tab === 'middleware'
                  ? m.runtime_search_middleware()
                  : m.runtime_search_permissions(),
            value: searchQuery,
            onChange: setSearchQuery,
            width: 240,
          }}
          selection={{
            ariaLabel: m.runtime_page_tabs_label(),
            value: tab,
            onChange: changeTab,
            options: [
              {
                value: 'services',
                label: m.runtime_page_tab_services(),
                'data-testid': 'runtime-tab-services',
              },
              {
                value: 'middleware',
                label: m.runtime_page_tab_middleware(),
                'data-testid': 'runtime-tab-middleware',
              },
              {
                value: 'permissions',
                label: m.runtime_page_tab_permissions(),
                'data-testid': 'runtime-tab-permissions',
              },
            ],
          }}
        />
      }
      emptyPanelMessage={m.common_select_item()}
      hidePanel={tab === 'services'}
      surface="cards"
    >
      <CardsPage>
        {!loading && !query && (
          <SummaryCard
            testId="runtime-summary"
            title={
              services.length === 1
                ? m.runtime_page_hero_title_one()
                : m.runtime_page_hero_title({ count: services.length })
            }
            blurb={m.runtime_page_hero_body()}
            facts={[
              {
                label: m.runtime_page_fact_services(),
                value: asI18n(String(services.length)),
              },
              {
                label: m.runtime_page_fact_functions(),
                value: m.runtime_page_fact_of({
                  done: withService,
                  total: functions.length,
                }),
              },
              {
                label: m.runtime_page_fact_middleware(),
                value: asI18n(String(middleware.length)),
              },
              {
                label: m.runtime_page_fact_permissions(),
                value: asI18n(String(permissions.length)),
              },
            ]}
          />
        )}
        {tab === 'services' &&
          (serviceGroups.length > 0 ? serviceGroups : (['yours'] as Group[])).map((group) => {
            const list = services.filter((s) => s.group === group)
            const shownList = shownServices.filter((s) => s.group === group)
            return (
          <SectionCard
            key={group}
            testId={`runtime-services-${group}`}
            title={TITLES.services[group]()}
            subtitle={
              loading
                ? undefined
                : shownList.length === 1
                  ? m.runtime_page_count_one()
                  : m.runtime_page_count({ count: shownList.length })
            }
            blurb={BLURBS.services[group]()}
            footer={
              list.length > 0 ? (
                <ForDevelopers
                  attached
                  hint={m.runtime_page_dev_hint_services()}
                  testId={`runtime-services-${group}-developers`}
                >
                  <DevTable
                    columns={[
                      m.runtime_page_dev_col_code(),
                      m.runtime_page_dev_col_functions(),
                    ]}
                    rows={list.map((s) => ({
                      key: s.name,
                      cells: [
                        <DevMono key="code" value={s.name} copy />,
                        <DevMono key="functions" value={s.functions.join(', ')} />,
                      ],
                    }))}
                  />
                </ForDevelopers>
              ) : undefined
            }
          >
            <Stack gap="xs" mt="md">
              {!loading && list.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {m.services_empty_message()}
                </Text>
              ) : shownList.length === 0 && query ? (
                noMatches
              ) : (
                shownList.map((s) => (
                  <CardRow
                    key={s.name}
                    testId={`runtime-service-${s.name}`}
                    leading={
                      <StatusTile tone="info">
                        <Server size={18} />
                      </StatusTile>
                    }
                    title={serviceTitle(s.name)}
                    meta={usedBy(s.functions.length)}
                  />
                ))
              )}
            </Stack>
          </SectionCard>
            )
          })}
        {tab === 'middleware' &&
          rulesCards('middleware', middleware, openMiddleware)}
        {tab === 'permissions' &&
          rulesCards('permissions', permissions, openPermission)}
      </CardsPage>
    </ResizablePanelLayout>
  )
}
