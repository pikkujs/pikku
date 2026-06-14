import React from 'react'
import { Box, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import classes from './console.module.css'

export interface MetaRowProps {
  label: I18nNode
  labelWidth?: number
  align?: 'center' | 'flex-start'
  gap?: number
  children: React.ReactNode
}

export const MetaRow: React.FC<MetaRowProps> = ({
  label,
  labelWidth = 85,
  align = 'center',
  gap,
  children,
}) => (
  <Box
    className={classes.metaRow}
    style={
      align !== 'center' || gap
        ? { alignItems: align, ...(gap ? { gap } : {}) }
        : undefined
    }
  >
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
