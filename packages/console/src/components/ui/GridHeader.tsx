import React from 'react'
import { Box, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import classes from './console.module.css'

export interface GridColumn {
  label: I18nNode
  align?: 'left' | 'right'
}

export interface GridHeaderProps {
  columns: GridColumn[]
  gridTemplateColumns: string
}

export const GridHeader: React.FC<GridHeaderProps> = ({
  columns,
  gridTemplateColumns,
}) => (
  <Box
    className={classes.gridHeader}
    style={{ display: 'grid', gridTemplateColumns }}
  >
    {columns.map((col, i) => (
      <Text
        key={i}
        size="sm"
        fw={600}
        ff="monospace"
        c="var(--app-section-label)"
        tt="uppercase"
        className={classes.gridHeaderLabel}
        ta={col.align}
      >
        {col.label}
      </Text>
    ))}
  </Box>
)
