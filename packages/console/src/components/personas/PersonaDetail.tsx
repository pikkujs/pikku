import React, { useState } from 'react'
import {
  Anchor,
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
import {
  ChevronRight,
  Globe,
  KeyRound,
  Paperclip,
  Route,
  ShieldOff,
  Target,
  UserSearch,
} from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { PersonaAvatar } from './PersonaAvatar'
import { PersonaRoleList } from './PersonaRoleList'
import type { PersonaEntry } from './persona-types'

/**
 * How many scenarios are listed before the rest are folded away.
 *
 * A widely-cast persona is cast in everything — the e2e admin appears in 96 —
 * and a list that long buries every section under it. The count in the heading
 * is the number that matters; the names are for recognising a few.
 */
const SCENARIOS_SHOWN = 8

export interface PersonaDetailProps {
  persona: PersonaEntry
  /** Follow one of the persona's scenarios. Omitted where there is nowhere to
   *  follow it to. */
  onOpenScenario?: (name: string) => void
  /** Open the virtual user a run would make of this persona. Same rule. */
  onOpenVirtualUser?: (key: string) => void
}

/**
 * Who a persona is, what they may do, and what they appear in.
 *
 * Carries its own identity header and no surface of its own: this is panel
 * content, opened through `openPersona` so it lands wherever the surrounding
 * app puts panels — the console's own pane, or an embedding host's end-edge
 * panel. It used to be a right-hand `Drawer`, which ignored both.
 */
export const PersonaDetail: React.FC<PersonaDetailProps> = ({
  persona,
  onOpenScenario,
  onOpenVirtualUser,
}) => {
  useLocale()
  const [allScenarios, setAllScenarios] = useState(false)
  const shownScenarios = allScenarios
    ? persona.scenarios
    : persona.scenarios.slice(0, SCENARIOS_SHOWN)

  return (
    <Stack gap="lg" pt="xs" data-testid={`persona-detail-${persona.key}`}>
      <Group gap={14} wrap="nowrap" align="flex-start">
        <PersonaAvatar
          personaKey={persona.key}
          jobTitle={persona.jobTitle}
          name={persona.name}
          avatarUrl={persona.avatarUrl}
          size={56}
        />
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fw={600} size="lg" data-testid="persona-field-name">
            {asI18n(persona.name)}
          </Text>
          {persona.jobTitle && (
            <Text size="sm" c="dimmed" data-testid="persona-field-role">
              {asI18n(persona.jobTitle)}
            </Text>
          )}
          <Text
            ff="monospace"
            size="xs"
            c="dimmed"
            data-testid="persona-field-email"
          >
            {asI18n(persona.email)}
          </Text>
          <Group gap={6} mt={6} wrap="wrap">
            <Badge variant="default" radius="sm" tt="none" fw={500}>
              {asI18n(persona.key)}
            </Badge>
            {persona.disposition && (
              <Badge
                variant="light"
                color="cyan"
                radius="sm"
                tt="none"
                fw={500}
              >
                {asI18n(persona.disposition)}
              </Badge>
            )}
            {!persona.runnable && (
              <Badge
                data-testid={`persona-detail-target-${persona.key}`}
                variant="light"
                color="gray"
                radius="sm"
                tt="none"
                fw={500}
                leftSection={<ShieldOff size={11} />}
              >
                {m.personas_target()}
              </Badge>
            )}
          </Group>
        </Stack>
      </Group>

      {!persona.runnable && (
        <Text size="xs" c="dimmed">
          {m.personas_target_explained()}
        </Text>
      )}

      {(persona.description || persona.personality) && (
        <>
          <Divider />
          <Stack gap={6}>
            <Title order={4} size="sm" fw={600}>
              {m.personas_section_about()}
            </Title>
            {persona.description && (
              <Text size="sm">{asI18n(persona.description)}</Text>
            )}
            {persona.personality && (
              <Text
                size="sm"
                c="dimmed"
                fs="italic"
                data-testid="persona-field-personality"
              >
                {asI18n(`“${persona.personality}”`)}
              </Text>
            )}
          </Stack>
        </>
      )}

      <Divider />
      <Stack gap={8}>
        <Group gap={8} align="baseline">
          <Title order={4} size="sm" fw={600}>
            {m.personas_section_roles()}
          </Title>
          {persona.scopes.length > 0 && (
            <Text size="xs" c="dimmed">
              {persona.scopes.length === 1
                ? m.personas_scope_count_one()
                : m.personas_scope_count({ count: persona.scopes.length })}
            </Text>
          )}
        </Group>
        <PersonaRoleList roles={persona.roles} />
      </Stack>

      {persona.goals.length > 0 && (
        <>
          <Divider />
          <Stack gap={6}>
            <Title order={4} size="sm" fw={600}>
              {m.personas_section_goals()}
            </Title>
            {persona.goals.map((goal) => (
              <Group key={goal} gap={8} wrap="nowrap" align="flex-start">
                <ThemeIcon variant="light" color="grape" size="sm" radius="sm">
                  <Target size={12} />
                </ThemeIcon>
                <Text size="sm">{asI18n(goal)}</Text>
              </Group>
            ))}
          </Stack>
        </>
      )}

      <Divider />
      <Stack gap={8}>
        <Title order={4} size="sm" fw={600}>
          {m.personas_section_signin()}
        </Title>
        {persona.accounts.length === 0 ? (
          <Text size="xs" c="dimmed">
            {m.personas_no_accounts()}
          </Text>
        ) : (
          persona.accounts.map((account) => (
            <Group key={account.name} gap={8} wrap="nowrap" align="center">
              <ThemeIcon variant="light" color="blue" size="sm" radius="sm">
                <KeyRound size={12} />
              </ThemeIcon>
              <Text size="sm">
                {account.provider
                  ? m.personas_account_provider({ provider: account.provider })
                  : m.personas_account_password()}
              </Text>
              {account.name !== 'primary' && (
                <Badge variant="default" radius="sm" tt="none" fw={500}>
                  {asI18n(account.name)}
                </Badge>
              )}
            </Group>
          ))
        )}
        <Group gap={8} wrap="nowrap" align="flex-start" mt={4}>
          <ThemeIcon variant="light" color="teal" size="sm" radius="sm">
            <Globe size={12} />
          </ThemeIcon>
          {persona.environments ? (
            <Group gap={4} wrap="wrap">
              {persona.environments.map((environment) => (
                <Badge
                  key={environment}
                  variant="default"
                  radius="sm"
                  tt="none"
                  fw={500}
                >
                  {asI18n(environment)}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              {m.personas_environments_default()}
            </Text>
          )}
        </Group>
      </Stack>

      {persona.fixtures.length > 0 && (
        <>
          <Divider />
          <Stack gap={6}>
            <Title order={4} size="sm" fw={600}>
              {m.personas_section_fixtures()}
            </Title>
            {persona.fixtures.map((fixture) => (
              <Group key={fixture} gap={8} wrap="nowrap" align="center">
                <Paperclip size={12} color="var(--mantine-color-dimmed)" />
                <Text size="xs" ff="monospace">
                  {asI18n(fixture)}
                </Text>
              </Group>
            ))}
          </Stack>
        </>
      )}

      {persona.tags.length > 0 && (
        <Group gap={4} wrap="wrap">
          {persona.tags.map((tag) => (
            <Badge key={tag} variant="default" radius="sm" tt="none" fw={500}>
              {asI18n(tag)}
            </Badge>
          ))}
        </Group>
      )}

      <Divider />
      <Stack gap={6}>
        <Title order={4} size="sm" fw={600}>
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
        </Title>
        {persona.scenarios.length === 0 ? (
          <Text size="xs" c="dimmed">
            {m.personas_not_cast()}
          </Text>
        ) : (
          shownScenarios.map((flow) => {
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
            // Without a handler this is a list of what casts them, not a set
            // of links — so it loses the frame as well as the chevron. A
            // bordered, padded row *is* an affordance; keeping it and removing
            // only the arrow leaves something that still asks to be clicked.
            return onOpenScenario ? (
              <UnstyledButton
                key={flow.name}
                data-testid={`persona-scenario-${flow.name}`}
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
                data-testid={`persona-scenario-${flow.name}`}
                py={2}
              >
                {row}
              </Box>
            )
          })
        )}
        {persona.scenarios.length > SCENARIOS_SHOWN && (
          <Anchor
            component="button"
            type="button"
            size="xs"
            data-testid="persona-scenarios-toggle"
            onClick={() => setAllScenarios((shown) => !shown)}
            style={{ alignSelf: 'flex-start' }}
          >
            {allScenarios
              ? m.personas_scenarios_show_fewer()
              : m.personas_scenarios_show_all({
                  count: persona.scenarios.length,
                })}
          </Anchor>
        )}
      </Stack>

      {onOpenVirtualUser && persona.runnable && (
        <UnstyledButton
          data-testid={`persona-virtual-user-${persona.key}`}
          onClick={() => onOpenVirtualUser(persona.key)}
          style={{
            borderRadius: 8,
            border: '1px solid var(--mantine-color-default-border)',
            padding: '8px 12px',
          }}
        >
          <Group gap={10} wrap="nowrap">
            <ThemeIcon variant="light" color="violet" size="sm" radius="sm">
              <UserSearch size={13} />
            </ThemeIcon>
            <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
              {m.personas_open_virtual_user()}
            </Text>
            <ChevronRight size={15} color="var(--mantine-color-dimmed)" />
          </Group>
        </UnstyledButton>
      )}

      <Text size="xs" c="dimmed">
        {persona.sourceFile
          ? m.personas_declared_in({ file: persona.sourceFile })
          : m.personas_defined_in()}
      </Text>
    </Stack>
  )
}
