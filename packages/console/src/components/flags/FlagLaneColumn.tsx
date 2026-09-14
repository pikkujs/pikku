import { Badge, Group, Stack, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { FlagCard } from './FlagCard'
import type { FlagBoardRow, FlagLaneId } from './flag-lanes'

/** Lane copy as maps of message FUNCTIONS keyed by the lane id — the only form
 *  a renamed message can fail the build on. */
export const LANE_TITLE: Record<FlagLaneId, () => I18nString> = {
  dark: m.flags_lane_dark,
  rolling: m.flags_lane_rolling,
  live: m.flags_lane_live,
  attention: m.flags_lane_attention,
}

export const LANE_HINT: Record<FlagLaneId, () => I18nString> = {
  dark: m.flags_lane_dark_hint,
  rolling: m.flags_lane_rolling_hint,
  live: m.flags_lane_live_hint,
  attention: m.flags_lane_attention_hint,
}

const LANE_COLOR: Record<FlagLaneId, string> = {
  dark: 'gray',
  rolling: 'blue',
  live: 'teal',
  attention: 'orange',
}

type FlagLaneColumnProps = {
  lane: FlagLaneId
  flags: FlagBoardRow[]
  selectedName: string | null
  onOpen: (flag: FlagBoardRow) => void
}

/**
 * One column of the launch board.
 *
 * An empty lane still draws, because the board is read as a journey — a flag
 * moves left to right — and a column that disappears when it empties takes the
 * journey with it.
 */
export const FlagLaneColumn: React.FC<FlagLaneColumnProps> = ({
  lane,
  flags,
  selectedName,
  onOpen,
}) => {
  return (
    <Stack
      gap={10}
      data-testid="flag-lane"
      data-lane={lane}
      style={{ minWidth: 0 }}
    >
      <Stack gap={2}>
        <Group gap={6} align="center">
          <Text
            component="h3"
            size="xs"
            fw={700}
            tt="uppercase"
            style={{ letterSpacing: 0.6 }}
          >
            {LANE_TITLE[lane]()}
          </Text>
          <Badge
            size="xs"
            variant="light"
            color={flags.length === 0 ? 'gray' : LANE_COLOR[lane]}
          >
            {flags.length}
          </Badge>
        </Group>
        <Text
          size="xs"
          c="dimmed"
          lineClamp={2}
          style={{ minHeight: 'calc(2 * 1.45em)' }}
        >
          {LANE_HINT[lane]()}
        </Text>
      </Stack>

      <Stack gap={8}>
        {flags.length === 0 ? (
          <Text size="xs" c="dimmed" fs="italic">
            {m.flags_lane_empty()}
          </Text>
        ) : (
          flags.map((flag) => (
            <FlagCard
              key={flag.name}
              flag={flag}
              selected={flag.name === selectedName}
              onOpen={onOpen}
            />
          ))
        )}
      </Stack>
    </Stack>
  )
}
