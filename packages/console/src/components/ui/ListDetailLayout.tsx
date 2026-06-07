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
}) => {
  const showDetail = collapsible ? hasSelection : hasSelection || !!detail

  return (
    <Box
      className={classes.listDetailContainer}
      style={{
        ...(height ? { height } : undefined),
        gap: 'var(--mantine-spacing-md)',
      }}
    >
      <Box
        className={`${listWidth ? classes.listPaneFixed : classes.listPaneFlex} ${classes.listSurfaceCard}`}
        style={
          listWidth
            ? {
                width: listWidth,
                minWidth:
                  typeof listWidth === 'number'
                    ? Math.round(listWidth * 0.78)
                    : undefined,
              }
            : undefined
        }
      >
        {list}
      </Box>
      <Box
        className={`${classes.detailDrawerPane} ${classes.listSurfaceCard}`}
        style={{
          width: showDetail ? 'min(520px, 42vw)' : 0,
          minWidth: showDetail ? 'min(420px, 32vw)' : 0,
          opacity: showDetail ? 1 : 0,
        }}
        aria-hidden={!showDetail}
      >
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
    </Box>
  )
}
