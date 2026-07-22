import React from 'react'
import { Box } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { PanelContainer } from '../panel/PanelContainer'
import { usePanelContext } from '../../context/PanelContext'
import classes from '../ui/console.module.css'

interface ThreePaneLayoutProps {
  children: React.ReactNode
  header?: React.ReactNode
  runsPanel?: React.ReactNode
  runsPanelVisible?: boolean
  emptyPanelMessage?: I18nNode
  showTabs?: boolean
  hidePanel?: boolean
  collapseWhenEmpty?: boolean
}

export const ThreePaneLayout: React.FC<ThreePaneLayoutProps> = ({
  children,
  header,
  runsPanel,
  runsPanelVisible = true,
  emptyPanelMessage,
  showTabs = false,
  hidePanel = false,
  collapseWhenEmpty = false,
}) => {
  const { panels } = usePanelContext()
  const alwaysVisible = !showTabs

  const showLeft = !!runsPanel && runsPanelVisible
  const showRight =
    !hidePanel && (panels.size !== 0 || (alwaysVisible && !collapseWhenEmpty))

  return (
    <Box className={classes.flexColumn} style={{ flex: 1, minHeight: 0 }}>
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
        <Box
          style={{
            width: showLeft ? 240 : 0,
            minWidth: showLeft ? 240 : 0,
            flexShrink: 0,
            overflow: 'hidden',
            opacity: showLeft ? 1 : 0,
            transition:
              'width 180ms ease, min-width 180ms ease, opacity 180ms ease',
          }}
        >
          <Box className={classes.listSurfaceCard} style={{ height: '100%' }}>
            {runsPanel}
          </Box>
        </Box>

        <Box
          className={classes.listSurfaceCard}
          style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
        >
          {children}
        </Box>

        <Box
          style={{
            width: showRight ? 'min(520px, 42vw)' : 0,
            flexShrink: 0,
            overflow: 'hidden',
            opacity: showRight ? 1 : 0,
            transition: 'width 180ms ease, opacity 180ms ease',
          }}
        >
          <Box
            className={classes.listSurfaceCard}
            style={{ height: '100%', width: 'min(520px, 42vw)' }}
          >
            <PanelContainer
              emptyMessage={emptyPanelMessage}
              workflowGraph={false}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
