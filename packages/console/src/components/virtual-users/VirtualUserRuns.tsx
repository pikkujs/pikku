import React from 'react'
import { Badge, Box, Button, Group, Stack, Text, UnstyledButton } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import {
  useStartVirtualUserRun,
  useVirtualUserRuns,
  useVirtualUserRunSteps,
} from '../../hooks/useVirtualUserRuns'
import { describeAction } from './virtual-user-model'
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

type StepRow = {
  index: number
  action: Record<string, unknown>
  status?: number
  ok?: boolean
  response?: string
  findingKinds?: string[]
}

const STATUS_COLOUR: Record<RunRow['status'], string> = {
  running: 'blue',
  completed: 'green',
  failed: 'red',
}

const Transcript: React.FC<{ runId: string }> = ({ runId }) => {
  const { data, isPending } = useVirtualUserRunSteps(runId)
  const steps = (data ?? []) as StepRow[]

  if (isPending) {
    return (
      <Text size="xs" c="dimmed">
        {m.virtual_users_runs_loading()}
      </Text>
    )
  }
  if (steps.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        {m.virtual_users_runs_no_transcript()}
      </Text>
    )
  }

  return (
    <Stack gap={2} data-testid="virtual-user-transcript">
      {steps.map((step) => (
        <Group key={step.index} gap={8} wrap="nowrap" align="baseline">
          <Text size="xs" c="dimmed" ff="monospace" style={{ minWidth: 28 }}>
            {asI18n(String(step.index))}
          </Text>
          <Text size="xs" ff="monospace">
            {asI18n(describeAction(step.action))}
          </Text>
          {step.status !== undefined && (
            <Text size="xs" c={step.ok === false ? 'red' : 'dimmed'}>
              {asI18n(String(step.status))}
            </Text>
          )}
          {step.findingKinds?.map((kind) => (
            <Badge key={kind} size="xs" variant="light" color="orange" tt="none">
              {asI18n(kind)}
            </Badge>
          ))}
        </Group>
      ))}
    </Stack>
  )
}

/**
 * What this persona has actually done, under everything the declaration says
 * they could do — and the button that makes them do it.
 *
 * The section stays even with nothing in it, because the trigger lives here: a
 * persona nobody has ever run is exactly the one somebody wants to run.
 */
export const VirtualUserRuns: React.FC<{ persona: string }> = ({ persona }) => {
  const { data } = useVirtualUserRuns(persona)
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
      {runs.length === 0 && (
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
                  {asI18n(`${run.disposition} · seed ${run.seed}`)}
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
                    {asI18n(`${finding.kind} · step ${finding.step} · ${finding.detail}`)}
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
                        {asI18n(`${intent.title} · ${intent.status}`)}
                      </Badge>
                    ))}
                  </Group>
                )}
                <Transcript runId={run.runId} />
              </Stack>
            )}
          </Box>
        )
      })}
    </Stack>
  )
}
