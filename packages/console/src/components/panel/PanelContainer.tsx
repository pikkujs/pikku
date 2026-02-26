import React, { useMemo } from 'react'
import {
  Box,
  Group,
  Text,
  CloseButton,
  Stack,
  Center,
  UnstyledButton,
} from '@mantine/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import { createPanelChildren } from './PanelFactory'

interface PanelContainerProps {
  showTabs?: boolean
  emptyMessage?: string
}

export const PanelContainer: React.FunctionComponent<PanelContainerProps> = ({
  showTabs = true,
  emptyMessage,
}) => {
  const { panels, activePanel, setActivePanel, closePanel, goBack, goBackTo } =
    usePanelContext()

  const panelArray = Array.from(panels.values())
  const activePanelData = activePanel ? panels.get(activePanel) : null

  const children = useMemo(() => {
    return activePanelData ? createPanelChildren(activePanelData.data) : []
  }, [activePanelData])

  if (!showTabs && (panelArray.length === 0 || children.length === 0)) {
    return (
      <Center h="100%" p="xl">
        <Text c="dimmed" ta="center">
          {emptyMessage || 'Select an item to view details'}
        </Text>
      </Center>
    )
  }

  if (panelArray.length === 0 || children.length === 0) {
    return null
  }

  return (
    <Stack gap={0} style={{ height: '100%', overflow: 'hidden' }}>
      {showTabs && (
        <Box
          style={{
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Group gap={0} wrap="nowrap" style={{ overflowX: 'auto' }}>
            {panelArray.map((panel) => (
              <Group
                key={panel.id}
                gap="xs"
                wrap="nowrap"
                px="md"
                py="xs"
                style={{
                  cursor: 'pointer',
                  borderLeft: '1px solid var(--mantine-color-default-border)',
                  borderRight: '1px solid var(--mantine-color-default-border)',
                  borderBottom:
                    activePanel === panel.id
                      ? '2px solid var(--mantine-color-blue-6)'
                      : '2px solid transparent',
                  backgroundColor:
                    activePanel === panel.id
                      ? 'var(--mantine-color-gray-1)'
                      : 'transparent',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
                onClick={() => setActivePanel(panel.id)}
              >
                <Text size="sm" fw={activePanel === panel.id ? 600 : 400}>
                  {panel.title}
                </Text>
                <CloseButton
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    closePanel(panel.id)
                  }}
                />
              </Group>
            ))}
          </Group>
        </Box>
      )}

      {activePanelData && activePanelData.history.length > 0 && (
        <Box
          px="md"
          py="xs"
          style={{
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Group gap={6} wrap="nowrap" align="center">
            <UnstyledButton
              onClick={goBack}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={18} color="var(--mantine-color-dimmed)" />
            </UnstyledButton>
            {activePanelData.history.map((entry, index) => (
              <React.Fragment key={index}>
                <UnstyledButton onClick={() => goBackTo(index)}>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {entry.title}
                  </Text>
                </UnstyledButton>
                <ChevronRight size={14} color="var(--mantine-color-dimmed)" />
              </React.Fragment>
            ))}
            <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
              {activePanelData.title}
            </Text>
          </Group>
        </Box>
      )}

      <Box py="md" style={{ flex: 1, overflow: 'auto' }}>
        <Stack gap="xl">
          {children.map((child) => (
            <Box key={child.id}>{child.content}</Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  )
}
