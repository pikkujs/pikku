import { useMemo } from 'react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import type { WeavePiece } from './types'
import { flattenMeta } from './internal'

/**
 * Reads the live pikku meta (via PikkuMetaProvider) and flattens it into the
 * woven pieces. Exposed separately so the meta plumbing stays testable apart
 * from the canvas.
 */
export function useWeaveMeta(): { pieces: WeavePiece[]; loading: boolean } {
  const { meta, loading } = usePikkuMeta()
  const pieces = useMemo(() => flattenMeta(meta), [meta])
  return { pieces, loading }
}
