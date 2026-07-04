import React from 'react'
import {
  Drawer,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  Divider,
  UnstyledButton,
  ThemeIcon,
} from '@pikku/mantine/core'
import { Route, ChevronRight } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { PersonaAvatar } from './PersonaAvatar'
import type { PersonaEntry } from './persona-types'

type PersonaDrawerProps = {
  persona: PersonaEntry | null
  opened: boolean
  onClose: () => void
  onOpenFlow?: (name: string) => void
}

export const PersonaDrawer: React.FC<PersonaDrawerProps> = ({
  persona,
  opened,
  onClose,
  onOpenFlow,
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

          <Stack gap={6}>
            <Text size="sm" fw={600}>
              {asI18n(
                `Appears in ${persona.flows.length} ${persona.flows.length === 1 ? 'flow' : 'flows'}`
              )}
            </Text>
            {persona.flows.length === 0 ? (
              <Text size="xs" c="dimmed">
                {asI18n('Not cast in any user flow yet.')}
              </Text>
            ) : (
              persona.flows.map((flow) => (
                <UnstyledButton
                  key={flow.name}
                  onClick={() => onOpenFlow?.(flow.name)}
                  style={{
                    borderRadius: 8,
                    border: '1px solid var(--mantine-color-default-border)',
                    padding: '8px 12px',
                  }}
                >
                  <Group gap={10} wrap="nowrap">
                    <ThemeIcon variant="light" color="cyan" size="sm" radius="sm">
                      <Route size={13} />
                    </ThemeIcon>
                    <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
                      {asI18n(flow.displayName)}
                    </Text>
                    <ChevronRight
                      size={15}
                      color="var(--mantine-color-dimmed)"
                    />
                  </Group>
                </UnstyledButton>
              ))
            )}
          </Stack>

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
