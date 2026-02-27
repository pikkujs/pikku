import * as vscode from 'vscode'

export function prebuild(): void {
  const terminal =
    vscode.window.terminals.find((t) => t.name === 'Pikku') ||
    vscode.window.createTerminal('Pikku')
  terminal.show()
  terminal.sendText('npx pikku prebuild')
}
