import React, { useState } from 'react'
import { Box, Group, Stack, Text, Badge } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { PersonaAvatar } from './PersonaAvatar'
import { personaVisual } from './personaVisual'
import type { PersonaEntry } from './persona-types'

type PersonaCardProps = {
  persona: PersonaEntry
  onOpen?: (key: string) => void
}

export const PersonaCard: React.FC<PersonaCardProps> = ({ persona, onOpen }) => {
  const [hovered, setHovered] = useState(false)
  const { color } = personaVisual(persona.key, persona.jobTitle, persona.name)
  return (
    <Box
      data-testid={`persona-card-${persona.key}`}
      onClick={() => onOpen?.(persona.key)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? 'var(--mantine-color-default-hover)'
          : 'var(--app-surface, var(--mantine-color-body))',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 14,
        cursor: onOpen ? 'pointer' : 'default',
        transition: 'background 100ms',
        padding: '18px 22px',
      }}
    >
      <Group gap={18} wrap="nowrap" align="center">
        <PersonaAvatar
          personaKey={persona.key}
          jobTitle={persona.jobTitle}
          name={persona.name}
          size={48}
        />
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="md" fw={600} style={{ lineHeight: 1.2 }}>
            {asI18n(persona.name)}
          </Text>
          <Text size="xs" ff="monospace" c="dimmed">
            {asI18n(persona.email)}
          </Text>
          {persona.personality && (
            <Text size="sm" c="dimmed" fs="italic" lineClamp={2} mt={4}>
              {asI18n(`“${persona.personality}”`)}
            </Text>
          )}
        </Stack>
        <Stack gap={8} align="flex-end" style={{ flexShrink: 0 }}>
          {persona.jobTitle && (
            <Badge variant="light" color={color} radius="sm" tt="none" fw={500}>
              {asI18n(persona.jobTitle)}
            </Badge>
          )}
          {persona.flowCount > 0 && (
            <Text size="xs" ff="monospace" c="dimmed">
              {asI18n(
                `in ${persona.flowCount} ${persona.flowCount === 1 ? 'flow' : 'flows'}`
              )}
            </Text>
          )}
        </Stack>
      </Group>
    </Box>
  )
}
