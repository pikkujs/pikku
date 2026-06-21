import React from 'react'
import { Stack, Text, Anchor } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import classes from '../ui/console.module.css'
import { CommandChip } from '../ui/CommandChip'

interface EmptyStatePlaceholderProps {
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
  hero?: React.ReactNode
  title: I18nNode
  description?: I18nNode
  code?: string
  docsHref: string
}

export const EmptyStatePlaceholder: React.FC<EmptyStatePlaceholderProps> = ({
  icon: Icon,
  hero,
  title,
  description,
  code,
  docsHref,
}) => {
  useLocale()
  return (
    <Stack
      align="center"
      justify="center"
      gap="md"
      className={classes.emptyState}
      py="xl"
      style={{ minHeight: '60vh' }}
    >
      {hero ?? (Icon ? <Icon size={48} strokeWidth={1} /> : null)}
      <Text size="xl" fw={600}>
        {title}
      </Text>
      {description && (
        <Text c="dimmed" ta="center" maw={500}>
          {description}
        </Text>
      )}
      {code && <CommandChip cmd={code} />}
      <Anchor
        href={docsHref}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
        c="dimmed"
      >
        {m.empty_state_how_it_works()}
      </Anchor>
    </Stack>
  )
}
