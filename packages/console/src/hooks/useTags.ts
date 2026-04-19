import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export interface TagInfo {
  tag: string
  functionCount: number
  hasMiddleware: boolean
  hasPermissions: boolean
}

export function useTags(): TagInfo[] {
  const { meta } = usePikkuMeta()

  return useMemo(() => {
    const tagMap: Record<string, TagInfo> = {}

    for (const f of meta.functions ?? []) {
      for (const t of (f as any).tags ?? []) {
        if (!tagMap[t])
          tagMap[t] = {
            tag: t,
            functionCount: 0,
            hasMiddleware: false,
            hasPermissions: false,
          }
        tagMap[t].functionCount++
      }
    }

    for (const [, a] of Object.entries(meta.agentsMeta ?? {})) {
      for (const t of (a as any).tags ?? []) {
        if (!tagMap[t])
          tagMap[t] = {
            tag: t,
            functionCount: 0,
            hasMiddleware: false,
            hasPermissions: false,
          }
      }
    }

    const mwTagGroups = (meta as any).middlewareGroupsMeta?.tagGroups ?? {}
    for (const tag of Object.keys(mwTagGroups)) {
      if (!tagMap[tag])
        tagMap[tag] = {
          tag,
          functionCount: 0,
          hasMiddleware: false,
          hasPermissions: false,
        }
      tagMap[tag].hasMiddleware = true
    }

    const permTagGroups = (meta as any).permissionsGroupsMeta?.tagGroups ?? {}
    for (const tag of Object.keys(permTagGroups)) {
      if (!tagMap[tag])
        tagMap[tag] = {
          tag,
          functionCount: 0,
          hasMiddleware: false,
          hasPermissions: false,
        }
      tagMap[tag].hasPermissions = true
    }

    return Object.values(tagMap).sort((a, b) => a.tag.localeCompare(b.tag))
  }, [meta])
}

export function useTagOptions() {
  const tags = useTags()

  return useMemo(() => {
    return tags.map((t) => {
      const parts: string[] = []
      if (t.functionCount > 0)
        parts.push(`${t.functionCount} func${t.functionCount > 1 ? 's' : ''}`)
      if (t.hasMiddleware) parts.push('middleware')
      if (t.hasPermissions) parts.push('permissions')
      const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : ''
      return {
        value: t.tag,
        label: `${t.tag}${suffix}`,
      }
    })
  }, [tags])
}
