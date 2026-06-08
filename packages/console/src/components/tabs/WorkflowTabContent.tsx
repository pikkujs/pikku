import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PanelProvider } from '../../context/PanelContext'
import { WorkflowRunProvider } from '../../context/WorkflowRunContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { WorkflowCanvas } from '../project/WorkflowCanvas'
import { Center, Loader } from '@mantine/core'
import { GitBranch } from 'lucide-react'
import { useConsoleNavigator } from '../../context/ConsoleNavigatorContext'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'

export const WorkflowTabContent: React.FC<{ immersiveDetail?: boolean }> = ({
  immersiveDetail = false,
}) => {
  const { workflowId, navigateTo } = useConsoleNavigator()
  const rpc = usePikkuRPC()
  const { data: workflow, isLoading } = useQuery({
    queryKey: ['workflow-meta-by-id', workflowId],
    queryFn: () =>
      rpc.invoke('console:getWorkflowMetaById', { workflowId: workflowId! }),
    enabled: !!workflowId,
  })

  const { meta } = usePikkuMeta()

  const workflowItems = useMemo(() => {
    if (!meta.workflows) return []
    return Object.entries(meta.workflows).map(([name, w]: [string, any]) => ({
      name,
      description: w.steps ? `${w.steps.length} steps` : undefined,
    }))
  }, [meta.workflows])

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (!workflow) {
    return (
      <EmptyStatePlaceholder
        icon={GitBranch}
        title={workflowId ? `Workflow "${workflowId}" not found` : 'No workflows found'}
        description={workflowId ? 'This workflow may have been removed or renamed.' : 'Define workflows in your project to visualize them here.'}
        docsHref="https://pikku.dev/docs/core-features/workflows"
      />
    )
  }

  return (
    <PanelProvider>
      <WorkflowRunProvider
        workflowName={workflowId!}
        currentGraphHash={(workflow as any).graphHash}
        workflowNodes={(workflow as any).nodes}
      >
        <WorkflowCanvas
          workflow={workflow}
          items={workflowItems}
          onItemSelect={(name) => navigateTo('workflows', name)}
          immersiveDetail={immersiveDetail}
        />
      </WorkflowRunProvider>
    </PanelProvider>
  )
}
