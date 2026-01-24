import { pikkuSchemas } from './functions/wirings/functions/schemas.js'
import { pikkuFetch } from './functions/runtimes/fetch/index.js'
import { pikkuWebSocketTyped } from './functions/runtimes/websocket/pikku-command-websocket-typed.js'
import { pikkuRPCClient } from './functions/wirings/rpc/pikku-command-rpc-client.js'
import { pikkuQueueService } from './functions/wirings/queue/pikku-command-queue-service.js'
import { pikkuOpenAPI } from './functions/wirings/http/pikku-command-openapi.js'
import { pikkuNext } from './functions/runtimes/nextjs/pikku-command-nextjs.js'
import { pikkuCLICommand, wireCLI } from '../.pikku/cli/pikku-cli-types.gen.js'
import { all } from './functions/commands/all.js'
import { bootstrap } from './functions/commands/bootstrap.js'
import { watch } from './functions/commands/watch.js'
import { oauthConnect } from './functions/commands/oauth/oauth-connect.js'
import { oauthStatus } from './functions/commands/oauth/oauth-status.js'
import { oauthDisconnect } from './functions/commands/oauth/oauth-disconnect.js'
// import { clientCLIRenderer } from './services.js'

wireCLI({
  program: 'pikku',
  description:
    'Pikku CLI - Code generation tool for type-safe backend development',
  // render: clientCLIRenderer,
  options: {
    config: {
      description: 'Path to pikku.config.json file',
      short: 'c',
    },
    logLevel: {
      description: 'Set log level',
      default: 'info' as const,
      short: 'l',
    },
    userSessionType: {
      description:
        'Specify which UserSession type to use (when multiple exist)',
    },
    singletonServicesFactoryType: {
      description: 'Specify which singleton services factory to use',
    },
    wireServicesFactoryType: {
      description: 'Specify which wire services factory to use',
    },
    stateOutput: {
      description: 'Save inspector state to JSON file for reuse',
    },
    stateInput: {
      description: 'Load inspector state from JSON file (skips inspection)',
    },
  },
  commands: {
    all: pikkuCLICommand({
      func: all,
      description: 'Generate all Pikku files (types, schemas, wirings, etc.)',
      isDefault: true,
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
        httpMethods: {
          description: 'Filter HTTP routes by methods (comma-separated)',
        },
        httpRoutes: {
          description: 'Filter HTTP routes by route patterns (comma-separated)',
        },
        names: {
          description: 'Filter functions by name patterns (supports wildcards)',
          short: 'n',
        },
      },
    }),
    bootstrap: pikkuCLICommand({
      func: bootstrap,
      description: 'Generate only type files (setup phase only)',
    }),
    watch: pikkuCLICommand({
      func: watch,
      description: 'Watch for file changes and regenerate automatically',
    }),
    schemas: pikkuCLICommand({
      func: pikkuSchemas,
      description: 'Generate JSON schemas for function input/output types',
    }),
    fetch: pikkuCLICommand({
      func: pikkuFetch,
      description: 'Generate type-safe HTTP fetch client',
    }),
    websocket: pikkuCLICommand({
      func: pikkuWebSocketTyped,
      description: 'Generate type-safe WebSocket client',
    }),
    rpc: pikkuCLICommand({
      func: pikkuRPCClient,
      description: 'Generate RPC client wrappers',
    }),
    'queue-service': pikkuCLICommand({
      func: pikkuQueueService,
      description: 'Generate queue service wrapper',
    }),
    openapi: pikkuCLICommand({
      func: pikkuOpenAPI,
      description: 'Generate OpenAPI specification from HTTP routes',
    }),
    nextjs: pikkuCLICommand({
      func: pikkuNext,
      description: 'Generate Next.js backend and HTTP wrappers',
    }),
    'oauth:connect': pikkuCLICommand({
      func: oauthConnect,
      description: 'Authorize an OAuth2 credential',
      parameters: '<credentialName>',
      options: {
        output: {
          description: 'Output mode: console or secret',
          default: 'console' as const,
          short: 'o',
        },
        port: {
          description: 'Port for callback server (default: 9876)',
          short: 'p',
        },
      },
    }),
    'oauth:status': pikkuCLICommand({
      func: oauthStatus,
      description: 'Check status of an OAuth2 credential',
      parameters: '<credentialName>',
    }),
    'oauth:disconnect': pikkuCLICommand({
      func: oauthDisconnect,
      description: 'Remove stored tokens for an OAuth2 credential',
      parameters: '<credentialName>',
    }),
  },
})
