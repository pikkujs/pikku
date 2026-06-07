import React, { Suspense } from 'react'
import { Center, Loader, Box, Stack, SegmentedControl } from '@mantine/core'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ListPageHeader } from '../components/layout/PageLayout'
import { HttpTab } from '../components/tabs/HttpTab'
import { ChannelsTab } from '../components/tabs/ChannelsTab'
import { McpTab } from '../components/tabs/McpTab'
import { CliTab } from '../components/tabs/CliTab'
import { PageContainer } from '../components/layout/PageLayout'

const TABS = [
  { value: 'http', label: 'HTTP' },
  { value: 'channels', label: 'Channels' },
  { value: 'mcp', label: 'MCP' },
  { value: 'cli', label: 'CLI' },
]

const ApisPageInner: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'http'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  const renderTab = () => {
    switch (tab) {
      case 'channels':
        return <ChannelsTab />
      case 'mcp':
        return <McpTab />
      case 'cli':
        return <CliTab />
      default:
        return <HttpTab />
    }
  }

  return (
    <PanelProvider>
      <PageContainer
        fullWidth
        contentGap="md"
        style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
        header={
          <Stack gap="md">
            <ListPageHeader title="Wires" description="Browse HTTP routes, channels, MCP servers, and CLI surfaces" />
            <SegmentedControl size="xs" value={tab} onChange={handleTabChange} data={TABS} />
          </Stack>
        }
      >
        <Box style={{ flex: 1, minHeight: 0 }}>{renderTab()}</Box>
      </PageContainer>
    </PanelProvider>
  )
}

export const ApisPage: React.FC = () => {
  return (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <ApisPageInner />
    </Suspense>
  )
}
