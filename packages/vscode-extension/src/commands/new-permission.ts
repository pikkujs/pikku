import * as vscode from 'vscode'
import { runPikkuCLI } from '../utils/run-cli'

const PERMISSION_TYPES = [
  {
    label: 'Simple',
    description: 'Standard permission check',
    value: 'simple',
  },
  {
    label: 'Factory',
    description: 'Parameterized permission factory',
    value: 'factory',
  },
]

export async function newPermission(): Promise<void> {
  const permType = await vscode.window.showQuickPick(PERMISSION_TYPES, {
    placeHolder: 'Select permission type',
  })
  if (!permType) return

  const name = await vscode.window.showInputBox({
    prompt: 'Permission name (e.g. canEditPost)',
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
        title: `Creating permission...`,
      },
      () =>
        runPikkuCLI(workspaceRoot, [
          'new',
          'permission',
          name,
          '--type',
          permType.value,
        ])
    )

    const filePath = output.split('\n').pop()?.trim()
    if (filePath) {
      const doc = await vscode.workspace.openTextDocument(filePath)
      await vscode.window.showTextDocument(doc)
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Pikku: ${err.message}`)
  }
}
