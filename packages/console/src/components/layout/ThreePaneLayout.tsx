import React from 'react'
import { ActionIcon, Box, Tooltip, UnstyledButton } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
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
import classes from '../ui/console.module.css'

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
  /** Noun shown on the collapsed left/right rail (e.g. "Conversations", "Runs").
   *  Falls back to generic "List" / "Details". */
  listLabel?: I18nNode
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
  const hasRight =
    !hidePanel &&
    (panels.size !== 0 || (alwaysVisible && !collapseWhenEmpty))

  const showLeft = hasLeft && !leftCollapsed
  const showRight = hasRight && !rightCollapsed

  const showPaneHeader = hasLeft || hasRight || !!lead || !!filters

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
        {hasLeft && (
          <Box
            className={classes.paneCollapseTransition}
            style={{
              width: showLeft ? 240 : 40,
              minWidth: showLeft ? 240 : 40,
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {showLeft ? (
              <Box
                className={classes.listSurfaceCard}
                style={{ height: '100%' }}
              >
                {runsPanel}
              </Box>
            ) : (
              <Tooltip label={m.pane_show_list()} position="right">
                <UnstyledButton
                  className={classes.paneStub}
                  aria-label={m.pane_show_list()}
                  onClick={() => setLeftCollapsed(false)}
                >
                  <PanelLeftOpen size={16} />
                  <span className={classes.paneStubLabel}>
                    {listLabel ?? m.pane_list()}
                  </span>
                </UnstyledButton>
              </Tooltip>
            )}
          </Box>
        )}

        <Box
          className={classes.listSurfaceCard}
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
                borderBottom: '1px solid var(--app-row-border)',
              }}
            >
              {hasLeft && (
                <Tooltip
                  label={leftCollapsed ? m.pane_show_list() : m.pane_hide_list()}
                >
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={
                      leftCollapsed ? m.pane_show_list() : m.pane_hide_list()
                    }
                    onClick={() => setLeftCollapsed((v) => !v)}
                  >
                    {leftCollapsed ? (
                      <PanelLeftOpen size={16} />
                    ) : (
                      <PanelLeftClose size={16} />
                    )}
                  </ActionIcon>
                </Tooltip>
              )}
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
              {hasRight && (
                <Tooltip
                  label={
                    rightCollapsed ? m.pane_show_details() : m.pane_hide_details()
                  }
                >
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={
                      rightCollapsed
                        ? m.pane_show_details()
                        : m.pane_hide_details()
                    }
                    onClick={() => setRightCollapsed((v) => !v)}
                  >
                    {rightCollapsed ? (
                      <PanelRightOpen size={16} />
                    ) : (
                      <PanelRightClose size={16} />
                    )}
                  </ActionIcon>
                </Tooltip>
              )}
            </Box>
          )}
          <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {children}
          </Box>
        </Box>

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
                style={{ height: '100%', width: 'min(520px, 42vw)' }}
              >
                <PanelContainer
                  emptyMessage={emptyPanelMessage}
                  workflowGraph={false}
                  hideClose
                  hideRootTitle={!!lead}
                />
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
