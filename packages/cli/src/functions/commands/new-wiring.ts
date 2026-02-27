import { existsSync } from 'fs'
import { dirname } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { pikkuSessionlessFunc } from '#pikku'
import { scaffoldFilePath } from '../../utils/file-writer.js'

function getWiringTemplate(type: string, name: string): string {
  switch (type) {
    case 'http':
      return `import { wireHTTP } from '#pikku'
// import { myFunc } from '../functions/${name}.functions.js'

wireHTTP({
  method: 'get',
  route: '/api/${name}',
  func: myFunc,
  auth: false,
})
`

    case 'channel':
      return `import { wireChannel } from '#pikku'
// import { onConnect, onMessage, onDisconnect } from '../functions/${name}.functions.js'

wireChannel({
  name: '${name}',
  route: '/',
  onConnect,
  onDisconnect,
  onMessage,
  auth: true,
})
`

    case 'scheduler':
      return `import { wireScheduler } from '#pikku'
// import { myTask } from '../functions/${name}.functions.js'

wireScheduler({
  name: '${name}',
  schedule: '0 * * * *',
  func: myTask,
})
`

    case 'queue':
      return `import { wireQueueWorker } from '#pikku'
// import { processItem } from '../functions/${name}.functions.js'

wireQueueWorker({
  name: '${name}',
  func: processItem,
})
`

    case 'mcp':
      return `import { wireMCPResource } from '#pikku'
// import { myResource } from '../functions/${name}.functions.js'

wireMCPResource({
  uri: '${name}',
  title: '${name}',
  description: 'TODO: describe this resource',
  func: myResource,
})
`

    case 'cli':
      return `import { wireCLI, pikkuCLICommand } from '#pikku'
// import { myCommand } from '../functions/${name}.functions.js'

wireCLI({
  program: '${name}',
  commands: {
    example: pikkuCLICommand({
      func: myCommand,
      description: 'TODO: describe this command',
    }),
  },
})
`

    case 'trigger':
      return `import { wireTrigger } from '#pikku'
// import { handleEvent } from '../functions/${name}.functions.js'

wireTrigger({
  name: '${name}',
  func: handleEvent,
})
`

    default:
      return `// ${type} wiring for ${name}\n`
  }
}

export const pikkuNewWiring = pikkuSessionlessFunc<
  { name: string; type?: string },
  void
>({
  func: async ({ logger, config }, { name, type = 'http' }) => {
    const filePath = scaffoldFilePath(config, 'wirings', name, '.wiring.ts')

    if (existsSync(filePath)) {
      logger.error(`File already exists: ${filePath}`)
      process.exit(1)
    }

    const content = getWiringTemplate(type, name)

    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf-8')
    logger.info(`Created wiring at ${filePath}`)
    console.log(filePath)
  },
})
