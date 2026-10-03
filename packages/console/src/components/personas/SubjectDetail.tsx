import React from 'react'
import {
  Badge,
  Box,
  Divider,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@pikku/mantine/core'
import { ChevronRight, Footprints, Route, ShieldOff } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { SubjectAvatar } from './SubjectAvatar'
import type { SubjectEntry } from './subject-types'

export interface SubjectDetailProps {
  subject: SubjectEntry
  /** Follow one of the scenarios this subject acts in. Omitted where there is
   *  nowhere to follow it to. */
  onOpenScenario?: (name: string) => void
}

/**
 * What a non-human actor can be made to do, and where it is made to do it.
 *
 * The persona profile's shape without the half that only applies to a person:
 * no roles, no login, no goals. What replaces them is the list of declared
 * steps, because for a subject that list *is* the reach — nothing else grants
 * it anything.
 */
export const SubjectDetail: React.FC<SubjectDetailProps> = ({
  subject,
  onOpenScenario,
}) => {
  useLocale()
  const label =
    subject.kind === 'platform'
      ? m.subjects_platform_name()
      : asI18n(subject.name)

  return (
    <Stack gap="lg" pt="xs" data-testid={`subject-detail-${subject.key}`}>
      <Group gap={14} wrap="nowrap" align="flex-start">
        <SubjectAvatar kind={subject.kind} size={56} />
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fw={600} size="lg" data-testid="subject-field-name">
            {label}
          </Text>
          <Text size="sm" c="dimmed">
            {subject.kind === 'platform'
              ? m.subjects_platform_role()
              : m.subjects_addon_role()}
          </Text>
          <Group gap={6} mt={6} wrap="wrap">
            <Badge variant="default" radius="sm" tt="none" fw={500}>
              {asI18n(subject.key)}
            </Badge>
            <Badge
              data-testid={`subject-detail-not-a-person-${subject.key}`}
              variant="light"
              color="gray"
              radius="sm"
              tt="none"
              fw={500}
              leftSection={<ShieldOff size={11} />}
            >
              {m.subjects_not_a_person()}
            </Badge>
          </Group>
        </Stack>
      </Group>

      <Text size="xs" c="dimmed">
        {m.subjects_not_a_person_explained()}
      </Text>

      <Divider />
      <Stack gap={6}>
        <Title order={4} size="sm" fw={600}>
          {m.personas_section_about()}
        </Title>
        <Text size="sm">
          {subject.kind === 'platform'
            ? m.subjects_platform_blurb()
            : m.subjects_addon_blurb({ addon: subject.addon! })}
        </Text>
      </Stack>

      <Divider />
      <Stack gap={8}>
        <Group gap={8} align="baseline">
          <Title order={4} size="sm" fw={600}>
            {m.subjects_section_steps()}
          </Title>
          {subject.steps.length > 0 && (
            <Text size="xs" c="dimmed">
              {subject.steps.length === 1
                ? m.subjects_step_count_one()
                : m.subjects_step_count({ count: subject.steps.length })}
            </Text>
          )}
        </Group>
        {subject.steps.length === 0 ? (
          <Text size="xs" c="dimmed">
            {m.subjects_no_steps_explained()}
          </Text>
        ) : (
          subject.steps.map((step) => (
            <Group key={step.name} gap={8} wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" color="violet" size="sm" radius="sm">
                <Footprints size={12} />
              </ThemeIcon>
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Text size="sm">{asI18n(step.displayName)}</Text>
                {step.sourceFile && (
                  <Text size="xs" ff="monospace" c="dimmed" lineClamp={1}>
                    {asI18n(step.sourceFile)}
                  </Text>
                )}
              </Stack>
            </Group>
          ))
        )}
      </Stack>

      <Divider />
      <Stack gap={6}>
        <Title order={4} size="sm" fw={600}>
          {m.personas_appears_in({
            features:
              subject.features.length === 1
                ? m.personas_feature_count_one()
                : m.personas_feature_count({ count: subject.features.length }),
            scenarios:
              subject.scenarios.length === 1
                ? m.personas_scenario_count_one()
                : m.personas_scenario_count({
                    count: subject.scenarios.length,
                  }),
          })}
        </Title>
        {subject.scenarios.length === 0 ? (
          <Text size="xs" c="dimmed">
            {m.personas_not_cast()}
          </Text>
        ) : (
          subject.scenarios.map((flow) => {
            const row = (
              <Group gap={10} wrap="nowrap">
                <ThemeIcon variant="light" color="cyan" size="sm" radius="sm">
                  <Route size={13} />
                </ThemeIcon>
                <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
                  {asI18n(flow.displayName)}
                </Text>
                {onOpenScenario && (
                  <ChevronRight size={15} color="var(--mantine-color-dimmed)" />
                )}
              </Group>
            )
            return onOpenScenario ? (
              <UnstyledButton
                key={flow.name}
                data-testid={`subject-scenario-${flow.name}`}
                onClick={() => onOpenScenario(flow.name)}
                style={{
                  borderRadius: 8,
                  border: '1px solid var(--mantine-color-default-border)',
                  padding: '8px 12px',
                }}
              >
                {row}
              </UnstyledButton>
            ) : (
              <Box
                key={flow.name}
                data-testid={`subject-scenario-${flow.name}`}
                py={2}
              >
                {row}
              </Box>
            )
          })
        )}
      </Stack>

      <Text size="xs" c="dimmed">
        {subject.kind === 'platform'
          ? m.subjects_platform_declared()
          : m.subjects_addon_declared({ addon: subject.addon! })}
      </Text>
    </Stack>
  )
}
