import * as vscode from 'vscode'

const TRANSPORT_TYPES = [
  { label: 'HTTP', description: 'HTTP route wiring' },
  { label: 'WebSocket', description: 'WebSocket channel wiring' },
  { label: 'Queue', description: 'Queue worker wiring' },
  { label: 'Cron', description: 'Scheduled task wiring' },
  { label: 'MCP', description: 'Model Context Protocol wiring' },
  { label: 'CLI', description: 'CLI command wiring' },
  { label: 'Trigger', description: 'Event trigger wiring' },
]

const TEMPLATES: Record<string, string> = {
  HTTP: `import { addRoute } from '@pikku/core/http'
// import { myFunction } from '../functions/my-function'

addRoute({
  method: 'get',
  route: '/api/example',
  func: myFunction,
})
`,

  WebSocket: `import { addChannel } from '@pikku/core/channel'
// import { onConnect, onMessage, onDisconnect } from '../functions/my-channel'

addChannel({
  name: 'example',
  route: '/ws/example',
  onConnect,
  onMessage,
  onDisconnect,
})
`,

  Queue: `import { addQueueWorker } from '@pikku/core/queue'
// import { processItem } from '../functions/my-worker'

addQueueWorker({
  name: 'example-queue',
  func: processItem,
})
`,

  Cron: `import { addScheduledTask } from '@pikku/core/scheduler'
// import { cleanupOldData } from '../functions/my-task'

addScheduledTask({
  name: 'cleanup',
  schedule: '0 0 * * *', // daily at midnight
  func: cleanupOldData,
})
`,

  MCP: `import { addMCPTool } from '@pikku/core/mcp'
// import { myTool } from '../functions/my-tool'

addMCPTool({
  name: 'example-tool',
  description: 'An example MCP tool',
  func: myTool,
})
`,

  CLI: `import { addCLI } from '@pikku/core/cli'
// import { myCommand } from '../functions/my-command'

addCLI({
  name: 'example',
  description: 'An example CLI command',
  func: myCommand,
})
`,

  Trigger: `import { addTrigger } from '@pikku/core/trigger'
// import { handleEvent } from '../functions/my-trigger'

addTrigger({
  name: 'example-trigger',
  func: handleEvent,
})
`,
}

export async function newWiring(): Promise<void> {
  const transport = await vscode.window.showQuickPick(TRANSPORT_TYPES, {
    placeHolder: 'Select transport type',
  })
  if (!transport) return

  const content = TEMPLATES[transport.label] || `// ${transport.label} wiring\n`

  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'typescript',
  })
  await vscode.window.showTextDocument(doc)
}
