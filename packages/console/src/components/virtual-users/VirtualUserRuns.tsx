import React from 'react'
import { Badge, Box, Button, Group, Stack, Text, UnstyledButton } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import {
  useStartVirtualUserRun,
  useVirtualUserRuns,
} from '../../hooks/useVirtualUserRuns'
import { VirtualUserTranscript } from './VirtualUserTranscript'
import styles from './virtual-users.module.css'

type RunRow = {
  runId: string
  status: 'running' | 'completed' | 'failed'
  disposition: string
  seed: number
  createdAt: string
  finishedAt: string | null
  stoppedBy: string | null
  error: string | null
  findings: { kind: string; detail: string; step: number }[]
  intents: { id: string; title: string; status: string; suspensions: number }[]
  tally: { steps?: number; calls?: number; mutations?: number } | null
}

const STATUS_COLOUR: Record<RunRow['status'], string> = {
  running: 'blue',
  completed: 'green',
  failed: 'red',
}

/**
 * What this persona has actually done, under everything the declaration says
 * they could do — and the button that makes them do it.
 *
 * The section stays even with nothing in it, because the trigger lives here: a
 * persona nobody has ever run is exactly the one somebody wants to run.
 */
export const VirtualUserRuns: React.FC<{ persona: string }> = ({ persona }) => {
  const { data, error } = useVirtualUserRuns(persona)
  const start = useStartVirtualUserRun(persona)
  const [openRun, setOpenRun] = React.useState<string>()
  const runs = (data ?? []) as RunRow[]

  return (
    <Stack gap="sm" data-testid="virtual-user-runs">
      <Group justify="space-between" align="center">
        <Text
          size="xs"
          fw={600}
          tt="uppercase"
          c="dimmed"
          className={styles.sectionTitle}
          style={{ letterSpacing: '0.06em' }}
        >
          {m.virtual_users_runs()}
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          loading={start.isPending}
          onClick={() => start.mutate(undefined)}
          data-testid="virtual-user-run-now"
        >
          {m.virtual_users_runs_start()}
        </Button>
      </Group>
      {start.error && (
        <Text size="xs" c="red">
          {asI18n(
            start.error instanceof Error
              ? start.error.message
              : String(start.error)
          )}
        </Text>
      )}
      {error && (
        <Text size="xs" c="red">
          {asI18n(error instanceof Error ? error.message : String(error))}
        </Text>
      )}
      {!error && runs.length === 0 && (
        <Text size="xs" c="dimmed">
          {m.virtual_users_runs_none()}
        </Text>
      )}
      {runs.map((run) => {
        const open = openRun === run.runId
        return (
          <Box key={run.runId}>
            <UnstyledButton
              onClick={() => setOpenRun(open ? undefined : run.runId)}
              aria-expanded={open}
              style={{ width: '100%' }}
            >
              <Group gap={10} wrap="wrap" align="baseline">
                <Badge
                  size="xs"
                  variant="light"
                  radius="sm"
                  tt="none"
                  color={STATUS_COLOUR[run.status]}
                >
                  {asI18n(run.status)}
                </Badge>
                <Text size="sm">
                  {asI18n(new Date(run.createdAt).toLocaleString())}
                </Text>
                <Text size="sm" c="dimmed">
                  {m.virtual_users_runs_counts({
                    steps: run.tally?.steps ?? 0,
                    mutations: run.tally?.mutations ?? 0,
                  })}
                </Text>
                <Text
                  size="sm"
                  c={run.findings.length > 0 ? 'orange' : 'dimmed'}
                >
                  {m.virtual_users_runs_findings({
                    count: run.findings.length,
                  })}
                </Text>
                <Text size="xs" c="dimmed" ff="monospace">
                  {m.virtual_users_runs_seed({
                    disposition: run.disposition,
                    seed: run.seed,
                  })}
                </Text>
              </Group>
            </UnstyledButton>
            {open && (
              <Stack gap="xs" pt="xs" pl="md">
                {run.error && (
                  <Text size="xs" c="red">
                    {asI18n(run.error)}
                  </Text>
                )}
                {run.findings.map((finding, at) => (
                  <Text key={at} size="xs" c="orange">
                    {m.virtual_users_runs_finding({
                      kind: finding.kind,
                      step: finding.step,
                      detail: finding.detail,
                    })}
                  </Text>
                ))}
                {run.intents.length > 0 && (
                  <Group gap={6}>
                    {run.intents.map((intent) => (
                      <Badge
                        key={intent.id}
                        size="xs"
                        variant="light"
                        radius="sm"
                        tt="none"
                      >
                        {m.virtual_users_runs_intent({
                          title: intent.title,
                          status: intent.status,
                        })}
                      </Badge>
                    ))}
                  </Group>
                )}
                <VirtualUserTranscript runId={run.runId} />
              </Stack>
            )}
          </Box>
        )
      })}
    </Stack>
  )
}
