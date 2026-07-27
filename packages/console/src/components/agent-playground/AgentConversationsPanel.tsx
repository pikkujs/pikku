import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useAgentPlayground } from '../../context/AgentPlaygroundContext'
import { useDeleteAgentThread } from '../../hooks/useAgentRuns'
import { RunsPanel } from '../layout/RunsPanel'

/**
 * The conversation history for the surface's agent. Mount anywhere under an
 * `AgentPlaygroundSurface`.
 */
export const AgentConversationsPanel: React.FC = () => {
  useLocale()
  const { threadId, setThreadId, threads, createNewThread, refetchThreads } =
    useAgentPlayground()
  const deleteThread = useDeleteAgentThread()

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

  return (
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
      onDelete={handleDelete}
    />
  )
}
