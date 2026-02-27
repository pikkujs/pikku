import * as vscode from 'vscode'
import { runPikkuCLI } from '../utils/run-cli'

const TRANSPORT_TYPES = [
  { label: 'HTTP', description: 'HTTP route wiring', value: 'http' },
  {
    label: 'WebSocket',
    description: 'WebSocket channel wiring',
    value: 'channel',
  },
  { label: 'Queue', description: 'Queue worker wiring', value: 'queue' },
  { label: 'Cron', description: 'Scheduled task wiring', value: 'scheduler' },
  { label: 'MCP', description: 'Model Context Protocol wiring', value: 'mcp' },
  { label: 'CLI', description: 'CLI command wiring', value: 'cli' },
  { label: 'Trigger', description: 'Event trigger wiring', value: 'trigger' },
]

export async function newWiring(): Promise<void> {
  const transport = await vscode.window.showQuickPick(TRANSPORT_TYPES, {
    placeHolder: 'Select transport type',
  })
  if (!transport) return

  const name = await vscode.window.showInputBox({
    prompt: 'Wiring name (e.g. todos)',
    validateInput: (value) => {
      if (!value) return 'Name is required'
      if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(value))
        return 'Must be a valid identifier (letters, numbers, hyphens)'
      return undefined
    },
  })
  if (!name) return

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  try {
    const output = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Creating ${transport.label} wiring...`,
      },
      () =>
        runPikkuCLI(workspaceRoot, [
          'new',
          'wiring',
          name,
          '--type',
          transport.value,
        ])
    )

    // Last line of stdout is the file path
    const filePath = output.split('\n').pop()?.trim()
    if (filePath) {
      const doc = await vscode.workspace.openTextDocument(filePath)
      await vscode.window.showTextDocument(doc)
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Pikku: ${err.message}`)
  }
}
