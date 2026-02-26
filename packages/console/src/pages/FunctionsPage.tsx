import { useQuery } from '@tanstack/react-query'
import { FunctionSquare } from 'lucide-react'
import { ProjectFunctions } from '@/components/project/ProjectFunctions'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { PanelProvider } from '@/context/PanelContext'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { Center, Loader } from '@mantine/core'

export const FunctionsPage: React.FunctionComponent = () => {
  const rpc = usePikkuRPC()

  const { data: functions, isLoading } = useQuery({
    queryKey: ['functions-meta'],
    queryFn: () => rpc('console:getFunctionsMeta', null),
  })

  if (isLoading || !functions) {
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
            icon={FunctionSquare}
            category="Functions"
            docsHref="https://pikku.dev/docs/core-features/functions"
          />
        }
        showTabs={false}
        hidePanel={functions.length === 0}
        emptyPanelMessage="Select a function to view its details"
      >
        <ProjectFunctions functions={functions} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
