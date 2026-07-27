import React, { useMemo } from 'react'
import type { ReactNode } from 'react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { ProjectSecrets } from '../project/ProjectSecrets'

export interface SecretsListPanelProps {
  /** Filters by name, display name, description and secret id. */
  searchQuery?: string
  emptyHero?: ReactNode
}

/**
 * Every secret declared by the project as a selectable table. Reads the project
 * meta itself, so a host can mount it under a {@link ConsoleSurface} without the
 * secrets page around it.
 */
export const SecretsListPanel: React.FC<SecretsListPanelProps> = ({
  searchQuery = '',
  emptyHero,
}) => {
  const { meta, loading } = usePikkuMeta()

  const allSecrets = useMemo(() => {
    if (!meta.secretsMeta) return []
    return Object.entries(meta.secretsMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        displayName: data.displayName,
        description: data.description,
        secretId: data.secretId,
        isOAuth2: !!data.oauth2,
        rawData: data,
      })
    )
  }, [meta.secretsMeta])

  const secrets = useMemo(() => {
    if (!searchQuery) return allSecrets
    const q = searchQuery.toLowerCase()
    return allSecrets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.displayName?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.secretId?.toLowerCase().includes(q)
    )
  }, [allSecrets, searchQuery])

  return (
    <ProjectSecrets secrets={secrets} loading={loading} emptyHero={emptyHero} />
  )
}
