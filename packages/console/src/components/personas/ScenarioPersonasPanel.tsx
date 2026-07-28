import React, { useMemo } from 'react'
import { useScenarioPersonaEntries } from '../../hooks/useScenarioEntries'
import { PersonasView } from './PersonasView'

export interface ScenarioPersonasPanelProps {
  /** Opens one of the scenario flows a persona is cast in. */
  onOpenScenario?: (name: string) => void
  /** Filters by key, name, email and personality. Omit for the full list. */
  searchQuery?: string
}

/**
 * The personas a project's scenarios sign in as. Mountable on its own, so a
 * host can place it independently of the flows panel.
 */
export const ScenarioPersonasPanel: React.FC<ScenarioPersonasPanelProps> = ({
  onOpenScenario,
  searchQuery = '',
}) => {
  const { personas, loading } = useScenarioPersonaEntries()

  const filteredPersonas = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return personas
    return personas.filter(
      (p) =>
        p.key.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.personality?.toLowerCase().includes(q)
    )
  }, [personas, searchQuery])

  return (
    <PersonasView
      personas={filteredPersonas}
      loading={loading}
      onOpenScenario={onOpenScenario}
    />
  )
}
