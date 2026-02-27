import * as vscode from 'vscode'
import { PikkuInspector } from './inspector'
import { FunctionsTreeProvider } from './views/functions-tree'
import { WiringsTreeProvider } from './views/wirings-tree'
import { MiddlewareTreeProvider } from './views/middleware-tree'
import { PermissionsTreeProvider } from './views/permissions-tree'
import { WiringCodeLensProvider } from './codelens/wiring-lens'
import { prebuild } from './commands/prebuild'
import { refresh } from './commands/refresh'
import { newFunction } from './commands/new-function'
import { newWiring } from './commands/new-wiring'
import { showInfo } from './commands/info'

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!workspaceRoot) return

  const inspector = new PikkuInspector(workspaceRoot)

  // Initial inspection with progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: 'Pikku: Inspecting project...',
    },
    async () => {
      await inspector.inspect()
    }
  )

  // Register tree views
  const functionsTree = new FunctionsTreeProvider(inspector)
  const wiringsTree = new WiringsTreeProvider(inspector)
  const middlewareTree = new MiddlewareTreeProvider(inspector)
  const permissionsTree = new PermissionsTreeProvider(inspector)

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('pikku-functions', functionsTree),
    vscode.window.registerTreeDataProvider('pikku-wirings', wiringsTree),
    vscode.window.registerTreeDataProvider('pikku-middleware', middlewareTree),
    vscode.window.registerTreeDataProvider(
      'pikku-permissions',
      permissionsTree
    ),

    // Register commands
    vscode.commands.registerCommand('pikku.prebuild', () => prebuild()),
    vscode.commands.registerCommand('pikku.refresh', () => refresh(inspector)),
    vscode.commands.registerCommand('pikku.newFunction', () => newFunction()),
    vscode.commands.registerCommand('pikku.newWiring', () => newWiring()),
    vscode.commands.registerCommand('pikku.info', () => showInfo(inspector)),

    // Register CodeLens
    vscode.languages.registerCodeLensProvider(
      { language: 'typescript' },
      new WiringCodeLensProvider(inspector)
    ),

    // Disposable inspector
    inspector
  )
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
