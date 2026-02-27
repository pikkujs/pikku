import * as vscode from 'vscode'
import type { PikkuInspector } from '../inspector'

type TreeElement =
  | { kind: 'definition'; id: string }
  | { kind: 'tag-group'; tag: string }
  | { kind: 'applied'; label: string; filePath?: string }

export class MiddlewareTreeProvider
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
    if (element.kind === 'definition') {
      const state = this.inspector.getState()
      const def = state?.middleware?.definitions[element.id]
      const item = new vscode.TreeItem(
        element.id,
        vscode.TreeItemCollapsibleState.Collapsed
      )
      item.contextValue = 'middleware-definition'
      item.iconPath = new vscode.ThemeIcon('shield')
      if (def?.sourceFile) {
        item.description = def.sourceFile.replace(
          state?.rootDir + '/' || '',
          ''
        )
      }
      return item
    }

    if (element.kind === 'tag-group') {
      const item = new vscode.TreeItem(
        `Tag: ${element.tag}`,
        vscode.TreeItemCollapsibleState.Collapsed
      )
      item.contextValue = 'middleware-tag'
      item.iconPath = new vscode.ThemeIcon('tag')
      return item
    }

    const item = new vscode.TreeItem(
      element.label,
      vscode.TreeItemCollapsibleState.None
    )
    item.contextValue = 'middleware-applied'
    item.iconPath = new vscode.ThemeIcon('arrow-right')

    if (element.filePath) {
      item.command = {
        command: 'vscode.open',
        title: 'Go to Source',
        arguments: [vscode.Uri.file(element.filePath)],
      }
    }

    return item
  }

  getChildren(element?: TreeElement): TreeElement[] {
    const state = this.inspector.getState()
    if (!state) return []

    if (!element) {
      const children: TreeElement[] = []

      // Definitions
      if (state.middleware?.definitions) {
        for (const id of Object.keys(state.middleware.definitions)) {
          children.push({ kind: 'definition', id })
        }
      }

      // Tag middleware groups
      if (state.middleware?.tagMiddleware) {
        for (const tag of state.middleware.tagMiddleware.keys()) {
          children.push({ kind: 'tag-group', tag })
        }
      }

      return children
    }

    if (element.kind === 'definition') {
      const def = state.middleware?.definitions[element.id]
      if (!def) return []

      const applied: TreeElement[] = []
      if (def.sourceFile) {
        applied.push({
          kind: 'applied',
          label: `Source: ${def.sourceFile.replace(state.rootDir + '/', '')}`,
          filePath: def.sourceFile,
        })
      }

      // Show instances that use this definition
      if (state.middleware?.instances) {
        for (const [instanceId, instance] of Object.entries(
          state.middleware.instances
        )) {
          if ((instance as any).definitionId === element.id) {
            applied.push({
              kind: 'applied',
              label: `Instance: ${instanceId}`,
              filePath: (instance as any).sourceFile,
            })
          }
        }
      }

      return applied
    }

    if (element.kind === 'tag-group') {
      const group = state.middleware?.tagMiddleware?.get(element.tag)
      if (!group) return []

      const children: TreeElement[] = []
      if (group.sourceFile) {
        children.push({
          kind: 'applied',
          label: `Source: ${group.sourceFile.replace(state.rootDir + '/', '')}`,
          filePath: group.sourceFile,
        })
      }
      if (group.instanceIds) {
        for (const id of group.instanceIds) {
          children.push({ kind: 'applied', label: `Uses: ${id}` })
        }
      }
      return children
    }

    return []
  }
}
