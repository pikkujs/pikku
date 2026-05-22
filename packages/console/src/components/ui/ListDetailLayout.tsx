import React from 'react'
import { Box, Text } from '@mantine/core'
import classes from './console.module.css'

export interface ListDetailLayoutProps {
  list: React.ReactNode
  detail: React.ReactNode
  emptyMessage?: string
  hasSelection: boolean
  collapsible?: boolean
  listWidth?: number | string
  height?: string
}

export const ListDetailLayout: React.FC<ListDetailLayoutProps> = ({
  list,
  detail,
  emptyMessage = 'Select an item',
  hasSelection,
  collapsible = false,
  listWidth,
  height,
}) => (
  <Box className={classes.listDetailContainer} style={height ? { height } : undefined}>
    <Box
      className={listWidth ? classes.listPaneFixed : classes.listPaneFlex}
      style={listWidth ? { width: listWidth, minWidth: typeof listWidth === 'number' ? Math.round(listWidth * 0.78) : undefined } : undefined}
    >
      {list}
    </Box>
    {(!collapsible || hasSelection) && (
      <Box className={classes.detailPane}>
        {hasSelection ? (
          detail
        ) : (
          <Box className={classes.emptyState}>
            <Text c="dimmed" ff="monospace" size="sm">
              {emptyMessage}
            </Text>
          </Box>
        )}
      </Box>
    )}
  </Box>
)
