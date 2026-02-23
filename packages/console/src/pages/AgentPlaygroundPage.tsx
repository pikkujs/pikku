import React, { useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Center, Loader, Text } from '@mantine/core'
import { Bot } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '@/context/PanelContext'
import {
  AgentPlaygroundProvider,
  useAgentPlayground,
} from '@/context/AgentPlaygroundContext'
import { ThreePaneLayout } from '@/components/layout/ThreePaneLayout'
import { RunsPanel } from '@/components/layout/RunsPanel'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { AgentChat } from '@/components/project/AgentChat'
import { useDeleteAgentThread } from '@/hooks/useAgentRuns'

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
      docsHref="https://pikkujs.com/docs/agents"
      categoryPath="/agents"
      currentItem={agentId}
      items={agentItems}
      onItemSelect={onAgentSelect}
    />
  )

  return (
    <ThreePaneLayout
      header={header}
      runsPanel={runsPanel}
      runsPanelVisible
      emptyPanelMessage="Agent configuration"
    >
      <AgentChat />
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
