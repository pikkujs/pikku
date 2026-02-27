import * as vscode from 'vscode'
import type { PikkuInspector } from '../inspector'

export async function refresh(inspector: PikkuInspector): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Pikku: Refreshing...',
      cancellable: false,
    },
    async () => {
      await inspector.refresh()
    }
  )
}
