import React, { useContext } from 'react'
import { PanelContext, PanelProvider } from '../../context/PanelContext'

export interface ConsoleSurfaceProps {
  children: React.ReactNode
  /**
   * Mount a fresh panel context even when one is already above us. Use when a
   * surface must keep its selection to itself rather than share the host's.
   */
  isolate?: boolean
}

/**
 * Mounts the panel context that every list panel and inspector reads from, so
 * the panels below can be arranged in any order, anywhere in a host's tree.
 *
 * Pages used to mount `PanelProvider` themselves, which forced each one to keep
 * its table in a private inner component purely so `usePanelContext` had a
 * provider above it. Owning the provider here is what lets those tables become
 * standalone panels.
 *
 * When a host has already mounted a panel context, this defers to it rather
 * than nesting a second one — otherwise a host arranging panels from several
 * surfaces would find each stuck with its own private selection. Pass
 * `isolate` to opt out. This mirrors how `ScenariosPage` already defers to a
 * host-supplied `ConsoleNavigator`.
 *
 * Only the panel context lives here. The router, meta, RPC and editable
 * providers are assumed ambient — a host such as the Fabric console supplies
 * its own.
 */
export const ConsoleSurface: React.FC<ConsoleSurfaceProps> = ({
  children,
  isolate = false,
}) => {
  const hostPanels = useContext(PanelContext)
  if (hostPanels && !isolate) return <>{children}</>
  return <PanelProvider>{children}</PanelProvider>
}
