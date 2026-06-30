import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from '../router'
import {
  Center,
  Loader,
  Text,
  Stack,
  Paper,
  Group,
  Button,
  Box,
  Popover,
  TextInput,
  UnstyledButton,
  ScrollArea,
} from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
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
import { getServerUrl } from '../context/serverUrl'

const CredentialPrompt: React.FC<{
  requirements: Array<{
    credentialName: string
    displayName: string
    addonNamespace: string
    connected: boolean
  }>
  onRefresh: () => void
}> = ({ requirements, onRefresh }) => {
  useLocale()
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
            {m.agent_playground_connect_accounts()}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {m.agent_playground_credentials_required()}
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
                    {asI18n(req.displayName)}
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => handleConnect(req.credentialName)}
                >
                  {m.agent_playground_connect()}
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
  useLocale()
  const { openAgent } = usePanelContext()
  const { threadId, setThreadId, threads, createNewThread, refetchThreads } =
    useAgentPlayground()
  const deleteThread = useDeleteAgentThread()
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
            {asI18n(agentId)}
          </Text>
          <ChevronDown size={14} style={{ flexShrink: 0 }} />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <TextInput
          placeholder={m.agent_playground_search_agents()}
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
                    {asI18n(item.name)}
                  </Text>
                  {item.description && (
                    <Text size="sm" c="dimmed">
                      {asI18n(item.description)}
                    </Text>
                  )}
                </div>
              </UnstyledButton>
            ))}
            {filteredItems.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {m.common_no_results()}
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
      newButtonLabel={m.agent_playground_new_conversation()}
      emptyMessage={m.agent_playground_no_conversations()}
      statusFilters={[]}
      header={selector}
      onDelete={handleDelete}
    />
  )

  return (
    <ThreePaneLayout
      runsPanel={runsPanel}
      runsPanelVisible
      emptyPanelMessage={m.agent_playground_panel_message()}
    >
      <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box style={{ flex: 1, minHeight: 0 }}>
          {!credLoading && !allConnected ? (
            <CredentialPrompt
              requirements={requirements}
              onRefresh={refetchCreds}
            />
          ) : (
            <AgentChat key={`${agentId}-${threadId}`} />
          )}
        </Box>
      </Box>
    </ThreePaneLayout>
  )
}

export const AgentPlaygroundPage: React.FC = () => {
  useLocale()
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
        title={agentId ? asI18n(`Agent "${agentId}" not found`) : m.agent_playground_no_agent_selected()}
        description={agentId ? m.agent_playground_agent_not_found_description() : m.agent_playground_select_agent_description()}
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
