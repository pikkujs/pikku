import React from 'react'
import { useLink } from '../../router'
import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Divider,
  Group,
  Paper,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@pikku/mantine/core'
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  DollarSign,
  Play,
  ShieldCheck,
} from 'lucide-react'
import { asI18n, type I18nNode, type I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { plural } from '@/i18n/plural'
import type { VirtualUserDisposition } from '@pikku/core/virtual-user'
import type { VirtualUserDoc } from './virtual-user-model'
import { VirtualUserSchedule } from './VirtualUserSchedule'
import { VirtualUserVisits } from './VirtualUserVisits'
import { DispositionBadge, VirtualUserAvatar } from './VirtualUserAvatar'
import { frequencyWord } from './disposition-labels'
import { useDeveloperDetails } from '../../hooks/useDeveloperDetails'
import { useStartVirtualUserRun } from '../../hooks/useVirtualUserRuns'
import { virtualUserRunRefused } from '../../lib/virtualUserRunRefused'
import { SectionCard } from '../ui/SectionCard'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevCode, DevField, DevFields, DevMono } from '../ui/DevDetail'
import type { PersonaLastTry, VirtualUserRunRow } from './run-summary'

const DISPOSITION_BLURB: Record<VirtualUserDisposition, () => I18nString> = {
  realistic: m.virtual_users_disposition_realistic,
  careless: m.virtual_users_disposition_careless,
  newcomer: m.virtual_users_disposition_newcomer,
  stale: m.virtual_users_disposition_stale,
  auditor: m.virtual_users_disposition_auditor,
  adversarial: m.virtual_users_disposition_adversarial,
  accountable: m.virtual_users_disposition_accountable,
}

const TASKS_SHOWN = 5
const AREAS_SHOWN = 4

const percent = (weight: number, total: number) =>
  total === 0 ? 0 : Math.round((weight / total) * 100)

const Fact: React.FC<{
  icon: React.ReactNode
  title: I18nNode
  children: I18nNode
}> = ({ icon, title, children }) => (
  <Paper variant="inset" px={14} py={12}>
    <Group gap={10} wrap="nowrap" align="flex-start">
      <ThemeIcon variant="transparent" color="blue" c="blue" size="sm">
        {icon}
      </ThemeIcon>
      <Stack gap={2}>
        <Text size="sm" fw={600}>
          {title}
        </Text>
        <Text size="xs" c="dimmed" lh={1.4}>
          {children}
        </Text>
      </Stack>
    </Group>
  </Paper>
)

const Trait: React.FC<{
  label: I18nNode
  explain: I18nNode
  value: number
}> = ({ label, explain, value }) => (
  <Paper variant="inset" px="md" py={14}>
    <Stack gap={12}>
      <Tooltip
        label={explain}
        multiline
        w={260}
        position="top-start"
        events={{ hover: true, focus: true, touch: true }}
      >
        <Text
          size="sm"
          tabIndex={0}
          style={{
            alignSelf: 'flex-start',
            cursor: 'help',
            textDecoration: 'underline dotted',
            textUnderlineOffset: 4,
          }}
        >
          {label}
        </Text>
      </Tooltip>
      <Progress value={Math.max(value, 2)} size="sm" />
      <Text size="sm">
        {frequencyWord(value)}
        <Text span size="xs" c="dimmed" ml={4}>
          {asI18n(`· ${value}%`)}
        </Text>
      </Text>
    </Stack>
  </Paper>
)

const Area: React.FC<{ children: I18nNode; count: number }> = ({
  children,
  count,
}) => (
  <Badge
    size="lg"
    variant="filled"
    color="gray"
    rightSection={
      <Text span inherit c="dimmed" fw={500}>
        {asI18n(String(count))}
      </Text>
    }
  >
    {children}
  </Badge>
)

const EndpointNames: React.FC<{ names: string[] }> = ({ names }) => {
  const Link = useLink()
  return (
    <Group gap={12} wrap="nowrap" align="stretch" data-testid="reach-names">
      <Divider orientation="vertical" />
      <ScrollArea.Autosize mah={220} style={{ flex: 1 }}>
        <Group gap={6} py={4}>
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
      </ScrollArea.Autosize>
    </Group>
  )
}

