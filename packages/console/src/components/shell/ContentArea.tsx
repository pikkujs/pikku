import { Box } from '@pikku/mantine/core'
import {
  PanelInsetProvider,
  usePanelInset,
} from '../../context/PanelInsetProvider'

/**
 * The content column every layout puts the routed screen into: a positioned box
 * that owns the panel portal root (side panels pin themselves to its end edge)
 * and pads the screen by whatever an open panel reserves — so the page card
 * SHRINKS beside the panel instead of hiding under it. One implementation, used
 * by every layout, so panels behave identically wherever they open.
 */
export function ContentArea({ children }: { children: React.ReactNode }) {
  return (
    <PanelInsetProvider>
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        <Box
          id="console-content-portal-root"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
        <PageSlot>{children}</PageSlot>
      </Box>
    </PanelInsetProvider>
  )
}

function PageSlot({ children }: { children: React.ReactNode }) {
  const { inset } = usePanelInset()
  return (
    <Box
      // The routed screen is the document's main landmark. Declared once here so
      // every layout gets it; without it a screen-reader user has no way to skip
      // the nav to reach the page they navigated to.
      component="main"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        paddingInlineEnd: inset,
      }}
    >
      {children}
    </Box>
  )
}
