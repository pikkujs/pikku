import React from 'react'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { KnowledgeWorkspace } from '../components/knowledge/KnowledgeWorkspace'
import type { KnowledgeBrowse } from '../hooks/useKnowledgeBrowse'

export interface KnowledgePageProps {
  /** Browse state owned by the host (see `useKnowledgeBrowse`), so the host can
   *  mount `KnowledgeBrowseRail` as its own panel. */
  browse?: KnowledgeBrowse
}

export const KnowledgePage: React.FC<KnowledgePageProps> = ({ browse }) => (
  <ConsoleSurface>
    <KnowledgeWorkspace browse={browse} />
  </ConsoleSurface>
)