const Tasks: React.FC<{ user: VirtualUserDoc }> = ({ user }) => {
  const [all, setAll] = React.useState(false)
  const [openTask, setOpenTask] = React.useState<string>()
  const { shown: developerDetails } = useDeveloperDetails()
  const Link = useLink()
  const { intents, wants } = user
  const areasShown = wants.byFeature.slice(0, AREAS_SHOWN)
  const rest = wants.byFeature.slice(AREAS_SHOWN)
  const tasks = plural(
    wants.intents,
    m.virtual_users_tasks_one,
    m.virtual_users_tasks_other
  )
  const areas = plural(
    Math.max(wants.features, 1),
    m.virtual_users_areas_one,
    m.virtual_users_areas_other
  )

  return (
    <Paper variant="inset" px="md" py={14} data-testid="virtual-user-tasks">
      <Stack gap={12}>
        <Group justify="space-between" gap={12}>
          <Text fw={600}>
            {user.goals.length > 0
              ? m.virtual_users_tasks_plus_head({ tasks })
              : m.virtual_users_tasks_from_head({ tasks })}
          </Text>
          <Text size="xs" c="dimmed">
            {m.virtual_users_tasks_across({ areas })}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          {m.virtual_users_tasks_note({ name: user.name })}
          <Anchor component={Link} to="/scenarios" size="sm" ml={4}>
            {m.virtual_users_see_stories()}
          </Anchor>
        </Text>
        {areasShown.length > 0 && (
          <Group gap={8}>
            {areasShown.map((area) => (
              <Area key={area.name} count={area.count}>
                {asI18n(area.name)}
              </Area>
            ))}
            {rest.length > 0 && (
              <Area count={rest.reduce((sum, area) => sum + area.count, 0)}>
                {plural(
                  rest.length,
                  m.virtual_users_more_areas_one,
                  m.virtual_users_more_areas_other
                )}
              </Area>
            )}
          </Group>
        )}
        <Stack gap={0}>
          {(all ? intents : intents.slice(0, TASKS_SHOWN)).map(
            (intent, index) => {
              const open = openTask === intent.id
              const steps = intent.steps ?? []
              const canOpen =
                developerDetails && (steps.length > 0 || !!intent.description)
              return (
                <Box key={intent.id}>
                  {index > 0 && <Divider />}
                  <UnstyledButton
                    disabled={!canOpen}
                    onClick={() => setOpenTask(open ? undefined : intent.id)}
                    w="100%"
                    py={10}
                    style={{ cursor: canOpen ? undefined : 'default' }}
                    data-testid={`intent-${intent.id}`}
                  >
                    <Group justify="space-between" wrap="nowrap" gap={12}>
                      <Group gap={6} wrap="nowrap">
                        {canOpen && (
                          <ChevronRight
                            size={13}
                            style={{
                              transform: open ? 'rotate(90deg)' : undefined,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <Text size="sm">{asI18n(intent.title)}</Text>
                      </Group>
                      {user.featureByIntent[intent.id] && (
                        <Text
                          size="xs"
                          c="dimmed"
                          lineClamp={1}
                          maw={220}
                          style={{ flexShrink: 0 }}
                        >
                          {asI18n(user.featureByIntent[intent.id])}
                        </Text>
                      )}
                    </Group>
                  </UnstyledButton>
                  <Collapse expanded={open}>
                    <Group
                      gap={12}
                      wrap="nowrap"
                      align="stretch"
                      ml={19}
                      pb={10}
                    >
                      <Divider orientation="vertical" />
                      <Stack gap={2}>
                        {intent.description && (
                          <Text size="sm" c="dimmed">
                            {asI18n(intent.description)}
                          </Text>
                        )}
                        {steps.map((step, stepIndex) => (
                          <Text key={stepIndex} size="sm" c="dimmed">
                            {asI18n(step)}
                          </Text>
                        ))}
                      </Stack>
                    </Group>
                  </Collapse>
                </Box>
              )
            }
          )}
        </Stack>
        {intents.length > TASKS_SHOWN && (
          <Box>
            <Anchor
              component="button"
              size="sm"
              fw={500}
              onClick={() => setAll(!all)}
              data-testid="virtual-user-intents-toggle"
            >
              {all
                ? m.virtual_users_intents_show_fewer()
                : m.virtual_users_show_all_tasks({ count: intents.length })}
            </Anchor>
          </Box>
        )}
      </Stack>
    </Paper>
  )
}

const REACH_CHANGE = 'blue'
const REACH_LOOK = 'cyan.8'
const REACH_OFF = 'gray.7'

const reachSentence = ({ reach, profile }: VirtualUserDoc) => {
  const off = reach.total - reach.offered
  return reach.showsEverything
    ? m.virtual_users_reach_inverted({ total: reach.total })
    : profile.readOnly
      ? m.virtual_users_reach_read_only({
          offered: reach.offered,
          total: reach.total,
        })
      : off === 0
        ? m.virtual_users_reach_everything({
            total: reach.total,
            mutations: reach.mutations,
          })
        : m.virtual_users_reach_some({
            offered: reach.offered,
            total: reach.total,
            off,
          })
}

const Reach: React.FC<{ user: VirtualUserDoc }> = ({ user }) => {
  const { reach } = user
  const look = reach.offered - reach.mutations
  const off = reach.total - reach.offered
  const parts = [
    {
      value: reach.mutations,
      color: REACH_CHANGE,
      label: m.virtual_users_count_change(),
    },
    { value: look, color: REACH_LOOK, label: m.virtual_users_count_look() },
    { value: off, color: REACH_OFF, label: m.virtual_users_count_off() },
  ]
  return (
    <>
      <Progress.Root size={14}>
        {parts.map((part, index) => (
          <Progress.Section
            key={index}
            value={reach.total === 0 ? 0 : (part.value / reach.total) * 100}
            color={part.color}
          />
        ))}
      </Progress.Root>
      <Group gap={20}>
        {parts.map((part, index) => (
          <Group key={index} gap={8} wrap="nowrap">
            <Text span c={part.color} lh={0}>
              <Circle size={8} fill="currentColor" />
            </Text>
            <Text size="sm" c="dimmed">
              {asI18n(`${part.value} `)}
              {part.label}
            </Text>
          </Group>
        ))}
      </Group>
      <Text size="sm" c="dimmed">
        {user.roles.length > 0
          ? m.virtual_users_role_line({ roles: user.roles.join(', ') })
          : m.virtual_users_role_none()}
      </Text>
    </>
  )
}

type NameList = 'offered' | 'mutations' | 'inferred'

const DeveloperDetails: React.FC<{
  user: VirtualUserDoc
  environment: string
}> = ({ user, environment }) => {
  const [names, setNames] = React.useState<NameList>()
  const { profile, reach } = user
  const moveTotal =
    profile.moves.continue +
    profile.moves.suspend +
    profile.moves.resume +
    profile.moves.abandon
  const toggle = (list: NameList) => setNames(names === list ? undefined : list)

  return (
    <ForDevelopers
      label={m.virtual_users_dev_title()}
      hint={m.virtual_users_dev_hint()}
      testId="virtual-user-dev"
    >
      <Stack gap="md">
        <DevFields>
          <DevField label={m.virtual_users_dev_key()} value={user.id} />
          <DevField label={m.virtual_users_dev_disposition()} value={user.disposition} />
          <DevField label={m.virtual_users_dev_moves()}>
            <Text size="sm" ff="monospace">
              {m.virtual_users_moves({
                continue: percent(profile.moves.continue, moveTotal),
                suspend: percent(profile.moves.suspend, moveTotal),
                resume: percent(profile.moves.resume, moveTotal),
                abandon: percent(profile.moves.abandon, moveTotal),
              })}
            </Text>
            {user.tunedDials.length > 0 && (
              <Text size="xs" c="dimmed">
                {m.virtual_users_tuned({ dials: user.tunedDials.join(', ') })}
              </Text>
            )}
          </DevField>
          <DevField label={m.virtual_users_dev_roles()} value={user.roles.join(', ') || undefined} />
          <DevField label={m.virtual_users_dev_scopes()} value={user.scopes.join(', ') || undefined} />
          {user.persona.email && (
            <DevField label={m.virtual_users_dev_email()} value={user.persona.email} />
          )}
          <DevField label={m.virtual_users_dev_where()}>
            {user.environments ? (
              <DevMono value={user.environments.join(', ')} />
            ) : (
              <Text size="sm">{m.virtual_users_environments_default()}</Text>
            )}
          </DevField>
          {user.fixtures && user.fixtures.length > 0 && (
            <DevField label={m.virtual_users_fixtures()} value={user.fixtures.join(', ')} />
          )}
          {user.tags.length > 0 && (
            <DevField label={m.virtual_users_dev_tags()} value={user.tags.join(', ')} />
          )}
          <DevField label={m.virtual_users_dev_budget()}>
            <Text size="sm">{m.virtual_users_budget_default()}</Text>
          </DevField>
          <DevField label={m.virtual_users_dev_endpoints()}>
            <Group gap={12}>
              <Anchor
                component="button"
                size="sm"
                onClick={() => toggle('offered')}
              >
                {m.virtual_users_dev_endpoints_value({
                  offered: reach.offered,
                  mutations: reach.mutations,
                })}
              </Anchor>
              {reach.mutations > 0 && (
                <Anchor
                  component="button"
                  size="sm"
                  onClick={() => toggle('mutations')}
                >
                  {m.virtual_users_count_change()}
                </Anchor>
              )}
            </Group>
          </DevField>
        </DevFields>
        {names === 'offered' && <EndpointNames names={reach.offeredNames} />}
        {names === 'mutations' && <EndpointNames names={reach.mutationNames} />}
        <DevCode
          label={m.virtual_users_dev_run()}
          code={`pikku persona run ${environment} ${user.id}`}
        />
        <DevCode
          label={m.virtual_users_dev_sync()}
          code={`pikku persona sync ${environment}`}
        />
        {reach.inferred > 0 && (
          <Box>
            <Anchor
              component="button"
              size="sm"
              c="dimmed"
              onClick={() => toggle('inferred')}
              data-testid="virtual-user-inferred"
            >
              {m.virtual_users_inferred({ count: reach.inferred })}
            </Anchor>
            {names === 'inferred' && (
              <EndpointNames names={reach.inferredNames} />
            )}
          </Box>
        )}
      </Stack>
    </ForDevelopers>
  )
}

type VirtualUserDocumentProps = {
  user: VirtualUserDoc
  tried?: PersonaLastTry
  onOpenVisit: (run: VirtualUserRunRow) => void
  environment?: string
  production?: boolean
}

export const VirtualUserDocument: React.FC<VirtualUserDocumentProps> = ({
  user,
  tried,
  onOpenVisit,
  environment = 'staging',
  production,
}) => {
  const { profile } = user
  const start = useStartVirtualUserRun(user.id)
  const refused = virtualUserRunRefused(user.disposition, production)
  const moveTotal =
    profile.moves.continue +
    profile.moves.suspend +
    profile.moves.resume +
    profile.moves.abandon
  const hasSomethingToWant = user.goals.length > 0 || user.intents.length > 0
  const visiting = tried?.running ?? false

  const top = React.useRef<HTMLDivElement>(null)
  const shownId = React.useRef(user.id)
  React.useEffect(() => {
    if (shownId.current === user.id) return
    shownId.current = user.id
    top.current?.scrollIntoView({ block: 'start' })
  }, [user.id])

  return (
    <Stack ref={top} gap={16} data-testid={`virtual-user-document-${user.id}`}>
      <Card>
        <Group gap={18} wrap="nowrap" align="flex-start">
          <VirtualUserAvatar
            name={user.name}
            disposition={user.disposition}
            size={64}
          />
          <Stack gap={4} miw={0}>
            <Group gap={10} align="center">
              <Title order={1}>{asI18n(user.name)}</Title>
              <DispositionBadge disposition={user.disposition} />
            </Group>
            {user.persona.jobTitle && (
              <Text c="dimmed">{asI18n(user.persona.jobTitle)}</Text>
            )}
            {user.description && (
              <Text size="sm" c="dimmed" maw={640}>
                {asI18n(user.description)}
              </Text>
            )}
          </Stack>
        </Group>

        {visiting && (
          <Stack gap={2} data-testid="virtual-user-visiting">
            <Text fw={600} c="blue">
              {m.virtual_users_visiting_title({ name: user.name })}
            </Text>
            <Text size="sm" c="dimmed">
              {m.virtual_users_visiting_body()}
            </Text>
          </Stack>
        )}
        <Group gap="sm" data-help="try">
          <Button
            size="lg"
            leftSection={<Play size={16} fill="currentColor" />}
            loading={start.isPending}
            disabled={visiting || refused}
            onClick={() => start.mutate(undefined)}
            data-testid="virtual-user-run-now"
          >
            {m.virtual_users_send({ name: user.name })}
          </Button>
          <Button
            size="lg"
            variant="default"
            fw={500}
            onClick={() =>
              document
                .getElementById('virtual-user-schedule')
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          >
            {m.virtual_users_schedule_open()}
          </Button>
        </Group>
        {refused && (
          <Text size="sm" c="dimmed" data-testid="virtual-user-run-refused">
            {m.virtual_users_runs_production_only()}
          </Text>
        )}
        {start.error && (
          <Text size="sm" c="red">
            {asI18n(
              start.error instanceof Error
                ? start.error.message
                : String(start.error)
            )}
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing={12}>
          <Fact
            icon={<ShieldCheck size={20} />}
            title={m.virtual_users_fact_safe_title()}
          >
            {m.virtual_users_fact_safe()}
          </Fact>
          <Fact
            icon={<Clock size={20} />}
            title={m.virtual_users_fact_time_title()}
          >
            {m.virtual_users_fact_time()}
          </Fact>
          <Fact
            icon={<DollarSign size={20} />}
            title={m.virtual_users_fact_cost_title()}
          >
            {m.virtual_users_fact_cost()}
          </Fact>
        </SimpleGrid>
      </Card>

      <SectionCard
        title={m.virtual_users_behaves({ name: user.name })}
        blurb={DISPOSITION_BLURB[user.disposition]()}
        testId="virtual-user-behaviour"
      >
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing={16}>
          <Trait
            label={m.virtual_users_trait_sticks()}
            explain={m.virtual_users_trait_sticks_explain()}
            value={percent(profile.moves.continue, moveTotal)}
          />
          <Trait
            label={m.virtual_users_trait_checks()}
            explain={m.virtual_users_trait_checks_explain()}
            value={Math.round(profile.reReadRate * 100)}
          />
          <Trait
            label={m.virtual_users_trait_twice()}
            explain={m.virtual_users_trait_twice_explain()}
            value={Math.round(profile.repeatRate * 100)}
          />
        </SimpleGrid>
        {(profile.readOnly ||
          profile.emptyMemory ||
          profile.invertedOracle) && (
          <Group gap={8}>
            {profile.readOnly && (
              <Badge size="lg" variant="filled" color="gray">
                {m.virtual_users_flag_read_only()}
              </Badge>
            )}
            {profile.emptyMemory && (
              <Badge size="lg" variant="filled" color="gray">
                {m.virtual_users_flag_empty_memory()}
              </Badge>
            )}
            {profile.invertedOracle && (
              <Badge size="lg" variant="filled" color="gray">
                {m.virtual_users_flag_inverted()}
              </Badge>
            )}
          </Group>
        )}
      </SectionCard>

      <SectionCard
        title={m.virtual_users_will_try({ name: user.name })}
        blurb={user.goals.length > 0 ? m.virtual_users_own_words() : undefined}
        testId="virtual-user-wants"
      >
        {!hasSomethingToWant && (
          <Text c="orange" data-testid="virtual-user-no-wants">
            {m.virtual_users_nothing_to_want({ actor: user.name })}
          </Text>
        )}
        {user.goals.length > 0 && (
          <Stack gap={12}>
            {user.goals.map((goal) => (
              <Group key={goal} gap={10} wrap="nowrap" align="flex-start">
                <ThemeIcon
                  variant="transparent"
                  color="green"
                  c="green"
                  size="sm"
                >
                  <CheckCircle2 size={18} />
                </ThemeIcon>
                <Text>{m.virtual_users_quoted({ goal })}</Text>
              </Group>
            ))}
          </Stack>
        )}
        {user.intents.length > 0 && <Tasks user={user} />}
      </SectionCard>

      <SectionCard
        title={m.virtual_users_allowed({ name: user.name })}
        blurb={reachSentence(user)}
        testId="virtual-user-reach"
      >
        <Reach user={user} />
      </SectionCard>

      <SectionCard
        title={m.virtual_users_visits()}
        testId="virtual-user-visits-section"
        help="visits"
      >
        <VirtualUserSchedule
          persona={user.id}
          name={user.name}
          declaredDisposition={user.disposition}
          declaredGoals={user.goals}
          production={production}
        />
        <VirtualUserVisits
          persona={user.id}
          name={user.name}
          onOpen={onOpenVisit}
        />
      </SectionCard>

      <DeveloperDetails user={user} environment={environment} />
    </Stack>
  )
}
