import { Suspense, useContext } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { WorkflowsList } from '../components/project/WorkflowsList'
import type { WorkflowExtraColumn } from '../components/project/WorkflowsList'
import { WorkflowTabContent } from '../components/tabs/WorkflowTabContent'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { Center, Loader } from '@mantine/core'
import { useAIWorkflows } from '../hooks/useWorkflowRuns'
import {
  OSSConsoleNavigator,
  ConsoleNavigatorCtx,
  useConsoleNavigator,
} from '../context/ConsoleNavigatorContext'

const WorkflowPageInner: React.FC<{
  extraColumns?: WorkflowExtraColumn[]
  headerRight?: React.ReactNode
  immersiveDetail?: boolean
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}> = ({ extraColumns, headerRight, immersiveDetail = false, icon }) => {
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

  const workflows = meta.workflows || {}
  const hasWorkflows =
    Object.keys(workflows).length > 0 || (aiWorkflows && aiWorkflows.length > 0)

  if (!hasWorkflows) {
    return (
      <WorkflowsList
        workflows={workflows}
        aiWorkflows={aiWorkflows as any}
        extraColumns={extraColumns}
        headerRight={headerRight}
        icon={icon}
      />
    )
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout hidePanel>
        <WorkflowsList
          workflows={workflows}
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
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}> = ({ extraColumns, headerRight, immersiveDetail = false, icon }) => {
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
        icon={icon}
      />
    </Suspense>
  )
  // Fabric (or any other host) provides its own navigator above this component.
  // Only wrap with the OSS default when none is present.
  if (existingNavigator) return inner
  return <OSSConsoleNavigator>{inner}</OSSConsoleNavigator>
}
