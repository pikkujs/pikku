import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

/**
 * Every HTTP route in the project meta, sorted by path — shared by `HttpPage`
 * and `HttpListPanel` so a host can read the same rows without mounting either.
 */
export const useHttpItems = (): { items: any[]; loading: boolean } => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo(() => {
    if (!meta.httpMeta) return []
    return [...meta.httpMeta].sort((a, b) => a.route.localeCompare(b.route))
  }, [meta.httpMeta])

  return { items, loading }
}
