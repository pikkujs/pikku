import * as vscode from 'vscode'
import type { PikkuInspector } from '../inspector'

type TreeElement =
  | { kind: 'tag'; tag: string }
  | { kind: 'function'; funcId: string; tag: string }

export class FunctionsTreeProvider
  implements vscode.TreeDataProvider<TreeElement>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeElement | undefined
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private inspector: PikkuInspector) {
    inspector.onDidChange(() => this._onDidChangeTreeData.fire(undefined))
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    const state = this.inspector.getState()

    if (element.kind === 'tag') {
      const item = new vscode.TreeItem(
        element.tag,
        vscode.TreeItemCollapsibleState.Expanded
      )
      item.contextValue = 'tag'
      item.iconPath = new vscode.ThemeIcon('tag')
      return item
    }

    const meta = state?.functions.meta[element.funcId]
    const types = this.inspector.getFunctionTypes(element.funcId)
    const badges = types.map(typeToIcon).join(' ')
    const label = `${element.funcId}${badges ? ` ${badges}` : ''}`

    const item = new vscode.TreeItem(
      label,
      vscode.TreeItemCollapsibleState.None
    )
    item.contextValue = 'function'
    item.iconPath = new vscode.ThemeIcon('symbol-function')
    item.tooltip = meta?.description || element.funcId
    item.description = types.join(', ')

    // Navigate to source on click
    const fileEntry = state?.functions.files.get(element.funcId)
    if (fileEntry) {
      item.command = {
        command: 'vscode.open',
        title: 'Go to Function',
        arguments: [vscode.Uri.file(fileEntry.path)],
      }
    }

    return item
  }

  getChildren(element?: TreeElement): TreeElement[] {
    const state = this.inspector.getState()
    if (!state) return []

    if (!element) {
      // Root: return tags
      const tagSet = new Set<string>()
      for (const meta of Object.values(state.functions.meta)) {
        if (meta.tags && meta.tags.length > 0) {
          for (const tag of meta.tags) {
            tagSet.add(tag)
          }
        } else {
          tagSet.add('untagged')
        }
      }
      return Array.from(tagSet)
        .sort()
        .map((tag) => ({ kind: 'tag' as const, tag }))
    }

    if (element.kind === 'tag') {
      // Under a tag: return functions with that tag
      const funcs: TreeElement[] = []
      for (const [funcId, meta] of Object.entries(state.functions.meta)) {
        const tags =
          meta.tags && meta.tags.length > 0 ? meta.tags : ['untagged']
        if (tags.includes(element.tag)) {
          funcs.push({ kind: 'function', funcId, tag: element.tag })
        }
      }
      return funcs.sort((a, b) =>
        (a as any).funcId.localeCompare((b as any).funcId)
      )
    }

    return []
  }
}

function typeToIcon(type: string): string {
  switch (type) {
    case 'http':
      return '\u26A1'
    case 'channel':
      return '\uD83D\uDD0C'
    case 'scheduler':
      return '\u23F0'
    case 'queue':
      return '\uD83D\uDCE8'
    case 'mcp':
      return '\uD83D\uDEE0'
    case 'cli':
      return '\uD83D\uDCBB'
    case 'trigger':
      return '\u2B50'
    case 'workflow':
      return '\uD83D\uDD04'
    case 'agent':
      return '\uD83E\uDD16'
    default:
      return ''
  }
}
