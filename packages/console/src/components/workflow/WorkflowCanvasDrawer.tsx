import React, { useMemo } from 'react'
import { Box, Drawer } from '@pikku/mantine/core'
import { useCanvasDrawerContext } from '../../context/DrawerContext'
import { createCanvasDrawerContent } from '../canvas-drawer/CanvasDrawerFactory'

/**
 * The overlay drawer the canvas opens for add-step and friends. Kept separate
 * from the graph panel because it is positioned against the viewport, not
 * against whatever pane the graph happens to be sitting in.
 */
export const WorkflowCanvasDrawer: React.FC = () => {
  const { canvasDrawer, closeCanvasDrawer } = useCanvasDrawerContext()

  const drawerContent = useMemo(() => {
    return canvasDrawer ? createCanvasDrawerContent(canvasDrawer.data) : null
  }, [canvasDrawer])

  return (
    <>
      {canvasDrawer && (
        <Box
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 98,
          }}
          onClick={closeCanvasDrawer}
        />
      )}
      <Drawer
        opened={canvasDrawer !== null}
        onClose={closeCanvasDrawer}
        position="right"
        size="md"
        withOverlay={false}
        withinPortal={false}
        closeOnClickOutside={false}
        withCloseButton={false}
        styles={{
          inner: {
            top: '50px',
            zIndex: 99,
          },
          content: {
            height: '100%',
          },
          header: {
            display: 'none',
          },
          body: {
            padding: 0,
          },
        }}
      >
        {drawerContent}
      </Drawer>
    </>
  )
}
