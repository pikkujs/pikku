import React from 'react'
import { Box, Stack } from '@pikku/mantine/core'

type PlanItemCardProps = { children: React.ReactNode }

/** One thing the plan names, as a raised block inside its section. */
export const PlanItemCard: React.FC<PlanItemCardProps> = ({ children }) => {
  return (
    <Box
      style={{
        border: '1px solid var(--app-border)',
        borderRadius: 6,
        padding: 10,
        background: 'var(--app-panel-bg-raised)',
      }}
    >
      <Stack gap={6}>{children}</Stack>
    </Box>
  )
}
