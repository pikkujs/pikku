import React from 'react'
import { Box, Text } from '@mantine/core'
import classes from './console.module.css'

export interface EmptyStateProps {
  message: string
}

export const EmptyState: React.FunctionComponent<EmptyStateProps> = ({
  message,
}) => (
  <Box className={classes.emptyState}>
    <Text c="dimmed" ff="monospace" size="sm">
      {message}
    </Text>
  </Box>
)
