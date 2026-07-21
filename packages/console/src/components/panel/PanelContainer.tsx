import React, { useMemo } from 'react'
import { Box, Center, Stack, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePanelContext } from '../../context/PanelContext'
import { createPanelChildren } from './PanelFactory'
import { SidePanel, SidePanelContent, SidePanelHeader } from './SidePanel'

interface PanelContainerProps {
  emptyMessage?: I18nNode
  /** Render workflow panels with their flow drawn vertically (graph /
   *  scenario timeline). Default true; layouts that already show a full
   *  workflow canvas next to the panel pass false. */
  workflowGraph?: boolean
  /** Hide the per-panel close (X). Used when the surrounding layout owns the
   *  collapse control for the whole pane. */
  hideClose?: boolean
  /** Drop the header on the top-level panel — the entity it names is already
   *  shown by the layout's own header (the middle-pane selector), so repeating
   *  it here is redundant. Drilled-in panels (steps, sub-items) keep their
   *  header + back button. */
  hideRootTitle?: boolean
  /** The pane's own collapse control, rendered at the right edge of the panel
   *  header. Lives here (not in the middle pane) so the control sits in the
   *  panel it actually collapses. */
  collapseAction?: React.ReactNode
}

export const PanelContainer: React.FC<PanelContainerProps> = ({
  emptyMessage,
  workflowGraph = true,
  hideClose = false,
  hideRootTitle = false,
  collapseAction,
}) => {
  const { panels, activePanel, closePanel, goBack } = usePanelContext()
  useLocale()

  const activePanelData = activePanel ? panels.get(activePanel) : null

  const children = useMemo(() => {
    return activePanelData
      ? createPanelChildren(activePanelData.data, { workflowGraph })
      : []
  }, [activePanelData, workflowGraph])

  if (!activePanelData || children.length === 0) {
    return (
      <Box
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {collapseAction && <SidePanelHeader>{collapseAction}</SidePanelHeader>}
        <Center style={{ flex: 1, minHeight: 0 }} p="xl">
          <Text c="dimmed" ta="center">
            {emptyMessage ?? m.panel_select_item()}
          </Text>
        </Center>
      </Box>
    )
  }

  return (
    <Box style={{ height: '100%' }}>
      {children.map((child) =>
        child.selfContained ? (
          <Box
            key={child.id}
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            {collapseAction && (
              <SidePanelHeader>{collapseAction}</SidePanelHeader>
            )}
            <Box style={{ flex: 1, minHeight: 0 }}>{child.content}</Box>
          </Box>
        ) : (
          <SidePanel key={child.id}>
            {(!(hideRootTitle && activePanelData.history.length === 0) ||
              collapseAction) && (
              <SidePanelHeader
                title={
                  hideRootTitle && activePanelData.history.length === 0
                    ? undefined
                    : asI18n(activePanelData.title)
                }
                onBack={activePanelData.history.length > 0 ? goBack : undefined}
                onClose={hideClose ? undefined : () => closePanel(activePanel!)}
              >
                {collapseAction}
              </SidePanelHeader>
            )}
            <SidePanelContent>
              <Stack gap="xl" px="md">
                {child.content}
              </Stack>
            </SidePanelContent>
          </SidePanel>
        )
      )}
    </Box>
  )
}
