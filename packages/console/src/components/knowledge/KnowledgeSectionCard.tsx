import React from 'react'
import { Button, Group, Text } from '@pikku/mantine/core'
import { BookOpen } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type {
  KnowledgeFinding,
  KnowledgeNavSection,
  KnowledgeNote,
} from '../../lib/knowledge'
import type { MilestonePlan } from '../../lib/plan'
import { SectionCard } from '../ui/SectionCard'
import { KnowledgeNoteList } from './KnowledgeNoteList'
import { KnowledgeSectionIcon } from './KnowledgeSectionIcon'
import { knowledgeSectionTitle } from './knowledge-section-title'

export type KnowledgeSectionCardProps = {
  section: KnowledgeNavSection
  index: KnowledgeNote | undefined
  plans: Record<string, MilestonePlan>
  findings: KnowledgeFinding[]
  onOpen: (path: string) => void
}

export const KnowledgeSectionCard: React.FC<KnowledgeSectionCardProps> = ({
  section,
  index,
  plans,
  findings,
  onOpen,
}) => {
  const isRoot = section.section === ''
  const indexIsARow = index && (isRoot || section.notes.length === 0)
  const rows = indexIsARow ? [index, ...section.notes] : section.notes
  const description = index?.description ?? section.description
  const blurb = isRoot
    ? m.knowledge_section_start_blurb()
    : description
      ? asI18n(description)
      : undefined

  return (
    <SectionCard
      testId={`knowledge-section-${section.section || 'root'}`}
      eyebrow={
        <Group gap={6} wrap="nowrap">
          <KnowledgeSectionIcon section={section.section} size={14} />
          <Text size="xs" c="dimmed" ff="monospace" truncate>
            {asI18n(
              section.section ? `knowledge/${section.section}/` : 'knowledge/'
            )}
          </Text>
        </Group>
      }
      title={knowledgeSectionTitle(section.section, index)}
      subtitle={
        rows.length === 1
          ? m.knowledge_section_count_one()
          : m.knowledge_section_count({ count: rows.length })
      }
      blurb={blurb}
      right={
        index && !indexIsARow ? (
          <Button
            variant="default"
            size="compact-sm"
            leftSection={<BookOpen size={14} />}
            data-testid={`knowledge-nav-${index.path}`}
            onClick={() => onOpen(index.path)}
          >
            {m.knowledge_section_about()}
          </Button>
        ) : undefined
      }
    >
      <KnowledgeNoteList
        notes={rows}
        plans={plans}
        findings={findings}
        onOpen={onOpen}
      />
    </SectionCard>
  )
}
