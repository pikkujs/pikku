import React from 'react'
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  TextInput,
  Text,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Plus, X } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import type { VirtualUserDisposition } from '@pikku/core/virtual-user'
import {
  useSetVirtualUserSchedule,
  useVirtualUserSchedules,
} from '../../hooks/useVirtualUserSchedules'
import { useDeveloperDetails } from '../../hooks/useDeveloperDetails'
import { DISPOSITION_LABEL } from './disposition-labels'
import { virtualUserRunRefused } from '../../lib/virtualUserRunRefused'

const HOUR_MS = 3_600_000

const nextVisitWhen = (iso: string, locale: string, now = Date.now()) => {
  const date = new Date(iso)
  const time = date.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const midnight = (value: number) => new Date(value).setHours(0, 0, 0, 0)
  const days = Math.round(
    (midnight(date.getTime()) - midnight(now)) / 86_400_000
  )
  const day =
    days >= 0 && days <= 1
      ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
          days,
          'day'
        )
      : date.toLocaleDateString(locale, { weekday: 'long' })
  return m.virtual_users_day_at({ day, time })
}

const DISPOSITIONS: VirtualUserDisposition[] = [
  'realistic',
  'careless',
  'newcomer',
  'stale',
  'auditor',
  'adversarial',
  'accountable',
]

