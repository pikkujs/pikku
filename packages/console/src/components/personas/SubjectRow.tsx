import React from 'react'
import { Badge, Group, Stack, Text } from '@pikku/mantine/core'
import { UnstyledButton } from '@pikku/mantine/core'
import { ChevronRight, Footprints, Route, ShieldOff } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { SubjectAvatar } from './SubjectAvatar'
import type { SubjectEntry } from './subject-types'
import classes from './personas.module.css'

export interface SubjectRowProps {
  subject: SubjectEntry
  onOpen?: (key: string) => void
}

/**
 * One non-human actor, in the same row as the people.
 *
 * It shares the persona grid on purpose — the list answers "who acts in this
 * product", and an actor rendered in a different shape further down the page
 * reads as a different question. What differs is what fills the columns: a
 * subject holds no roles, so the roles column carries the steps it can be made
 * to take, which is the same thing that column always answered — what this
 * actor is able to do.
 */
export const SubjectRow: React.FC<SubjectRowProps> = ({ subject, onOpen }) => {
  const label =
    subject.kind === 'platform'
      ? m.subjects_platform_name()
      : asI18n(subject.name)

  return (
    <UnstyledButton
      data-testid={`subject-row-${subject.key}`}
      component={onOpen ? 'button' : 'div'}
      className={classes.row}
      aria-label={label}
      onClick={onOpen ? () => onOpen(subject.key) : undefined}
      style={{
        width: '100%',
        textAlign: 'left',
        borderRadius: 10,
        border: '1px solid var(--mantine-color-default-border)',
        background: 'var(--app-surface, var(--mantine-color-body))',
        padding: '14px 16px',
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      <SubjectAvatar kind={subject.kind} size={48} />

      <Stack gap={2} style={{ minWidth: 0 }}>
        <Group gap={8} wrap="wrap">
          <Text size="sm" fw={600} lineClamp={1} style={{ flexShrink: 0 }}>
            {label}
          </Text>
          <Text size="sm" c="dimmed" lineClamp={1}>
            {subject.kind === 'platform'
              ? m.subjects_platform_role()
              : m.subjects_addon_role()}
          </Text>
          <Badge
            data-testid={`subject-not-a-person-${subject.key}`}
            variant="light"
            color="gray"
            radius="sm"
            tt="none"
            fw={500}
            leftSection={<ShieldOff size={11} />}
            style={{ flexShrink: 0 }}
          >
            {m.subjects_not_a_person()}
          </Badge>
        </Group>

        <Text size="xs" c="dimmed" lineClamp={1}>
          {subject.kind === 'platform'
            ? m.subjects_platform_blurb()
            : m.subjects_addon_blurb({ addon: subject.addon! })}
        </Text>
      </Stack>

      <Group gap={6} wrap="wrap" className={classes.roles}>
        {subject.steps.length === 0 ? (
          <Text size="xs" c="dimmed">
            {m.subjects_no_steps()}
          </Text>
        ) : (
          subject.steps.map((step) => (
            <Badge
              key={step.name}
              variant="light"
              color="violet"
              radius="sm"
              tt="none"
              fw={500}
            >
              {asI18n(step.displayName)}
            </Badge>
          ))
        )}
      </Group>

      <Stack gap={3} c="dimmed" className={classes.facts}>
        <Group gap={6} wrap="nowrap">
          <Footprints size={12} />
          <Text size="xs">
            {subject.steps.length === 0
              ? m.subjects_no_steps()
              : subject.steps.length === 1
                ? m.subjects_step_count_one()
                : m.subjects_step_count({ count: subject.steps.length })}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Route size={12} />
          <Text size="xs">
            {subject.scenarios.length === 0
              ? m.personas_in_no_scenarios()
              : subject.scenarios.length === 1
                ? m.personas_scenario_count_one()
                : m.personas_scenario_count({
                    count: subject.scenarios.length,
                  })}
          </Text>
        </Group>
      </Stack>

      {onOpen && <ChevronRight size={16} color="var(--mantine-color-dimmed)" />}
    </UnstyledButton>
  )
}
