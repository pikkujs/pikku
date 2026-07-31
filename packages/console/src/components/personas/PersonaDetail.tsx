import React from 'react'
import {
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
import { useLocale } from '@/i18n/config'
import { PersonaAvatar } from './PersonaAvatar'
import type { PersonaEntry } from './persona-types'

export interface PersonaDetailProps {
  persona: PersonaEntry
  /** Follow one of the persona's scenarios. Omitted where there is nowhere to
   *  follow it to. */
  onOpenScenario?: (name: string) => void
}

/**
 * Who a persona is and what they appear in.
 *
 * Carries its own identity header and no surface of its own: this is panel
 * content, opened through `openPersona` so it lands wherever the surrounding
 * app puts panels — the console's own pane, or an embedding host's end-edge
 * panel. It used to be a right-hand `Drawer`, which ignored both.
 */
export const PersonaDetail: React.FC<PersonaDetailProps> = ({
  persona,
  onOpenScenario,
}) => {
  useLocale()

  return (
    <Stack gap="md" pt="xs" data-testid={`persona-detail-${persona.key}`}>
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
      <Divider />
      <TextInput
        label={m.personas_field_name()}
        data-testid="persona-field-name"
        value={persona.name}
        readOnly
        variant="filled"
      />
      <TextInput
        label={m.personas_field_email()}
        data-testid="persona-field-email"
        value={persona.email}
        readOnly
        variant="filled"
        styles={{
          input: { fontFamily: 'var(--mantine-font-family-monospace)' },
        }}
      />
      <TextInput
        label={m.personas_field_role()}
        data-testid="persona-field-role"
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
                : m.personas_feature_count({ count: persona.features.length }),
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
                <ChevronRight size={15} color="var(--mantine-color-dimmed)" />
              </Group>
            </UnstyledButton>
          ))
        )}
      </Stack>

      <Text size="xs" c="dimmed">
        {m.personas_defined_in()}
      </Text>
    </Stack>
  )
}
