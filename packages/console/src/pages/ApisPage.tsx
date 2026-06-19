import React, { Suspense, useState } from 'react'
import { Center, Loader } from '@pikku/mantine/core'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { HttpTab } from '../components/tabs/HttpTab'
import { ChannelsTab } from '../components/tabs/ChannelsTab'
import { McpTab } from '../components/tabs/McpTab'
import { CliTab } from '../components/tabs/CliTab'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'

type ApisTab = 'http' | 'channels' | 'mcp' | 'cli'

const SEARCH_PLACEHOLDER_KEY: Record<ApisTab, string> = {
  http: 'apis.search.http',
  channels: 'apis.search.channels',
  mcp: 'apis.search.mcp',
  cli: 'apis.search.cli',
}

type ApisPageProps = {
  httpHero?: React.ReactNode
  channelsHero?: React.ReactNode
  mcpHero?: React.ReactNode
}

const ApisPageInner: React.FC<ApisPageProps> = ({ httpHero, channelsHero, mcpHero }) => {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const tab = (searchParams.get('tab') || 'http') as ApisTab

  const handleTabChange = (value: ApisTab) => {
    setSearchQuery('')
    setSearchParams({ tab: value })
  }

  const renderTab = () => {
    switch (tab) {
      case 'channels':
        return <ChannelsTab searchQuery={searchQuery} emptyHero={channelsHero} />
      case 'mcp':
        return <McpTab searchQuery={searchQuery} emptyHero={mcpHero} />
      case 'cli':
        return <CliTab searchQuery={searchQuery} />
      default:
        return <HttpTab searchQuery={searchQuery} emptyHero={httpHero} />
    }
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={t('apis.title')}
            description={t('apis.description')}
            docsHref="https://pikku.dev/docs/wiring/http"
            search={{
              placeholder: t(SEARCH_PLACEHOLDER_KEY[tab]),
              value: searchQuery,
              onChange: setSearchQuery,
              width: 240,
            }}
            selection={{
              ariaLabel: asI18n('API type'),
              value: tab,
              onChange: handleTabChange,
              options: [
                { value: 'http', label: asI18n('HTTP') },
                { value: 'channels', label: asI18n('Channels') },
                { value: 'mcp', label: asI18n('MCP') },
                { value: 'cli', label: asI18n('CLI') },
              ],
            }}
          />
        }
        emptyPanelMessage={t('common.select_item')}
      >
        {renderTab()}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}

export const ApisPage: React.FC<ApisPageProps> = (props) => {
  return (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <ApisPageInner {...props} />
    </Suspense>
  )
}
