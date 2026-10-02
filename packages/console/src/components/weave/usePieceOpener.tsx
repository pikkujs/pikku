import { usePanelContext } from '../../context/PanelContext'
import type { WeavePiece } from './types'

export function usePieceOpener(): (piece: WeavePiece) => void {
  const panel = usePanelContext()
  return (piece: WeavePiece) => {
    const { type, name, meta } = piece
    switch (type) {
      case 'function':
        return panel.openFunction(String(meta.pikkuFuncName ?? meta.pikkuFuncId ?? name), meta)
      case 'http':
        return panel.openHTTPWire(name, meta)
      case 'channel':
        return panel.openChannel(name, meta)
      case 'queue':
        return panel.openQueue(name, meta)
      case 'scheduler':
        return panel.openScheduler(name, meta)
      case 'mcp':
        return panel.openMCP(name, meta)
      case 'workflow':
        return panel.openWorkflow(name, meta)
      case 'scenario':
        // A scenario is a workflow-shaped flow — reuse the workflow detail panel.
        return panel.openWorkflow(name, meta)
      case 'page':
      case 'addon':
        // Pages and addons have no config panel; opening is handled separately
        // (a new browser tab — the live route / the npm package page).
        return
      case 'agent':
        return panel.openAgent(name, meta)
      case 'email':
        return panel.openEmail(name, meta)
      case 'cli':
        return panel.openCLI(name, meta)
      case 'trigger':
        return panel.openTrigger(name, meta)
    }
  }
}
