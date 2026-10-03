import React from 'react'
import { SimpleGrid } from '@pikku/mantine/core'
import type { KnowledgeFinding, KnowledgeNote } from '../../lib/knowledge'
import { findingsForNote } from '../../lib/knowledge'
import type { MilestonePlan } from '../../lib/plan'
import { KnowledgeNoteRow } from './KnowledgeNoteRow'

export type KnowledgeNoteListProps = {
  notes: KnowledgeNote[]
  plans: Record<string, MilestonePlan>
  findings: KnowledgeFinding[]
  onOpen: (path: string) => void
}

export const KnowledgeNoteList: React.FC<KnowledgeNoteListProps> = ({
  notes,
  plans,
  findings,
  onOpen,
}) => (
  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm" mt="md">
    {notes.map((note) => (
      <KnowledgeNoteRow
        key={note.path}
        note={note}
        plan={plans[note.path]}
        issues={findingsForNote(findings, note.path).length}
        onOpen={onOpen}
      />
    ))}
  </SimpleGrid>
)
