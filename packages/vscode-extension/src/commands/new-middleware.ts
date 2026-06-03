import * as vscode from 'vscode'
import { runPikkuCLI } from '../utils/run-cli'

const MIDDLEWARE_TYPES = [
  { label: 'Simple', description: 'Standard middleware', value: 'simple' },
  {
    label: 'Factory',
    description: 'Parameterized middleware factory',
    value: 'factory',
  },
]

export async function newMiddleware(): Promise<void> {
  const middlewareType = await vscode.window.showQuickPick(MIDDLEWARE_TYPES, {
    placeHolder: 'Select middleware type',
  })
  if (!middlewareType) return

  const name = await vscode.window.showInputBox({
    prompt: 'Middleware name (e.g. authMiddleware)',
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
        title: `Creating middleware...`,
      },
      () =>
        runPikkuCLI(workspaceRoot, [
          'new',
          'middleware',
          name,
          '--type',
          middlewareType.value,
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
