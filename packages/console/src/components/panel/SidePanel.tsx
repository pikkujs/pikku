import React from 'react'
import { Box, CloseButton, Group, Text, UnstyledButton } from '@mantine/core'
import { ChevronLeft } from 'lucide-react'
import classes from '../ui/console.module.css'

export const SidePanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    className={`${classes.flexColumn} ${classes.overflowHidden}`}
    style={{ position: 'relative', height: '100%' }}
  >
    {children}
  </Box>
)

interface SidePanelHeaderProps {
  title: string
  onClose: () => void
  onBack?: () => void
  children?: React.ReactNode
}

export const SidePanelHeader: React.FC<SidePanelHeaderProps> = ({ title, onClose, onBack, children }) => (
  <Box
    px="md"
    py="xs"
    style={{ borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
  >
    <Group gap="xs" wrap="nowrap" align="center">
      {onBack && (
        <UnstyledButton onClick={onBack} style={{ display: 'flex', alignItems: 'center' }}>
          <ChevronLeft size={16} color="var(--mantine-color-dimmed)" />
        </UnstyledButton>
      )}
      <Text size="sm" fw={600} style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {title}
      </Text>
      {children}
      <CloseButton size="sm" onClick={onClose} />
    </Group>
  </Box>
)

export const SidePanelContent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box py="md" className={`${classes.flexGrow} ${classes.overflowAuto}`}>
    {children}
  </Box>
)

export const SidePanelFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    px="md"
    py="sm"
    style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTop: '1px solid var(--mantine-color-default-border)',
      background: 'var(--mantine-color-body)',
    }}
  >
    {children}
  </Box>
)
