import { Suspense } from 'react'
import { useSearchParams } from '../router'
import { GitBranch } from 'lucide-react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { WorkflowsList } from '../components/project/WorkflowsList'
import { WorkflowPageClient } from '../components/pages/WorkflowPageClient'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '../components/layout/DetailPageHeader'
import { Center, Loader } from '@mantine/core'
import { useAIWorkflows } from '../hooks/useWorkflowRuns'

function WorkflowPageInner() {
  const [searchParams] = useSearchParams()
  const workflowId = searchParams.get('id')
  const { meta, loading } = usePikkuMeta()
  const { data: aiWorkflows } = useAIWorkflows()

  if (workflowId) {
    return <WorkflowPageClient />
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
          workflows={meta.workflows || {}}
          aiWorkflows={aiWorkflows as any}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}

export const WorkflowsPage: React.FunctionComponent = () => {
  return (
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
}
