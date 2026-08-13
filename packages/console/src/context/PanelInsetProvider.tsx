import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

/**
 * How much room the open side panels reserve on the content column's end edge.
 *
 * A panel is pinned to that edge (it portals into `#console-content-portal-root`)
 * and the layout pads the page by the SAME amount — so the page card shrinks
 * instead of being covered. The panel's own card gutter overlaps the page card's,
 * which is why the reservation is `width - gutter`: one gutter between the two
 * cards, the console's standard.
 */
interface PanelInsetValue {
  inset: number
  reserve: (id: string, width: number | null) => void
}

const PanelInsetContext = createContext<PanelInsetValue>({
  inset: 0,
  reserve: () => {},
})

export function PanelInsetProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [widths, setWidths] = useState<Record<string, number>>({})
  const reserve = useCallback((id: string, width: number | null) => {
    setWidths((current) => {
      if (width === null) {
        if (!(id in current)) return current
        const next = { ...current }
        delete next[id]
        return next
      }
      if (current[id] === width) return current
      return { ...current, [id]: width }
    })
  }, [])
  // Panels stack on the same edge, so the widest one is what has to be cleared.
  const inset = useMemo(() => Math.max(0, ...Object.values(widths)), [widths])
  const value = useMemo(() => ({ inset, reserve }), [inset, reserve])
  return (
    <PanelInsetContext.Provider value={value}>
      {children}
    </PanelInsetContext.Provider>
  )
}

export function usePanelInset() {
  return useContext(PanelInsetContext)
}
