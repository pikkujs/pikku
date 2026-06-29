import React from 'react'
import { Box, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
import classes from './console.module.css'

export interface ListDetailLayoutProps {
  list: React.ReactNode
  detail: React.ReactNode
  emptyMessage?: I18nNode
  hasSelection: boolean
  collapsible?: boolean
  listWidth?: number | string
  height?: string
}

export const ListDetailLayout: React.FC<ListDetailLayoutProps> = ({
  list,
  detail,
  emptyMessage,
  hasSelection,
  collapsible = false,
  listWidth,
  height,
}) => {
  const { t } = useI18n()
  const showDetail = !collapsible || hasSelection
  const msg = emptyMessage ?? t('common.select_item')

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
                flex: '0 0 auto',
              }
            : undefined
        }
      >
        {list}
      </Box>
      <Box
        className={`${classes.detailDrawerPane} ${classes.listSurfaceCard}`}
        style={{
          flex: showDetail ? '1 0 auto' : undefined,
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
              {msg}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
