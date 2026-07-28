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
import { m } from '@/i18n/messages'
import { PersonaAvatar } from './PersonaAvatar'
import type { PersonaEntry } from './persona-types'

type PersonaDrawerProps = {
  persona: PersonaEntry | null
  opened: boolean
  onClose: () => void
  onOpenScenario?: (name: string) => void
}

export const PersonaDrawer: React.FC<PersonaDrawerProps> = ({
  persona,
  opened,
  onClose,
  onOpenScenario,
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
        <Stack gap="md" pt="xs" data-testid={`persona-drawer-${persona.key}`}>
          <Divider />
          <TextInput
            label={m.personas_field_name()}
            value={persona.name}
            readOnly
            variant="filled"
          />
          <TextInput
            label={m.personas_field_email()}
            value={persona.email}
            readOnly
            variant="filled"
            styles={{
              input: { fontFamily: 'var(--mantine-font-family-monospace)' },
            }}
          />
          <TextInput
            label={m.personas_field_role()}
            value={persona.jobTitle ?? '—'}
            readOnly
            variant="filled"
          />
          <Textarea
            label={m.personas_field_personality()}
            value={persona.personality ?? '—'}
            readOnly
            variant="filled"
            autosize
            minRows={3}
          />

          <Stack gap={6}>
            <Text size="sm" fw={600}>
              {m.personas_appears_in({
                features:
                  persona.features.length === 1
                    ? m.personas_feature_count_one()
                    : m.personas_feature_count({
                        count: persona.features.length,
                      }),
                scenarios:
                  persona.scenarios.length === 1
                    ? m.personas_scenario_count_one()
                    : m.personas_scenario_count({
                        count: persona.scenarios.length,
                      }),
              })}
            </Text>
            {persona.scenarios.length === 0 ? (
              <Text size="xs" c="dimmed">
                {m.personas_not_cast()}
              </Text>
            ) : (
              persona.scenarios.map((flow) => (
                <UnstyledButton
                  key={flow.name}
                  data-testid={`persona-scenario-${flow.name}`}
                  onClick={() => onOpenScenario?.(flow.name)}
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
            {m.personas_defined_in()}
          </Text>
        </Stack>
      )}
    </Drawer>
  )
}
