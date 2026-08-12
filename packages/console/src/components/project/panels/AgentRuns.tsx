import React, { useContext } from 'react'
import { Center, Loader, Stack } from '@pikku/mantine/core'
import { Bot, Gauge } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { EmptyState } from '../../ui/EmptyState'
import { AgentRunCard, type AgentRunCardProps } from './AgentRunCard'
import { AgentPlaygroundContext } from '../../../context/AgentPlaygroundContext'
import { useAgentThreadRuns } from '../../../hooks/useAgentRuns'

/**
 * The runs of the conversation currently open, newest first, each carrying
 * whatever the scorers recorded about it.
 *
 * Thread-scoped rather than agent-scoped: a grade is only legible next to the
 * exchange that earned it, and the chat holding that exchange is one pane away.
 */
export const AgentRuns: React.FC = () => {
  useLocale()
  const playground = useContext(AgentPlaygroundContext)
  const threadId = playground
    ? (playground.threadId ?? playground.draftThreadId)
    : null
  const { data, isLoading } = useAgentThreadRuns(threadId)

  if (!threadId) {
    return (
      <EmptyState
        icon={Bot}
        title={m.agent_runs_no_thread_title()}
        subtitle={m.agent_runs_no_thread_description()}
        compact
      />
    )
  }

  if (isLoading) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    )
  }

  const runs = (data as AgentRunCardProps['run'][] | undefined) ?? []

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={Gauge}
        title={m.agent_runs_empty_title()}
        subtitle={m.agent_runs_empty_description()}
        compact
      />
    )
  }

  return (
    <Stack gap="sm">
      {runs.map((run) => (
        <AgentRunCard key={run.runId} run={run} />
      ))}
    </Stack>
  )
}
