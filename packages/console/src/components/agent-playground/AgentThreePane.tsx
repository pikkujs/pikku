import React from 'react'
import { m } from '@/i18n/messages'
import { ThreePaneLayout } from '../layout/ThreePaneLayout'
import { AgentSelector } from './AgentSelector'
import { AgentConversationsPanel } from './AgentConversationsPanel'
import { AgentChatPanel } from './AgentChatPanel'

/**
 * The console's own arrangement of the agent playground panels: conversations
 * on the left, the chat in the middle, the inspector on the right.
 *
 * This is one composition of the panels, not the only one — a host that wants a
 * different layout mounts `AgentConversationsPanel` / `AgentChatPanel` itself
 * under an `AgentPlaygroundSurface`. The inspector is supplied by
 * `ThreePaneLayout`'s own right pane.
 */
export const AgentThreePane: React.FC = () => {
  return (
    <ThreePaneLayout
      lead={<AgentSelector />}
      storageKey="agent"
      listLabel={m.pane_conversations()}
      runsPanel={<AgentConversationsPanel />}
      runsPanelVisible
      emptyPanelMessage={m.agent_playground_panel_message()}
    >
      <AgentChatPanel />
    </ThreePaneLayout>
  )
}
