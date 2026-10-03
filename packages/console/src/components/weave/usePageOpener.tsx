import { fillPagePath, useAppAddress } from '../../hooks/usePages'
import type { WeavePiece } from './types'

export function usePageOpener(): ((piece: WeavePiece) => void) | undefined {
  const [address] = useAppAddress()
  if (!address) return undefined
  return (piece: WeavePiece) => {
    const path = fillPagePath(typeof piece.meta.path === 'string' ? piece.meta.path : '/')
    if (path === null) return
    window.open(new URL(path, address).toString(), '_blank', 'noopener,noreferrer')
  }
}
