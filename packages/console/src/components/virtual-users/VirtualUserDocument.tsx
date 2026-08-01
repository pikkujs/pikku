import React from 'react'
import { Link } from 'react-router'
import {
  Anchor,
  Badge,
  Box,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import { ChevronRight } from 'lucide-react'
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

/**
 * How many intents are listed before the rest are folded away. Enough to see
 * the kind of thing this user is after, few enough that the sections below it
 * are still on the same screen.
 */
const INTENTS_SHOWN = 6

type ReachFigure = 'offered' | 'mutations' | 'inferred'

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

/**
 * A number with its meaning under it — the reach figures read as a row of these.
 *
 * Given the endpoints it counts, the number becomes the way to see them. A
 * figure nobody can open is a figure nobody can check, and "71 offered" is
 * only worth printing if you can find out which 71.
 */
const Figure: React.FC<{
  value: number
  label: I18nNode
  names?: string[]
  open?: boolean
  onToggle?: () => void
}> = ({ value, label, names, open, onToggle }) => {
  const body = (
    <Stack gap={2} style={{ minWidth: 96 }}>
      <Text size="xl" fw={700} className={styles.figure}>
        {asI18n(String(value))}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Stack>
  )
  if (!names?.length || !onToggle) return body
  return (
    <UnstyledButton
      onClick={onToggle}
      className={styles.figureButton}
      data-open={open || undefined}
      aria-expanded={open}
    >
      {body}
    </UnstyledButton>
  )
}

/**
 * The endpoints behind a figure, each linking to where it is documented.
 *
 * The functions list filters on text, so the link carries the name as its
 * search — the same thing you would have typed, without having to remember it.
 */
const EndpointNames: React.FC<{ names: string[] }> = ({ names }) => (
  <Box className={styles.nameList} data-testid="reach-names">
    <Group gap={6}>
      {names.map((name) => (
        <Anchor
          key={name}
          component={Link}
          to={`/functions?search=${encodeURIComponent(name)}`}
          size="xs"
          ff="monospace"
          underline="hover"
          c="dimmed"
        >
          {asI18n(name)}
        </Anchor>
      ))}
    </Group>
  </Box>
)

/**
 * A feature is named by a sentence often enough that a legend of six of them
 * is three lines of prose. Cut to a phrase — the bar carries the proportion,
 * and the full name is one row away in the list underneath.
 */
const shortFeature = (name: string) =>
  name.length > 22 ? `${name.slice(0, 21).trimEnd()}…` : name

/** How this user's intents spread over the features that claim them. */
const FeatureSpread: React.FC<{
  byFeature: { name: string; count: number }[]
  total: number
}> = ({ byFeature, total }) => {
  if (!byFeature.length) return null
  const shown = byFeature.slice(0, 4)
  return (
    <Stack gap={6} data-testid="virtual-user-feature-spread">
      <Box className={styles.spreadBar}>
        {byFeature.map((feature, index) => (
          <Box
            key={feature.name}
            className={styles.spreadSegment}
            style={{
              flexGrow: feature.count,
              // Fading rather than a new hue per feature: the ranking is the
              // information, and six colours would imply six meanings.
              opacity: Math.max(0.25, 1 - index * 0.13),
            }}
          />
        ))}
        {total > byFeature.reduce((sum, f) => sum + f.count, 0) && (
          <Box
            className={styles.spreadRest}
            style={{
              flexGrow:
                total - byFeature.reduce((sum, f) => sum + f.count, 0),
            }}
          />
        )}
      </Box>
      <Text size="xs" c="dimmed" ff="monospace">
        {asI18n(
          shown.map((f) => `${shortFeature(f.name)} ${f.count}`).join(' · ') +
            (byFeature.length > shown.length
              ? ` · +${byFeature.length - shown.length} more`
              : '')
        )}
      </Text>
    </Stack>
  )
}

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

  const [openIntent, setOpenIntent] = React.useState<string>()
  const [allIntents, setAllIntents] = React.useState(false)
  const [openReach, setOpenReach] = React.useState<ReachFigure>()
  const visibleIntents = allIntents
    ? user.intents
    : user.intents.slice(0, INTENTS_SHOWN)

  // Picking a different user should start you at the top of their dossier. The
  // panel scrolls rather than the page, so without this you land partway down
  // someone else's intents, at whatever offset you left the last one at.
  const top = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' })
    setOpenIntent(undefined)
    setAllIntents(false)
    setOpenReach(undefined)
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
              <Stack gap={6}>
                <Text size="sm" ff="monospace">
                  {m.virtual_users_wants_summary({
                    intents: user.wants.intents,
                    features: user.wants.features,
                    steps: user.wants.steps,
                  })}
                </Text>
                <FeatureSpread
                  byFeature={user.wants.byFeature}
                  total={user.wants.intents}
                />
              </Stack>

              <Text size="sm" fw={600}>
                {m.virtual_users_intents({ actor: user.persona.key })}
              </Text>
              <Stack gap={0}>
                {visibleIntents.map((intent) => {
                  const open = openIntent === intent.id
                  return (
                    <Stack
                      key={intent.id}
                      gap={4}
                      data-testid={`intent-${intent.id}`}
                    >
                      <UnstyledButton
                        className={styles.intentRow}
                        data-open={open || undefined}
                        aria-expanded={open}
                        onClick={() => setOpenIntent(open ? undefined : intent.id)}
                      >
                        <Group gap={8} wrap="nowrap" align="baseline">
                          <ChevronRight
                            size={13}
                            className={styles.intentChevron}
                            data-open={open || undefined}
                          />
                          <Text size="sm" fw={500} style={{ flex: 1 }}>
                            {asI18n(intent.title)}
                          </Text>
                          <Text
                            size="xs"
                            c="dimmed"
                            className={styles.intentFeature}
                            // The truncated name in full, for the hover.
                            title={asI18n(user.featureByIntent[intent.id] ?? '')}
                          >
                            {asI18n(
                              user.featureByIntent[intent.id] ??
                                (m.virtual_users_intent_no_feature() as never)
                            )}
                          </Text>
                          {intent.steps && intent.steps.length > 0 && (
                            <Text size="xs" c="dimmed" ff="monospace">
                              {m.virtual_users_intent_steps({
                                count: intent.steps.length,
                              })}
                            </Text>
                          )}
                        </Group>
                      </UnstyledButton>
                      {open && (
                        <Stack gap={4} pb="sm" pl={21}>
                          {intent.description && (
                            <Text
                              size="sm"
                              c="dimmed"
                              style={{ maxWidth: '68ch' }}
                            >
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
                      )}
                    </Stack>
                  )
                })}
              </Stack>
              {user.intents.length > INTENTS_SHOWN && (
                <UnstyledButton
                  onClick={() => setAllIntents(!allIntents)}
                  data-testid="virtual-user-intents-toggle"
                >
                  <Text size="xs" c="dimmed" td="underline">
                    {allIntents
                      ? m.virtual_users_intents_show_fewer()
                      : m.virtual_users_intents_show_all({
                          count: user.intents.length,
                        })}
                  </Text>
                </UnstyledButton>
              )}
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
              names={reach.offeredNames}
              open={openReach === 'offered'}
              onToggle={() =>
                setOpenReach(openReach === 'offered' ? undefined : 'offered')
              }
            />
            <Figure
              value={reach.mutations}
              label={m.virtual_users_mutations_offered()}
              names={reach.mutationNames}
              open={openReach === 'mutations'}
              onToggle={() =>
                setOpenReach(openReach === 'mutations' ? undefined : 'mutations')
              }
            />
          </Group>
          {openReach === 'offered' && (
            <EndpointNames names={reach.offeredNames} />
          )}
          {openReach === 'mutations' && (
            <EndpointNames names={reach.mutationNames} />
          )}
          {!openReach && reach.offeredNames.length > 0 && (
            <Text size="xs" c="dimmed">
              {m.virtual_users_reach_open()}
            </Text>
          )}
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
              <UnstyledButton
                onClick={() =>
                  setOpenReach(openReach === 'inferred' ? undefined : 'inferred')
                }
                aria-expanded={openReach === 'inferred'}
                data-testid="virtual-user-inferred"
              >
                <Text size="sm" c="dimmed" td="underline">
                  {m.virtual_users_inferred({ count: reach.inferred })}
                </Text>
              </UnstyledButton>
            )}
            {openReach === 'inferred' && (
              <EndpointNames names={reach.inferredNames} />
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
