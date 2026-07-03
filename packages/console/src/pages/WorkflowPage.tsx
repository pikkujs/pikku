import React, { Suspense, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Group,
  TextInput,
  Center,
  Loader,
  SegmentedControl,
} from '@pikku/mantine/core'
import { GitBranch, Search, UserRound } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { WorkflowTabContent } from '../components/tabs/WorkflowTabContent'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { EntityCardList } from '../components/layout/EntityCardList'
import type { EntityCardItem } from '../components/layout/EntityCardList'
import {
  OSSConsoleNavigator,
  ConsoleNavigatorCtx,
  useConsoleNavigator,
} from '../context/ConsoleNavigatorContext'
import { useAIWorkflows } from '../hooks/useWorkflowRuns'

export type { WorkflowExtraColumn } from '../components/project/WorkflowsList'

const WorkflowPageInner: React.FC<{
  onOpen?: (name: string) => void
  headerRight?: ReactNode
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
  immersiveDetail?: boolean
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}> = ({
  onOpen,
  headerRight,
  emptyHero,
  metricSlot,
  immersiveDetail = false,
  icon = GitBranch,
}) => {
  useLocale()
  const { workflowId, navigateTo } = useConsoleNavigator()
  const { meta, loading } = usePikkuMeta()
  const { data: aiWorkflows } = useAIWorkflows()
  const [searchQuery, setSearchQuery] = useState('')
  const [view, setView] = useState<'workflows' | 'user-flows' | 'personas'>(
    'workflows'
  )

  const userFlowNames = useMemo(() => {
    const names = new Set<string>()
    for (const w of Object.values(meta.workflows ?? {}) as any[]) {
      if (w.source === 'user-flow' || w.userFlow === true) names.add(w.name)
    }
    return names
  }, [meta.workflows])

  const allItems = useMemo((): EntityCardItem[] => {
    const workflows = meta.workflows ?? {}
    const all = Object.values(workflows) as any[]
    if (aiWorkflows) {
      const existingNames = new Set(all.map((w: any) => w.name))
      for (const ai of aiWorkflows as unknown as any[]) {
        if (!existingNames.has(ai.workflowName)) {
          all.push({
            name: ai.workflowName,
            pikkuFuncId: ai.workflowName,
            steps: [],
            source: 'dynamic-workflow',
            nodes: ai.graph?.nodes,
          })
        }
      }
    }
    return all
      .map((w: any): EntityCardItem => {
        const stepCount = w.nodes ? Object.keys(w.nodes).length : (w.steps?.length ?? 0)
        const badges = []
        if (w.source === 'dynamic-workflow') badges.push({ label: 'Dynamic', tone: 'accent' as const })
        else if (w.source === 'user-flow') badges.push({ label: 'User Flow', tone: 'accent' as const })
        else if (w.dsl === true) badges.push({ label: 'DSL', tone: 'neutral' as const })
        const metaTags: string[] = []
        if (stepCount > 0) metaTags.push(`${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`)
        if (w.actors?.length) metaTags.push(w.actors.join(', '))
        return {
          name: w.name,
          badges,
          meta: metaTags,
          description: w.description ?? w.summary,
          tags: w.tags,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [meta.workflows, aiWorkflows])

  const personaItems = useMemo((): EntityCardItem[] => {
    const actors = meta.userFlowActors ?? {}
    const flowsByActor = new Map<string, number>()
    for (const w of Object.values(meta.workflows ?? {}) as any[]) {
      for (const actor of w.actors ?? []) {
        flowsByActor.set(actor, (flowsByActor.get(actor) ?? 0) + 1)
      }
    }
    return Object.entries(actors)
      .map(([key, cfg]: [string, any]): EntityCardItem => {
        const metaTags: string[] = [cfg.email]
        if (cfg.jobTitle) metaTags.push(cfg.jobTitle)
        const flowCount = flowsByActor.get(key) ?? 0
        return {
          name: key,
          displayName: cfg.name ?? key,
          badges:
            flowCount > 0
              ? [
                  {
                    label: `${flowCount} ${flowCount === 1 ? 'flow' : 'flows'}`,
                    tone: 'accent' as const,
                  },
                ]
              : [],
          meta: metaTags,
          description: cfg.personality,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [meta.userFlowActors, meta.workflows])

  const hasPersonas = personaItems.length > 0

  const items = useMemo(() => {
    const base =
      view === 'personas'
        ? personaItems
        : allItems.filter(
            (item) => userFlowNames.has(item.name) === (view === 'user-flows')
          )
    const q = searchQuery.toLowerCase()
    if (!q) return base
    return base.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    )
  }, [allItems, personaItems, userFlowNames, view, searchQuery])

  if (!onOpen && workflowId) {
    return <WorkflowTabContent immersiveDetail={immersiveDetail} />
  }

  const handleOpen = (name: string) => {
    if (view === 'personas') return
    if (onOpen) {
      onOpen(name)
    } else {
      navigateTo('workflows', name)
    }
  }

  const viewOptions = [
    { label: m.workflows_view_workflows(), value: 'workflows' },
    { label: m.workflows_view_user_flows(), value: 'user-flows' },
    ...(hasPersonas
      ? [{ label: m.workflows_view_personas(), value: 'personas' }]
      : []),
  ]

  const emptyTitle =
    view === 'user-flows'
      ? m.user_flows_empty_title()
      : view === 'personas'
        ? m.personas_empty_title()
        : m.workflows_empty_title()
  const emptyDescription =
    view === 'user-flows'
      ? m.user_flows_empty_description()
      : view === 'personas'
        ? m.personas_empty_description()
        : m.workflows_empty_description()

  return (
    <PanelProvider>
      <ResizablePanelLayout
        hidePanel
        header={
          <ListPageHeader
            title={m.workflows_title()}
            description={m.workflows_description()}
            docsHref="https://pikku.dev/docs/wiring/workflows"
            filters={
              <Group gap="sm" wrap="nowrap">
                <SegmentedControl
                  size="xs"
                  value={view}
                  onChange={(value) => setView(value as typeof view)}
                  data={viewOptions}
                />
                <TextInput
                  placeholder={m.workflows_search_placeholder()}
                  leftSection={<Search size={14} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="xs"
                  style={{ width: 240 }}
                />
                {headerRight}
              </Group>
            }
          />
        }
      >
        <EntityCardList
          items={items}
          onOpen={handleOpen}
          loading={loading}
          icon={view === 'personas' ? UserRound : icon}
          emptyHero={view === 'workflows' ? emptyHero : undefined}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          docsHref="https://pikku.dev/docs/wiring/workflows"
          metricSlot={view === 'personas' ? undefined : metricSlot}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}

export const WorkflowsPage: React.FC<{
  onOpen?: (name: string) => void
  headerRight?: ReactNode
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
  immersiveDetail?: boolean
  extraColumns?: unknown[]
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}> = ({
  onOpen,
  headerRight,
  emptyHero,
  metricSlot,
  immersiveDetail = false,
  extraColumns,
  icon = GitBranch,
}) => {
  const existingNavigator = useContext(ConsoleNavigatorCtx)
  const inner = (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <WorkflowPageInner
        onOpen={onOpen}
        headerRight={headerRight}
        emptyHero={emptyHero}
        metricSlot={metricSlot}
        immersiveDetail={immersiveDetail}
        icon={icon}
      />
    </Suspense>
  )
  if (existingNavigator) return inner
  return <OSSConsoleNavigator>{inner}</OSSConsoleNavigator>
}
