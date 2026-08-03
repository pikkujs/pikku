import React from 'react'
import { Badge, Group, Stack, Text } from '@pikku/mantine/core'
import { UnstyledButton } from '@pikku/mantine/core'
import {
  ChevronRight,
  KeyRound,
  Route,
  ShieldOff,
  Target,
  TriangleAlert,
} from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { PersonaAvatar } from './PersonaAvatar'
import type { PersonaEntry } from './persona-types'
import classes from './personas.module.css'

export interface PersonaRowProps {
  persona: PersonaEntry
  onOpen?: (key: string) => void
}

/**
 * One persona, as a row.
 *
 * A row rather than a card grid because the questions asked of this list are
 * comparative — who holds `platform-admin`, who is never run, who no scenario
 * casts — and a column answers those by letting the eye travel down it. Each
 * row is still a profile: everything the declaration says about somebody that
 * fits on one line of a directory, which is most of it.
 *
 * The personality comes before the description, and the disposition sits next
 * to the job title, because those two are the whole difference between a person
 * and a row in a permissions table — and for a persona a virtual user runs as,
 * they are also the brief the model is handed.
 *
 * The columns are a grid rather than flex so that they line up down the page;
 * sized off their own content, every row's roles land at a different x and the
 * comparison the list exists for is gone. Which columns survive a narrow
 * container is `personas.module.css`'s job.
 */
export const PersonaRow: React.FC<PersonaRowProps> = ({ persona, onOpen }) => {
  const blurb = persona.personality ?? persona.description

  return (
    <UnstyledButton
      data-testid={`persona-row-${persona.key}`}
      component={onOpen ? 'button' : 'div'}
      className={classes.row}
      aria-label={asI18n(persona.name)}
      onClick={onOpen ? () => onOpen(persona.key) : undefined}
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
      <PersonaAvatar
        personaKey={persona.key}
        jobTitle={persona.jobTitle}
        name={persona.name}
        avatarUrl={persona.avatarUrl}
        size={48}
      />

      <Stack gap={2} style={{ minWidth: 0 }}>
        {/* Wraps rather than truncating: squeezed into a panel, a clipped job
            title reads as "C…" and a clipped disposition runs out past the row
            edge. Given the choice, the identity line takes a second row. */}
        <Group gap={8} wrap="wrap">
          <Text size="sm" fw={600} lineClamp={1} style={{ flexShrink: 0 }}>
            {asI18n(persona.name)}
          </Text>
          {persona.jobTitle && (
            <Text size="sm" c="dimmed" lineClamp={1}>
              {asI18n(persona.jobTitle)}
            </Text>
          )}
          {persona.disposition && (
            <Badge
              data-testid={`persona-disposition-${persona.key}`}
              variant="light"
              color="cyan"
              radius="sm"
              tt="none"
              fw={500}
              style={{ flexShrink: 0 }}
            >
              {asI18n(persona.disposition)}
            </Badge>
          )}
          {!persona.runnable && (
            <Badge
              data-testid={`persona-target-${persona.key}`}
              variant="light"
              color="gray"
              radius="sm"
              tt="none"
              fw={500}
              leftSection={<ShieldOff size={11} />}
              style={{ flexShrink: 0 }}
            >
              {m.personas_target()}
            </Badge>
          )}
        </Group>

        <Text size="xs" ff="monospace" c="dimmed" lineClamp={1}>
          {asI18n(persona.email)}
        </Text>

        {blurb && (
          <Text
            size="xs"
            c="dimmed"
            fs={persona.personality ? 'italic' : undefined}
            lineClamp={1}
            data-testid={`persona-blurb-${persona.key}`}
          >
            {persona.personality ? asI18n(`“${blurb}”`) : asI18n(blurb)}
          </Text>
        )}
      </Stack>

      <Group gap={6} wrap="wrap" className={classes.roles}>
        {persona.roles.length === 0 ? (
          <Text size="xs" c="dimmed">
            {m.personas_no_roles()}
          </Text>
        ) : (
          persona.roles.map((role) => (
            <Badge
              key={role.name}
              variant="light"
              color={role.declared ? undefined : 'red'}
              radius="sm"
              tt="none"
              fw={500}
              leftSection={
                role.declared ? undefined : <TriangleAlert size={11} />
              }
            >
              {role.declared
                ? asI18n(role.displayName ?? role.name)
                : m.personas_role_undeclared_named({
                    role: role.displayName ?? role.name,
                  })}
            </Badge>
          ))
        )}
        {persona.tags.length > 0 && (
          <Text
            size="xs"
            ff="monospace"
            c="dimmed"
            lineClamp={1}
            style={{ width: '100%' }}
          >
            {asI18n(persona.tags.map((tag) => `#${tag}`).join(' '))}
          </Text>
        )}
      </Group>

      <Stack gap={3} c="dimmed" className={classes.facts}>
        <Group gap={6} wrap="nowrap">
          <KeyRound size={12} />
          <Text size="xs">
            {persona.scopes.length === 0
              ? m.personas_no_scopes()
              : persona.scopes.length === 1
                ? m.personas_scope_count_one()
                : m.personas_scope_count({ count: persona.scopes.length })}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Target size={12} />
          <Text size="xs">
            {persona.goals.length === 0
              ? m.personas_no_goals()
              : persona.goals.length === 1
                ? m.personas_goal_count_one()
                : m.personas_goal_count({ count: persona.goals.length })}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Route size={12} />
          <Text size="xs">
            {persona.scenarios.length === 0
              ? m.personas_in_no_scenarios()
              : persona.scenarios.length === 1
                ? m.personas_scenario_count_one()
                : m.personas_scenario_count({
                    count: persona.scenarios.length,
                  })}
          </Text>
        </Group>
      </Stack>

      {onOpen && <ChevronRight size={16} color="var(--mantine-color-dimmed)" />}
    </UnstyledButton>
  )
}
