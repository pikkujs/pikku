import React from 'react'
import { ActionIcon, Box, Tooltip, UnstyledButton } from '@pikku/mantine/core'
import type { I18nNode, I18nString } from '@pikku/react'
import { useLocalStorage } from '@mantine/hooks'
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { PanelContainer } from '../panel/PanelContainer'
import { usePanelContext } from '../../context/PanelContext'
import { useConsoleChrome } from '../../context/ConsoleChromeContext'
import { ConsoleDetailPanel } from '../shell/ConsoleDetailPanel'
import { ConsoleListPanel } from '../shell/ConsoleListPanel'
import { PageOptionsPortal } from '../shell/PageOptionsPortal'
import { PaneCollapseProvider } from '../../context/PaneCollapseContext'
import { usePhone } from '../../lib/breakpoints'
import classes from '../ui/console.module.css'

/** The list's content width, and the rail it collapses to. */
const LIST_WIDTH = 240
const LIST_RAIL_WIDTH = 40
/** As a panel each also carries the card's own gutter on both sides. */
const CARD_GUTTERS = 16

interface ThreePaneLayoutProps {
  children: React.ReactNode
  header?: React.ReactNode
  /** Rendered in the middle pane's own header bar (selector / title). Both the
   *  agents and workflow playgrounds use this so their headers match. */
  lead?: React.ReactNode
  /** Extra controls (badges) sitting next to `lead` in the middle header. */
  filters?: React.ReactNode
  runsPanel?: React.ReactNode
  runsPanelVisible?: boolean
  emptyPanelMessage?: I18nNode
  showTabs?: boolean
  hidePanel?: boolean
  collapseWhenEmpty?: boolean
  /** Namespaces the persisted left/right collapse state so different playgrounds
   *  (agents, workflow) remember their panes independently. */
  storageKey?: string
  /** Noun shown on the collapsed left rail, and on the phone's tab for the sheet
   *  the same pane moves into (e.g. "Conversations", "Runs"). A string, not a
   *  node: a tab reads its label out as its accessible name. Falls back to the
   *  generic "List". */
  listLabel?: I18nString
  /** Noun shown on the collapsed right rail. Falls back to "Details". */
  detailLabel?: I18nNode
}

