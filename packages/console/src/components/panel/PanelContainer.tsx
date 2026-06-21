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
}

export const PanelContainer: React.FC<PanelContainerProps> = ({ emptyMessage }) => {
  const { panels, activePanel, closePanel, goBack } = usePanelContext()
  useLocale()

  const activePanelData = activePanel ? panels.get(activePanel) : null

  const children = useMemo(() => {
    return activePanelData ? createPanelChildren(activePanelData.data) : []
  }, [activePanelData])

  if (!activePanelData || children.length === 0) {
    return (
      <Center h="100%" p="xl">
        <Text c="dimmed" ta="center">
          {emptyMessage ?? m.panel_select_item()}
        </Text>
      </Center>
    )
  }

  return (
    <Box style={{ height: '100%' }}>
      {children.map((child) =>
        child.selfContained ? (
          <Box key={child.id} style={{ height: '100%' }}>
            {child.content}
          </Box>
        ) : (
          <SidePanel key={child.id}>
            <SidePanelHeader
              title={asI18n(activePanelData.title)}
              onBack={activePanelData.history.length > 0 ? goBack : undefined}
              onClose={() => closePanel(activePanel!)}
            />
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
