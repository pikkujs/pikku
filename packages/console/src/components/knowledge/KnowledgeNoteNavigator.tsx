import React from 'react'
import { Box, Group, ScrollArea, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type {
  KnowledgeFinding,
  KnowledgeGroup,
  KnowledgeSelection,
} from '../../lib/knowledge'
import { maxSeverity, noteFileName } from '../../lib/knowledge'
import { KnowledgeSeverityIcon } from './KnowledgeSeverityIcon'
import { KnowledgeStatusBadge } from './KnowledgeStatusBadge'

type KnowledgeNoteNavigatorProps = {
  groups: KnowledgeGroup[]
  findings: KnowledgeFinding[]
  selected: KnowledgeSelection | null
  onSelect: (selection: KnowledgeSelection) => void
}

const isSelected = (
  selection: KnowledgeSelection | null,
  path: string
): boolean => selection?.kind === 'note' && selection.path === path

const rowStyle = (selected: boolean): React.CSSProperties => ({
  padding: '6px 10px',
  borderRadius: 8,
  cursor: 'pointer',
  background: selected ? 'var(--mantine-color-default-hover)' : 'transparent',
})

export const KnowledgeNoteNavigator: React.FC<KnowledgeNoteNavigatorProps> = ({
  groups,
  findings,
  selected,
  onSelect,
}) => {
  return (
    <ScrollArea style={{ height: '100%' }} data-testid="knowledge-navigator">
      <Stack gap="xs" p="xs">
        {findings.length > 0 && (
          <Box
            data-testid="knowledge-nav-findings"
            onClick={() => onSelect({ kind: 'findings' })}
            style={rowStyle(selected?.kind === 'findings')}
          >
            <Group gap={6} wrap="nowrap">
              <KnowledgeSeverityIcon
                severity={maxSeverity(findings)}
                size={13}
              />
              <Text size="sm" fw={500}>
                {findings.length === 1
                  ? m.knowledge_issue_count_one()
                  : m.knowledge_issue_count({ count: findings.length })}
              </Text>
            </Group>
          </Box>
        )}

        {groups.map((group) => (
          <Stack gap={2} key={group.section || 'root'}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} px={10} pt={4}>
              {group.section
                ? asI18n(group.section)
                : m.knowledge_section_root()}
            </Text>
            {group.notes.map((note) => (
              <Box
                key={note.path}
                data-testid={`knowledge-nav-${note.path}`}
                onClick={() => onSelect({ kind: 'note', path: note.path })}
                style={rowStyle(isSelected(selected, note.path))}
              >
                <Group gap={6} wrap="nowrap" align="baseline">
                  <Text
                    size="sm"
                    fw={isSelected(selected, note.path) ? 600 : 500}
                    lineClamp={1}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {asI18n(note.title)}
                  </Text>
                  {note.status && <KnowledgeStatusBadge status={note.status} />}
                </Group>
                <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
                  {asI18n(noteFileName(note.path))}
                </Text>
              </Box>
            ))}
          </Stack>
        ))}
      </Stack>
    </ScrollArea>
  )
}
