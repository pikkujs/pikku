import React from 'react'
import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { VirtualUserDisposition } from '@pikku/core/virtual-user'
import {
  useSetVirtualUserSchedule,
  useVirtualUserSchedules,
} from '../../hooks/useVirtualUserSchedules'
import styles from './virtual-users.module.css'

const HOUR_MS = 3_600_000

const DISPOSITIONS: VirtualUserDisposition[] = [
  'realistic',
  'careless',
  'newcomer',
  'stale',
  'auditor',
  'adversarial',
  'accountable',
]

/**
 * What a persona does when nobody is watching, and whether that is still what
 * the repository says they do.
 *
 * A cadence is enabled once and then outlives the declaration it was written
 * from: someone edits `personas.ts`, redeploys, and the row keeps running last
 * month's goals. So every field is shown against what this persona currently
 * declares, and marks itself where the two have parted ways.
 *
 * `original` is the declaration rather than the row's own saved value. Both are
 * true comparisons, but only one is a question this screen exists to answer —
 * whether the code in front of you is what is running. That a field has unsaved
 * edits is already said by the save button appearing.
 *
 * The intervals carry no `original`: nothing declares a cadence in code, and
 * there is deliberately nowhere to. A persona's timing is an operational choice
 * about how much to spend, made where it can be changed without a deploy.
 */
export const VirtualUserSchedule: React.FC<{
  persona: string
  declaredDisposition: VirtualUserDisposition
  declaredGoals: string[]
}> = ({ persona, declaredDisposition, declaredGoals }) => {
  const { data, error } = useVirtualUserSchedules()
  const save = useSetVirtualUserSchedule(persona)
  const row = (data ?? []).find((schedule) => schedule.persona === persona)

  const saved = React.useMemo(
    () => ({
      disposition: (row?.disposition ??
        declaredDisposition) as VirtualUserDisposition,
      goals: row?.goals ?? declaredGoals,
      minHours: (row?.minIntervalMs ?? 6 * HOUR_MS) / HOUR_MS,
      maxHours: (row?.maxIntervalMs ?? 24 * HOUR_MS) / HOUR_MS,
    }),
    [row, declaredDisposition, declaredGoals]
  )
  const [draft, setDraft] = React.useState(saved)
  const dirty =
    draft.disposition !== saved.disposition ||
    draft.goals.join(' ') !== saved.goals.join(' ') ||
    draft.minHours !== saved.minHours ||
    draft.maxHours !== saved.maxHours
  // A cadence changed from the CLI, or by anyone else on this console, arrives
  // as a new row on the next read. Rebasing the draft on it would take the
  // field out from under whoever is mid-edit, so the draft only follows the
  // saved values while there is nothing to lose.
  React.useEffect(() => {
    if (!dirty) setDraft(saved)
  }, [saved])

  return (
    <Stack gap="sm" data-testid="virtual-user-schedule">
      <Group justify="space-between" align="center">
        <Text
          size="xs"
          fw={600}
          tt="uppercase"
          c="dimmed"
          className={styles.sectionTitle}
          style={{ letterSpacing: '0.06em' }}
        >
          {m.virtual_users_schedule()}
        </Text>
        <Switch
          size="sm"
          checked={row?.enabled ?? false}
          disabled={save.isPending}
          onChange={(event) =>
            save.mutate({ enabled: event.currentTarget.checked })
          }
          label={m.virtual_users_schedule_enabled()}
          data-testid="virtual-user-schedule-enabled"
        />
      </Group>

      <Text size="xs" c="dimmed" style={{ maxWidth: '68ch' }}>
        {m.virtual_users_schedule_note()}
      </Text>

      {error && (
        <Text size="xs" c="red">
          {asI18n(error instanceof Error ? error.message : String(error))}
        </Text>
      )}
      {save.error && (
        <Text size="xs" c="red">
          {asI18n(
            save.error instanceof Error
              ? save.error.message
              : String(save.error)
          )}
        </Text>
      )}

      <Select
        size="xs"
        label={m.virtual_users_schedule_disposition()}
        data={DISPOSITIONS}
        value={draft.disposition}
        original={declaredDisposition}
        onChange={(value) =>
          setDraft((current) => ({
            ...current,
            disposition: (value ??
              declaredDisposition) as VirtualUserDisposition,
          }))
        }
        data-testid="virtual-user-schedule-disposition"
      />

      <TagsInput
        size="xs"
        label={m.virtual_users_schedule_goals()}
        value={draft.goals}
        original={declaredGoals}
        onChange={(goals) => setDraft((current) => ({ ...current, goals }))}
        data-testid="virtual-user-schedule-goals"
      />

      <Group grow align="start">
        <NumberInput
          size="xs"
          min={1}
          label={m.virtual_users_schedule_min_hours()}
          value={draft.minHours}
          onChange={(value) =>
            setDraft((current) => ({ ...current, minHours: Number(value) }))
          }
          data-testid="virtual-user-schedule-min"
        />
        <NumberInput
          size="xs"
          min={1}
          label={m.virtual_users_schedule_max_hours()}
          value={draft.maxHours}
          onChange={(value) =>
            setDraft((current) => ({ ...current, maxHours: Number(value) }))
          }
          data-testid="virtual-user-schedule-max"
        />
      </Group>

      <Group justify="space-between" align="center">
        <Text size="xs" c="dimmed">
          {row?.enabled
            ? m.virtual_users_schedule_next({
                when: new Date(row.nextRunAt).toLocaleString(),
              })
            : m.virtual_users_schedule_off()}
        </Text>
        {dirty && (
          <Button
            size="compact-xs"
            variant="light"
            loading={save.isPending}
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
        )}
      </Group>
    </Stack>
  )
}
