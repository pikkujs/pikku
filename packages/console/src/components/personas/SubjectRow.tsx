import React from 'react'
import { ActionIcon, Badge, Group, Stack, Text } from '@pikku/mantine/core'
import { ChevronRight, Cog, Plug } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import type { SubjectEntry } from './subject-types'

export interface SubjectRowProps {
  subject: SubjectEntry
  onOpen?: (key: string) => void
}

export const SubjectRow: React.FC<SubjectRowProps> = ({ subject, onOpen }) => {
  const platform = subject.kind === 'platform'
  const label = platform ? m.subjects_platform_name() : asI18n(subject.name)

  return (
    <CardRow
      testId={`subject-row-${subject.key}`}
      onClick={onOpen ? () => onOpen(subject.key) : undefined}
      leading={
        <StatusTile tone="neutral">
          {platform ? <Cog size={18} /> : <Plug size={18} />}
        </StatusTile>
      }
      title={label}
      meta={
        <Stack gap={6}>
          <span>
            {platform
              ? m.subjects_platform_blurb()
              : m.subjects_addon_blurb({ addon: subject.addon! })}
          </span>
          <Group gap={6} wrap="wrap">
            {subject.steps.length === 0 ? (
              <Text size="xs" c="dimmed">
                {m.subjects_no_steps()}
              </Text>
            ) : (
              subject.steps.map((step) => (
                <Badge
                  key={step.name}
                  variant="light"
                  color="gray"
                  radius="sm"
                  tt="none"
                  fw={500}
                >
                  {asI18n(step.displayName)}
                </Badge>
              ))
            )}
          </Group>
        </Stack>
      }
      trailing={
        onOpen ? (
          <ActionIcon
            visibleFrom="sm"
            variant="subtle"
            color="gray"
            aria-label={m.personas_open({ name: subject.name })}
            onClick={() => onOpen(subject.key)}
          >
            <ChevronRight size={16} />
          </ActionIcon>
        ) : undefined
      }
    />
  )
}
