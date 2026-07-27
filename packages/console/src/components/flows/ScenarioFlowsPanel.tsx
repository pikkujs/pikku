import React, { useMemo } from 'react'
import { useScenarioFlowEntries } from '../../hooks/useScenarioEntries'
import { FlowsList } from './FlowsList'

export interface ScenarioFlowsPanelProps {
  onOpen: (name: string) => void
  /** Filters by name and description. Omit for the full list. */
  searchQuery?: string
}

/**
 * The scenario flows of a project as cards. Mountable on its own, so a host can
 * place flows and personas wherever it likes rather than behind one toggle.
 */
export const ScenarioFlowsPanel: React.FC<ScenarioFlowsPanelProps> = ({
  onOpen,
  searchQuery = '',
}) => {
  const { flows, loading } = useScenarioFlowEntries()

  const filteredFlows = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return flows
    return flows.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q)
    )
  }, [flows, searchQuery])

  return <FlowsList flows={filteredFlows} onOpen={onOpen} loading={loading} />
}
