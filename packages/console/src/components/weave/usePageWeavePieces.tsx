import { useMemo } from 'react'
import { usePages } from '../../hooks/usePages'
import type { WeavePiece } from './types'

export function usePageWeavePieces(): WeavePiece[] {
  const { data: pages } = usePages()
  return useMemo(
    () =>
      (pages ?? []).map((page) => ({
        id: `page:${page.app}:${page.path}`,
        type: 'page' as const,
        name: page.path,
        meta: { slug: page.app, path: page.path },
      })),
    [pages]
  )
}
