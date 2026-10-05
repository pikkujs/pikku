// ─────────────────────────────────────────────────────────────────────────────
// Live view of artifacts/. The design agent writes files while the user is
// looking at this tab, so the list is polled rather than read once: `active`
// keeps the poll to the lens that actually shows them.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { fetchArtifacts, type DesignArtifact } from '@/lib/discovery'

const POLL_MS = 4000

export function useArtifacts(active: boolean): {
  artifacts: DesignArtifact[]
  error: string | null
  refresh: () => void
} {
  const [artifacts, setArtifacts] = useState<DesignArtifact[]>([])
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let live = true
    const read = () => {
      fetchArtifacts()
        .then((next) => {
          if (!live) return
          setError(null)
          // Replace only on a real change: a new array every 4s would reload the
          // iframe, throwing away the user's scroll position mid-read.
          setArtifacts((prev) => (same(prev, next) ? prev : next))
        })
        .catch((e: unknown) => {
          if (live) setError(e instanceof Error ? e.message : String(e))
        })
    }
    read()
    if (!active)
      return () => {
        live = false
      }
    const timer = setInterval(read, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [active, nonce])

  return { artifacts, error, refresh }
}

function same(a: DesignArtifact[], b: DesignArtifact[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (entry, i) =>
        entry.id === b[i]!.id &&
        entry.name === b[i]!.name &&
        entry.file === b[i]!.file &&
        entry.versions.length === b[i]!.versions.length &&
        entry.options.join('|') === b[i]!.options.join('|'),
    )
  )
}
