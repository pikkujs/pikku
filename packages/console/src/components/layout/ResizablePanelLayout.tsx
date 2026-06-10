import React from 'react'
import { Allotment } from 'allotment'
import { Box } from '@mantine/core'
import { PanelContainer } from '../panel/PanelContainer'
import { usePanelContext } from '../../context/PanelContext'
import classes from '../ui/console.module.css'

interface ResizablePanelLayoutProps {
  children: React.ReactNode
  header?: React.ReactNode
  minSize?: number
  emptyPanelMessage?: string
  showTabs?: boolean
  hidePanel?: boolean
}

export const ResizablePanelLayout: React.FC<ResizablePanelLayoutProps> = ({
  children,
  header,
  minSize = 267,
  emptyPanelMessage,
  showTabs = false,
  hidePanel = false,
}) => {
  const { panels } = usePanelContext()
  const showPanel = !hidePanel

  return (
    <Box className={classes.flexColumn} px="xl" py="md" style={{ height: '100vh', gap: 'var(--mantine-spacing-md)' }}>
      {header}
      <Box className={classes.flexGrow} style={{ minHeight: 0 }}>
        {showPanel ? (
          <Allotment key={panels.size === 0 ? 'empty-panel' : 'with-panel'} defaultSizes={[840, 267]}>
            <Allotment.Pane>
              <Box className={`${classes.flexColumn} ${classes.overflowAuto}`} style={{ minWidth: 0, height: '100%', paddingRight: 'var(--mantine-spacing-sm)' }}>
                {children}
              </Box>
            </Allotment.Pane>
            <Allotment.Pane minSize={minSize} maxSize={500} preferredSize={267}>
              <Box className={`${classes.flexColumn} ${classes.overflowAuto}`} style={{ minWidth: 0, height: '100%', paddingLeft: 'var(--mantine-spacing-sm)' }}>
                <PanelContainer emptyMessage={emptyPanelMessage} />
              </Box>
            </Allotment.Pane>
          </Allotment>
        ) : (
          <Box className={`${classes.flexColumn} ${classes.overflowAuto}`} style={{ minWidth: 0, height: '100%' }}>
            {children}
          </Box>
        )}
      </Box>
    </Box>
  )
}
