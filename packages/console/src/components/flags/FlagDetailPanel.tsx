import { useEffect, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Progress,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Plus, X } from 'lucide-react'
import { ConsolePanel } from '../shell/ConsolePanel'
import { m } from '@/i18n/messages'
import {
  useClearFlagOverride,
  useFlagOverrides,
  useSetFlagEnabled,
  useSetFlagOverride,
  useSetFlagRollout,
  type FlagSubject,
} from '../../hooks/useFeatureFlags'
import {
  admitsEveryone,
  flagAttentionReason,
  flagLaneOf,
  type FlagBoardRow,
} from './flag-lanes'
import { LANE_LOOK, flagTitle } from './FlagRow'
import { StatusBadge } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import { ForDevelopers } from '../ui/ForDevelopers'

type FlagDetailPanelProps = {
  flag: FlagBoardRow | null
  opened: boolean
  writable: boolean
  onClose: () => void
}

const ATTENTION_COPY = {
  unbacked: m.flags_attention_unbacked,
  undeclared: m.flags_attention_undeclared,
}

const subjectOf = (kind: string, id: string): FlagSubject =>
  kind === 'organization' ? { organizationId: id } : { userId: id }

const grantedOn = (at: string) => {
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? at : date.toLocaleDateString()
}

/**
 * One flag's operator controls, beside the board rather than over it.
 *
 * The switch, the bucket and the overrides are on the same surface because they
 * are read together: "off for everyone except these three" is the switch and an
 * override row, and an operator who has to leave one screen to see the other is
 * the operator who turns a flag on for everybody by mistake.
 */
