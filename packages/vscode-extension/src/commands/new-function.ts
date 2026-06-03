import * as vscode from 'vscode'
import { runPikkuCLI } from '../utils/run-cli'

const FUNCTION_TYPES = [
  {
    label: 'pikkuSessionlessFunc',
    description: 'Function without session requirement',
    value: 'sessionless',
  },
  {
    label: 'pikkuFunc',
    description: 'Standard function with session',
    value: 'func',
  },
  {
    label: 'pikkuVoidFunc',
    description: 'Fire-and-forget function',
    value: 'void',
  },
]

export async function newFunction(): Promise<void> {
  const funcType = await vscode.window.showQuickPick(FUNCTION_TYPES, {
    placeHolder: 'Select function type',
  })
  if (!funcType) return

  const name = await vscode.window.showInputBox({
    prompt: 'Function name (e.g. getBooks)',
    validateInput: (value) => {
      if (!value) return 'Name is required'
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(value))
        return 'Must be a valid identifier'
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
        title: `Creating ${funcType.label}...`,
      },
      () =>
        runPikkuCLI(workspaceRoot, [
          'new',
          'function',
          name,
          '--type',
          funcType.value,
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
