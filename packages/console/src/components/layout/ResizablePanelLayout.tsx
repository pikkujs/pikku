import React from 'react'
import { Box } from '@mantine/core'
import { PanelContainer } from '../panel/PanelContainer'
import { usePanelContext } from '../../context/PanelContext'
import classes from '../ui/console.module.css'
import { PageContainer } from './PageLayout'

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
  emptyPanelMessage,
  showTabs = false,
  hidePanel = false,
}) => {
  const { panels } = usePanelContext()
  const showPanel = !hidePanel && panels.size !== 0

  return (
    <PageContainer
      fullWidth
      contentGap="xs"
      style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
      header={header}
    >
      <Box style={{ display: 'flex', flex: 1, minHeight: 0, gap: 'var(--mantine-spacing-md)' }}>
        <Box className={`${classes.flexColumn} ${classes.overflowAuto}`} style={{ flex: 1, minWidth: 0, height: '100%' }}>
          {children}
        </Box>

        {showPanel && (
          <Box
            style={{
              width: 'min(520px, 42vw)',
              minWidth: 'min(420px, 32vw)',
              flexShrink: 0,
            }}
          >
            <Box className={`${classes.flexColumn} ${classes.listSurfaceCard}`} style={{ height: '100%' }}>
              <PanelContainer showTabs={showTabs} emptyMessage={emptyPanelMessage} />
            </Box>
          </Box>
        )}
      </Box>
    </PageContainer>
  )
}
