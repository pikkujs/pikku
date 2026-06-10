import React from 'react'
import { Box } from '@mantine/core'
import { PanelContainer } from '../panel/PanelContainer'
import { usePanelContext } from '../../context/PanelContext'
import classes from '../ui/console.module.css'

const PANEL_WIDTH = 450

interface ResizablePanelLayoutProps {
  children: React.ReactNode
  header?: React.ReactNode
  leftDrawer?: React.ReactNode
  leftDrawerWidth?: number
  emptyPanelMessage?: string
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
    <Box className={classes.flexColumn} px="xl" py="md" style={{ height: '100vh', gap: 'var(--mantine-spacing-md)' }}>
      {header}
      <Box style={{ flex: 1, display: 'flex', minHeight: 0, gap: 'var(--mantine-spacing-md)' }}>
        {leftDrawer && (
          <Box style={{ width: leftDrawerWidth, flexShrink: 0, overflow: 'hidden' }}>
            {leftDrawer}
          </Box>
        )}
        <Box className={`${classes.flexColumn} ${classes.overflowAuto}`} style={{ flex: 1, minWidth: 0 }}>
          {children}
        </Box>
        {!hidePanel && (
          <Box style={{
            width: rightOpen ? PANEL_WIDTH : 0,
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'width 180ms ease',
          }}>
            <Box className={classes.listSurfaceCard} style={{ width: PANEL_WIDTH, height: '100%' }}>
              <PanelContainer emptyMessage={emptyPanelMessage} />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}
