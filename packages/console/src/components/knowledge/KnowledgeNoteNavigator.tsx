import React from 'react'
import {
  Box,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type {
  KnowledgeFinding,
  KnowledgeGroup,
  KnowledgeSelection,
} from '../../lib/knowledge'
import { maxSeverity, toNavSections } from '../../lib/knowledge'
import { KnowledgeSectionIcon, KnowledgeTypeIcon } from './KnowledgeIcon'
import { KnowledgeSeverityIcon } from './KnowledgeSeverityIcon'
import { KnowledgeStatusBadge } from './KnowledgeStatusBadge'
import classes from '../ui/console.module.css'

type KnowledgeNoteNavigatorProps = {
  groups: KnowledgeGroup[]
  findings: KnowledgeFinding[]
  selected: KnowledgeSelection | null
  onSelect: (selection: KnowledgeSelection) => void
}

const isSelected = (
  selection: KnowledgeSelection | null,
  path: string | undefined
): boolean =>
  path !== undefined && selection?.kind === 'note' && selection.path === path

/** One indent per level of nesting, so `security` reads as part of `decisions`. */
const INDENT = 12

const indent = (depth: number): React.CSSProperties => ({
  paddingLeft: 10 + depth * INDENT,
})

/**
 * The notes, in the shape the bundle is organised in: a section heading that
 * opens the section's own `index.md`, the notes under it, and a sub-section
 * indented under its parent.
 *
 * Sections carry the icon of what they hold and notes the icon of their `type:`,
 * because a drawer of a dozen markdown files is otherwise a dozen identical rows
 * that have to be read one at a time.
 */
export const KnowledgeNoteNavigator: React.FC<KnowledgeNoteNavigatorProps> = ({
  groups,
  findings,
  selected,
  onSelect,
}) => {
  const sections = toNavSections(groups)

  return (
    <ScrollArea style={{ height: '100%' }} data-testid="knowledge-navigator">
      <Stack gap="xs" p="xs">
        {findings.length > 0 && (
          <UnstyledButton
            data-testid="knowledge-nav-findings"
            data-selected={selected?.kind === 'findings' || undefined}
            onClick={() => onSelect({ kind: 'findings' })}
            className={classes.knowledgeRow}
            style={indent(0)}
          >
            <KnowledgeSeverityIcon severity={maxSeverity(findings)} size={13} />
            <Text size="sm" fw={500}>
              {findings.length === 1
                ? m.knowledge_issue_count_one()
                : m.knowledge_issue_count({ count: findings.length })}
            </Text>
          </UnstyledButton>
        )}

        {sections.map((section) => {
          const label = section.section ? (
            asI18n(section.label)
          ) : (
            <>{m.knowledge_section_root()}</>
          )

          return (
            <Stack gap={2} key={section.section || 'root'}>
              {/*
                The heading is the section's index, not a label above it: a reader
                who wants to know what belongs in `decisions/` clicks the word
                `decisions`, which is where they were already looking. A section
                with no index of its own is a heading and nothing more.
              */}
              {section.indexPath ? (
                <UnstyledButton
                  data-testid={`knowledge-nav-${section.indexPath}`}
                  data-selected={
                    isSelected(selected, section.indexPath) || undefined
                  }
                  onClick={() =>
                    onSelect({ kind: 'note', path: section.indexPath! })
                  }
                  className={classes.knowledgeRow}
                  style={indent(section.depth)}
                >
                  <KnowledgeSectionIcon section={section.section} />
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    {label}
                  </Text>
                </UnstyledButton>
              ) : (
                <Box
                  className={classes.knowledgeRow}
                  style={indent(section.depth)}
                >
                  <KnowledgeSectionIcon section={section.section} />
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    {label}
                  </Text>
                </Box>
              )}

              {section.notes.map((note) => (
                <UnstyledButton
                  key={note.path}
                  data-testid={`knowledge-nav-${note.path}`}
                  data-selected={isSelected(selected, note.path) || undefined}
                  onClick={() => onSelect({ kind: 'note', path: note.path })}
                  // The drawer is narrow and a note title is a sentence, so the
                  // clamped ones are readable on hover rather than only by
                  // opening them.
                  title={asI18n(note.title)}
                  className={classes.knowledgeRow}
                  style={indent(section.depth + 1)}
                >
                  <KnowledgeTypeIcon type={note.type} />
                  <Text
                    size="sm"
                    fw={isSelected(selected, note.path) ? 600 : 500}
                    lineClamp={1}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {asI18n(note.title)}
                  </Text>
                  {note.status && <KnowledgeStatusBadge status={note.status} />}
                </UnstyledButton>
              ))}
            </Stack>
          )
        })}
      </Stack>
    </ScrollArea>
  )
}
