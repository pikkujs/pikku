import { pikkuSchemas } from './functions/wirings/functions/schemas.js'
import { pikkuFetch } from './functions/wirings/fetch/index.js'
import { pikkuWebSocketTyped } from './functions/wirings/channels/pikku-command-websocket-typed.js'
import { pikkuRPCClient } from './functions/wirings/rpc/pikku-command-rpc-client.js'
import { pikkuQueueService } from './functions/wirings/queue/pikku-command-queue-service.js'
import { pikkuOpenAPI } from './functions/wirings/http/pikku-command-openapi.js'
import { pikkuNext } from './functions/runtimes/nextjs/pikku-command-nextjs.js'
import { pikkuCLICommand, wireCLI } from '../.pikku/cli/pikku-cli-types.gen.js'
import { all } from './functions/commands/all.js'
import { defaultCLIRenderer } from './services.js'

wireCLI({
  program: 'pikku',
  description:
    'Pikku CLI - Code generation tool for type-safe backend development',
  render: defaultCLIRenderer,
  options: {
    config: {
      description: 'Path to pikku.config.json file',
      short: 'c',
    },
    logLevel: {
      description: 'Set log level',
      default: 'info',
      short: 'l',
    },
  },
  commands: {
    all: pikkuCLICommand({
      command: 'all',
      func: all,
      description: 'Generate all Pikku files (types, schemas, wirings, etc.)',
      options: {
        tags: {
          description: 'Filter functions by tags (comma-separated)',
          short: 't',
        },
        types: {
          description: 'Filter functions by types (comma-separated)',
        },
        directories: {
          description: 'Filter functions by directories (comma-separated)',
          short: 'd',
        },
      },
    }),
    schemas: pikkuCLICommand({
      command: 'schemas',
      func: pikkuSchemas,
      description: 'Generate JSON schemas for function input/output types',
    }),
    fetch: pikkuCLICommand({
      command: 'fetch',
      func: pikkuFetch,
      description: 'Generate type-safe HTTP fetch client',
    }),
    websocket: pikkuCLICommand({
      command: 'websocket',
      func: pikkuWebSocketTyped,
      description: 'Generate type-safe WebSocket client',
    }),
    rpc: pikkuCLICommand({
      command: 'rpc',
      func: pikkuRPCClient,
      description: 'Generate RPC client wrappers',
    }),
    'queue-service': pikkuCLICommand({
      command: 'queue-service',
      func: pikkuQueueService,
      description: 'Generate queue service wrapper',
    }),
    openapi: pikkuCLICommand({
      command: 'openapi',
      func: pikkuOpenAPI,
      description: 'Generate OpenAPI specification from HTTP routes',
    }),
    nextjs: pikkuCLICommand({
      command: 'nextjs',
      func: pikkuNext,
      description: 'Generate Next.js backend and HTTP wrappers',
    }),
  },
})
