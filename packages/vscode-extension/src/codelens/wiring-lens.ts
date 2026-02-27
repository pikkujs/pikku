import * as vscode from 'vscode'
import type { PikkuInspector } from '../inspector'

const FUNC_PATTERN = /\b(pikkuFunc|pikkuSessionlessFunc|pikkuVoidFunc)\s*[<(]/g

export class WiringCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

  constructor(private inspector: PikkuInspector) {
    inspector.onDidChange(() => this._onDidChangeCodeLenses.fire())
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const state = this.inspector.getState()
    if (!state) return []

    const lenses: vscode.CodeLens[] = []
    const text = document.getText()
    const filePath = document.uri.fsPath

    // Find all functions defined in this file
    for (const [funcId, fileEntry] of state.functions.files.entries()) {
      if (fileEntry.path !== filePath) continue

      const summary = this.inspector.getWiringSummary(funcId)
      if (!summary) continue

      // Find the exported const declaration for this function
      const exportPattern = new RegExp(
        `\\bexport\\s+const\\s+${escapeRegex(fileEntry.exportedName)}\\b`
      )
      const match = exportPattern.exec(text)
      if (!match) continue

      const pos = document.positionAt(match.index)
      const range = new vscode.Range(pos, pos)

      lenses.push(
        new vscode.CodeLens(range, {
          title: summary,
          command: 'pikku.info',
          tooltip: `Wirings for ${funcId}`,
        })
      )
    }

    // Fallback: regex scan for pikkuFunc calls if no file entries match
    if (lenses.length === 0) {
      let match: RegExpExecArray | null
      FUNC_PATTERN.lastIndex = 0
      while ((match = FUNC_PATTERN.exec(text)) !== null) {
        // Try to find the variable name assigned to this call
        const beforeMatch = text.substring(
          Math.max(0, match.index - 200),
          match.index
        )
        const nameMatch =
          /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*$/.exec(beforeMatch)
        if (!nameMatch) continue

        const varName = nameMatch[1]

        // Look up this name in inspector state
        let funcId: string | undefined
        for (const [id, entry] of state.functions.files.entries()) {
          if (entry.exportedName === varName) {
            funcId = id
            break
          }
        }
        if (!funcId) continue

        const summary = this.inspector.getWiringSummary(funcId)
        if (!summary) continue

        const pos = document.positionAt(match.index)
        const range = new vscode.Range(pos, pos)

        lenses.push(
          new vscode.CodeLens(range, {
            title: summary,
            command: 'pikku.info',
            tooltip: `Wirings for ${funcId}`,
          })
        )
      }
    }

    return lenses
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
