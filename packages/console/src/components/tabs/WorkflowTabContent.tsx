import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PanelProvider } from '../../context/PanelContext'
import { WorkflowRunProvider } from '../../context/WorkflowRunContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { WorkflowCanvas } from '../project/WorkflowCanvas'
import { Center, Loader, Box, Text } from '@mantine/core'
import { useConsoleNavigator } from '../../context/ConsoleNavigatorContext'
import styles from '../ui/console.module.css'

export const WorkflowTabContent: React.FunctionComponent = () => {
  const { workflowId, navigateTo } = useConsoleNavigator()
  const rpc = usePikkuRPC()
  const { data: workflow, isLoading } = useQuery({
    queryKey: ['workflow-meta-by-id', workflowId],
    queryFn: () => rpc.invoke('console:getWorkflowMetaById', { workflowId: workflowId! }),
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
        workflowName={workflowId!}
        currentGraphHash={(workflow as any).graphHash}
        workflowNodes={(workflow as any).nodes}
      >
        <Box h="100vh" className={styles.flexColumn}>
          <Box className={`${styles.flexGrow} ${styles.overflowAuto}`}>
            <WorkflowCanvas
              workflow={workflow}
              items={workflowItems}
              onItemSelect={(name) => navigateTo('workflows', name)}
            />
          </Box>
        </Box>
      </WorkflowRunProvider>
    </PanelProvider>
  )
}