export const ThreePaneLayout: React.FC<ThreePaneLayoutProps> = ({
  children,
  header,
  lead,
  filters,
  runsPanel,
  runsPanelVisible = true,
  emptyPanelMessage,
  showTabs = false,
  hidePanel = false,
  collapseWhenEmpty = false,
  storageKey = 'three-pane',
  listLabel,
  detailLabel,
}) => {
  useLocale()
  const { panels } = usePanelContext()
  const ownsChrome = useConsoleChrome() === 'self'
  const phone = usePhone()
  const alwaysVisible = !showTabs

  const [leftCollapsed, setLeftCollapsed] = useLocalStorage({
    key: `${storageKey}-left-collapsed`,
    defaultValue: false,
  })
  const [rightCollapsed, setRightCollapsed] = useLocalStorage({
    key: `${storageKey}-right-collapsed`,
    defaultValue: false,
  })

  const hasLeft = !!runsPanel && runsPanelVisible
  /**
   * The details pane is this layout's own copy of `PanelContainer`, a third
   * column in the page card. Under a host's chrome the same selection opens in
   * the end-edge panel instead — a card of its own beside the page — so keeping
   * the column would render the open panel twice at once.
   */
  const hasRight =
    ownsChrome &&
    !hidePanel &&
    (panels.size !== 0 || (alwaysVisible && !collapseWhenEmpty))

  /**
   * On a phone the pane is the bottom sheet, opened from the foot bar — there is
   * no second column to be beside, and a 240px list in a 390px viewport leaves
   * the surface it selects for unusable. It is never collapsed there: closing the
   * sheet already IS the collapse.
   */
  const listInSheet = hasLeft && phone
  const showLeft = hasLeft && (phone || !leftCollapsed)
  const showRight = hasRight && !rightCollapsed

  /**
   * Under a host's chrome the list opens as a PANEL on the content column's
   * start edge — its own card beside the page, the mirror of the detail panel on
   * the other edge — because choosing what the page shows is a different job
   * from showing it. Standalone the layout draws the only card there is, and on
   * a phone there is nothing to sit beside, so both keep the docked column.
   */
  const listAsPanel = !ownsChrome && !phone

  const listBody = listInSheet ? (
    runsPanel
  ) : showLeft ? (
    // The panel renders the collapse control itself, in a row it already has —
    // see PaneCollapseContext.
    <PaneCollapseProvider collapse={() => setLeftCollapsed(true)}>
      {runsPanel}
    </PaneCollapseProvider>
  ) : (
    <Tooltip label={m.pane_show_list()} position="right">
      <UnstyledButton
        className={listAsPanel ? classes.paneStubFlush : classes.paneStub}
        aria-label={m.pane_show_list()}
        onClick={() => setLeftCollapsed(false)}
      >
        <PanelLeftOpen size={16} />
        <span className={classes.paneStubLabel}>
          {listLabel ?? m.pane_list()}
        </span>
      </UnstyledButton>
    </Tooltip>
  )

  // The middle pane's header carries only its own content (selector/badges) —
  // each side pane owns the control that collapses it.
  const showPaneHeader = !!lead || !!filters

  // Once the list has moved out to a panel of its own, the middle pane IS the
  // page card's body, so it drops the border that would read as a card in a
  // card. It keeps it wherever a docked list still sits beside it.
  const mainSurface =
    !ownsChrome && (!hasLeft || listAsPanel || listInSheet)
      ? classes.listSurfaceFlush
      : classes.listSurfaceCard

  return (
    <Box className={classes.flexColumn} style={{ flex: 1, minHeight: 0 }}>
      {header}
      <Box
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          gap: 'var(--mantine-spacing-md)',
          padding: 'var(--console-body-gutter)',
        }}
      >
        {listInSheet && (
          <PageOptionsPortal label={listLabel ?? m.pane_list()}>
            <Box
              className={classes.flexColumn}
              style={{ flex: 1, minHeight: 0, width: '100%' }}
              data-testid="pane-list-sheet"
            >
              {listBody}
            </Box>
          </PageOptionsPortal>
        )}

        {hasLeft &&
          !listInSheet &&
          (listAsPanel ? (
            <ConsoleListPanel
              width={(showLeft ? LIST_WIDTH : LIST_RAIL_WIDTH) + CARD_GUTTERS}
              testId="console-list-panel"
            >
              {listBody}
            </ConsoleListPanel>
          ) : (
            <Box
              className={classes.paneCollapseTransition}
              style={{
                width: showLeft ? LIST_WIDTH : LIST_RAIL_WIDTH,
                minWidth: showLeft ? LIST_WIDTH : LIST_RAIL_WIDTH,
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {showLeft ? (
                <Box
                  className={classes.listSurfaceCard}
                  style={{ height: '100%' }}
                >
                  {listBody}
                </Box>
              ) : (
                listBody
              )}
            </Box>
          ))}

        <Box
          className={mainSurface}
          style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
        >
          {showPaneHeader && (
            <Box
              px={8}
              style={{
                height: 42,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderBottom: '1px solid var(--app-border)',
              }}
            >
              <Box
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {lead}
                {filters}
              </Box>
            </Box>
          )}
          <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {children}
          </Box>
        </Box>

        {!ownsChrome && !hidePanel && (
          <ConsoleDetailPanel
            emptyMessage={emptyPanelMessage}
            workflowGraph={false}
          />
        )}

        {hasRight && (
          <Box
            className={classes.paneCollapseTransition}
            style={{
              width: showRight ? 'min(520px, 42vw)' : 40,
              minWidth: showRight ? undefined : 40,
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {showRight ? (
              <Box
                className={classes.listSurfaceCard}
                style={{
                  height: '100%',
                  width: 'min(520px, 42vw)',
                  position: 'relative',
                }}
              >
                <PanelContainer
                  emptyMessage={emptyPanelMessage}
                  workflowGraph={false}
                  hideClose
                  hideRootTitle={!!lead}
                />
                {/* Overlaid rather than given a header row of its own — with the
                    root title suppressed that row would be empty but for this
                    icon, pushing the panel down a line. The offset lines it up
                    with the panel's own title row and its actions. */}
                <Tooltip label={m.pane_hide_details()}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={m.pane_hide_details()}
                    onClick={() => setRightCollapsed(true)}
                    style={{
                      position: 'absolute',
                      top: 20,
                      right: 10,
                      zIndex: 2,
                    }}
                  >
                    <PanelRightClose size={16} />
                  </ActionIcon>
                </Tooltip>
              </Box>
            ) : (
              <Tooltip label={m.pane_show_details()} position="left">
                <UnstyledButton
                  className={classes.paneStub}
                  aria-label={m.pane_show_details()}
                  onClick={() => setRightCollapsed(false)}
                >
                  <PanelRightOpen size={16} />
                  <span className={classes.paneStubLabel}>
                    {detailLabel ?? m.pane_details()}
                  </span>
                </UnstyledButton>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
