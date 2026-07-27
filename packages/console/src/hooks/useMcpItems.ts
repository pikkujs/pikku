import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

/**
 * Every MCP resource, tool and prompt in the project meta, sorted by name —
 * shared by `McpPage` and `McpListPanel` so a host can read the same rows
 * without mounting either.
 */
export const useMcpItems = (): { items: any[]; loading: boolean } => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo(() => {
    if (!meta.mcpMeta) return []
    return [...meta.mcpMeta].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    )
  }, [meta.mcpMeta])

  return { items, loading }
}
