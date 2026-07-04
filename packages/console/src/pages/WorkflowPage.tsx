import React, { Suspense, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Group, TextInput, Center, Loader } from '@pikku/mantine/core'
import { GitBranch, Search } from 'lucide-react'
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

  const scenarioNames = useMemo(() => {
    const names = new Set<string>()
    for (const w of Object.values(meta.workflows ?? {}) as any[]) {
      if (w.source === 'scenario' || w.scenario === true) names.add(w.name)
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
        else if (w.source === 'scenario') badges.push({ label: 'Scenario', tone: 'accent' as const })
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

  const items = useMemo(() => {
    const base = allItems.filter((item) => !scenarioNames.has(item.name))
    const q = searchQuery.toLowerCase()
    if (!q) return base
    return base.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    )
  }, [allItems, scenarioNames, searchQuery])

  if (!onOpen && workflowId) {
    return <WorkflowTabContent immersiveDetail={immersiveDetail} />
  }

  const handleOpen = (name: string) => {
    if (onOpen) {
      onOpen(name)
    } else {
      navigateTo('workflows', name)
    }
  }

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
          icon={icon}
          emptyHero={emptyHero}
          emptyTitle={m.workflows_empty_title()}
          emptyDescription={m.workflows_empty_description()}
          docsHref="https://pikku.dev/docs/wiring/workflows"
          metricSlot={metricSlot}
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
