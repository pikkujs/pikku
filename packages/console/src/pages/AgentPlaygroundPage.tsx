import React from 'react'
import { Center, Loader } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { Bot } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { AgentPlaygroundSurface } from '../components/agent-playground/AgentPlaygroundSurface'
import { AgentThreePane } from '../components/agent-playground/AgentThreePane'
import { useAgentPlaygroundState } from '../hooks/useAgentPlaygroundState'

export const AgentPlaygroundPage: React.FC = () => {
  useLocale()
  const { agentId, agentData, agentItems, selectAgent, loading } =
    useAgentPlaygroundState()

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
        title={
          agentId
            ? asI18n(`Agent "${agentId}" not found`)
            : m.agent_playground_no_agent_selected()
        }
        description={
          agentId
            ? m.agent_playground_agent_not_found_description()
            : m.agent_playground_select_agent_description()
        }
        docsHref="https://pikku.dev/docs/core-features/agents"
      />
    )
  }

  return (
    <AgentPlaygroundSurface
      agentId={agentId}
      agentData={agentData}
      agentItems={agentItems}
      onAgentSelect={selectAgent}
    >
      <AgentThreePane />
    </AgentPlaygroundSurface>
  )
}
