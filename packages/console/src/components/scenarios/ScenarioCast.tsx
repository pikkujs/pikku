import React from 'react'
import { Group, Text, UnstyledButton } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { PersonaAvatar } from '../personas/PersonaAvatar'
import type { PersonaEntry } from '../personas/persona-types'

type ScenarioCastProps = {
  cast: PersonaEntry[]
  onOpenPersona?: (key: string) => void
}

/**
 * Who a scenario is written to be run by. The persona is part of the story, so
 * the cast reads inline with the scenario rather than living on a page of its
 * own; the full identity is one click away in the persona drawer.
 */
export const ScenarioCast: React.FC<ScenarioCastProps> = ({
  cast,
  onOpenPersona,
}) => {
  if (cast.length === 0) return null

  return (
    <Group gap={10} wrap="wrap" data-testid="scenario-cast">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {m.scenarios_cast()}
      </Text>
      {cast.map((persona) => (
        <UnstyledButton
          key={persona.key}
          data-testid="scenario-cast-member"
          data-persona-key={persona.key}
          onClick={onOpenPersona ? () => onOpenPersona(persona.key) : undefined}
          style={{ cursor: onOpenPersona ? 'pointer' : 'default' }}
        >
          <Group gap={6} wrap="nowrap">
            <PersonaAvatar
              personaKey={persona.key}
              jobTitle={persona.jobTitle}
              name={persona.name}
              size={20}
            />
            <Text size="sm">{asI18n(persona.name)}</Text>
            {persona.jobTitle && (
              <Text size="xs" c="dimmed">
                {asI18n(persona.jobTitle)}
              </Text>
            )}
          </Group>
        </UnstyledButton>
      ))}
    </Group>
  )
}
