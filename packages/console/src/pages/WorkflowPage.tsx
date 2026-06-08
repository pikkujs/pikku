import { Suspense, useContext, useMemo, useState } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { WorkflowsList } from '../components/project/WorkflowsList'
import type { WorkflowExtraColumn } from '../components/project/WorkflowsList'
import { WorkflowTabContent } from '../components/tabs/WorkflowTabContent'
import { Center, Group, Loader, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { useAIWorkflows } from '../hooks/useWorkflowRuns'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import {
  OSSConsoleNavigator,
  ConsoleNavigatorCtx,
  useConsoleNavigator,
} from '../context/ConsoleNavigatorContext'

const WorkflowPageInner: React.FC<{
  extraColumns?: WorkflowExtraColumn[]
  headerRight?: React.ReactNode
  immersiveDetail?: boolean
}> = ({ extraColumns, headerRight, immersiveDetail = false }) => {
  const { workflowId } = useConsoleNavigator()
  const { meta, loading } = usePikkuMeta()
  const { data: aiWorkflows } = useAIWorkflows()
  const [searchQuery, setSearchQuery] = useState('')

  const allWorkflows = useMemo(() => {
    const workflows = meta.workflows || {}
    const all = Object.values(workflows) as any[]
    if (aiWorkflows) {
      const existingNames = new Set(all.map((w: any) => w.name))
      for (const ai of (aiWorkflows as unknown as any[])) {
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
  }, [meta.workflows, aiWorkflows])

  const filteredWorkflows = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return allWorkflows
    return allWorkflows.filter((w: any) =>
      w.name?.toLowerCase().includes(q) || w.pikkuFuncId?.toLowerCase().includes(q)
    )
  }, [allWorkflows, searchQuery])

  if (workflowId) {
    return <WorkflowTabContent immersiveDetail={immersiveDetail} />
  }

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
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
        <WorkflowsList
          workflows={filteredWorkflows}
          extraColumns={extraColumns}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}

export const WorkflowsPage: React.FC<{
  extraColumns?: WorkflowExtraColumn[]
  headerRight?: React.ReactNode
  immersiveDetail?: boolean
}> = ({ extraColumns, headerRight, immersiveDetail = false }) => {
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
        extraColumns={extraColumns}
        headerRight={headerRight}
        immersiveDetail={immersiveDetail}
      />
    </Suspense>
  )
  if (existingNavigator) return inner
  return <OSSConsoleNavigator>{inner}</OSSConsoleNavigator>
}
