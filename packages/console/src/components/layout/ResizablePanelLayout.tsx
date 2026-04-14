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

export const ResizablePanelLayout: React.FunctionComponent<
  ResizablePanelLayoutProps
> = ({
  children,
  header,
  minSize = 400,
  emptyPanelMessage,
  showTabs = false,
  hidePanel = false,
}) => {
  const { panels } = usePanelContext()
  const alwaysVisible = !showTabs
  const showPanel = !hidePanel && (alwaysVisible || panels.size !== 0)

  return (
    <Box className={classes.flexColumn} style={{ height: '100vh' }}>
      {header}
      <Box className={classes.flexGrow} style={{ minHeight: 0 }}>
        <Allotment
          key={showPanel ? 'with-panel' : 'no-panel'}
          defaultSizes={[840, 400]}
        >
          <Allotment.Pane>
            <Box className={`${classes.flexColumn} ${classes.overflowAuto}`}>{children}</Box>
          </Allotment.Pane>
          <Allotment.Pane
            visible={showPanel}
            minSize={minSize}
            maxSize={500}
            preferredSize={400}
          >
            <Box className={`${classes.flexColumn} ${classes.overflowAuto}`}>
              <PanelContainer
                showTabs={showTabs}
                emptyMessage={emptyPanelMessage}
              />
            </Box>
          </Allotment.Pane>
        </Allotment>
      </Box>
    </Box>
  )
}
