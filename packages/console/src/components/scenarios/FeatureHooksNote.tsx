import React from 'react'
import { Box, Stack, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'

type FeatureHooksNoteProps = {
  hasBefore: boolean
  hasAfter: boolean
}

/**
 * Feature hooks run once around the whole group, never per scenario — the one
 * thing a feature deliberately cannot express is gherkin's `Background:`. The
 * wording says so outright, because assuming otherwise is the common misread.
 */
export const FeatureHooksNote: React.FC<FeatureHooksNoteProps> = ({
  hasBefore,
  hasAfter,
}) => {
  if (!hasBefore && !hasAfter) return null

  return (
    <Box
      data-testid="feature-hooks"
      style={{
        border: '1px dashed var(--mantine-color-default-border)',
        borderRadius: 10,
        padding: '10px 14px',
      }}
    >
      <Stack gap={2}>
        <Text size="xs" fw={600} c="dimmed">
          {m.scenarios_group_hooks()}
        </Text>
        {hasBefore && (
          <Text size="sm" c="dimmed">
            {m.scenarios_group_before()}
          </Text>
        )}
        {hasAfter && (
          <Text size="sm" c="dimmed">
            {m.scenarios_group_after()}
          </Text>
        )}
      </Stack>
    </Box>
  )
}
