import React from 'react'
import {
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { ChevronRight, SquareCheckBig } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { plural } from '@/i18n/plural'
import { useVirtualUserRuns } from '../../hooks/useVirtualUserRuns'
import {
  goalsReached,
  problemCount,
  runProblems,
  timeAgo,
  type VirtualUserRunRow,
} from './run-summary'

const Outcome: React.FC<{ run: VirtualUserRunRow }> = ({ run }) => {
  if (run.status === 'running') {
    return (
      <Text size="sm" c="blue">
        {m.virtual_users_list_visiting()}
      </Text>
    )
  }
  const problems = problemCount(runProblems(run))
  if (problems > 0) {
    return (
      <Text size="sm" c="orange">
        {plural(
          problems,
          m.virtual_users_last_problems_one,
          m.virtual_users_last_problems_other
        )}
      </Text>
    )
  }
  return (
    <Text size="sm" c={run.status === 'failed' ? 'dimmed' : 'green'}>
      {run.status === 'failed'
        ? m.virtual_users_run_stopped_short()
        : m.virtual_users_last_ok()}
    </Text>
  )
}

export const VirtualUserVisits: React.FC<{
  persona: string
  name: string
  onOpen: (run: VirtualUserRunRow) => void
}> = ({ persona, name, onOpen }) => {
  const { locale } = useLocale()
  const { data, error } = useVirtualUserRuns(persona)
  const runs = ((data ?? []) as Omit<VirtualUserRunRow, 'persona'>[]).map(
    (run) => ({ ...run, persona })
  )

  if (error) {
    return (
      <Text size="xs" c="red">
        {asI18n(error instanceof Error ? error.message : String(error))}
      </Text>
    )
  }

  if (runs.length === 0) {
    return (
      <Paper
        variant="inset"
        radius="lg"
        px={32}
        py={40}
        data-testid="virtual-user-no-visits"
      >
        <Stack gap={10} align="center" ta="center">
          <ThemeIcon variant="transparent" color="gray" c="dimmed" size="lg">
            <SquareCheckBig size={28} />
          </ThemeIcon>
          <Text fw={600} size="lg">
            {m.virtual_users_no_visits_title()}
          </Text>
          <Text size="sm" c="dimmed" maw={460}>
            {m.virtual_users_no_visits({ name })}
          </Text>
        </Stack>
      </Paper>
    )
  }

  return (
    <Stack gap={8} data-testid="virtual-user-visits">
      {runs.map((run) => (
        <UnstyledButton
          key={run.runId}
          w="100%"
          onClick={() => onOpen(run)}
          data-testid={`virtual-user-visit-${run.runId}`}
        >
          <Paper variant="inset" px="md" py="sm">
            <Group justify="space-between" wrap="nowrap">
              <Group gap={16} wrap="wrap">
                <Text
                  size="sm"
                  fw={500}
                  title={asI18n(new Date(run.createdAt).toLocaleString())}
                >
                  {asI18n(timeAgo(run.createdAt, locale))}
                </Text>
                <Outcome run={run} />
                {run.intents.length > 0 && run.status !== 'running' && (
                  <Text size="sm" c="dimmed">
                    {m.virtual_users_visit_goals({
                      reached: goalsReached(run),
                      total: run.intents.length,
                    })}
                  </Text>
                )}
              </Group>
              <ThemeIcon
                variant="transparent"
                color="gray"
                c="dimmed"
                size="sm"
              >
                <ChevronRight size={16} />
              </ThemeIcon>
            </Group>
          </Paper>
        </UnstyledButton>
      ))}
    </Stack>
  )
}
