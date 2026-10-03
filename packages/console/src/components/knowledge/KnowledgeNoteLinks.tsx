import React from 'react'
import { Anchor, Group, Text } from '@pikku/mantine/core'
import { asI18n, type I18nString } from '@pikku/react'
import { MetaRow } from '../ui/MetaRow'
import classes from '../ui/console.module.css'

type KnowledgeNoteLinksProps = {
  label: I18nString
  paths: string[]
  /** The note's title, when the path resolves to one; absent for a dangling link. */
  titleFor?: (path: string) => string | undefined
  onOpen?: (path: string) => void
}

/**
 * One side of a note's edges, as a row of the details table.
 *
 * Titles rather than paths: a reader choosing where to go next is choosing
 * between ideas, and `decisions/security/only-report-viewers-read-a-report.md`
 * is the filing, not the idea. A dangling link has no note to take a title from,
 * so its path is all there is to show — and showing it as code says why it is
 * not a link.
 *
 * Renders nothing when there are none — an empty "Linked from" label says less
 * than no label at all.
 */
export const KnowledgeNoteLinks: React.FC<KnowledgeNoteLinksProps> = ({
  label,
  paths,
  titleFor,
  onOpen,
}) => {
  if (paths.length === 0) return null

  return (
    <MetaRow label={label} labelWidth={110} align="flex-start">
      <Group gap={10} wrap="wrap">
        {paths.map((path) => {
          const title = titleFor?.(path)
          if (title === undefined) {
            return (
              <Text key={path} size="sm" c="dimmed" ff="monospace">
                {asI18n(path)}
              </Text>
            )
          }
          return onOpen ? (
            <Anchor
              key={path}
              component="button"
              type="button"
              size="sm"
              className={classes.knowledgeLink}
              onClick={() => onOpen(path)}
            >
              {asI18n(title)}
            </Anchor>
          ) : (
            <Text key={path} size="sm">
              {asI18n(title)}
            </Text>
          )
        })}
      </Group>
    </MetaRow>
  )
}
