import React, { createContext, useContext, useEffect, useState } from 'react'
import { Box, CloseButton, Group, Text, UnstyledButton } from '@mantine/core'
import { ChevronLeft } from 'lucide-react'
import classes from '../ui/console.module.css'

const SidePanelCtx = createContext<{
  hasFooter: boolean
  setHasFooter: (v: boolean) => void
}>({ hasFooter: false, setHasFooter: () => {} })

export const SidePanel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasFooter, setHasFooter] = useState(false)
  return (
    <SidePanelCtx.Provider value={{ hasFooter, setHasFooter }}>
      <Box
        className={`${classes.flexColumn} ${classes.overflowHidden}`}
        style={{ position: 'relative', height: '100%' }}
      >
        {children}
      </Box>
    </SidePanelCtx.Provider>
  )
}

interface SidePanelHeaderProps {
  title: string
  onClose: () => void
  onBack?: () => void
  children?: React.ReactNode
}

export const SidePanelHeader: React.FC<SidePanelHeaderProps> = ({ title, onClose, onBack, children }) => (
  <Box
    px="md"
    style={{
      height: 42,
      display: 'flex',
      alignItems: 'center',
      borderBottom: '1px solid var(--mantine-color-default-border)',
      background: 'var(--app-surface)',
      flexShrink: 0,
    }}
  >
    <Group gap="xs" wrap="nowrap" align="center" style={{ width: '100%' }}>
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

export const SidePanelContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hasFooter } = useContext(SidePanelCtx)
  return (
    <Box
      py="md"
      className={`${classes.flexGrow} ${classes.overflowAuto}`}
      style={{ minHeight: 0, paddingBottom: hasFooter ? 96 : undefined }}
    >
      {children}
    </Box>
  )
}

export const SidePanelFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setHasFooter } = useContext(SidePanelCtx)
  useEffect(() => {
    setHasFooter(true)
    return () => setHasFooter(false)
  }, [setHasFooter])

  return (
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
}