const GoalsEditor: React.FC<{
  goals: string[]
  usual: string[]
  onChange: (goals: string[]) => void
}> = ({ goals, usual, onChange }) => {
  const [adding, setAdding] = React.useState('')
  const changed = goals.join('\n') !== usual.join('\n')
  const add = () => {
    const goal = adding.trim()
    if (!goal) return
    onChange([...goals, goal])
    setAdding('')
  }
  return (
    <Stack gap={6} data-testid="virtual-user-schedule-goals">
      <Group justify="space-between" gap="sm">
        <Text size="sm" fw={600}>
          {m.virtual_users_schedule_goals()}
        </Text>
        {changed && (
          <Anchor component="button" size="sm" onClick={() => onChange(usual)}>
            {m.virtual_users_goals_reset()}
          </Anchor>
        )}
      </Group>
      <Paper variant="inset" p={0}>
        {goals.length === 0 && (
          <>
            <Text size="sm" c="dimmed" pl={14} pr={8} py={6}>
              {m.virtual_users_goals_none()}
            </Text>
            <Divider />
          </>
        )}
        {goals.map((goal, index) => (
          <React.Fragment key={`${index}-${goal}`}>
            <Group
              justify="space-between"
              wrap="nowrap"
              gap="sm"
              pl={14}
              pr={8}
              py={6}
            >
              <Text size="sm">{asI18n(goal)}</Text>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={m.virtual_users_goal_remove()}
                onClick={() => onChange(goals.filter((_, i) => i !== index))}
              >
                <X size={14} />
              </ActionIcon>
            </Group>
            <Divider />
          </React.Fragment>
        ))}
        <TextInput
          variant="unstyled"
          pl={14}
          pr={8}
          placeholder={m.virtual_users_goal_add()}
          value={adding}
          onChange={(event) => setAdding(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
          onBlur={add}
          leftSection={<Plus size={14} />}
          data-testid="virtual-user-schedule-goal-add"
        />
      </Paper>
    </Stack>
  )
}

export const VirtualUserSchedule: React.FC<{
  persona: string
  name: string
  declaredDisposition: VirtualUserDisposition
  declaredGoals: string[]
  production?: boolean
}> = ({ persona, name, declaredDisposition, declaredGoals, production }) => {
  const { shown: developerDetails } = useDeveloperDetails()
  const { data, error } = useVirtualUserSchedules()
  const save = useSetVirtualUserSchedule(persona)
  const row = (data ?? []).find((schedule) => schedule.persona === persona)

  const saved = React.useMemo(
    () => ({
      disposition: (row?.disposition ??
        declaredDisposition) as VirtualUserDisposition,
      goals: row?.goals?.length ? row.goals : declaredGoals,
      minHours: (row?.minIntervalMs ?? 6 * HOUR_MS) / HOUR_MS,
      maxHours: (row?.maxIntervalMs ?? 24 * HOUR_MS) / HOUR_MS,
    }),
    [row, declaredDisposition, declaredGoals]
  )
  const [draft, setDraft] = React.useState(saved)
  const [edited, setEdited] = React.useState(false)
  const edit = (patch: Partial<typeof saved>) => {
    setEdited(true)
    setDraft((current) => ({ ...current, ...patch }))
  }
  const dirty =
    edited &&
    (draft.disposition !== saved.disposition ||
      draft.goals.join(' ') !== saved.goals.join(' ') ||
      draft.minHours !== saved.minHours ||
      draft.maxHours !== saved.maxHours)
  // A cadence changed from the CLI, or by anyone else on this console, arrives
  // as a new row on the next read. Rebasing the draft on it would take the
  // field out from under whoever is mid-edit, so the draft only follows the
  // saved values while there is nothing to lose.
  React.useEffect(() => {
    if (dirty) return
    setDraft(saved)
    setEdited(false)
  }, [saved])
  const enabled = row?.enabled ?? false
  const enableRefused =
    !enabled && virtualUserRunRefused(saved.disposition, production)
  const saveRefused =
    enabled && virtualUserRunRefused(draft.disposition, production)

  const { locale } = useLocale()

  return (
    <Paper
      variant="inset"
      p={0}
      data-testid="virtual-user-schedule"
      data-help="schedule"
      id="virtual-user-schedule"
    >
      <Group
        justify="space-between"
        align="flex-start"
        wrap="nowrap"
        gap="lg"
        px={16}
        py={14}
      >
        <Stack gap={4}>
          <Text fw={600}>{m.virtual_users_schedule_title()}</Text>
          <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
            {enabled && row
              ? m.virtual_users_schedule_on_text({
                  name,
                  min: saved.minHours,
                  max: saved.maxHours,
                  when: nextVisitWhen(row.nextRunAt, locale),
                })
              : m.virtual_users_schedule_off_text({
                  name,
                  min: saved.minHours,
                  max: saved.maxHours,
                })}
          </Text>
        </Stack>
        <Switch
          size="md"
          mt={2}
          checked={enabled}
          disabled={save.isPending || enableRefused}
          onChange={(event) =>
            save.mutate({ enabled: event.currentTarget.checked })
          }
          aria-label={m.virtual_users_schedule_title()}
          data-testid="virtual-user-schedule-enabled"
        />
      </Group>

      {(enableRefused || saveRefused) && (
        <Text
          size="xs"
          c="dimmed"
          px={16}
          pb={12}
          data-testid="virtual-user-schedule-refused"
        >
          {m.virtual_users_schedule_production_only()}
        </Text>
      )}
      {(error || save.error) && (
        <Text size="xs" c="red" px={16} pb={12}>
          {asI18n(
            [error, save.error]
              .filter(Boolean)
              .map((e) => (e instanceof Error ? e.message : String(e)))
              .join(' · ')
          )}
        </Text>
      )}

      {(enabled || developerDetails) && (
        <>
          <Divider />
          <Box px={16} py={14}>
            <Group justify="space-between" align="center" gap="md">
              <Stack gap={2} style={{ flex: '1 1 240px' }}>
                <Text size="sm" fw={600}>
                  {m.virtual_users_schedule_gap()}
                </Text>
                <Text size="xs" c="dimmed">
                  {m.virtual_users_schedule_gap_hint()}
                </Text>
              </Stack>
              <Group gap="sm" wrap="nowrap">
                <NumberInput
                  size="sm"
                  w={150}
                  min={1}
                  label={m.virtual_users_schedule_min_hours()}
                  rightSection={
                    <Text size="xs" c="dimmed">
                      {m.virtual_users_hours_unit()}
                    </Text>
                  }
                  rightSectionWidth={52}
                  value={draft.minHours}
                  onChange={(value) => edit({ minHours: Number(value) })}
                  data-testid="virtual-user-schedule-min"
                />
                <NumberInput
                  size="sm"
                  w={150}
                  min={1}
                  label={m.virtual_users_schedule_max_hours()}
                  rightSection={
                    <Text size="xs" c="dimmed">
                      {m.virtual_users_hours_unit()}
                    </Text>
                  }
                  rightSectionWidth={52}
                  value={draft.maxHours}
                  onChange={(value) => edit({ maxHours: Number(value) })}
                  data-testid="virtual-user-schedule-max"
                />
              </Group>
            </Group>
          </Box>
        </>
      )}

      {developerDetails && (
        <>
          <Divider />
          <Box px={16} py={14}>
            <Stack gap="sm">
              <Text size="sm" fw={600}>
                {m.virtual_users_dev_schedule()}
              </Text>
              <Stack gap="md">
                <Select
                  size="sm"
                  maw={280}
                  label={m.virtual_users_schedule_disposition()}
                  data={DISPOSITIONS.map((value) => ({
                    value,
                    label: DISPOSITION_LABEL[value](),
                  }))}
                  value={draft.disposition}
                  original={declaredDisposition}
                  onChange={(value) =>
                    edit({
                      disposition: (value ??
                        declaredDisposition) as VirtualUserDisposition,
                    })
                  }
                  data-testid="virtual-user-schedule-disposition"
                />
                <GoalsEditor
                  goals={draft.goals}
                  usual={declaredGoals}
                  onChange={(goals) => edit({ goals })}
                />
              </Stack>
            </Stack>
          </Box>
        </>
      )}

      {dirty && (
        <>
          <Divider />
          <Box px={16} py={14}>
            <Group justify="flex-end">
              <Button
                size="sm"
                loading={save.isPending}
                disabled={saveRefused}
                onClick={() =>
                  save.mutate({
                    disposition: draft.disposition,
                    goals: draft.goals,
                    minIntervalMs: draft.minHours * HOUR_MS,
                    maxIntervalMs: draft.maxHours * HOUR_MS,
                  })
                }
                data-testid="virtual-user-schedule-save"
              >
                {m.virtual_users_schedule_save()}
              </Button>
            </Group>
          </Box>
        </>
      )}
    </Paper>
  )
}
