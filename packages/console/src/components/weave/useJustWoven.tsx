import { useEffect, useRef, useState } from 'react'
import type { WeavePiece } from './types'
import { HOT_MS } from './internal'

/* ---- track which pieces were *just* woven (lit for HOT_MS, then rest) ---- */
export function useJustWoven(pieces: WeavePiece[]) {
  const seen = useRef<Set<string> | null>(null)
  const [hot, setHot] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    const ids = pieces.map((p) => p.id)
    // First meta load: seed silently so the whole existing state renders at
    // rest — only pieces added *after* mount get the electric-thread focus.
    if (seen.current === null) {
      seen.current = new Set(ids)
      return
    }
    const now = performance.now()
    const fresh = ids.filter((id) => !seen.current!.has(id))
    if (fresh.length) {
      setHot((prev) => {
        const next = new Map(prev)
        for (const id of fresh) next.set(id, now)
        return next
      })
    }
    seen.current = new Set(ids)
  }, [pieces])

  // Cool down expired highlights (drives re-render as they fade out).
  useEffect(() => {
    if (hot.size === 0) return
    const timer = setInterval(() => {
      const now = performance.now()
      setHot((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [id, at] of prev) {
          if (now - at > HOT_MS) {
            next.delete(id)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 250)
    return () => clearInterval(timer)
  }, [hot.size])

  return hot
}
