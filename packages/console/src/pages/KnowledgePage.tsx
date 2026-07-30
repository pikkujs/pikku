import React from 'react'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { KnowledgeWorkspace } from '../components/knowledge/KnowledgeWorkspace'

export const KnowledgePage: React.FC = () => (
  <ConsoleSurface>
    <KnowledgeWorkspace />
  </ConsoleSurface>
)
