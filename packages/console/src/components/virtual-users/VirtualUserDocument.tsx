import React from 'react'
import { Badge, Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { VirtualUserDisposition } from '@pikku/core/virtual-user'
import type { VirtualUserDoc } from './virtual-user-model'
import styles from './virtual-users.module.css'

/** One line saying what this disposition is, in a person's terms. */
const DISPOSITION_BLURB: Record<VirtualUserDisposition, () => unknown> = {
  realistic: m.virtual_users_disposition_realistic,
  careless: m.virtual_users_disposition_careless,
  newcomer: m.virtual_users_disposition_newcomer,
  stale: m.virtual_users_disposition_stale,
  auditor: m.virtual_users_disposition_auditor,
  adversarial: m.virtual_users_disposition_adversarial,
}

const percent = (weight: number, total: number) =>
  total === 0 ? 0 : Math.round((weight / total) * 100)

const Section: React.FC<{
  title: ReturnType<typeof m.virtual_users_behaviour>
  children: React.ReactNode
  testId?: string
}> = ({ title, children, testId }) => (
  <Stack gap="sm" data-testid={testId}>
    <Text
      size="xs"
      fw={600}
      tt="uppercase"
      c="dimmed"
      className={styles.sectionTitle}
      style={{ letterSpacing: '0.06em' }}
    >
      {title}
    </Text>
    {children}
  </Stack>
)

/** A number with its meaning under it — the reach figures read as a row of these. */
const Figure: React.FC<{
  value: number
  label: I18nNode
}> = ({ value, label }) => (
  <Stack gap={2} style={{ minWidth: 96 }}>
    <Text size="xl" fw={700} className={styles.figure}>
      {asI18n(String(value))}
    </Text>
    <Text size="xs" c="dimmed">
      {label}
    </Text>
  </Stack>
)

type VirtualUserDocumentProps = {
  user: VirtualUserDoc
  /** The environment name used in the example command. */
  environment?: string
}

/**
 * One virtual user, read as a dossier: who they are, how they behave, what they
 * want, what they can reach and when they stop.
 *
 * Every figure on this page comes from the same functions the runner uses, so
 * what is shown here is the run's actual input rather than a description of it.
 */
export const VirtualUserDocument: React.FC<VirtualUserDocumentProps> = ({
  user,
  environment = 'staging',
}) => {
  const { profile, reach } = user
  const moveTotal =
    profile.moves.continue +
    profile.moves.suspend +
    profile.moves.resume +
    profile.moves.abandon
  const hasSomethingToWant = user.goals.length > 0 || user.intents.length > 0

  // Picking a different user should start you at the top of their dossier. The
  // panel scrolls rather than the page, so without this you land partway down
  // someone else's intents, at whatever offset you left the last one at.
  const top = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' })
  }, [user.id])

  return (
    <Box
      ref={top}
      data-testid={`virtual-user-document-${user.id}`}
      style={{ maxWidth: 860, padding: '28px 32px 64px' }}
    >
      <Stack gap="xl">
        <Stack gap={8}>
          <Group gap={8} align="center">
            <Text fw={700} size="xl" style={{ lineHeight: 1.25 }}>
              {asI18n(user.name)}
            </Text>
            <Badge size="sm" variant="light" radius="sm" tt="none">
              {asI18n(user.disposition)}
            </Badge>
            {user.tags.map((tag) => (
              <Badge
                key={tag}
                size="sm"
                variant="outline"
                radius="sm"
                tt="none"
                color="gray"
              >
                {asI18n(tag)}
              </Badge>
            ))}
          </Group>
          {user.description && (
            <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
              {asI18n(user.description)}
            </Text>
          )}
          <Group gap={6} align="baseline">
            <Text size="sm" c="dimmed">
              {m.virtual_users_signs_in_as()}
            </Text>
            <Text size="sm" fw={600}>
              {asI18n(user.persona.name)}
            </Text>
            {user.persona.jobTitle && (
              <Text size="sm" c="dimmed">
                {asI18n(`· ${user.persona.jobTitle}`)}
              </Text>
            )}
            {user.persona.email && (
              <Text size="sm" c="dimmed" ff="monospace">
                {asI18n(`· ${user.persona.email}`)}
              </Text>
            )}
          </Group>
          {user.persona.personality && (
            <Text size="sm" c="dimmed" fs="italic" style={{ maxWidth: '68ch' }}>
              {asI18n(user.persona.personality)}
            </Text>
          )}
        </Stack>

        <Section
          title={m.virtual_users_behaviour()}
          testId="virtual-user-behaviour"
        >
          <Text size="sm" style={{ maxWidth: '68ch' }}>
            {DISPOSITION_BLURB[user.disposition]() as never}
          </Text>
          <Text size="sm" ff="monospace" c="dimmed">
            {m.virtual_users_moves({
              continue: percent(profile.moves.continue, moveTotal),
              suspend: percent(profile.moves.suspend, moveTotal),
              resume: percent(profile.moves.resume, moveTotal),
              abandon: percent(profile.moves.abandon, moveTotal),
            })}
          </Text>
          <Stack gap={4}>
            {profile.reReadRate > 0 && (
              <Text size="sm" c="dimmed">
                {m.virtual_users_dial_reread({
                  percent: Math.round(profile.reReadRate * 100),
                })}
              </Text>
            )}
            {profile.repeatRate > 0 && (
              <Text size="sm" c="dimmed">
                {m.virtual_users_dial_repeat({
                  percent: Math.round(profile.repeatRate * 100),
                })}
              </Text>
            )}
            {profile.emptyMemory && (
              <Text size="sm" c="dimmed">
                {m.virtual_users_dial_empty_memory()}
              </Text>
            )}
            {profile.readOnly && (
              <Text size="sm" c="dimmed">
                {m.virtual_users_dial_read_only()}
              </Text>
            )}
            {profile.invertedOracle && (
              <Text size="sm" c="dimmed">
                {m.virtual_users_dial_inverted()}
              </Text>
            )}
          </Stack>
        </Section>

        <Section title={m.virtual_users_wants()} testId="virtual-user-wants">
          {!hasSomethingToWant && (
            <Text size="sm" c="orange" data-testid="virtual-user-no-wants">
              {m.virtual_users_nothing_to_want({ actor: user.persona.key })}
            </Text>
          )}

          {user.goals.length > 0 && (
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                {m.virtual_users_goals()}
              </Text>
              {user.goals.map((goal) => (
                <Text key={goal} size="sm">
                  {asI18n(`· ${goal}`)}
                </Text>
              ))}
            </Stack>
          )}

          {user.intents.length > 0 && (
            <Stack gap="md">
              <Text size="sm" fw={600}>
                {m.virtual_users_intents({ actor: user.persona.key })}
              </Text>
              {user.intents.map((intent) => (
                <Stack key={intent.id} gap={4} data-testid={`intent-${intent.id}`}>
                  <Group gap={6}>
                    <Text size="sm" fw={500}>
                      {asI18n(intent.title)}
                    </Text>
                    {user.featureByIntent[intent.id] && (
                      <Text size="xs" c="dimmed">
                        {asI18n(user.featureByIntent[intent.id]!)}
                      </Text>
                    )}
                  </Group>
                  {intent.description && (
                    <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
                      {asI18n(intent.description)}
                    </Text>
                  )}
                  {intent.steps && intent.steps.length > 0 && (
                    <Stack gap={2} className={styles.intentSteps}>
                      {intent.steps.map((step, index) => (
                        <Text key={index} size="sm" c="dimmed">
                          {asI18n(step)}
                        </Text>
                      ))}
                    </Stack>
                  )}
                </Stack>
              ))}
              <Text size="xs" c="dimmed" fs="italic" style={{ maxWidth: '68ch' }}>
                {m.virtual_users_intents_note()}
              </Text>
            </Stack>
          )}
        </Section>

        <Section title={m.virtual_users_reach()} testId="virtual-user-reach">
          <Group gap="xl" align="flex-start">
            <Figure
              value={reach.offered}
              label={m.virtual_users_offered({ total: reach.total })}
            />
            <Figure
              value={reach.mutations}
              label={m.virtual_users_mutations_offered()}
            />
          </Group>
          <Stack gap={4}>
            {reach.showsEverything && (
              <Text size="sm" c="dimmed">
                {m.virtual_users_shows_everything()}
              </Text>
            )}
            {reach.withheldByApproval > 0 && (
              <Text size="sm" c="dimmed">
                {m.virtual_users_withheld_approval({
                  count: reach.withheldByApproval,
                })}
              </Text>
            )}
            {reach.withheldByGrants > 0 && (
              <Text size="sm" c="dimmed">
                {m.virtual_users_withheld_grants({
                  count: reach.withheldByGrants,
                })}
              </Text>
            )}
            {reach.withheldByReadOnly > 0 && (
              <Text size="sm" c="dimmed">
                {m.virtual_users_withheld_readonly({
                  count: reach.withheldByReadOnly,
                })}
              </Text>
            )}
            {reach.inferred > 0 && (
              <Text size="sm" c="dimmed">
                {m.virtual_users_inferred({ count: reach.inferred })}
              </Text>
            )}
          </Stack>
          {user.grants && user.grants.length > 0 && (
            <Group gap={6}>
              <Text size="sm" fw={600}>
                {m.virtual_users_grants()}
              </Text>
              {user.grants.map((grant) => (
                <Badge
                  key={grant}
                  size="xs"
                  variant="light"
                  radius="sm"
                  tt="none"
                >
                  {asI18n(grant)}
                </Badge>
              ))}
            </Group>
          )}
          {user.fixtures && user.fixtures.length > 0 && (
            <Group gap={6}>
              <Text size="sm" fw={600}>
                {m.virtual_users_fixtures()}
              </Text>
              {user.fixtures.map((fixture) => (
                <Text key={fixture} size="sm" ff="monospace" c="dimmed">
                  {asI18n(fixture)}
                </Text>
              ))}
            </Group>
          )}
        </Section>

        <Section title={m.virtual_users_stops()} testId="virtual-user-stops">
          {user.budget?.steps ||
          user.budget?.mutations ||
          user.budget?.duration ? (
            <Group gap="xl">
              {user.budget?.steps !== undefined && (
                <Figure
                  value={user.budget.steps}
                  label={m.virtual_users_budget_steps()}
                />
              )}
              {user.budget?.mutations !== undefined && (
                <Figure
                  value={user.budget.mutations}
                  label={m.virtual_users_budget_mutations()}
                />
              )}
              {user.budget?.duration !== undefined && (
                <Stack gap={2} style={{ minWidth: 96 }}>
                  <Text size="xl" fw={700} className={styles.figure}>
                    {asI18n(String(user.budget.duration))}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {m.virtual_users_budget_duration()}
                  </Text>
                </Stack>
              )}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              {m.virtual_users_budget_default()}
            </Text>
          )}
        </Section>

        <Section title={m.virtual_users_run()} testId="virtual-user-run">
          <Text size="sm" ff="monospace" className={styles.command}>
            {asI18n(`pikku virtual-user run ${environment} ${user.id}`)}
          </Text>
          <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
            {m.virtual_users_run_note()}
          </Text>
        </Section>
      </Stack>
    </Box>
  )
}
