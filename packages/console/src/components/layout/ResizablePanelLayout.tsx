import React from 'react'
import { Box } from '@pikku/mantine/core'
import type { I18nNode, I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { PanelContainer } from '../panel/PanelContainer'
import { usePanelContext } from '../../context/PanelContext'
import { useConsoleChrome } from '../../context/ConsoleChromeContext'
import { ConsoleDetailPanel } from '../shell/ConsoleDetailPanel'
import { ConsoleListPanel } from '../shell/ConsoleListPanel'
import { ConsoleSidePanel } from '../shell/ConsoleSidePanel'
import { PageOptionsPortal } from '../shell/PageOptionsPortal'
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
  /** Names the drawer on the phone's tab for the sheet it moves into ("Notes",
   *  "Features"). Falls back to the generic "Options". */
  leftDrawerLabel?: I18nString
  /** A form or inspector reading FROM what is on screen — the email composer's
   *  variables, say. Its own card on the end edge, never a column welded into the
   *  page card, and the same bottom sheet as everything else on a phone. */
  sidePanel?: React.ReactNode
  sidePanelWidth?: number
  sidePanelLabel?: I18nString
  emptyPanelMessage?: I18nNode
  hidePanel?: boolean
}

export const ResizablePanelLayout: React.FC<ResizablePanelLayoutProps> = ({
  children,
  header,
  leftDrawer,
  leftDrawerWidth = 260,
  leftDrawerLabel,
  sidePanel,
  sidePanelWidth = 320,
  sidePanelLabel,
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
  // A phone has no room beside anything: both side surfaces move into the one
  // bottom sheet the foot bar opens. Only one may claim it, and the navigator
  // wins — it is what decides what the page is showing at all.
  const listInSheet = !!leftDrawer && phone
  const sideInSheet = !!sidePanel && phone && !listInSheet

  return (
    <Box className={classes.flexColumn} style={{ flex: 1, minHeight: 0 }}>
      {/* header renders as a full-bleed bar; the panel area below stays padded */}
      {header}
      <Box
        className={`${classes.flexColumn} ${classes.flushBody}`}
        style={{
          flex: 1,
          minHeight: 0,
        }}
      >
        <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {listInSheet && (
            <PageOptionsPortal label={leftDrawerLabel}>
              <Box
                className={classes.flexColumn}
                style={{ flex: 1, minHeight: 0, width: '100%' }}
                data-testid="left-drawer-sheet"
              >
                {leftDrawer}
              </Box>
            </PageOptionsPortal>
          )}
          {sideInSheet && (
            <PageOptionsPortal label={sidePanelLabel}>
              <Box
                className={classes.flexColumn}
                style={{ flex: 1, minHeight: 0, width: '100%' }}
                data-testid="side-panel-sheet"
              >
                {sidePanel}
              </Box>
            </PageOptionsPortal>
          )}
          {leftDrawer &&
            !listInSheet &&
            (listAsPanel ? (
              <ConsoleListPanel
                width={leftDrawerWidth + CARD_GUTTERS}
                testId="console-list-panel"
              >
                {leftDrawer}
              </ConsoleListPanel>
            ) : (
              <Box
                className={classes.paneDockEnd}
                style={{
                  width: leftDrawerWidth,
                  flexShrink: 0,
                  overflow: 'hidden',
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
          {sidePanel &&
            !sideInSheet &&
            (ownsChrome || phone ? (
              <Box
                className={`${classes.listSurfaceCard} ${classes.paneDock}`}
                style={{
                  width: sidePanelWidth,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {sidePanel}
              </Box>
            ) : (
              <ConsoleSidePanel
                width={sidePanelWidth + CARD_GUTTERS}
                testId="console-side-panel"
              >
                {sidePanel}
              </ConsoleSidePanel>
            ))}

          {!ownsChrome && !hidePanel && (
            <ConsoleDetailPanel emptyMessage={emptyPanelMessage} />
          )}
          {ownsChrome && !hidePanel && (
            <Box
              style={{
                width: rightOpen ? PANEL_WIDTH : 0,
                flexShrink: 0,
                overflow: 'hidden',
                transition: 'width 180ms ease',
              }}
            >
              <Box
                className={`${classes.listSurfaceCard} ${classes.paneDock}`}
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
