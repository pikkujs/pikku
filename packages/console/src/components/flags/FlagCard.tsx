import {
  Badge,
  Group,
  Progress,
  Stack,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import {
  flagAttentionReason,
  flagLaneOf,
  type FlagBoardRow,
} from './flag-lanes'
import { appColorVars } from '@pikku/mantine/theme'

type FlagCardProps = {
  flag: FlagBoardRow
  selected: boolean
  onOpen: (flag: FlagBoardRow) => void
}

/** The attention reason as copy. A map of message FUNCTIONS rather than an
 *  assembled key, so a renamed message fails the build. */
const ATTENTION_COPY = {
  unbacked: m.flags_attention_unbacked,
  undeclared: m.flags_attention_undeclared,
}

/**
 * One flag on the launch board.
 *
 * The card carries only what distinguishes flags from each other in the same
 * lane — the rollout share, the capability constraint, the reason it needs
 * attention. The lane it sits in already says what state it is in, so repeating
 * that on every card would be noise.
 */
export const FlagCard: React.FC<FlagCardProps> = ({
  flag,
  selected,
  onOpen,
}) => {
  const attention = flagAttentionReason(flag)
  const rolling = flag.rolloutPercent !== null && flag.rolloutPercent < 100

  return (
    <UnstyledButton
      onClick={() => onOpen(flag)}
      data-testid="flag-card"
      data-flag-name={flag.name}
      data-lane={flagLaneOf(flag)}
      data-selected={selected || undefined}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: 12,
        borderRadius: 8,
        background: 'var(--app-panel-bg)',
        border: `0.5px solid ${selected ? 'var(--mantine-primary-color-filled)' : 'var(--app-border)'}`,
        boxShadow: selected
          ? '0 0 0 1px var(--mantine-primary-color-filled)'
          : undefined,
      }}
    >
      <Stack gap={8}>
        <Text component="h4" size="sm" fw={600} lineClamp={1}>
          {asI18n(flag.name)}
        </Text>

        {flag.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {asI18n(flag.description)}
          </Text>
        )}

        {attention && (
          <Text size="xs" style={{ color: appColorVars.amber }}>
            {ATTENTION_COPY[attention]()}
          </Text>
        )}

        {rolling && (
          <Stack gap={4}>
            <Progress
              value={flag.rolloutPercent ?? 0}
              size="sm"
              radius="xl"
              aria-label={m.flags_panel_rollout()}
            />
            <Text size="xs" c="dimmed">
              {m.flags_rollout_percent({ percent: flag.rolloutPercent ?? 0 })}
            </Text>
          </Stack>
        )}

        {flag.anyOf && flag.anyOf.length > 0 && (
          <Group gap={4}>
            {flag.anyOf.map((scope) => (
              <Badge key={scope} size="xs" variant="light" color="gray">
                {asI18n(scope)}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>
    </UnstyledButton>
  )
}
