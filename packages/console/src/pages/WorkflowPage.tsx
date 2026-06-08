import React, { Suspense, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Group, TextInput, Center, Loader } from '@mantine/core'
import { GitBranch, Search } from 'lucide-react'
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

// Keep this export for backwards compat
export type { WorkflowExtraColumn } from '../components/project/WorkflowsList'

const WorkflowPageInner: React.FC<{
  onOpen?: (name: string) => void
  headerRight?: ReactNode
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
  immersiveDetail?: boolean
}> = ({ onOpen, headerRight, emptyHero, metricSlot, immersiveDetail = false }) => {
  const { workflowId, navigateTo } = useConsoleNavigator()
  const { meta, loading } = usePikkuMeta()
  const { data: aiWorkflows } = useAIWorkflows()
  const [searchQuery, setSearchQuery] = useState('')

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
        else if (w.dsl === true) badges.push({ label: 'DSL', tone: 'neutral' as const })
        const metaTags: string[] = []
        if (stepCount > 0) metaTags.push(`${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`)
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
    const q = searchQuery.toLowerCase()
    if (!q) return allItems
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    )
  }, [allItems, searchQuery])

  // OSS inline detail view (not used when fabric provides onOpen)
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
            title="Workflows"
            description="Visual workflow definitions and run history"
            docsHref="https://pikku.dev/docs/wiring/workflows"
            filters={
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  placeholder="Search workflows..."
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
          icon={GitBranch}
          emptyHero={emptyHero}
          emptyTitle="No workflows found"
          emptyDescription="Define workflows in your project to see them here."
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
  /** @deprecated — cards have no columns; ignored */
  extraColumns?: unknown[]
}> = ({ onOpen, headerRight, emptyHero, metricSlot, immersiveDetail = false }) => {
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
      />
    </Suspense>
  )
  if (existingNavigator) return inner
  return <OSSConsoleNavigator>{inner}</OSSConsoleNavigator>
}
