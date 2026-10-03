import React from 'react'
import { Box } from '@pikku/mantine/core'
import { useAgentPlayground } from '../../context/AgentPlaygroundContext'
import { useAgentPlaygroundSurface } from '../../context/AgentPlaygroundSurfaceContext'
import { useAgentCredentials } from '../../hooks/useAgentCredentials'
import { AgentChat } from '../project/AgentChat'
import { AgentCredentialPrompt } from './AgentCredentialPrompt'
import { ConsoleLoading } from '../ui/ConsoleLoading'

/**
 * The conversation with the surface's agent, gated behind whatever accounts the
 * agent's tools still need connecting. Mount anywhere under an
 * `AgentPlaygroundSurface`.
 */
export const AgentChatPanel: React.FC = () => {
  const { agentId } = useAgentPlaygroundSurface()
  const { threadId, dbMessages } = useAgentPlayground()
  const {
    requirements,
    allConnected,
    loading: credLoading,
    refetch: refetchCreds,
  } = useAgentCredentials(agentId)

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {!credLoading && !allConnected ? (
          <AgentCredentialPrompt
            requirements={requirements}
            onRefresh={refetchCreds}
          />
        ) : threadId != null && dbMessages === undefined ? (
          <ConsoleLoading />
        ) : (
          <AgentChat key={`${agentId}-${threadId}`} />
        )}
      </Box>
    </Box>
  )
}
