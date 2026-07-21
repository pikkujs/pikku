import React, { createContext, useContext, useEffect, useState } from 'react'
import { Box, CloseButton, Group, Text, UnstyledButton } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
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
  /** Omit when the title would duplicate what an outer header already shows —
   *  the bar still renders so it can host the pane's own controls. */
  title?: I18nNode
  /** Omit to hide the close (X) button — e.g. when the pane owns a collapse
   *  control instead. */
  onClose?: () => void
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
      {title ? (
        <Text size="sm" fw={600} style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </Text>
      ) : (
        <Box style={{ flex: 1 }} />
      )}
      {children}
      {onClose && <CloseButton size="sm" onClick={onClose} />}
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
