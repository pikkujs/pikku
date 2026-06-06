import React from 'react'
import { Box } from '@mantine/core'
import { PanelContainer } from '../panel/PanelContainer'
import { usePanelContext } from '../../context/PanelContext'
import classes from '../ui/console.module.css'

interface ThreePaneLayoutProps {
  children: React.ReactNode
  header?: React.ReactNode
  runsPanel?: React.ReactNode
  runsPanelVisible?: boolean
  emptyPanelMessage?: string
  showTabs?: boolean
  hidePanel?: boolean
}

export const ThreePaneLayout: React.FC<ThreePaneLayoutProps> = ({
  children,
  header,
  runsPanel,
  runsPanelVisible = true,
  emptyPanelMessage,
  showTabs = false,
  hidePanel = false,
}) => {
  const { panels } = usePanelContext()
  const alwaysVisible = !showTabs

  const showLeft = !!runsPanel && runsPanelVisible
  const showRight = !hidePanel && (alwaysVisible || panels.size !== 0)

  return (
    <Box className={classes.flexColumn} style={{ height: '100vh' }}>
      {header}
      <Box
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          gap: 'var(--mantine-spacing-md)',
          padding: 'var(--mantine-spacing-md)',
        }}
      >
        {/* Left card: runs / history panel */}
        <Box
          style={{
            width: showLeft ? 240 : 0,
            minWidth: showLeft ? 240 : 0,
            flexShrink: 0,
            overflow: 'hidden',
            opacity: showLeft ? 1 : 0,
            transition: 'width 180ms ease, min-width 180ms ease, opacity 180ms ease',
          }}
        >
          <Box className={classes.listSurfaceCard} style={{ height: '100%' }}>
            {runsPanel}
          </Box>
        </Box>

        {/* Center card: main content */}
        <Box
          className={classes.listSurfaceCard}
          style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
        >
          {children}
        </Box>

        {/* Right card: panel / detail */}
        <Box
          style={{
            width: showRight ? 'min(520px, 42vw)' : 0,
            flexShrink: 0,
            overflow: 'hidden',
            opacity: showRight ? 1 : 0,
            transition: 'width 180ms ease, opacity 180ms ease',
          }}
        >
          <Box className={classes.listSurfaceCard} style={{ height: '100%', width: 'min(520px, 42vw)' }}>
            <PanelContainer showTabs={false} emptyMessage={emptyPanelMessage} />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
