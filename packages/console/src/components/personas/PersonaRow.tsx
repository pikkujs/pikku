import React from 'react'
import { ActionIcon, Badge, Group, Stack, Text } from '@pikku/mantine/core'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { CardRow } from '../ui/CardRow'
import { StatusBadge } from '../ui/StatusBadge'
import { PersonaAvatar } from './PersonaAvatar'
import type { PersonaEntry } from './persona-types'

export interface PersonaRowProps {
  persona: PersonaEntry
  onOpen?: (key: string) => void
}

export const PersonaRow: React.FC<PersonaRowProps> = ({ persona, onOpen }) => {
  const blurb = persona.personality ?? persona.description
  const facts: I18nNode[] = [
    ...(persona.jobTitle ? [asI18n(persona.jobTitle)] : []),
    persona.scenarios.length === 0
      ? m.personas_in_no_scenarios()
      : persona.scenarios.length === 1
        ? m.personas_row_in_one()
        : m.personas_row_in({ count: persona.scenarios.length }),
  ]

  return (
    <CardRow
      testId={`persona-row-${persona.key}`}
      onClick={onOpen ? () => onOpen(persona.key) : undefined}
      leading={
        <PersonaAvatar
          personaKey={persona.key}
          jobTitle={persona.jobTitle}
          name={persona.name}
          avatarUrl={persona.avatarUrl}
          size={40}
        />
      }
      title={asI18n(persona.name)}
      badges={
        persona.runnable ? undefined : (
          <span data-testid={`persona-target-${persona.key}`}>
            <StatusBadge tone="neutral" size="sm" dot={false}>
              {m.personas_target()}
            </StatusBadge>
          </span>
        )
      }
      meta={
        <Stack gap={6}>
          <span>
            {facts.map((part, index) => (
              <React.Fragment key={index}>
                {index > 0 && asI18n(' · ')}
                {part}
              </React.Fragment>
            ))}
          </span>
          {blurb && (
            <Text
              size="sm"
              c="dimmed"
              fs={persona.personality ? 'italic' : undefined}
              lineClamp={2}
              data-testid={`persona-blurb-${persona.key}`}
            >
              {persona.personality
                ? m.personas_blurb_quoted({ blurb })
                : asI18n(blurb)}
            </Text>
          )}
          <Group gap={6} wrap="wrap">
            {persona.roles.length === 0 ? (
              <Text size="xs" c="dimmed">
                {m.personas_no_roles()}
              </Text>
            ) : (
              persona.roles.map((role) =>
                role.declared ? (
                  <Badge
                    key={role.name}
                    variant="light"
                    radius="sm"
                    tt="none"
                    fw={500}
                  >
                    {asI18n(role.displayName ?? role.name)}
                  </Badge>
                ) : (
                  <Badge
                    key={role.name}
                    variant="light"
                    color="red"
                    radius="sm"
                    tt="none"
                    fw={500}
                    leftSection={<TriangleAlert size={11} />}
                  >
                    {m.personas_role_undeclared_named({
                      role: role.displayName ?? role.name,
                    })}
                  </Badge>
                )
              )
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
            aria-label={m.personas_open({ name: persona.name })}
            onClick={() => onOpen(persona.key)}
          >
            <ChevronRight size={16} />
          </ActionIcon>
        ) : undefined
      }
    />
  )
}
