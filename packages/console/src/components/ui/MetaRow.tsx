import React from 'react'
import { Box, Text } from '@mantine/core'
import classes from './console.module.css'

export interface MetaRowProps {
  label: string
  labelWidth?: number
  align?: 'center' | 'flex-start'
  gap?: number
  children: React.ReactNode
}

export const MetaRow: React.FunctionComponent<MetaRowProps> = ({
  label,
  labelWidth = 85,
  align = 'center',
  gap,
  children,
}) => (
  <Box className={classes.metaRow} style={align !== 'center' || gap ? { alignItems: align, ...(gap ? { gap } : {}) } : undefined}>
    <Text
      size="sm"
      ff="monospace"
      c="var(--app-meta-label)"
      className={classes.metaRowLabel}
      style={{ minWidth: labelWidth }}
    >
      {label}
    </Text>
    <Box className={classes.metaRowContent}>{children}</Box>
  </Box>
)
