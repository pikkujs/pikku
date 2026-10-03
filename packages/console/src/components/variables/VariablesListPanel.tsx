import React, { useMemo } from 'react'
import type { ReactNode } from 'react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { ProjectVariables } from '../project/ProjectVariables'

export interface VariablesListPanelProps {
  /** Filters by name, display name, description and variable id. */
  searchQuery?: string
  emptyHero?: ReactNode
}

/**
 * Every variable declared by the project as a selectable table. Reads the
 * project meta itself, so a host can mount it under a {@link ConsoleSurface}
 * without the variables page around it.
 */
export const VariablesListPanel: React.FC<VariablesListPanelProps> = ({
  searchQuery = '',
  emptyHero,
}) => {
  const { meta, loading } = usePikkuMeta()

  const allVariables = useMemo(() => {
    if (!meta.variablesMeta) return []
    return Object.entries(meta.variablesMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        displayName: data.displayName,
        description: data.description,
        variableId: data.variableId,
        rawData: data,
      })
    )
  }, [meta.variablesMeta])

  const variables = useMemo(() => {
    if (!searchQuery) return allVariables
    const q = searchQuery.toLowerCase()
    return allVariables.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.displayName?.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q) ||
        v.variableId?.toLowerCase().includes(q)
    )
  }, [allVariables, searchQuery])

  return (
    <ProjectVariables
      variables={variables}
      loading={loading}
      emptyHero={emptyHero}
    />
  )
}
