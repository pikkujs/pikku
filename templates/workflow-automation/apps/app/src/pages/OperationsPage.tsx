import { useState, type FC } from 'react'
import { Alert, Box, Button, Card, Group, Select, Stack, Text, Title } from '@pikku/mantine/core'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { LiveFeed } from '@/components/LiveFeed'
import { m, asI18n } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

/**
 * The work behind the run list.
 *
 * `runFlow` and `publishFlow` — with its graph validation, version freeze and
 * activation — were wired, scoped and unreachable. An operator could watch runs
 * happen and could not start one, and a builder could not publish anything at
 * all. These are the same actions a trigger and a deploy produce, exposed so a
 * person can perform them and see what happens.
 */
export const OperationsPage: FC = () => {
  useLocale()
  const runs = usePikkuQuery('listRuns', { limit: 25 })
  const runFlow = usePikkuMutation('runFlow')
  const startFlowPublish = usePikkuMutation('startFlowPublish')
  const sweepStuckRuns = usePikkuMutation('sweepStuckRuns')
  // The webhook sweep runs every five minutes on its own. A scheduled task a
  // human cannot trigger is a task nobody can verify or recover: when a webhook
  // flow stops firing, the operator's first question is whether the sweep still
  // works, and waiting five minutes to find out is not an answer. Same work,
  // same permissions, on demand.
  const sweepPendingWebhooks = usePikkuMutation('sweepPendingWebhooks')

  const [flowId, setFlowId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  // The run list is the only place a flow id surfaces today, so the options come
  // from there. A flow that has never run cannot be started from this screen —
  // worth noticing, and an argument for a flow list of its own.
  const flowOptions = [
    ...new Map(
      (runs.data?.runs ?? []).map((r) => [r.flowId, { value: r.flowId, label: r.flowName }]),
    ).values(),
  ]
  const chosen = flowId ?? flowOptions[0]?.value ?? null

  const run = async (what: () => Promise<unknown>) => {
    setFailed(false)
    setNote(null)
    try {
      await what()
      setNote(m.ops__done())
      await runs.refetch()
    } catch {
      setFailed(true)
    }
  }

  return (
    <Stack gap="lg">
      <Box>
        <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
          {m.ops__title()}
        </Title>
        <Text c="dimmed" size="sm">{m.ops__subtitle()}</Text>
      </Box>

      {note && <Alert color="teal" variant="light">{asI18n(note)}</Alert>}
      {failed && <Alert color="red" variant="light">{m.ops__failed()}</Alert>}

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.ops__run_title()}</Title>
          {flowOptions.length === 0 ? (
            <Text c="dimmed" size="sm">{m.ops__nothing()}</Text>
          ) : (
            <Group align="flex-end">
              <Select data={flowOptions} value={chosen} onChange={setFlowId} allowDeselect={false} w={280} />
              <Button
                loading={runFlow.isPending}
                disabled={!chosen}
                onClick={() => void run(() => runFlow.mutateAsync({ flowId: chosen!, payload: {} }))}
              >
                {m.ops__run_action()}
              </Button>
            </Group>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.ops__publish_title()}</Title>
          <Text c="dimmed" size="sm">{m.ops__publish_body()}</Text>
          {flowOptions.length === 0 ? (
            <Text c="dimmed" size="sm">{m.ops__nothing()}</Text>
          ) : (
            <Group align="flex-end">
              <Select data={flowOptions} value={chosen} onChange={setFlowId} allowDeselect={false} w={280} />
              <Button
                variant="default"
                loading={startFlowPublish.isPending}
                disabled={!chosen}
                onClick={() =>
                  void run(() =>
                    startFlowPublish.mutateAsync({
                      flowId: chosen!,
                      graph: '{"nodes":[{"id":"n1","type":"query"}]}',
                    }),
                  )
                }
              >
                {m.ops__publish_action()}
              </Button>
            </Group>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.ops__sweep_title()}</Title>
          <Text c="dimmed" size="sm">{m.ops__sweep_body()}</Text>
          <Group>
            <Button
              variant="default"
              loading={sweepStuckRuns.isPending}
              onClick={() => void run(() => sweepStuckRuns.mutateAsync(null))}
            >
              {m.ops__sweep_stuck()}
            </Button>
            <Button
              variant="default"
              loading={sweepPendingWebhooks.isPending}
              onClick={() => void run(() => sweepPendingWebhooks.mutateAsync(null))}
            >
              {m.ops__sweep_webhooks()}
            </Button>
          </Group>
        </Stack>
      </Card>
      <LiveFeed />
    </Stack>
  )
}
