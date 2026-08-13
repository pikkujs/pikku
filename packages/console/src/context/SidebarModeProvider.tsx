import { createContext, useContext } from 'react'

/**
 * How the nav rail is being framed:
 * - `docked` — an in-flow column at the head of the content row, always
 *   visible, owning its own collapse/hide controls.
 * - `sheet` — inside the mobile nav Drawer, which already provides the frame and
 *   owns dismissal: fill it, drop the collapse/hide controls, and always render
 *   expanded (a 60px icon rail inside a 288px sheet is pointless).
 */
export type SidebarMode = 'docked' | 'sheet'

const SidebarModeContext = createContext<SidebarMode>('docked')

export function SidebarModeProvider({
  mode,
  children,
}: {
  mode: SidebarMode
  children: React.ReactNode
}) {
  return (
    <SidebarModeContext.Provider value={mode}>
      {children}
    </SidebarModeContext.Provider>
  )
}

export function useSidebarMode(): SidebarMode {
  return useContext(SidebarModeContext)
}
