import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Box,
  CloseButton,
  Group,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { ChevronLeft } from 'lucide-react'
import classes from '../ui/console.module.css'

const SidePanelCtx = createContext<{
  hasFooter: boolean
  setHasFooter: (v: boolean) => void
}>({ hasFooter: false, setHasFooter: () => {} })

const PanelChromeCtx = createContext<{
  hideRootTitle: boolean
  hideClose: boolean
}>({ hideRootTitle: false, hideClose: false })

/**
 * Declares that the surrounding chrome already names the panel and owns its
 * close — an end-edge panel card, or a pane whose own header carries the
 * collapse control.
 *
 * The root panel then drops its title band rather than repeating it. This is a
 * context and not a prop because a self-contained panel builds its own header
 * (it needs its own actions in it), so `PanelContainer` cannot hand the flags
 * down by hand.
 */
export const PanelChrome: React.FC<{
  hideRootTitle?: boolean
  hideClose?: boolean
  children: React.ReactNode
}> = ({ hideRootTitle = false, hideClose = false, children }) => {
  const value = useMemo(
    () => ({ hideRootTitle, hideClose }),
    [hideRootTitle, hideClose]
  )
  return (
    <PanelChromeCtx.Provider value={value}>{children}</PanelChromeCtx.Provider>
  )
}

export const SidePanel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
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
  title: I18nNode
  /** Omit to hide the close (X) button — e.g. when a parent layout owns the
   *  collapse control for this pane. */
  onClose?: () => void
  onBack?: () => void
  children?: React.ReactNode
}

export const SidePanelHeader: React.FC<SidePanelHeaderProps> = ({
  title,
  onClose,
  onBack,
  children,
}) => {
  const { hideRootTitle, hideClose } = useContext(PanelChromeCtx)
  // A drilled-in panel keeps its header whatever the chrome says — the back
  // button is the only way out of it, and the title is the only thing naming
  // where the drill landed.
  const isRoot = !onBack
  const named = !(hideRootTitle && isRoot)
  // Actions are the panel's own and have nowhere else to go, so a header the
  // chrome has un-named still renders for them — as a bare action strip.
  if (!named && !children) return null

  return (
    <Box
      px="md"
      style={{
        height: named ? 42 : 32,
        display: 'flex',
        alignItems: 'center',
        borderBottom: named
          ? '1px solid var(--mantine-color-default-border)'
          : undefined,
        background: named ? 'var(--app-surface)' : undefined,
        flexShrink: 0,
      }}
    >
      <Group
        gap="xs"
        wrap="nowrap"
        align="center"
        justify={named ? undefined : 'flex-end'}
        style={{ width: '100%' }}
      >
        {onBack && (
          <UnstyledButton
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <ChevronLeft size={16} color="var(--mantine-color-dimmed)" />
          </UnstyledButton>
        )}
        {named && (
          <Text
            size="sm"
            fw={600}
            style={{
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </Text>
        )}
        {children}
        {onClose && !hideClose && <CloseButton size="sm" onClick={onClose} />}
      </Group>
    </Box>
  )
}

export const SidePanelContent: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
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

export const SidePanelFooter: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
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
