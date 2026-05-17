import { Suspense, useContext } from 'react'
import { GitBranch } from 'lucide-react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { WorkflowsList } from '../components/project/WorkflowsList'
import { WorkflowTabContent } from '../components/tabs/WorkflowTabContent'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '../components/layout/DetailPageHeader'
import { Center, Loader } from '@mantine/core'
import { useAIWorkflows } from '../hooks/useWorkflowRuns'
import {
  OSSConsoleNavigator,
  ConsoleNavigatorCtx,
  useConsoleNavigator,
} from '../context/ConsoleNavigatorContext'

function WorkflowPageInner() {
  const { workflowId } = useConsoleNavigator()
  const { meta, loading } = usePikkuMeta()
  const { data: aiWorkflows } = useAIWorkflows()

  if (workflowId) {
    return <WorkflowTabContent />
  }

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  const workflows = meta.workflows || {}
  const hasWorkflows = Object.keys(workflows).length > 0 || (aiWorkflows && aiWorkflows.length > 0)

  if (!hasWorkflows) {
    return (
      <WorkflowsList
        workflows={workflows}
        aiWorkflows={aiWorkflows as any}
      />
    )
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={GitBranch}
            category="Workflows"
            docsHref="https://pikku.dev/docs/wiring/workflows"
          />
        }
        hidePanel
      >
        <WorkflowsList
          workflows={workflows}
          aiWorkflows={aiWorkflows as any}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}

export const WorkflowsPage: React.FunctionComponent = () => {
  const existingNavigator = useContext(ConsoleNavigatorCtx)
  const inner = (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <WorkflowPageInner />
    </Suspense>
  )
  // Fabric (or any other host) provides its own navigator above this component.
  // Only wrap with the OSS default when none is present.
  if (existingNavigator) return inner
  return <OSSConsoleNavigator>{inner}</OSSConsoleNavigator>
}
