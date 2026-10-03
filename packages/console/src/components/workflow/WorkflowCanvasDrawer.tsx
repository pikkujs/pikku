import React, { useEffect, useMemo, useRef } from 'react'
import { Box, Drawer } from '@pikku/mantine/core'
import { useCanvasDrawerContext } from '../../context/DrawerContext'
import { useConsoleChrome } from '../../context/ConsoleChromeContext'
import { usePanelContextSafe } from '../../context/PanelContext'
import { createCanvasDrawerContent } from '../canvas-drawer/CanvasDrawerFactory'

const PANEL_TITLE = 'Add a node'

/**
 * The surface the canvas opens for add-step and friends.
 *
 * Standalone this is an overlay drawer pinned to the viewport rather than to
 * whatever pane the graph sits in — which is why it is separate from the graph
 * panel at all.
 *
 * Embedded, that pinning is exactly wrong: the console is one card inside a
 * host's page, so a viewport-fixed overlay floats over the host's own chrome
 * and ignores the end-edge panel it already has. There the canvas state is
 * mirrored into the panel context instead and the host renders it wherever it
 * puts panels. The content is the same either way — a catalogue that reads only
 * app-level RPC metadata, so it survives being rendered outside the page's
 * provider tree.
 */
export const WorkflowCanvasDrawer: React.FC = () => {
  const { canvasDrawer, closeCanvasDrawer } = useCanvasDrawerContext()
  const panel = usePanelContextSafe()
  const asPanel = useConsoleChrome() === 'host' && !!panel

  const drawerContent = useMemo(() => {
    return canvasDrawer ? createCanvasDrawerContent(canvasDrawer.data) : null
  }, [canvasDrawer])

  const openPanel = panel?.openPanel
  const panels = panel?.panels
  const panelId = canvasDrawer ? `workflowCanvas-${canvasDrawer.id}` : null

  useEffect(() => {
    if (!asPanel || !openPanel || !canvasDrawer) return
    openPanel('workflowCanvas', canvasDrawer.id, PANEL_TITLE, {
      data: canvasDrawer.data,
    })
  }, [asPanel, openPanel, canvasDrawer])

  // The host owns the close control, so the canvas state has to follow it down:
  // left set, the affordance that opened this would look inert on the next
  // click. Only once the panel has been SEEN open — on the render that requests
  // it, the map legitimately does not have it yet.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (!asPanel || !panelId) {
      wasOpen.current = false
      return
    }
    if (panels?.has(panelId)) {
      wasOpen.current = true
    } else if (wasOpen.current) {
      wasOpen.current = false
      closeCanvasDrawer()
    }
  }, [asPanel, panelId, panels, closeCanvasDrawer])

  if (asPanel) return null

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
