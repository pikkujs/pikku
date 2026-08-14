import React from 'react'
import { Box } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { PanelContainer } from '../panel/PanelContainer'
import { usePanelContext } from '../../context/PanelContext'
import { useConsoleChrome } from '../../context/ConsoleChromeContext'
import { ConsoleDetailPanel } from '../shell/ConsoleDetailPanel'
import { ConsoleListPanel } from '../shell/ConsoleListPanel'
import { usePhone } from '../../lib/breakpoints'
import classes from '../ui/console.module.css'

const PANEL_WIDTH = 450
/** The list panel carries the card's own gutter on both sides. */
const CARD_GUTTERS = 16

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
  // Under a host's chrome the selection opens in the end-edge panel instead of
  // a column welded into the list — same context, same content, a card of its
  // own beside the page rather than inside it.
  const ownsChrome = useConsoleChrome() === 'self'
  const phone = usePhone()
  const rightOpen = ownsChrome && !hidePanel && panels.size > 0
  // And the navigator that selects what the page shows becomes a panel of its
  // own on the start edge, for the same reason (see ConsoleListPanel).
  const listAsPanel = !ownsChrome && !phone

  return (
    <Box className={classes.flexColumn} style={{ flex: 1, minHeight: 0 }}>
      {/* header renders as a full-bleed bar; the panel area below stays padded */}
      {header}
      <Box
        className={classes.flexColumn}
        style={{
          flex: 1,
          minHeight: 0,
          gap: 'var(--mantine-spacing-md)',
          // The body is padded in both chrome modes — an embedding host's page
          // card is a bare card whose content supplies its own gutter (it cannot
          // pad the card itself without insetting the full-bleed header band
          // above). How much is the chrome's call, not this layout's.
          padding: 'var(--console-body-gutter)',
        }}
      >
        <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {leftDrawer &&
            (listAsPanel ? (
              <ConsoleListPanel
                width={leftDrawerWidth + CARD_GUTTERS}
                testId="console-list-panel"
              >
                {leftDrawer}
              </ConsoleListPanel>
            ) : (
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
            ))}
          <Box
            className={`${classes.flexColumn} ${classes.overflowAuto}`}
            style={{ flex: 1, minWidth: 0 }}
          >
            {children}
          </Box>
          {!ownsChrome && !hidePanel && (
            <ConsoleDetailPanel emptyMessage={emptyPanelMessage} />
          )}
          {ownsChrome && !hidePanel && (
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