export const FlagDetailPanel: React.FC<FlagDetailPanelProps> = ({
  flag,
  opened,
  writable,
  onClose,
}) => {
  const [subjectKind, setSubjectKind] = useState('organization')
  const [subjectId, setSubjectId] = useState('')
  const [adding, setAdding] = useState(false)
  /** Turning a flag on with no rollout limit admits everyone, so the switch
   *  arms a confirmation rather than committing on the first click. Every other
   *  transition — off, or on behind a bucket — applies directly. */
  const [confirmingLive, setConfirmingLive] = useState(false)

  const overridesQuery = useFlagOverrides(flag?.name, opened)
  const setEnabled = useSetFlagEnabled()
  const setRollout = useSetFlagRollout()
  const setOverride = useSetFlagOverride()
  const clearOverride = useClearFlagOverride()

  const overrides = overridesQuery.data?.overrides ?? []
  const overridesSupported = overridesQuery.data?.supported ?? false
  const attention = flag ? flagAttentionReason(flag) : null

  // The panel outlives the flag it describes, so an armed confirmation or a
  // half-typed subject id would carry over to the next flag opened.
  useEffect(() => {
    setConfirmingLive(false)
    setSubjectId('')
    setAdding(false)
  }, [flag?.name])

  const actionError = (setEnabled.error ||
    setRollout.error ||
    setOverride.error ||
    clearOverride.error) as Error | null

  const saving =
    setEnabled.isPending || setRollout.isPending || clearOverride.isPending

  const toggle = (next: boolean) => {
    if (!flag) return
    if (next && admitsEveryone(flag)) {
      setConfirmingLive(true)
      return
    }
    setEnabled.mutate({ name: flag.name, enabled: next })
  }

  const pin = (enabled: boolean) => {
    if (!flag || !subjectId.trim()) return
    setOverride.mutate(
      {
        name: flag.name,
        subject: subjectOf(subjectKind, subjectId.trim()),
        enabled,
      },
      {
        onSuccess: () => {
          setSubjectId('')
          setAdding(false)
        },
      }
    )
  }

  const lane = flag ? flagLaneOf(flag) : 'dark'
  const look = LANE_LOOK[lane]
  const summary = !flag
    ? null
    : lane === 'rolling'
      ? m.flags_rollout_percent({ percent: flag.rolloutPercent ?? 0 })
      : look.title()

  return (
    <ConsolePanel
      opened={opened}
      onClose={onClose}
      width="lg"
      title={flag ? asI18n(flagTitle(flag.name)) : undefined}
      testId="flag-panel"
    >
      {flag && (
        <Stack gap="lg">
          <Paper variant="inset" px="md" py="sm">
            <Group gap="md" wrap="nowrap">
              <StatusTile tone={look.tone}>
                <look.Icon size={18} />
              </StatusTile>
              <Stack gap={2} miw={0}>
                <Text fw={600}>{summary}</Text>
                {flag.description && (
                  <Text size="sm" c="dimmed">
                    {asI18n(flag.description)}
                  </Text>
                )}
              </Stack>
            </Group>
          </Paper>

          {attention && (
            <Alert color="orange" data-testid="flag-attention">
              {ATTENTION_COPY[attention]()}
            </Alert>
          )}

          {actionError && (
            <Alert
              color="red"
              title={m.flags_action_error()}
              data-testid="flag-action-error"
            >
              {asI18n(actionError.message)}
            </Alert>
          )}

          <Stack gap="xs">
            <Text fw={600}>{m.flags_panel_who_title()}</Text>
            <Paper variant="inset" px="md" py="sm">
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Stack gap={2} miw={0}>
                  <Text size="sm" fw={500}>
                    {m.flags_panel_enabled()}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {flag.enabled
                      ? m.flags_panel_on_hint_on()
                      : m.flags_panel_on_hint_off()}
                  </Text>
                </Stack>
                <Switch
                  size="md"
                  checked={flag.enabled}
                  disabled={!writable || setEnabled.isPending}
                  aria-label={m.flags_panel_enabled()}
                  data-testid="flag-enabled"
                  onChange={(event) => toggle(event.currentTarget.checked)}
                />
              </Group>
            </Paper>

            {confirmingLive && (
              <Alert
                color="orange"
                title={m.flags_confirm_live_title()}
                data-testid="flag-confirm-live"
              >
                <Stack gap={8}>
                  <Text size="sm">{m.flags_confirm_live_body()}</Text>
                  <Group gap={6}>
                    <Button
                      size="xs"
                      color="orange"
                      loading={setEnabled.isPending}
                      data-testid="flag-confirm-live-go"
                      onClick={() => {
                        setEnabled.mutate(
                          { name: flag.name, enabled: true },
                          { onSuccess: () => setConfirmingLive(false) }
                        )
                      }}
                    >
                      {m.flags_confirm_live_go()}
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => setConfirmingLive(false)}
                    >
                      {m.flags_confirm_cancel()}
                    </Button>
                  </Group>
                </Stack>
              </Alert>
            )}

            <Paper variant="inset" px="md" py="sm">
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Stack gap={2} miw={0}>
                  <Text size="sm" fw={500}>
                    {m.flags_panel_rollout()}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {flag.rolloutPercent === null
                      ? m.flags_rollout_none()
                      : m.flags_panel_rollout_help()}
                  </Text>
                </Stack>
                <NumberInput
                  w={96}
                  value={flag.rolloutPercent ?? ''}
                  min={0}
                  max={100}
                  suffix={m.flags_percent_suffix()}
                  placeholder={m.flags_panel_rollout_all()}
                  aria-label={m.flags_panel_rollout()}
                  disabled={!writable || setRollout.isPending}
                  data-testid="flag-rollout"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                  onBlur={(event) => {
                    const raw = event.currentTarget.value.replace('%', '').trim()
                    const percent = raw === '' ? null : Number(raw)
                    if (percent === flag.rolloutPercent) return
                    setRollout.mutate({ name: flag.name, percent })
                  }}
                />
              </Group>
              {flag.rolloutPercent !== null && (
                <Progress
                  mt="sm"
                  value={flag.rolloutPercent}
                  size="sm"
                  radius="xl"
                  aria-hidden
                />
              )}
            </Paper>

            <Paper variant="inset" px="md" py="sm">
              <Stack gap={6}>
                <Text size="sm" fw={500}>
                  {m.flags_any_of()}
                </Text>
                {flag.anyOf && flag.anyOf.length > 0 ? (
                  <Group gap={6}>
                    {flag.anyOf.map((scope) => (
                      <Badge key={scope} size="lg" variant="light" color="gray">
                        {asI18n(flagTitle(scope))}
                      </Badge>
                    ))}
                  </Group>
                ) : (
                  <Text size="xs" c="dimmed">
                    {m.flags_any_of_none()}
                  </Text>
                )}
              </Stack>
            </Paper>
          </Stack>

          <Stack gap="xs">
            <Stack gap={2}>
              <Text fw={600}>{m.flags_panel_overrides()}</Text>
              <Text size="sm" c="dimmed">
                {m.flags_panel_overrides_hint()}
              </Text>
            </Stack>

            {!overridesSupported && !overridesQuery.isLoading ? (
              <Text size="sm" c="dimmed">
                {m.flags_overrides_unsupported()}
              </Text>
            ) : overrides.length === 0 ? (
              <Text size="sm" c="dimmed">
                {m.flags_overrides_empty()}
              </Text>
            ) : (
              overrides.map((override) => (
                <Paper
                  key={override.subjectId}
                  variant="inset"
                  px="md"
                  py="sm"
                  data-testid="flag-override"
                  data-subject-id={override.subjectId}
                >
                  <Group justify="space-between" wrap="nowrap" gap="md">
                    <Stack gap={2} miw={0}>
                      <Text size="sm" fw={500} truncate>
                        {asI18n(override.subjectId)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {asI18n(
                          [
                            override.subjectKind === 'organization'
                              ? m.flags_override_kind_org()
                              : m.flags_override_kind_user(),
                            ...(override.grantedAt
                              ? [
                                  m.flags_override_since({
                                    at: grantedOn(override.grantedAt),
                                  }),
                                ]
                              : []),
                          ].join(' · ')
                        )}
                      </Text>
                    </Stack>
                    <Group gap={6} wrap="nowrap">
                      <StatusBadge
                        tone={override.enabled ? 'good' : 'neutral'}
                        size="sm"
                      >
                        {override.enabled
                          ? m.flags_override_on()
                          : m.flags_override_off()}
                      </StatusBadge>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        disabled={!writable || saving}
                        loading={
                          clearOverride.isPending &&
                          clearOverride.variables?.subject ===
                            subjectOf(override.subjectKind, override.subjectId)
                        }
                        aria-label={m.flags_override_clear()}
                        onClick={() =>
                          clearOverride.mutate({
                            name: flag.name,
                            subject: subjectOf(
                              override.subjectKind,
                              override.subjectId
                            ),
                          })
                        }
                      >
                        <X size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Paper>
              ))
            )}

            {writable &&
              overridesSupported &&
              (adding ? (
                <Paper variant="inset" px="md" py="sm">
                  <Stack gap="sm">
                    <Group gap={8} wrap="nowrap">
                      <Select
                        w={150}
                        allowDeselect={false}
                        value={subjectKind}
                        onChange={(value) => value && setSubjectKind(value)}
                        aria-label={m.flags_override_kind()}
                        data={[
                          {
                            value: 'organization',
                            label: m.flags_override_kind_org(),
                          },
                          { value: 'user', label: m.flags_override_kind_user() },
                        ]}
                      />
                      <TextInput
                        flex={1}
                        autoFocus
                        placeholder={
                          subjectKind === 'organization'
                            ? m.flags_override_subject_org()
                            : m.flags_override_subject_user()
                        }
                        value={subjectId}
                        data-testid="flag-override-subject"
                        onChange={(event) =>
                          setSubjectId(event.currentTarget.value)
                        }
                      />
                    </Group>
                    <Group gap={6} justify="flex-end">
                      <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => {
                          setAdding(false)
                          setSubjectId('')
                        }}
                      >
                        {m.flags_confirm_cancel()}
                      </Button>
                      <Button
                        size="xs"
                        variant="default"
                        disabled={!subjectId.trim() || setOverride.isPending}
                        loading={
                          setOverride.isPending &&
                          setOverride.variables?.enabled === false
                        }
                        onClick={() => pin(false)}
                      >
                        {m.flags_override_keep_out()}
                      </Button>
                      <Button
                        size="xs"
                        color="green"
                        disabled={!subjectId.trim() || setOverride.isPending}
                        loading={
                          setOverride.isPending &&
                          setOverride.variables?.enabled === true
                        }
                        onClick={() => pin(true)}
                      >
                        {m.flags_override_let_in()}
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              ) : (
                <Button
                  variant="subtle"
                  justify="flex-start"
                  leftSection={<Plus size={14} />}
                  data-testid="flag-override-add"
                  onClick={() => setAdding(true)}
                >
                  {m.flags_override_add()}
                </Button>
              ))}
          </Stack>

          <ForDevelopers testId="flag-dev" hint={m.flags_panel_dev_hint()}>
            <Stack gap={2}>
              {[
                `name: ${flag.name}`,
                `enabled: ${flag.enabled}`,
                `rolloutPercent: ${flag.rolloutPercent ?? 'null'}`,
                `anyOf: ${flag.anyOf?.join(', ') || '—'}`,
                `declared: ${flag.declared} · backed: ${flag.backed}`,
                ...overrides.map(
                  (o) =>
                    `${o.subjectKind} ${o.subjectId} → ${o.enabled ? 'on' : 'off'}${o.grantedBy ? ` · by ${o.grantedBy}` : ''}`
                ),
              ].map((line) => (
                <Text
                  key={line}
                  size="xs"
                  c="dimmed"
                  ff="monospace"
                  style={{ wordBreak: 'break-all' }}
                >
                  {asI18n(line)}
                </Text>
              ))}
            </Stack>
          </ForDevelopers>
        </Stack>
      )}
    </ConsolePanel>
  )
}
