import React from 'react'
import { Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import classes from './agent-run-scores.module.css'

export type ScoreReadoutProps = {
  scorerName: string
  score: number
  reason?: string
}

/**
 * One scorer's grade of one run: the name, the figure, and the width of the
 * figure. A judge's reason sits under it because it is written about this
 * answer and is the only part a reader can argue with.
 */
export const ScoreReadout: React.FC<ScoreReadoutProps> = ({
  scorerName,
  score,
  reason,
}) => {
  const clamped = Math.max(0, Math.min(1, score))

  return (
    <Stack gap={4}>
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Text size="sm" truncate>
          {asI18n(scorerName)}
        </Text>
        <Text size="sm" ff="monospace" fw={600}>
          {asI18n(score.toFixed(2))}
        </Text>
      </Group>
      <Box className={classes.scoreTrack}>
        <Box
          className={classes.scoreFill}
          style={{ width: `${clamped * 100}%` }}
        />
      </Box>
      {reason && (
        <Text size="xs" c="dimmed" className={classes.scoreReason}>
          {asI18n(reason)}
        </Text>
      )}
    </Stack>
  )
}
