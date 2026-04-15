import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from '../router'
import {
  Center,
  Loader,
  Text,
  SegmentedControl,
  Stack,
  Paper,
  Group,
  Button,
} from '@mantine/core'
import { Bot, KeyRound, Link2 } from 'lucide-react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '../context/PanelContext'
import {
  AgentPlaygroundProvider,
  useAgentPlayground,
} from '../context/AgentPlaygroundContext'
import { ThreePaneLayout } from '../components/layout/ThreePaneLayout'
import { RunsPanel } from '../components/layout/RunsPanel'
import { DetailPageHeader } from '../components/layout/DetailPageHeader'
import { AgentChat } from '../components/project/AgentChat'
import { useDeleteAgentThread } from '../hooks/useAgentRuns'
import { useAgentCredentials } from '../hooks/useAgentCredentials'
import { getServerUrl } from '../context/PikkuRpcProvider'

const CredentialPrompt: React.FunctionComponent<{
  requirements: Array<{
    credentialName: string
    displayName: string
    addonNamespace: string
    connected: boolean
  }>
  onRefresh: () => void
}> = ({ requirements, onRefresh }) => {
  const serverUrl = getServerUrl()
  const missing = requirements.filter((r) => !r.connected)

  const handleConnect = (credentialName: string) => {
    const connectUrl = `${serverUrl}/credentials/${credentialName}/connect`
    const popup = window.open(connectUrl, 'oauth-connect', 'width=600,height=700')
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer)
        onRefresh()
      }
    }, 500)
  }

  return (
    <Center h="100%" p="xl">
      <Paper withBorder radius="md" p="xl" maw={480} w="100%">
        <Stack gap="md" align="center">
          <KeyRound size={32} color="var(--mantine-color-orange-6)" />
          <Text fw={600} size="lg" ta="center">
            Connect your accounts
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            This agent requires the following credentials to be connected before
            you can start chatting.
          </Text>
          <Stack gap="xs" w="100%">
            {missing.map((req) => (
              <Group
                key={req.credentialName}
                justify="space-between"
                p="sm"
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 'var(--mantine-radius-sm)',
                }}
              >
                <Group gap="xs">
                  <Link2 size={16} color="var(--mantine-color-dimmed)" />
                  <Text size="sm" fw={500}>
                    {req.displayName}
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => handleConnect(req.credentialName)}
                >
                  Connect
                </Button>
              </Group>
            ))}
          </Stack>
        </Stack>
      </Paper>
    </Center>
  )
}

const AgentPlaygroundInner: React.FunctionComponent<{
  agentId: string
  agentData: any
  agentItems: { name: string; description?: string }[]
  onAgentSelect: (name: string) => void
}> = ({ agentId, agentData, agentItems, onAgentSelect }) => {
  const { openAgent } = usePanelContext()
  const { threadId, setThreadId, threads, createNewThread, refetchThreads } =
    useAgentPlayground()
  const deleteThread = useDeleteAgentThread()
  const [streaming, setStreaming] = useState(false)
  const {
    requirements,
    allConnected,
    loading: credLoading,
    refetch: refetchCreds,
  } = useAgentCredentials(agentId)

  useEffect(() => {
    if (agentData) {
      openAgent(agentId, agentData)
    }
  }, [agentId, agentData, openAgent])

  const handleDelete = (id: string) => {
    deleteThread.mutate(id, {
      onSuccess: () => {
        if (threadId === id) {
          setThreadId(null)
        }
        refetchThreads()
      },
    })
  }

  const runsPanel = (
    <RunsPanel
      title="Conversations"
      runs={threads}
      selectedId={threadId}
      onSelect={setThreadId}
      onClear={() => setThreadId(null)}
      onNewClick={createNewThread}
      newButtonLabel="New conversation"
      emptyMessage="No conversations yet"
      statusFilters={[]}
      onDelete={handleDelete}
    />
  )

  const header = (
    <DetailPageHeader
      icon={Bot}
      category="Agents"
      docsHref="https://pikku.dev/docs/wiring/ai-agents"
      categoryPath="/agents"
      currentItem={agentId}
      items={agentItems}
      onItemSelect={onAgentSelect}
      rightSection={
        <SegmentedControl
          size="xs"
          value={streaming ? 'stream' : 'normal'}
          onChange={(v) => setStreaming(v === 'stream')}
          data={[
            { label: 'Normal', value: 'normal' },
            { label: 'Stream', value: 'stream' },
          ]}
        />
      }
    />
  )

  return (
    <ThreePaneLayout
      header={header}
      runsPanel={runsPanel}
      runsPanelVisible
      emptyPanelMessage="Agent configuration"
    >
      {!credLoading && !allConnected ? (
        <CredentialPrompt
          requirements={requirements}
          onRefresh={refetchCreds}
        />
      ) : (
        <AgentChat key={`${threadId}-${streaming}`} streaming={streaming} />
      )}
    </ThreePaneLayout>
  )
}

export const AgentPlaygroundPage: React.FunctionComponent = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const agentId = searchParams.get('id') || ''
  const { meta, loading } = usePikkuMeta()

  const agentData = meta.agentsMeta?.[agentId]

  const agentItems = useMemo(() => {
    if (!meta.agentsMeta) return []
    return Object.entries(meta.agentsMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        description: data?.summary,
      })
    )
  }, [meta.agentsMeta])

  const handleAgentSelect = (name: string) => {
    navigate(`/agents/playground?id=${encodeURIComponent(name)}`)
  }

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (!agentId || !agentData) {
    return (
      <Center h="100vh">
        <Text c="dimmed">Agent &quot;{agentId}&quot; not found.</Text>
      </Center>
    )
  }

  return (
    <PanelProvider>
      <AgentPlaygroundProvider agentId={agentId}>
        <AgentPlaygroundInner
          agentId={agentId}
          agentData={agentData}
          agentItems={agentItems}
          onAgentSelect={handleAgentSelect}
        />
      </AgentPlaygroundProvider>
    </PanelProvider>
  )
}
