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
import { consoleCommand } from './functions/commands/console.js'
import { pikkuVersionsInit } from './functions/commands/versions-init.js'
import { pikkuVersionsCheck } from './functions/commands/versions-check.js'
import { pikkuVersionsUpdate } from './functions/commands/versions-update.js'
import { pikkuNewFunction } from './functions/commands/new-function.js'
import { pikkuNewWiring } from './functions/commands/new-wiring.js'
import { pikkuNewMiddleware } from './functions/commands/new-middleware.js'
import { pikkuNewPermission } from './functions/commands/new-permission.js'
import { pikkuNewAddon } from './functions/commands/new-addon.js'
import {
  pikkuInfoFunctions,
  pikkuInfoTags,
  pikkuInfoMiddleware,
  pikkuInfoPermissions,
} from './functions/commands/info.js'
import {
  enableRpc,
  enableConsole,
  enableAgent,
  enableWorkflow,
} from './functions/commands/enable.js'
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
    console: pikkuCLICommand({
      func: consoleCommand,
      description: 'Start the Pikku Console UI with live file watching',
      options: {
        port: {
          description: 'Port for the console server',
          default: '51442',
          short: 'p',
        },
        open: {
          description: 'Open the console in the browser',
          default: 'false',
          short: 'o',
        },
      },
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
    enable: {
      description: 'Enable Pikku features',
      subcommands: {
        rpc: pikkuCLICommand({
          func: enableRpc,
          description: 'Enable public RPC endpoint',
          options: {
            'no-auth': {
              description: 'Disable auth requirement',
              default: false,
            },
          },
        }),
        console: pikkuCLICommand({
          func: enableConsole,
          description: 'Enable console functions',
          options: {
            'no-auth': {
              description: 'Disable auth requirement',
              default: false,
            },
          },
        }),
        agent: pikkuCLICommand({
          func: enableAgent,
          description: 'Enable public agent endpoints',
          options: {
            'no-auth': {
              description: 'Disable auth requirement',
              default: false,
            },
          },
        }),
        workflow: pikkuCLICommand({
          func: enableWorkflow,
          description: 'Enable workflow workers',
          options: {
            'no-auth': {
              description: 'Disable auth requirement',
              default: false,
            },
          },
        }),
      },
    },
    new: {
      description: 'Scaffold new functions and wirings',
      subcommands: {
        function: pikkuCLICommand({
          func: pikkuNewFunction,
          description: 'Create a new Pikku function file',
          parameters: '<name>',
          options: {
            type: {
              description:
                'Function type: func, sessionless (default), or void',
              short: 't',
              default: 'sessionless',
            },
          },
        }),
        wiring: pikkuCLICommand({
          func: pikkuNewWiring,
          description: 'Create a new wiring file',
          parameters: '<name>',
          options: {
            type: {
              description:
                'Wiring type: http (default), channel, scheduler, queue, mcp, cli, or trigger',
              short: 't',
              default: 'http',
            },
          },
        }),
        middleware: pikkuCLICommand({
          func: pikkuNewMiddleware,
          description: 'Create a new middleware file',
          parameters: '<name>',
          options: {
            type: {
              description: 'Middleware type: simple (default) or factory',
              short: 't',
              default: 'simple',
            },
          },
        }),
        permission: pikkuCLICommand({
          func: pikkuNewPermission,
          description: 'Create a new permission file',
          parameters: '<name>',
          options: {
            type: {
              description: 'Permission type: simple (default) or factory',
              short: 't',
              default: 'simple',
            },
          },
        }),
        addon: pikkuCLICommand({
          func: pikkuNewAddon,
          description: 'Scaffold a new addon package',
          parameters: '<name>',
          options: {
            displayName: {
              description:
                'Human-readable display name (defaults to PascalCase of name)',
            },
            description: {
              description:
                'Package description (defaults to "{displayName} integration for Pikku")',
            },
            category: {
              description: 'Forge category (defaults to "General")',
              default: 'General',
            },
            dir: {
              description:
                'Override output directory (defaults to scaffold.addonDir or cwd)',
              short: 'd',
            },
            secret: {
              description: 'Include secret schema file',
              default: false,
            },
            variable: {
              description: 'Include variable definition file',
              default: false,
            },
            oauth: {
              description:
                'Include OAuth2 credential wiring and OAuth2Client-based API service',
              default: false,
            },
            test: {
              description: 'Include test harness (default: true)',
              default: true,
            },
            openapi: {
              description:
                'Path to OpenAPI YAML/JSON spec to generate functions from',
            },
            mcp: {
              description:
                'Add mcp: true to generated functions (expose as MCP tools)',
              default: false,
            },
          },
        }),
      },
    },
    versions: {
      description: 'Manage function contract versions',
      subcommands: {
        init: pikkuCLICommand({
          func: pikkuVersionsInit,
          description: 'Initialize the version manifest (versions.json)',
          options: {
            force: {
              description: 'Overwrite existing manifest',
            },
          },
        }),
        check: pikkuCLICommand({
          func: pikkuVersionsCheck,
          description:
            'Validate function contracts against the version manifest',
        }),
        update: pikkuCLICommand({
          func: pikkuVersionsUpdate,
          description:
            'Update the version manifest with current contract hashes',
        }),
      },
    },
    info: pikkuCLICommand({
      func: pikkuInfoFunctions,
      description: 'Show information about Pikku project resources',
      options: {
        limit: {
          description: 'Maximum number of rows to display',
          default: '50',
        },
        verbose: {
          description: 'Show additional details (file paths, services, etc.)',
          default: false,
        },
      },
      subcommands: {
        functions: pikkuCLICommand({
          func: pikkuInfoFunctions,
          description: 'List all registered functions',
          options: {
            limit: {
              description: 'Maximum number of rows to display',
              default: '50',
            },
            verbose: {
              description: 'Show additional details (type, middleware, file)',
              default: false,
            },
          },
        }),
        tags: pikkuCLICommand({
          func: pikkuInfoTags,
          description:
            'List all tags with associated functions, middleware, and permissions',
          options: {
            limit: {
              description: 'Maximum number of rows to display',
              default: '50',
            },
            verbose: {
              description: 'Show names instead of counts',
              default: false,
            },
          },
        }),
        middleware: pikkuCLICommand({
          func: pikkuInfoMiddleware,
          description: 'List all middleware definitions',
          options: {
            limit: {
              description: 'Maximum number of rows to display',
              default: '50',
            },
            verbose: {
              description: 'Show additional details (sourceFile, services)',
              default: false,
            },
          },
        }),
        permissions: pikkuCLICommand({
          func: pikkuInfoPermissions,
          description: 'List all permission definitions',
          options: {
            limit: {
              description: 'Maximum number of rows to display',
              default: '50',
            },
            verbose: {
              description: 'Show additional details (sourceFile, services)',
              default: false,
            },
          },
        }),
      },
    }),
  },
})
