import * as vscode from 'vscode'
import type { PikkuInspector } from '../inspector'

type TreeElement =
  | { kind: 'definition'; id: string }
  | { kind: 'tag-group'; tag: string }
  | { kind: 'detail'; label: string; filePath?: string }

export class PermissionsTreeProvider
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
      const def = state?.permissions?.definitions[element.id]
      const item = new vscode.TreeItem(
        element.id,
        vscode.TreeItemCollapsibleState.Collapsed
      )
      item.contextValue = 'permission-definition'
      item.iconPath = new vscode.ThemeIcon('lock')
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
      item.contextValue = 'permission-tag'
      item.iconPath = new vscode.ThemeIcon('tag')
      return item
    }

    const item = new vscode.TreeItem(
      element.label,
      vscode.TreeItemCollapsibleState.None
    )
    item.contextValue = 'permission-detail'
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

      if (state.permissions?.definitions) {
        for (const id of Object.keys(state.permissions.definitions)) {
          children.push({ kind: 'definition', id })
        }
      }

      if (state.permissions?.tagPermissions) {
        for (const tag of state.permissions.tagPermissions.keys()) {
          children.push({ kind: 'tag-group', tag })
        }
      }

      return children
    }

    if (element.kind === 'definition') {
      const def = state.permissions?.definitions[element.id]
      if (!def) return []

      const details: TreeElement[] = []
      if (def.sourceFile) {
        details.push({
          kind: 'detail',
          label: `Source: ${def.sourceFile.replace(state.rootDir + '/', '')}`,
          filePath: def.sourceFile,
        })
      }

      if (state.permissions?.instances) {
        for (const [instanceId, instance] of Object.entries(
          state.permissions.instances
        )) {
          if ((instance as any).definitionId === element.id) {
            details.push({
              kind: 'detail',
              label: `Instance: ${instanceId}`,
              filePath: (instance as any).sourceFile,
            })
          }
        }
      }

      return details
    }

    if (element.kind === 'tag-group') {
      const group = state.permissions?.tagPermissions?.get(element.tag)
      if (!group) return []

      const children: TreeElement[] = []
      if (group.sourceFile) {
        children.push({
          kind: 'detail',
          label: `Source: ${group.sourceFile.replace(state.rootDir + '/', '')}`,
          filePath: group.sourceFile,
        })
      }
      if (group.instanceIds) {
        for (const id of group.instanceIds) {
          children.push({ kind: 'detail', label: `Uses: ${id}` })
        }
      }
      return children
    }

    return []
  }
}
