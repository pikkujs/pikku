import React, { createContext, useContext } from 'react'

/** Lets a side pane's own content render the control that collapses it, so the
 *  control sits in a row the pane already has instead of a header added just to
 *  hold it. `null` outside a collapsible pane — render nothing then. */
const PaneCollapseCtx = createContext<(() => void) | null>(null)

export const PaneCollapseProvider: React.FC<{
  collapse: () => void
  children: React.ReactNode
}> = ({ collapse, children }) => (
  <PaneCollapseCtx.Provider value={collapse}>
    {children}
  </PaneCollapseCtx.Provider>
)

export const usePaneCollapse = () => useContext(PaneCollapseCtx)
