import React from 'react'
import { Box, Text } from '@mantine/core'
import classes from './console.module.css'

export interface GridColumn {
  label: string
  align?: 'left' | 'right'
}

export interface GridHeaderProps {
  columns: GridColumn[]
  gridTemplateColumns: string
}

export const GridHeader: React.FunctionComponent<GridHeaderProps> = ({
  columns,
  gridTemplateColumns,
}) => (
  <Box className={classes.gridHeader} style={{ display: 'grid', gridTemplateColumns }}>
    {columns.map((col) => (
      <Text
        key={col.label}
        size="xs"
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
