import { Suspense, useContext } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { WorkflowsList } from '../components/project/WorkflowsList'
import type { WorkflowExtraColumn } from '../components/project/WorkflowsList'
import { WorkflowTabContent } from '../components/tabs/WorkflowTabContent'
import { Center, Loader } from '@mantine/core'
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
      <ResizablePanelLayout hidePanel header={<ListPageHeader title="Workflows" description="Visual workflow definitions and run history" />}>
        <WorkflowsList
          workflows={meta.workflows || {}}
          aiWorkflows={aiWorkflows as any}
          extraColumns={extraColumns}
          headerRight={headerRight}
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
