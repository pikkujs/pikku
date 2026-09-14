import { useEffect, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { X } from 'lucide-react'
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
  type FlagBoardRow,
} from './flag-lanes'

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

/** A grant is attributed to an actor id the store holds and the console cannot
 *  resolve to a name. Show enough of it to tell two actors apart, with the whole
 *  id on the element for whoever needs to match it against a log. */
const shortId = (id: string) => (id.length > 10 ? `${id.slice(0, 8)}…` : id)

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
      { onSuccess: () => setSubjectId('') }
    )
  }

  return (
    <ConsolePanel
      opened={opened}
      onClose={onClose}
      width="lg"
      title={flag ? asI18n(flag.name) : undefined}
      testId="flag-panel"
    >
      {flag && (
        <Stack gap="md">
          {flag.description && (
            <Text size="sm" c="dimmed">
              {asI18n(flag.description)}
            </Text>
          )}

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

          <Stack gap={6}>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {m.flags_any_of()}
            </Text>
            {flag.anyOf && flag.anyOf.length > 0 ? (
              <Group gap={4}>
                {flag.anyOf.map((scope) => (
                  <Badge key={scope} size="sm" variant="light" color="gray">
                    {asI18n(scope)}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                {m.flags_any_of_none()}
              </Text>
            )}
          </Stack>

          <Divider />

          <Switch
            checked={flag.enabled}
            disabled={!writable || setEnabled.isPending}
            label={m.flags_panel_enabled()}
            data-testid="flag-enabled"
            onChange={(event) => toggle(event.currentTarget.checked)}
          />

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
                    color="red"
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

          <Stack gap={6}>
            <NumberInput
              label={m.flags_panel_rollout()}
              description={m.flags_panel_rollout_help()}
              value={flag.rolloutPercent ?? ''}
              min={0}
              max={100}
              suffix={m.flags_percent_suffix()}
              disabled={!writable || setRollout.isPending}
              data-testid="flag-rollout"
              onKeyDown={(event) => {
                // A typed percentage is committed by leaving the field, and
                // Enter is how a keyboard operator leaves one.
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              onBlur={(event) => {
                const raw = event.currentTarget.value.replace('%', '').trim()
                const percent = raw === '' ? null : Number(raw)
                if (percent === flag.rolloutPercent) return
                setRollout.mutate({ name: flag.name, percent })
              }}
            />
            {flag.rolloutPercent === null && (
              <Text size="xs" c="dimmed">
                {m.flags_rollout_none()}
              </Text>
            )}
          </Stack>

          <Divider />

          <Stack gap={8}>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {m.flags_panel_overrides()}
            </Text>

            {!overridesSupported && !overridesQuery.isLoading ? (
              <Text size="sm" c="dimmed">
                {m.flags_overrides_unsupported()}
              </Text>
            ) : overrides.length === 0 ? (
              <Text size="sm" c="dimmed">
                {m.flags_overrides_empty()}
              </Text>
            ) : (
              <Stack gap={6}>
                {overrides.map((override) => (
                  <Group
                    key={override.subjectId}
                    justify="space-between"
                    wrap="nowrap"
                    data-testid="flag-override"
                    data-subject-id={override.subjectId}
                  >
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Group gap={6} wrap="nowrap">
                        <Badge size="xs" variant="light" color="gray">
                          {asI18n(override.subjectKind)}
                        </Badge>
                        <Text size="sm" lineClamp={1}>
                          {asI18n(override.subjectId)}
                        </Text>
                      </Group>
                      {override.grantedBy && (
                        <Text
                          size="xs"
                          c="dimmed"
                          title={asI18n(override.grantedBy)}
                        >
                          {override.grantedAt
                            ? m.flags_override_granted_at({
                                by: shortId(override.grantedBy),
                                at: grantedOn(override.grantedAt),
                              })
                            : m.flags_override_granted_by({
                                by: shortId(override.grantedBy),
                              })}
                        </Text>
                      )}
                    </Stack>
                    <Group gap={6} wrap="nowrap">
                      <Badge
                        size="sm"
                        variant="light"
                        color={override.enabled ? 'teal' : 'gray'}
                      >
                        {override.enabled
                          ? m.flags_override_on()
                          : m.flags_override_off()}
                      </Badge>
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
                ))}
              </Stack>
            )}

            {writable && overridesSupported && (
              <Stack gap={6} mt={6}>
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                  {m.flags_override_add()}
                </Text>
                <SegmentedControl
                  size="xs"
                  value={subjectKind}
                  onChange={setSubjectKind}
                  data={[
                    {
                      value: 'organization',
                      label: m.flags_override_kind_org(),
                    },
                    { value: 'user', label: m.flags_override_kind_user() },
                  ]}
                />
                <Group gap={6} wrap="nowrap">
                  <TextInput
                    style={{ flex: 1 }}
                    size="xs"
                    placeholder={m.flags_override_subject_id()}
                    value={subjectId}
                    data-testid="flag-override-subject"
                    onChange={(event) =>
                      setSubjectId(event.currentTarget.value)
                    }
                  />
                  <Button
                    size="xs"
                    variant="light"
                    color="teal"
                    disabled={!subjectId.trim() || setOverride.isPending}
                    loading={
                      setOverride.isPending &&
                      setOverride.variables?.enabled === true
                    }
                    onClick={() => pin(true)}
                  >
                    {m.flags_override_on()}
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="gray"
                    disabled={!subjectId.trim() || setOverride.isPending}
                    loading={
                      setOverride.isPending &&
                      setOverride.variables?.enabled === false
                    }
                    onClick={() => pin(false)}
                  >
                    {m.flags_override_off()}
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        </Stack>
      )}
    </ConsolePanel>
  )
}
