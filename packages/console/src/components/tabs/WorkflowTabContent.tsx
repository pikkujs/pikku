import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PanelProvider } from '../../context/PanelContext'
import { WorkflowRunProvider } from '../../context/WorkflowRunContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { WorkflowCanvas } from '../project/WorkflowCanvas'
import { Center, Loader } from '@pikku/mantine/core'
import { GitBranch } from 'lucide-react'
import { useConsoleNavigator } from '../../context/ConsoleNavigatorContext'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export const WorkflowTabContent: React.FC<{
  immersiveDetail?: boolean
  /** Render as a viewer only — no WorkflowRunProvider, so no run controls.
   *  Used for scenarios, which can only be run via `pikku scenario run`
   *  (actor sign-in cookies can't be minted in the browser). */
  readOnly?: boolean
  /** Override the entity id resolved from the navigator (e.g. scenarioId). */
  entityId?: string | null
}> = ({ immersiveDetail = false, readOnly = false, entityId }) => {
  const { workflowId, navigateTo } = useConsoleNavigator()
  useLocale()
  const rpc = usePikkuRPC()
  const resolvedId = entityId ?? workflowId
  const { data: workflow, isLoading } = useQuery({
    queryKey: ['workflow-meta-by-id', resolvedId],
    queryFn: () =>
      rpc.invoke('console:getWorkflowMetaById', { workflowId: resolvedId! }),
    enabled: !!resolvedId,
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
        title={resolvedId ? asI18n(`Workflow "${resolvedId}" not found`) : m.workflows_empty_title()}
        description={resolvedId ? m.workflows_not_found_description() : m.workflows_empty_description()}
        docsHref="https://pikku.dev/docs/core-features/workflows"
      />
    )
  }

  const canvas = (
    <WorkflowCanvas
      workflow={workflow}
      items={workflowItems}
      onItemSelect={(name) => navigateTo('workflows', name)}
      immersiveDetail={immersiveDetail}
    />
  )

  return (
    <PanelProvider>
      {readOnly ? (
        canvas
      ) : (
        <WorkflowRunProvider
          workflowName={resolvedId!}
          currentGraphHash={(workflow as any).graphHash}
          workflowNodes={(workflow as any).nodes}
        >
          {canvas}
        </WorkflowRunProvider>
      )}
    </PanelProvider>
  )
}
