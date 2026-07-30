import React from 'react'
import { Anchor, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nString } from '@pikku/react'

type KnowledgeNoteLinksProps = {
  label: I18nString
  paths: string[]
  /** The note's title, when the path resolves to one; absent for a dangling link. */
  titleFor?: (path: string) => string | undefined
  onOpen?: (path: string) => void
}

/**
 * One side of a note's edges. Renders nothing when there are none — an empty
 * "Linked from" heading says less than no heading at all.
 */
export const KnowledgeNoteLinks: React.FC<KnowledgeNoteLinksProps> = ({
  label,
  paths,
  titleFor,
  onOpen,
}) => {
  if (paths.length === 0) return null

  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      {paths.map((path) => {
        const title = titleFor?.(path)
        return (
          <Group key={path} gap={8} wrap="nowrap" align="baseline">
            {onOpen ? (
              <Anchor size="sm" onClick={() => onOpen(path)}>
                {asI18n(title ?? path)}
              </Anchor>
            ) : (
              <Text size="sm">{asI18n(title ?? path)}</Text>
            )}
            {title && (
              <Text size="xs" c="dimmed" ff="monospace">
                {asI18n(path)}
              </Text>
            )}
          </Group>
        )
      })}
    </Stack>
  )
}
