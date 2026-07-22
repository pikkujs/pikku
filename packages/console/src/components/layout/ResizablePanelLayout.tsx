import React from 'react'
import { Box } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { PanelContainer } from '../panel/PanelContainer'
import { usePanelContext } from '../../context/PanelContext'
import classes from '../ui/console.module.css'

const PANEL_WIDTH = 450

interface ResizablePanelLayoutProps {
  children: React.ReactNode
  header?: React.ReactNode
  leftDrawer?: React.ReactNode
  leftDrawerWidth?: number
  emptyPanelMessage?: I18nNode
  hidePanel?: boolean
}

export const ResizablePanelLayout: React.FC<ResizablePanelLayoutProps> = ({
  children,
  header,
  leftDrawer,
  leftDrawerWidth = 260,
  emptyPanelMessage,
  hidePanel = false,
}) => {
  const { panels } = usePanelContext()
  const rightOpen = !hidePanel && panels.size > 0

  return (
    <Box className={classes.flexColumn} style={{ flex: 1, minHeight: 0 }}>
      {/* header renders as a full-bleed bar; the panel area below stays padded */}
      {header}
      <Box
        className={classes.flexColumn}
        px="xl"
        py="md"
        style={{ flex: 1, minHeight: 0, gap: 'var(--mantine-spacing-md)' }}
      >
        <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {leftDrawer && (
            <Box
              style={{
                width: leftDrawerWidth,
                flexShrink: 0,
                overflow: 'hidden',
                marginRight: 'var(--mantine-spacing-md)',
              }}
            >
              {leftDrawer}
            </Box>
          )}
          <Box
            className={`${classes.flexColumn} ${classes.overflowAuto}`}
            style={{ flex: 1, minWidth: 0 }}
          >
            {children}
          </Box>
          {!hidePanel && (
            <Box
              style={{
                width: rightOpen ? PANEL_WIDTH : 0,
                marginLeft: rightOpen ? 'var(--mantine-spacing-md)' : 0,
                flexShrink: 0,
                overflow: 'hidden',
                transition: 'width 180ms ease, margin-left 180ms ease',
              }}
            >
              <Box
                className={classes.listSurfaceCard}
                style={{ width: PANEL_WIDTH, height: '100%' }}
              >
                <PanelContainer emptyMessage={emptyPanelMessage} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
