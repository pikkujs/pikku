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
  Box,
  Popover,
  TextInput,
  UnstyledButton,
  ScrollArea,
} from '@mantine/core'
import { KeyRound, Link2, ChevronDown, Search, Check, Bot } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '../context/PanelContext'
import {
  AgentPlaygroundProvider,
  useAgentPlayground,
} from '../context/AgentPlaygroundContext'
import { ThreePaneLayout } from '../components/layout/ThreePaneLayout'
import { RunsPanel } from '../components/layout/RunsPanel'
import { AgentChat } from '../components/project/AgentChat'
import { useDeleteAgentThread } from '../hooks/useAgentRuns'
import { useAgentCredentials } from '../hooks/useAgentCredentials'
import { getServerUrl } from '../context/PikkuRpcProvider'

const CredentialPrompt: React.FC<{
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
    const popup = window.open(
      connectUrl,
      'oauth-connect',
      'width=600,height=700'
    )
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

const AgentPlaygroundInner: React.FC<{
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
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [search, setSearch] = useState('')
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

  const filteredItems = useMemo(() => {
    if (!search) return agentItems
    const q = search.toLowerCase()
    return agentItems.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
    )
  }, [agentItems, search])

  const handleSelect = (name: string) => {
    setSelectorOpen(false)
    setSearch('')
    onAgentSelect(name)
  }

  const selector = (
    <Popover
      opened={selectorOpen}
      onChange={setSelectorOpen}
      width={280}
      position="bottom-start"
      shadow="md"
      zIndex={10000}
    >
      <Popover.Target>
        <UnstyledButton
          px="sm"
          py="xs"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
          onClick={() => setSelectorOpen((o) => !o)}
        >
          <Text size="sm" fw={600} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agentId}
          </Text>
          <ChevronDown size={14} style={{ flexShrink: 0 }} />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <TextInput
          placeholder="Search agents..."
          leftSection={<Search size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          styles={{
            input: {
              border: 'none',
              borderBottom: '1px solid var(--mantine-color-default-border)',
              borderRadius: 0,
            },
          }}
        />
        <ScrollArea.Autosize mah={300}>
          <Stack gap={0}>
            {filteredItems.map((item) => (
              <UnstyledButton
                key={item.name}
                onClick={() => handleSelect(item.name)}
                py="xs"
                px="sm"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor:
                    item.name === agentId
                      ? 'var(--mantine-color-green-light)'
                      : undefined,
                }}
              >
                {item.name === agentId ? (
                  <Check size={14} color="var(--mantine-color-green-6)" />
                ) : (
                  <Box w={14} />
                )}
                <div>
                  <Text size="sm" fw={item.name === agentId ? 500 : 400}>
                    {item.name}
                  </Text>
                  {item.description && (
                    <Text size="sm" c="dimmed">
                      {item.description}
                    </Text>
                  )}
                </div>
              </UnstyledButton>
            ))}
            {filteredItems.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No results
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  )

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
      header={selector}
      onDelete={handleDelete}
    />
  )

  return (
    <ThreePaneLayout
      runsPanel={runsPanel}
      runsPanelVisible
      emptyPanelMessage="Agent configuration"
    >
      <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box
          px="md"
          py="xs"
          style={{
            borderBottom: '1px solid var(--mantine-color-default-border)',
            flexShrink: 0,
          }}
        >
          <SegmentedControl
            size="xs"
            value={streaming ? 'stream' : 'normal'}
            onChange={(v) => setStreaming(v === 'stream')}
            data={[
              { label: 'Normal', value: 'normal' },
              { label: 'Stream', value: 'stream' },
            ]}
          />
        </Box>
        <Box style={{ flex: 1, minHeight: 0 }}>
          {!credLoading && !allConnected ? (
            <CredentialPrompt
              requirements={requirements}
              onRefresh={refetchCreds}
            />
          ) : (
            <AgentChat key={`${threadId}-${streaming}`} streaming={streaming} />
          )}
        </Box>
      </Box>
    </ThreePaneLayout>
  )
}

export const AgentPlaygroundPage: React.FC = () => {
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
      <EmptyStatePlaceholder
        icon={Bot}
        title={agentId ? `Agent "${agentId}" not found` : 'No agent selected'}
        description={agentId ? 'This agent may have been removed or renamed.' : 'Select an agent from the Agents page to open the playground.'}
        docsHref="https://pikku.dev/docs/core-features/agents"
      />
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
