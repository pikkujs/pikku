import React from 'react'
import {
  Button,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { Trash2, TriangleAlert } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import type { ScenarioRunRecord } from '@pikku/core/scenario'
import { SectionCard } from '../../ui/SectionCard'
import { StatusBadge, type StatusTone } from '../../ui/StatusBadge'
import { CardRow } from '../../ui/CardRow'
import { StatusTile } from '../../ui/StatusTile'
import { ScenarioRunTimeline } from './ScenarioRunTimeline'
import { runDuration, runWhen } from './scenario-run-format'

const TONE: Record<ScenarioRunRecord['status'], StatusTone> = {
  passed: 'good',
  failed: 'bad',
  running: 'info',
}

const LABEL: Record<ScenarioRunRecord['status'], () => I18nNode> = {
  passed: () => m.scenarios_status_passed(),
  failed: () => m.scenarios_status_failed(),
  running: () => m.scenarios_status_running(),
}

const Fact: React.FC<{ label: I18nNode; value: I18nNode }> = ({
  label,
  value,
}) => (
  <Stack gap={4}>
    <Text size="sm" c="dimmed">
      {label}
    </Text>
    <Text size="sm" fw={500}>
      {value}
    </Text>
  </Stack>
)

export const environmentLabel = (environment: string): I18nNode =>
  environment === 'local' ? m.scenarios_env_local() : asI18n(environment)

type ScenarioRunVerdictProps = {
  run: ScenarioRunRecord
  declared: number
  onOpenScenario: (scenarioName: string) => void
  onShowFailed: () => void
  onDelete: () => void
  deleting: boolean
}

export const ScenarioRunVerdict: React.FC<ScenarioRunVerdictProps> = ({
  run,
  declared,
  onOpenScenario,
  onShowFailed,
  onDelete,
  deleting,
}) => {
  const { locale } = useLocale()
  const total = run.results.length
  const failed = run.results.filter((r) => r.status === 'failed').length
  const settled = run.results.filter((r) => r.status !== 'running').length
  const recordings = run.results.reduce(
    (sum, r) =>
      sum +
      (r.artifacts ?? []).filter((artifact) => artifact.kind === 'video')
        .length,
    0
  )
  const elapsed =
    run.finishedAt &&
    new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()

  const title =
    run.status === 'running'
      ? m.scenarios_verdict_running({
          done: settled,
          total: Math.max(declared, total),
        })
      : failed > 0
        ? m.scenarios_verdict_failed({ failed, total })
        : total === 1
          ? m.scenarios_verdict_passed_one()
          : m.scenarios_verdict_passed({ total })
  const blurb =
    run.status === 'running'
      ? m.scenarios_verdict_running_body()
      : failed > 0
        ? m.scenarios_verdict_failed_body()
        : m.scenarios_verdict_passed_body()

  return (
    <SectionCard
      testId="scenario-run-verdict"
      hero
      eyebrow={
        <Group gap={10} mb={4}>
          <StatusBadge tone={TONE[run.status]}>{LABEL[run.status]()}</StatusBadge>
          <Text size="sm" c="dimmed">
            {asI18n(runWhen(run.startedAt, locale))}
          </Text>
        </Group>
      }
      title={title}
      blurb={blurb}
      right={
        <Group gap="sm">
          {failed > 0 && run.status !== 'running' && (
            <Button onClick={onShowFailed} data-testid="scenario-run-show-failed">
              {m.scenarios_verdict_show_failed()}
            </Button>
          )}
          <Button
            variant="default"
            leftSection={<Trash2 size={15} />}
            loading={deleting}
            onClick={onDelete}
            data-testid="scenario-run-delete"
          >
            {m.scenario_runs_delete()}
          </Button>
        </Group>
      }
    >
      <Divider my="md" />
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="lg">
        <Fact
          label={m.scenarios_fact_where()}
          value={environmentLabel(run.environment)}
        />
        <Fact
          label={m.scenarios_fact_how()}
          value={
            run.surface === 'browser'
              ? m.scenarios_fact_how_browser()
              : m.scenarios_fact_how_api()
          }
        />
        <Fact
          label={m.scenarios_fact_took()}
          value={
            elapsed ? asI18n(runDuration(elapsed)) : m.scenarios_fact_took_running()
          }
        />
        <Fact
          label={m.scenarios_fact_recordings()}
          value={
            recordings === 0
              ? m.scenarios_fact_recordings_none()
              : recordings === 1
                ? m.scenarios_fact_recordings_one()
                : m.scenarios_fact_recordings_count({ count: recordings })
          }
        />
      </SimpleGrid>
      {total > 1 && (
        <Stack gap={6} mt="lg">
          <ScenarioRunTimeline
            results={run.results}
            onOpen={(name) => {
              const result = run.results.find((entry) => entry.name === name)
              onOpenScenario(result?.scenarioName ?? name)
            }}
          />
        </Stack>
      )}
      {run.hookFailures.length > 0 && (
        <Stack gap="xs" mt="md">
          {run.hookFailures.map((failure) => (
            <CardRow
              key={failure}
              testId="scenario-run-hook-failure"
              leading={
                <StatusTile tone="bad">
                  <TriangleAlert size={18} />
                </StatusTile>
              }
              title={m.scenarios_hook_failed()}
              meta={asI18n(failure)}
            />
          ))}
        </Stack>
      )}
    </SectionCard>
  )
}
