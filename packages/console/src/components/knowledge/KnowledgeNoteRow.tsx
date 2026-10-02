import React from 'react'
import { ActionIcon, Stack, Text } from '@pikku/mantine/core'
import { ChevronRight } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { KnowledgeNote } from '../../lib/knowledge'
import { noteFileName } from '../../lib/knowledge'
import { planChecklistProgress, type MilestonePlan } from '../../lib/plan'
import { CardRow } from '../ui/CardRow'
import { StatusBadge } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import {
  KnowledgeStatusBadge,
  knowledgeStatusTone,
} from './KnowledgeStatusBadge'
import { KnowledgeTypeIcon } from './KnowledgeTypeIcon'

export type KnowledgeNoteRowProps = {
  note: KnowledgeNote
  plan?: MilestonePlan
  issues: number
  onOpen: (path: string) => void
}

export const KnowledgeNoteRow: React.FC<KnowledgeNoteRowProps> = ({
  note,
  plan,
  issues,
  onOpen,
}) => {
  const progress = plan?.plan ? planChecklistProgress(plan.checklist) : null

  return (
    <CardRow
      testId={`knowledge-nav-${note.path}`}
      onClick={() => onOpen(note.path)}
      leading={
        <StatusTile tone={knowledgeStatusTone(note.status)}>
          <KnowledgeTypeIcon type={note.type} size={18} color="currentColor" />
        </StatusTile>
      }
      title={asI18n(note.title)}
      badges={
        <>
          {note.status && <KnowledgeStatusBadge status={note.status} />}
          {issues > 0 && (
            <StatusBadge tone="warn" size="sm">
              {issues === 1
                ? m.knowledge_note_issues_one()
                : m.knowledge_note_issues({ count: issues })}
            </StatusBadge>
          )}
        </>
      }
      meta={
        <Stack gap={2}>
          <Text size="sm" c="dimmed" lineClamp={2}>
            {asI18n(note.description ?? noteFileName(note.path))}
          </Text>
          {progress && progress.total > 0 && (
            <Text size="xs" c="dimmed">
              {m.knowledge_note_plan_progress({
                done: progress.done,
                total: progress.total,
              })}
            </Text>
          )}
        </Stack>
      }
      trailing={
        <ActionIcon
          visibleFrom="sm"
          variant="subtle"
          color="gray"
          aria-label={m.knowledge_note_open({ title: note.title })}
          onClick={() => onOpen(note.path)}
        >
          <ChevronRight size={16} />
        </ActionIcon>
      }
    />
  )
}
