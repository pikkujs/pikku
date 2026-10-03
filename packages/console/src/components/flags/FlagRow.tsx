import { Box, Progress, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nString } from '@pikku/react'
import {
  AlertTriangle,
  Percent,
  ToggleLeft,
  ToggleRight,
  type LucideIcon,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { plural } from '@/i18n/plural'
import { CardRow } from '../ui/CardRow'
import type { StatusTone } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import {
  flagAttentionReason,
  flagLaneOf,
  type FlagBoardRow,
  type FlagLaneId,
} from './flag-lanes'

export const LANE_LOOK: Record<
  FlagLaneId,
  {
    tone: StatusTone
    Icon: LucideIcon
    title: () => I18nString
    hint: () => I18nString
  }
> = {
  attention: {
    tone: 'warn',
    Icon: AlertTriangle,
    title: m.flags_lane_attention,
    hint: m.flags_lane_attention_hint,
  },
  rolling: {
    tone: 'info',
    Icon: Percent,
    title: m.flags_lane_rolling,
    hint: m.flags_lane_rolling_hint,
  },
  live: {
    tone: 'good',
    Icon: ToggleRight,
    title: m.flags_lane_live,
    hint: m.flags_lane_live_hint,
  },
  dark: {
    tone: 'neutral',
    Icon: ToggleLeft,
    title: m.flags_lane_dark,
    hint: m.flags_lane_dark_hint,
  },
}

const ATTENTION_COPY = {
  unbacked: m.flags_attention_unbacked,
  undeclared: m.flags_attention_undeclared,
}

export const flagTitle = (name: string) => {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._:-]+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** One switch in the list: its state in words, what it is for, and how far it has rolled out. */
export const FlagRow: React.FC<{
  flag: FlagBoardRow
  selected: boolean
  onOpen: (flag: FlagBoardRow) => void
}> = ({ flag, selected, onOpen }) => {
  const lane = flagLaneOf(flag)
  const look = LANE_LOOK[lane]
  const attention = flagAttentionReason(flag)
  const rolling = lane === 'rolling'

  return (
    <Box data-testid="flag-card" data-flag-name={flag.name} data-lane={lane}>
      <CardRow
        leading={
          <StatusTile tone={look.tone}>
            <look.Icon size={18} />
          </StatusTile>
        }
        title={asI18n(flagTitle(flag.name))}
        meta={
          attention
            ? ATTENTION_COPY[attention]()
            : flag.description
              ? asI18n(flag.description)
              : undefined
        }
        trailing={
          rolling ? (
            <Stack gap={4} w={140}>
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
          ) : flag.anyOf && flag.anyOf.length > 0 ? (
            <Text size="xs" c="dimmed">
              {plural(
                flag.anyOf.length,
                m.flags_only_for_one,
                m.flags_only_for
              )}
            </Text>
          ) : undefined
        }
        onClick={() => onOpen(flag)}
        selected={selected}
      />
    </Box>
  )
}
