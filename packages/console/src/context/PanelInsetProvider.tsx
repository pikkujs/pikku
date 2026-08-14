import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

/** Which edge of the content column a panel is pinned to. */
export type PanelSide = 'start' | 'end'

/**
 * How much room the open side panels reserve on each edge of the content column.
 *
 * A panel is pinned to one of those edges (it portals into
 * `#console-content-portal-root`) and the layout pads the page by the SAME
 * amount — so the page card shrinks instead of being covered. The panel's own
 * card gutter overlaps the page card's, which is why the reservation is
 * `width - gutter`: one gutter between the two cards, the console's standard.
 */
interface PanelInsetValue {
  start: number
  end: number
  reserve: (id: string, width: number | null, side?: PanelSide) => void
}

const PanelInsetContext = createContext<PanelInsetValue>({
  start: 0,
  end: 0,
  reserve: () => {},
})

export function PanelInsetProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [reserved, setReserved] = useState<
    Record<string, { width: number; side: PanelSide }>
  >({})
  const reserve = useCallback(
    (id: string, width: number | null, side: PanelSide = 'end') => {
      setReserved((current) => {
        if (width === null) {
          if (!(id in current)) return current
          const next = { ...current }
          delete next[id]
          return next
        }
        const held = current[id]
        if (held && held.width === width && held.side === side) return current
        return { ...current, [id]: { width, side } }
      })
    },
    []
  )
  // Panels stack on the same edge, so the widest one is what has to be cleared.
  const insets = useMemo(() => {
    const widest = { start: 0, end: 0 }
    for (const { width, side } of Object.values(reserved)) {
      widest[side] = Math.max(widest[side], width)
    }
    return widest
  }, [reserved])
  const value = useMemo(
    () => ({ start: insets.start, end: insets.end, reserve }),
    [insets, reserve]
  )
  return (
    <PanelInsetContext.Provider value={value}>
      {children}
    </PanelInsetContext.Provider>
  )
}

export function usePanelInset() {
  return useContext(PanelInsetContext)
}
