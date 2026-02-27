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
import { RPCDefinitionProvider } from './definitions/rpc-definition'

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!workspaceRoot) return

  const inspector = new PikkuInspector(workspaceRoot)

  // Register tree views (they'll be empty until inspection completes)
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

    // Register commands — these work even before inspection
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

    // Register Go to Definition for RPC names (cmd+click)
    vscode.languages.registerDefinitionProvider(
      { language: 'typescript' },
      new RPCDefinitionProvider(inspector)
    ),

    inspector
  )

  // Try initial inspection — shows QuickPick if multiple configs found
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Pikku: Inspecting project...',
      cancellable: false,
    },
    async () => {
      await inspector.inspect()
    }
  )
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
