import React from 'react'
import { Box, Tabs } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { AgentConfiguration } from './AgentPanels'
import { AgentRuns } from './AgentRuns'

export interface AgentTabbedPanelProps {
  wireId: string
  metadata: any
}

/**
 * The agent inspector: what the agent is declared to be, and what it has
 * actually done. Configuration leads because it is true before any traffic
 * exists; the runs beside it are the same agent answered for.
 */
export const AgentTabbedPanel: React.FC<AgentTabbedPanelProps> = ({
  wireId,
  metadata,
}) => {
  useLocale()

  return (
    <Tabs defaultValue="configuration" keepMounted={false}>
      <Tabs.List px="md">
        <Tabs.Tab value="configuration">
          {m.agent_panel_tab_configuration()}
        </Tabs.Tab>
        <Tabs.Tab value="runs">{m.agent_runs_panel_title()}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="configuration" pt="md">
        <Box px="md">
          <AgentConfiguration wireId={wireId} metadata={metadata} />
        </Box>
      </Tabs.Panel>
      <Tabs.Panel value="runs" pt="md">
        <Box px="md">
          <AgentRuns />
        </Box>
      </Tabs.Panel>
    </Tabs>
  )
}
