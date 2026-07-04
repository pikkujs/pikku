import React from 'react'
import {
  Drawer,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  Divider,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { PersonaAvatar } from './PersonaAvatar'
import type { PersonaEntry } from './persona-types'

type PersonaDrawerProps = {
  persona: PersonaEntry | null
  opened: boolean
  onClose: () => void
}

export const PersonaDrawer: React.FC<PersonaDrawerProps> = ({
  persona,
  opened,
  onClose,
}) => {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={440}
      title={
        persona ? (
          <Group gap={12} wrap="nowrap">
            <PersonaAvatar
              personaKey={persona.key}
              jobTitle={persona.jobTitle}
              name={persona.name}
              size={40}
            />
            <Stack gap={0}>
              <Text fw={600} size="md">
                {asI18n(persona.name)}
              </Text>
              <Text ff="monospace" size="xs" c="dimmed">
                {asI18n(`actors.${persona.key}`)}
              </Text>
            </Stack>
          </Group>
        ) : null
      }
    >
      {persona && (
        <Stack gap="md" pt="xs">
          <Divider />
          <TextInput
            label={asI18n('Name')}
            value={persona.name}
            readOnly
            variant="filled"
          />
          <TextInput
            label={asI18n('Email')}
            value={persona.email}
            readOnly
            variant="filled"
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
          />
          <TextInput
            label={asI18n('Role label')}
            value={persona.jobTitle ?? '—'}
            readOnly
            variant="filled"
          />
          <Textarea
            label={asI18n('Personality — drives converse')}
            value={persona.personality ?? '—'}
            readOnly
            variant="filled"
            autosize
            minRows={3}
          />
          <Text size="xs" c="dimmed">
            {asI18n(
              'Personas are defined in pikku.config.json under userFlows.actors.'
            )}
          </Text>
        </Stack>
      )}
    </Drawer>
  )
}
