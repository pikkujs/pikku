import React from 'react'
import {
  Anchor,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@pikku/mantine/core'
import { asI18n, type I18nString } from '@pikku/react'
import { ArrowLeft, CheckCircle2, CircleDot, XCircle } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { plural } from '@/i18n/plural'
import { useDeveloperDetails } from '../../hooks/useDeveloperDetails'
import { StatusBadge } from '../ui/StatusBadge'
import { StatTile } from '../ui/StatTile'
import type { VirtualUserDoc } from './virtual-user-model'
import { VirtualUserAvatar } from './VirtualUserAvatar'
import { VirtualUserTranscript } from './VirtualUserTranscript'
import {
  goalsReached,
  problemCount,
  runProblems,
  timeAgo,
  visitMinutes,
  type ProblemLine,
  type VirtualUserRunRow,
} from './run-summary'

const SENTENCE: Record<
  ProblemLine['kind'],
  (params: { name: string; detail: string }) => I18nString
> = {
  'server-error': m.virtual_users_found_server_error,
  'transport-error': m.virtual_users_found_transport_error,
  'schema-violation': m.virtual_users_found_schema_violation,
  'unexpected-success': m.virtual_users_found_unexpected_success,
  custom: m.virtual_users_found_custom,
  stopped: m.virtual_users_found_stopped,
}

const WORTH_FIXING = new Set<ProblemLine['kind']>([
  'unexpected-success',
  'server-error',
  'schema-violation',
])

const GOAL_STATUS: Record<string, () => I18nString> = {
  completed: m.virtual_users_goal_completed,
  stuck: m.virtual_users_goal_stuck,
  abandoned: m.virtual_users_goal_abandoned,
  suspended: m.virtual_users_goal_suspended,
  open: m.virtual_users_goal_open,
}

const GoalIcon: React.FC<{ status: string }> = ({ status }) =>
  status === 'completed' ? (
    <ThemeIcon variant="transparent" color="green" c="green" size="sm">
      <CheckCircle2 size={16} />
    </ThemeIcon>
  ) : status === 'stuck' || status === 'abandoned' ? (
    <ThemeIcon variant="transparent" color="orange" c="orange" size="sm">
      <XCircle size={16} />
    </ThemeIcon>
  ) : (
    <ThemeIcon variant="transparent" color="gray" c="dimmed" size="sm">
      <CircleDot size={16} />
    </ThemeIcon>
  )

const Finding: React.FC<{ line: ProblemLine; name: string }> = ({
  line,
  name,
}) => {
  const [open, setOpen] = React.useState(false)
  const fix = WORTH_FIXING.has(line.kind)
  const technical = line.error
    ? [line.error]
    : line.details.map((detail) =>
        [detail.rpcName, detail.status, detail.detail, `step ${detail.step}`]
          .filter(Boolean)
          .join(' · ')
      )
  return (
    <Paper
      variant="inset"
      p={20}
      data-severity={fix ? 'fix' : 'look'}
      data-testid={`virtual-user-finding-${line.kind}`}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Title order={3}>
            {SENTENCE[line.kind]({
              name,
              detail: line.details[0]?.detail ?? '',
            })}
          </Title>
          <StatusBadge tone={fix ? 'warn' : 'info'} dot={false}>
            {fix
              ? m.virtual_users_severity_fix()
              : m.virtual_users_severity_look()}
          </StatusBadge>
        </Group>
        <Group gap={12}>
          {line.goal && (
            <Text size="sm" c="dimmed">
              {m.virtual_users_found_while({ goal: line.goal })}
            </Text>
          )}
          {line.count > 1 && (
            <Text size="sm" c="dimmed">
              {plural(
                line.count,
                m.virtual_users_found_times_one,
                m.virtual_users_found_times_other
              )}
            </Text>
          )}
        </Group>
        <Box>
          <Anchor
            component="button"
            size="sm"
            c="dimmed"
            onClick={() => setOpen(!open)}
          >
            {open ? m.virtual_users_hide_tech() : m.virtual_users_show_tech()}
          </Anchor>
          {open && (
            <Stack gap={2} pt={6}>
              {technical.map((text, index) => (
                <Text
                  key={index}
                  size="xs"
                  ff="monospace"
                  c="dimmed"
                  style={{ wordBreak: 'break-word' }}
                >
                  {asI18n(text)}
                </Text>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Paper>
  )
}

export const VirtualUserVisit: React.FC<{
  user: VirtualUserDoc
  run: VirtualUserRunRow
  onBack: () => void
}> = ({ user, run, onBack }) => {
  const { locale } = useLocale()
  const { shown: developerDetails } = useDeveloperDetails()
  const name = user.name
  const lines = runProblems(run)
  const problems = problemCount(lines)
  const reached = goalsReached(run)
  const total = run.intents.length
  const minutes = visitMinutes(run)
  const running = run.status === 'running'

  const summary =
    total === 0
      ? m.virtual_users_report_no_goals({ name })
      : reached === total
        ? m.virtual_users_report_all({ name })
        : reached === 0
          ? m.virtual_users_report_none({ name })
          : m.virtual_users_report_some({ name, reached, total })

  return (
    <Card data-testid="virtual-user-visit">
      <Group gap={16} wrap="nowrap" align="flex-start">
        <VirtualUserAvatar
          name={name}
          disposition={user.disposition}
          size={56}
        />
        <Stack gap={4} miw={0} style={{ flex: 1 }}>
          <Title order={1}>{m.virtual_users_report_title({ name })}</Title>
          <Text size="sm" c="dimmed">
            {running
              ? m.virtual_users_report_meta_running({
                  when: timeAgo(run.createdAt, locale),
                })
              : m.virtual_users_report_meta({
                  when: new Date(run.createdAt).toLocaleString(locale),
                  duration:
                    minutes === undefined || minutes < 1
                      ? m.virtual_users_duration_short()
                      : plural(
                          minutes,
                          m.virtual_users_duration_one,
                          m.virtual_users_duration_other
                        ),
                })}
          </Text>
          <Text c="dimmed" maw={680}>
            {running ? (
              m.virtual_users_visiting_body()
            ) : (
              <>
                {summary}{' '}
                {problems === 0
                  ? m.virtual_users_report_problems_none()
                  : plural(
                      problems,
                      m.virtual_users_report_problems_one,
                      m.virtual_users_report_problems_other
                    )}
              </>
            )}
          </Text>
        </Stack>
        <Button
          variant="default"
          size="compact-sm"
          leftSection={<ArrowLeft size={14} />}
          onClick={onBack}
          data-testid="virtual-user-visit-back"
        >
          {m.virtual_users_report_back({ name })}
        </Button>
      </Group>

      {!running && (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <StatTile
            label={m.virtual_users_stat_goals()}
            value={m.virtual_users_stat_goals_value({ reached, total })}
            tone={total > 0 && reached === total ? 'good' : undefined}
          />
          <StatTile
            label={m.virtual_users_stat_problems()}
            value={asI18n(String(problems))}
            tone={problems > 0 ? 'warn' : undefined}
          />
          <StatTile
            label={m.virtual_users_stat_did()}
            value={m.virtual_users_stat_did_value({
              calls: run.tally?.calls ?? run.tally?.steps ?? 0,
              mutations: run.tally?.mutations ?? 0,
            })}
          />
        </SimpleGrid>
      )}

      {lines.length > 0 && (
        <Stack gap="sm">
          <Title order={2}>{m.virtual_users_found()}</Title>
          {lines.map((line) => (
            <Finding key={line.key} line={line} name={name} />
          ))}
        </Stack>
      )}

      {total > 0 && (
        <Stack gap="xs">
          <Title order={2}>{m.virtual_users_tried()}</Title>
          <Stack gap={0}>
            {run.intents.map((intent, index) => (
              <React.Fragment key={intent.id}>
                {index > 0 && <Divider />}
                <Group justify="space-between" wrap="nowrap" py={10}>
                  <Group gap={10} wrap="nowrap">
                    <GoalIcon status={intent.status} />
                    <Text size="sm">{asI18n(intent.title)}</Text>
                  </Group>
                  <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                    {GOAL_STATUS[intent.status]?.() ?? asI18n(intent.status)}
                  </Text>
                </Group>
              </React.Fragment>
            ))}
          </Stack>
        </Stack>
      )}

      {developerDetails && (
        <Stack gap="xs">
          <Title order={2}>{m.virtual_users_steps_title()}</Title>
          <Text size="xs" c="dimmed" ff="monospace">
            {m.virtual_users_runs_seed({
              disposition: run.disposition ?? user.disposition,
              seed: run.seed ?? 0,
            })}
          </Text>
          <VirtualUserTranscript runId={run.runId} />
        </Stack>
      )}

      <Text size="sm" c="dimmed" maw={680}>
        {m.virtual_users_report_footer()}
      </Text>
    </Card>
  )
}
