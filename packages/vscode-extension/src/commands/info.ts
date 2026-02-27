import * as vscode from 'vscode'
import type { PikkuInspector } from '../inspector'

export function showInfo(inspector: PikkuInspector): void {
  const state = inspector.getState()
  if (!state) {
    vscode.window.showWarningMessage(
      'Pikku: No inspector state available. Run Refresh first.'
    )
    return
  }

  const channel = vscode.window.createOutputChannel('Pikku Info')
  channel.clear()
  channel.show()

  channel.appendLine('=== Pikku Project Info ===')
  channel.appendLine('')

  // Functions
  const funcCount = Object.keys(state.functions.meta).length
  channel.appendLine(`Functions: ${funcCount}`)
  for (const [funcId, meta] of Object.entries(state.functions.meta)) {
    const types = inspector.getFunctionTypes(funcId)
    const typeBadge = types.length > 0 ? ` [${types.join(', ')}]` : ''
    const tags = meta.tags?.length ? ` (tags: ${meta.tags.join(', ')})` : ''
    channel.appendLine(`  - ${funcId}${typeBadge}${tags}`)
  }
  channel.appendLine('')

  // HTTP Routes
  if (state.http?.meta) {
    channel.appendLine('HTTP Routes:')
    for (const [method, routes] of Object.entries(state.http.meta)) {
      for (const [route, meta] of Object.entries(
        routes as Record<string, any>
      )) {
        channel.appendLine(
          `  ${method.toUpperCase()} ${route} -> ${meta.pikkuFuncId}`
        )
      }
    }
    channel.appendLine('')
  }

  // Channels
  if (state.channels?.meta && Object.keys(state.channels.meta).length > 0) {
    channel.appendLine('Channels:')
    for (const [id, meta] of Object.entries(state.channels.meta) as [
      string,
      any,
    ][]) {
      channel.appendLine(`  ${meta.name || id} (${meta.route})`)
    }
    channel.appendLine('')
  }

  // Scheduled Tasks
  if (
    state.scheduledTasks?.meta &&
    Object.keys(state.scheduledTasks.meta).length > 0
  ) {
    channel.appendLine('Scheduled Tasks:')
    for (const [id, meta] of Object.entries(state.scheduledTasks.meta) as [
      string,
      any,
    ][]) {
      channel.appendLine(
        `  ${meta.name} [${meta.schedule}] -> ${meta.pikkuFuncId}`
      )
    }
    channel.appendLine('')
  }

  // Queue Workers
  if (
    state.queueWorkers?.meta &&
    Object.keys(state.queueWorkers.meta).length > 0
  ) {
    channel.appendLine('Queue Workers:')
    for (const [id, meta] of Object.entries(state.queueWorkers.meta) as [
      string,
      any,
    ][]) {
      channel.appendLine(`  ${meta.name} -> ${meta.pikkuFuncId}`)
    }
    channel.appendLine('')
  }

  // MCP
  if (state.mcpEndpoints) {
    const tools = Object.keys(state.mcpEndpoints.toolsMeta || {})
    const resources = Object.keys(state.mcpEndpoints.resourcesMeta || {})
    const prompts = Object.keys(state.mcpEndpoints.promptsMeta || {})
    if (tools.length + resources.length + prompts.length > 0) {
      channel.appendLine('MCP Endpoints:')
      for (const [id, meta] of Object.entries(
        state.mcpEndpoints.toolsMeta || {}
      )) {
        channel.appendLine(
          `  Tool: ${(meta as any).name} -> ${(meta as any).pikkuFuncId}`
        )
      }
      for (const [id, meta] of Object.entries(
        state.mcpEndpoints.resourcesMeta || {}
      )) {
        channel.appendLine(
          `  Resource: ${(meta as any).name} -> ${(meta as any).pikkuFuncId}`
        )
      }
      for (const [id, meta] of Object.entries(
        state.mcpEndpoints.promptsMeta || {}
      )) {
        channel.appendLine(
          `  Prompt: ${(meta as any).name} -> ${(meta as any).pikkuFuncId}`
        )
      }
      channel.appendLine('')
    }
  }

  // Middleware
  if (
    state.middleware?.definitions &&
    Object.keys(state.middleware.definitions).length > 0
  ) {
    channel.appendLine('Middleware:')
    for (const id of Object.keys(state.middleware.definitions)) {
      channel.appendLine(`  - ${id}`)
    }
    channel.appendLine('')
  }

  // Permissions
  if (
    state.permissions?.definitions &&
    Object.keys(state.permissions.definitions).length > 0
  ) {
    channel.appendLine('Permissions:')
    for (const id of Object.keys(state.permissions.definitions)) {
      channel.appendLine(`  - ${id}`)
    }
    channel.appendLine('')
  }
}
