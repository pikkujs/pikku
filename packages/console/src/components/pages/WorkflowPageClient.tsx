import React, { useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PanelProvider } from '@/context/PanelContext'
import { WorkflowRunProvider } from '@/context/WorkflowRunContext'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { WorkflowCanvas } from '@/components/project/WorkflowCanvas'
import { Center, Loader, Box, Text } from '@mantine/core'

export const WorkflowPageClient: React.FunctionComponent = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const workflowId = searchParams.get('id') || ''
  const rpc = usePikkuRPC()
  const { data: workflow, isLoading } = useQuery({
    queryKey: ['workflow-meta-by-id', workflowId],
    queryFn: () => rpc('console:getWorkflowMetaById', { workflowId }),
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
      <Center h="100vh">
        <Text c="dimmed">Workflow &quot;{workflowId}&quot; not found.</Text>
      </Center>
    )
  }

  return (
    <PanelProvider>
      <WorkflowRunProvider
        workflowName={workflowId}
        currentGraphHash={(workflow as any).graphHash}
        workflowNodes={(workflow as any).nodes}
      >
        <Box h="100vh" style={{ display: 'flex', flexDirection: 'column' }}>
          <Box style={{ flex: 1, overflow: 'auto' }}>
            <WorkflowCanvas
              workflow={workflow}
              items={workflowItems}
              onItemSelect={(name) =>
                navigate(`/workflow?id=${encodeURIComponent(name)}`)
              }
            />
          </Box>
        </Box>
      </WorkflowRunProvider>
    </PanelProvider>
  )
}
