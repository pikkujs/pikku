import React from 'react'
import { KnowledgeNoteNavigator } from './KnowledgeNoteNavigator'
import type { KnowledgeBrowse } from '../../hooks/useKnowledgeBrowse'

export interface KnowledgeBrowseRailProps {
  browse: KnowledgeBrowse
}

/**
 * The knowledge note list, mountable on its own. `KnowledgePage` renders this as
 * its own drawer unless it is given the same `useKnowledgeBrowse()` state, in
 * which case the host owns where the rail lives — a side panel, a sheet — and
 * the page drops its copy.
 */
export const KnowledgeBrowseRail: React.FC<KnowledgeBrowseRailProps> = ({
  browse,
}) => (
  <KnowledgeNoteNavigator
    groups={browse.groups}
    findings={browse.findings}
    selected={browse.selected}
    onSelect={browse.setSelected}
  />
)
