import type { FC } from 'react'
import {
  Badge,
  Button,
  Box,
  Card,
  Group,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@pikku/mantine/core'
import { QueryErrorCard } from '@/components/QueryErrorCard'
import { RunCard } from '@/components/RunCard'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { flowRunStatus, flowTriggerKind } from '@/i18n/i18n-enum.gen'
import type { FlowRunStatusKey, FlowTriggerKindKey } from '@/i18n/i18n-enum.gen'
import { useLocale } from '@/i18n/config'

/**
 * Failed is red and everything else is quiet.
 *
 * An operator opening this page is looking for one thing, and a table where
 * every row competes for attention is a table where the failure does not stand
 * out. Succeeded runs are the background against which a failure is visible.
 */
const STATUS_COLOR: Record<FlowRunStatusKey, string> = {
  failed: 'red',
  running: 'blue',
  queued: 'gray',
  cancelled: 'orange',
  succeeded: 'teal',
}

/**
 * Keeps the seconds once a run passes a minute.
 *
 * Rounding to whole minutes reported a 94-second run as "2m" — wrong in the
 * direction that matters, because the number an operator compares against a
 * timeout must not round away from it. Anything under an hour is shown as
 * minutes and seconds; beyond that the seconds stop earning their space.
 */
const duration = (startedAt: string, finishedAt: string | null) => {
  if (!finishedAt) return '—'
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  // One decimal only where it can matter. Above ten seconds the tenth is noise
  // and "38.0s" claims a precision the neighbouring rounded values do not have.
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) {
    const totalSeconds = Math.round(ms / 1000)
    return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
  }
  const totalMinutes = Math.round(ms / 60_000)
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
}

export const RunsPage: FC = () => {
  useLocale()

  const runs = usePikkuQuery('listRuns', { limit: 25 })
  const cancelRun = usePikkuMutation('cancelRun')

  const failing = (runs.data?.runs ?? []).filter((r) => r.status === 'failed').length

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Box>
          <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
            {m.runs__title()}
          </Title>
          <Text c="dimmed" size="sm">
            {m.runs__subtitle()}
          </Text>
        </Box>
        {!runs.isLoading && failing > 0 && (
          <Badge
            size="lg"
            variant="light"
            color="red"
            styles={{ label: { color: STATUS_TEXT_COLOR } }}
          >
            {m.runs__failing({ count: failing })}
          </Badge>
        )}
      </Group>

      {runs.isError ? (
        <QueryErrorCard error={runs.error} onRetry={() => void runs.refetch()} />
      ) : runs.isLoading ? (
        <Stack gap="xs">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} h={44} radius="sm" />
          ))}
        </Stack>
      ) : runs.data?.runs.length === 0 ? (
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap={4}>
            <Text fw={600}>{m.runs__empty_title()}</Text>
            <Text c="dimmed" size="sm">
              {m.runs__empty_hint()}
            </Text>
          </Stack>
        </Card>
      ) : (
        <>
        {/* Cards below `md`, a table from `md` up. The switch is at 992px and
            not 768 because at 768 the table was still 3px short of "Succeeded"
            and ellipsised it — and raising the badge type from 10px to 11px
            widens every label, so the table only appears where the wider labels
            fit. A tablet in portrait gets cards, which is no compromise: the
            flow and its status stay on one line either way. */}
        <Stack gap="xs" hiddenFrom="md">
          {runs.data?.runs.map((run) => (
            <RunCard
              key={run.runId}
              flowName={run.flowName}
              status={run.status}
              startedBy={run.startedBy}
              duration={duration(run.startedAt, run.finishedAt)}
              error={run.error}
              statusColor={STATUS_COLOR[run.status as FlowRunStatusKey]!}
            />
          ))}
        </Stack>
        <Card withBorder radius="md" p={0} visibleFrom="md">
          {/* The table still needs a scroll escape above the switch. Between 992
              and 1280 the columns are narrower than their contents:
              "Succeeded" wants 71px and the Status column offers 65 at 992 and 69 at
              1024, so four rows rendered "SUCCEE…".
              Compressing is not an option — a clipped status is the one cell
              nobody can afford to misread — so the table keeps its width and the
              container scrolls. */}
          <Table.ScrollContainer minWidth={820} type="native">
          <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{m.runs__col_flow()}</Table.Th>
                <Table.Th>{m.runs__col_status()}</Table.Th>
                <Table.Th>{m.runs__col_started_by()}</Table.Th>
                <Table.Th>{m.runs__col_duration()}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {runs.data?.runs.map((run) => (
                <Table.Tr key={run.runId}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text fw={600} size="sm">
                        {asI18n(run.flowName)}
                      </Text>
                      {run.error && (
                        <Text c="red" size="xs" lineClamp={1}>
                          {asI18n(run.error)}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      size="md"
                      variant="light"
                      color={STATUS_COLOR[run.status as FlowRunStatusKey]}
                      styles={{
                        label: {
                          color: STATUS_TEXT_COLOR,
                        },
                      }}
                    >
                      {flowRunStatus[run.status as FlowRunStatusKey]()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {/* The trigger kind is a DB enum with a generated label map,
                          not free text — rendering it raw printed lowercase
                          `webhook` beside localised uppercase status badges. The
                          `?.` is deliberate: unlike `status`, this column carries
                          no CHECK constraint, so an unrecognised value must fall
                          back rather than throw at render. */}
                      {flowTriggerKind[run.startedBy as FlowTriggerKindKey]?.() ??
                        asI18n(run.startedBy)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed" ff="monospace">
                      {asI18n(duration(run.startedAt, run.finishedAt))}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {/* Only a run still in flight can be stopped. Offering
                        Cancel on a finished run is an action with no effect,
                        which teaches an operator to distrust the button. */}
                    {(run.status === 'running' || run.status === 'queued') && (
                      <Button
                        size="compact-sm"
                        variant="default"
                        loading={cancelRun.isPending && cancelRun.variables?.runId === run.runId}
                        onClick={() =>
                          cancelRun.mutateAsync({ runId: run.runId }).then(() => runs.refetch())
                        }
                      >
                        {m.runs__cancel()}
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        </Card>
        </>
      )}
    </Stack>
  )
}
