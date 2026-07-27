import React from 'react'
import { useSearchParams, useNavigate } from '../router'
import { Center, Loader } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { Bot } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { AgentPlaygroundSurface } from '../components/agent-playground/AgentPlaygroundSurface'
import { AgentThreePane } from '../components/agent-playground/AgentThreePane'
import { useAgentItems } from '../hooks/useAgentItems'

export const AgentPlaygroundPage: React.FC = () => {
  useLocale()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const agentId = searchParams.get('id') || ''
  const { meta, loading } = usePikkuMeta()

  const agentData = meta.agentsMeta?.[agentId]

  const agentItems = useAgentItems()

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
    <AgentPlaygroundSurface
      agentId={agentId}
      agentData={agentData}
      agentItems={agentItems}
      onAgentSelect={handleAgentSelect}
    >
      <AgentThreePane />
    </AgentPlaygroundSurface>
  )
}
