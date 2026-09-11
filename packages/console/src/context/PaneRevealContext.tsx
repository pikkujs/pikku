import React, { createContext, useContext } from 'react'

/** Lets a list pane's own content re-open the details pane it feeds, so an
 *  action whose only result lands there is never silently swallowed by a pane
 *  the reader collapsed earlier. `null` where the details pane cannot be
 *  collapsed — there is nothing to reveal then. */
const PaneRevealCtx = createContext<(() => void) | null>(null)

export const PaneRevealProvider: React.FC<{
  reveal: () => void
  children: React.ReactNode
}> = ({ reveal, children }) => (
  <PaneRevealCtx.Provider value={reveal}>{children}</PaneRevealCtx.Provider>
)

export const usePaneReveal = () => useContext(PaneRevealCtx)
