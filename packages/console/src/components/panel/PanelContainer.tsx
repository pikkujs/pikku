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
import { ChevronLeft } from 'lucide-react'
import { usePanelContext } from '../../context/PanelContext'
import { createPanelChildren } from './PanelFactory'
import classes from '../ui/console.module.css'

interface PanelContainerProps {
  showTabs?: boolean
  emptyMessage?: string
}

export const PanelContainer: React.FC<PanelContainerProps> = ({
  emptyMessage,
}) => {
  const { panels, activePanel, closePanel, goBack } = usePanelContext()

  const panelArray = Array.from(panels.values())
  const activePanelData = activePanel ? panels.get(activePanel) : null

  const children = useMemo(() => {
    return activePanelData ? createPanelChildren(activePanelData.data) : []
  }, [activePanelData])

  if (panelArray.length === 0 || children.length === 0) {
    return (
      <Center h="100%" p="xl">
        <Text c="dimmed" ta="center">
          {emptyMessage || 'Select an item to view details'}
        </Text>
      </Center>
    )
  }

  return (
    <Stack
      gap={0}
      className={`${classes.flexColumn} ${classes.overflowHidden}`}
    >
      {activePanelData && (
        <Box
          px="md"
          py="xs"
          style={{
            borderBottom: '1px solid var(--mantine-color-default-border)',
            flexShrink: 0,
          }}
        >
          <Group gap="xs" wrap="nowrap" align="center">
            {activePanelData.history.length > 0 && (
              <UnstyledButton
                onClick={goBack}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                <ChevronLeft size={16} color="var(--mantine-color-dimmed)" />
              </UnstyledButton>
            )}
            <Text size="sm" fw={600} style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activePanelData.title}
            </Text>
            <CloseButton
              size="sm"
              onClick={() => closePanel(activePanel!)}
            />
          </Group>
        </Box>
      )}

      <Box py="md" className={`${classes.flexGrow} ${classes.overflowAuto}`}>
        <Stack gap="xl">
          {children.map((child) => (
            <Box key={child.id}>{child.content}</Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  )
}
