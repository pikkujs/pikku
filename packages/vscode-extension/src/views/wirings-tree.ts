import * as vscode from 'vscode'
import type { PikkuInspector } from '../inspector'

type TreeElement =
  | { kind: 'transport'; transport: string }
  | {
      kind: 'wiring'
      transport: string
      id: string
      label: string
      filePath?: string
    }

export class WiringsTreeProvider
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
    if (element.kind === 'transport') {
      const item = new vscode.TreeItem(
        element.transport,
        vscode.TreeItemCollapsibleState.Expanded
      )
      item.contextValue = 'transport'
      item.iconPath = new vscode.ThemeIcon(transportIcon(element.transport))
      return item
    }

    const item = new vscode.TreeItem(
      element.label,
      vscode.TreeItemCollapsibleState.None
    )
    item.contextValue = 'wiring'
    item.iconPath = new vscode.ThemeIcon('symbol-event')

    if (element.filePath) {
      item.command = {
        command: 'vscode.open',
        title: 'Go to Wiring',
        arguments: [vscode.Uri.file(element.filePath)],
      }
    }

    return item
  }

  getChildren(element?: TreeElement): TreeElement[] {
    const state = this.inspector.getState()
    if (!state) return []

    if (!element) {
      // Root: return transport types that have entries
      const transports: TreeElement[] = []
      if (state.http?.meta && hasHTTPRoutes(state.http.meta))
        transports.push({ kind: 'transport', transport: 'HTTP Routes' })
      if (state.channels?.meta && Object.keys(state.channels.meta).length > 0)
        transports.push({ kind: 'transport', transport: 'Channels' })
      if (
        state.scheduledTasks?.meta &&
        Object.keys(state.scheduledTasks.meta).length > 0
      )
        transports.push({ kind: 'transport', transport: 'Schedulers' })
      if (
        state.queueWorkers?.meta &&
        Object.keys(state.queueWorkers.meta).length > 0
      )
        transports.push({ kind: 'transport', transport: 'Queues' })
      if (
        state.mcpEndpoints &&
        (Object.keys(state.mcpEndpoints.toolsMeta || {}).length > 0 ||
          Object.keys(state.mcpEndpoints.resourcesMeta || {}).length > 0 ||
          Object.keys(state.mcpEndpoints.promptsMeta || {}).length > 0)
      )
        transports.push({ kind: 'transport', transport: 'MCP' })
      if (state.cli?.meta && Object.keys(state.cli.meta).length > 0)
        transports.push({ kind: 'transport', transport: 'CLI' })
      if (state.triggers?.meta && Object.keys(state.triggers.meta).length > 0)
        transports.push({ kind: 'transport', transport: 'Triggers' })
      if (state.workflows?.meta && Object.keys(state.workflows.meta).length > 0)
        transports.push({ kind: 'transport', transport: 'Workflows' })
      if (
        state.agents?.agentsMeta &&
        Object.keys(state.agents.agentsMeta).length > 0
      )
        transports.push({ kind: 'transport', transport: 'Agents' })
      return transports
    }

    if (element.kind === 'transport') {
      return this.getWiringsForTransport(element.transport, state)
    }

    return []
  }

  private getWiringsForTransport(transport: string, state: any): TreeElement[] {
    const wirings: TreeElement[] = []

    switch (transport) {
      case 'HTTP Routes':
        if (state.http?.meta) {
          for (const [method, routes] of Object.entries(state.http.meta)) {
            for (const [route, meta] of Object.entries(
              routes as Record<string, any>
            )) {
              const filePath = getFileFromSet(state.http.files, meta)
              wirings.push({
                kind: 'wiring',
                transport,
                id: `${method}:${route}`,
                label: `${method.toUpperCase()} ${route} \u2192 ${meta.pikkuFuncId}`,
                filePath,
              })
            }
          }
        }
        break

      case 'Channels':
        if (state.channels?.meta) {
          for (const [id, meta] of Object.entries(
            state.channels.meta as Record<string, any>
          )) {
            const filePath = getFileFromSet(state.channels.files, meta)
            wirings.push({
              kind: 'wiring',
              transport,
              id,
              label: `${meta.name || id} (${meta.route || ''})`,
              filePath,
            })
          }
        }
        break

      case 'Schedulers':
        if (state.scheduledTasks?.meta) {
          for (const [id, meta] of Object.entries(
            state.scheduledTasks.meta as Record<string, any>
          )) {
            const filePath = getFileFromSet(state.scheduledTasks.files, meta)
            wirings.push({
              kind: 'wiring',
              transport,
              id,
              label: `${meta.name} [${meta.schedule}] \u2192 ${meta.pikkuFuncId}`,
              filePath,
            })
          }
        }
        break

      case 'Queues':
        if (state.queueWorkers?.meta) {
          for (const [id, meta] of Object.entries(
            state.queueWorkers.meta as Record<string, any>
          )) {
            const filePath = getFileFromSet(state.queueWorkers.files, meta)
            wirings.push({
              kind: 'wiring',
              transport,
              id,
              label: `${meta.name} \u2192 ${meta.pikkuFuncId}`,
              filePath,
            })
          }
        }
        break

      case 'MCP':
        if (state.mcpEndpoints?.toolsMeta) {
          for (const [id, meta] of Object.entries(
            state.mcpEndpoints.toolsMeta as Record<string, any>
          )) {
            wirings.push({
              kind: 'wiring',
              transport,
              id: `tool:${id}`,
              label: `Tool: ${meta.name} \u2192 ${meta.pikkuFuncId}`,
            })
          }
        }
        if (state.mcpEndpoints?.resourcesMeta) {
          for (const [id, meta] of Object.entries(
            state.mcpEndpoints.resourcesMeta as Record<string, any>
          )) {
            wirings.push({
              kind: 'wiring',
              transport,
              id: `resource:${id}`,
              label: `Resource: ${meta.name} \u2192 ${meta.pikkuFuncId}`,
            })
          }
        }
        if (state.mcpEndpoints?.promptsMeta) {
          for (const [id, meta] of Object.entries(
            state.mcpEndpoints.promptsMeta as Record<string, any>
          )) {
            wirings.push({
              kind: 'wiring',
              transport,
              id: `prompt:${id}`,
              label: `Prompt: ${meta.name} \u2192 ${meta.pikkuFuncId}`,
            })
          }
        }
        break

      case 'CLI':
        if (state.cli?.meta) {
          for (const [id, meta] of Object.entries(
            state.cli.meta as Record<string, any>
          )) {
            wirings.push({
              kind: 'wiring',
              transport,
              id,
              label: typeof meta === 'object' ? meta.name || id : id,
            })
          }
        }
        break

      case 'Triggers':
        if (state.triggers?.meta) {
          for (const [id, meta] of Object.entries(
            state.triggers.meta as Record<string, any>
          )) {
            wirings.push({
              kind: 'wiring',
              transport,
              id,
              label: `${meta.name} \u2192 ${meta.pikkuFuncId}`,
            })
          }
        }
        break

      case 'Workflows':
        if (state.workflows?.meta) {
          for (const [id, meta] of Object.entries(
            state.workflows.meta as Record<string, any>
          )) {
            wirings.push({
              kind: 'wiring',
              transport,
              id,
              label: `${meta.name} (${meta.steps?.length || 0} steps)`,
            })
          }
        }
        break

      case 'Agents':
        if (state.agents?.agentsMeta) {
          for (const [id, meta] of Object.entries(
            state.agents.agentsMeta as Record<string, any>
          )) {
            wirings.push({
              kind: 'wiring',
              transport,
              id,
              label: meta.name || id,
            })
          }
        }
        break
    }

    return wirings
  }
}

function hasHTTPRoutes(meta: any): boolean {
  for (const routes of Object.values(meta)) {
    if (Object.keys(routes as any).length > 0) return true
  }
  return false
}

function getFileFromSet(
  files: Set<string> | Map<string, any> | undefined,
  _meta: any
): string | undefined {
  if (!files) return undefined
  if (files instanceof Map) {
    const entry = Array.from(files.values())[0]
    return entry?.path
  }
  if (files instanceof Set) {
    return Array.from(files)[0]
  }
  return undefined
}

function transportIcon(transport: string): string {
  switch (transport) {
    case 'HTTP Routes':
      return 'globe'
    case 'Channels':
      return 'plug'
    case 'Schedulers':
      return 'clock'
    case 'Queues':
      return 'mail'
    case 'MCP':
      return 'tools'
    case 'CLI':
      return 'terminal'
    case 'Triggers':
      return 'zap'
    case 'Workflows':
      return 'git-merge'
    case 'Agents':
      return 'robot'
    default:
      return 'symbol-event'
  }
}
