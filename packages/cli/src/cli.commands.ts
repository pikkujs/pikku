import {
  pikkuCLICommand,
  defineCLICommands,
} from '../.pikku/cli/pikku-cli-types.gen.js'
import { ref } from '#pikku'

export const pikkuCLIOptions = {
  config: {
    description: 'Path to pikku.config.json file',
    short: 'c',
  },
  logLevel: {
    description: 'Set log level',
    default: 'info' as const,
    short: 'l',
  },
  output: {
    description: 'Output format (json emits NDJSON)',
    choices: ['text', 'json'],
    default: 'text' as const,
  },
  json: {
    description: 'Alias for --output json',
    default: false,
    short: 'j',
  },
  userSessionType: {
    description: 'Specify which UserSession type to use (when multiple exist)',
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
  outDir: {
    description: 'Override output directory (default: from pikku.config.json)',
    short: 'o',
  },
}

export const pikkuCommands = defineCLICommands({
  all: pikkuCLICommand({
    func: ref('cli:all'),
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
    func: ref('cli:bootstrap'),
    description: 'Generate only type files (setup phase only)',
  }),
  watch: pikkuCLICommand({
    func: ref('cli:watch'),
    description: 'Watch for file changes and regenerate automatically',
    options: {
      hmr: {
        description: 'Enable hot module reload for registered functions',
        default: false,
      },
    },
  }),
  dev: pikkuCLICommand({
    func: ref('cli:dev'),
    description: 'Start a local development server with all services wired',
    options: {
      port: {
        description: 'Port for the dev server',
        default: '3000',
        short: 'p',
      },
      watch: {
        description: 'Watch for file changes and regenerate',
        default: true,
      },
      hmr: {
        description: 'Enable hot module reload',
        default: true,
      },
    },
  }),
  console: pikkuCLICommand({
    func: ref('cli:consoleCommand'),
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
      hmr: {
        description: 'Enable hot module reload for registered functions',
        default: false,
      },
    },
  }),
  schemas: pikkuCLICommand({
    func: ref('cli:pikkuSchemas'),
    description: 'Generate JSON schemas for function input/output types',
  }),
  fetch: pikkuCLICommand({
    func: ref('cli:pikkuFetch'),
    description: 'Generate type-safe HTTP fetch client',
  }),
  websocket: pikkuCLICommand({
    func: ref('cli:pikkuWebSocketTyped'),
    description: 'Generate type-safe WebSocket client',
  }),
  rpc: pikkuCLICommand({
    func: ref('cli:pikkuRPCClient'),
    description: 'Generate RPC client wrappers',
  }),
  'react-query': pikkuCLICommand({
    func: ref('cli:pikkuReactQuery'),
    description: 'Generate React Query hooks from RPC map',
  }),
  'queue-service': pikkuCLICommand({
    func: ref('cli:pikkuQueueService'),
    description: 'Generate queue service wrapper',
  }),
  openapi: pikkuCLICommand({
    func: ref('cli:pikkuOpenAPI'),
    description: 'Generate OpenAPI specification from HTTP routes',
  }),
  nextjs: pikkuCLICommand({
    func: ref('cli:pikkuNext'),
    description: 'Generate Next.js backend and HTTP wrappers',
  }),
  enable: {
    description: 'Enable Pikku features',
    subcommands: {
      rpc: pikkuCLICommand({
        func: ref('cli:enableRpc'),
        description: 'Enable public RPC endpoint',
        options: {
          noAuth: {
            description: 'Disable auth requirement',
            default: false,
          },
        },
      }),
      console: pikkuCLICommand({
        func: ref('cli:enableConsole'),
        description: 'Enable console functions',
        options: {
          noAuth: {
            description: 'Disable auth requirement',
            default: false,
          },
        },
      }),
      agent: pikkuCLICommand({
        func: ref('cli:enableAgent'),
        description: 'Enable public agent endpoints',
        options: {
          noAuth: {
            description: 'Disable auth requirement',
            default: false,
          },
        },
      }),
      workflow: pikkuCLICommand({
        func: ref('cli:enableWorkflow'),
        description: 'Enable workflow workers',
        options: {
          noAuth: {
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
        func: ref('cli:pikkuNewFunction'),
        description: 'Create a new Pikku function file',
        parameters: '<name>',
        options: {
          type: {
            description: 'Function type: func, sessionless (default), or void',
            short: 't',
            default: 'sessionless',
          },
        },
      }),
      wiring: pikkuCLICommand({
        func: ref('cli:pikkuNewWiring'),
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
        func: ref('cli:pikkuNewMiddleware'),
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
        func: ref('cli:pikkuNewPermission'),
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
        func: ref('cli:pikkuNewAddon'),
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
          credential: {
            description:
              'Include per-user credential wiring (apikey, bearer, or oauth2)',
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
          camelCase: {
            description:
              'Convert snake_case property names to camelCase in generated Zod schemas',
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
        func: ref('cli:pikkuVersionsInit'),
        description: 'Initialize the version manifest (versions.pikku.json)',
        options: {
          force: {
            description: 'Overwrite existing manifest',
          },
        },
      }),
      check: pikkuCLICommand({
        func: ref('cli:pikkuVersionsCheck'),
        description: 'Validate function contracts against the version manifest',
      }),
      update: pikkuCLICommand({
        func: ref('cli:pikkuVersionsUpdate'),
        description: 'Update the version manifest with current contract hashes',
      }),
    },
  },
  deploy: {
    description: 'Deploy Pikku project to cloud infrastructure',
    subcommands: {
      plan: pikkuCLICommand({
        func: ref('cli:deployPlan'),
        description:
          'Show deployment plan (what will be created, updated, deleted)',
        options: {
          provider: {
            description: 'Deployment provider (cloudflare, aws)',
            default: 'cloudflare',
            short: 'p',
          },
          resultFile: {
            description: 'Write structured JSON plan result to this file path',
          },
        },
      }),
      apply: pikkuCLICommand({
        func: ref('cli:deployApply'),
        description: 'Execute the deployment plan',
        options: {
          provider: {
            description: 'Deployment provider (cloudflare, aws)',
            default: 'cloudflare',
            short: 'p',
          },
          fromPlan: {
            description:
              'Skip build pipeline, deploy from existing plan output',
            default: false,
          },
          resultFile: {
            description:
              'Write structured JSON deploy result to this file path',
          },
        },
      }),
      info: pikkuCLICommand({
        func: ref('cli:deployInfo'),
        description:
          'Show project deployment info (workers, queues, crons, secrets)',
        options: {
          provider: {
            description: 'Deployment provider (cloudflare, aws)',
            default: 'cloudflare',
            short: 'p',
          },
        },
      }),
    },
  },
  info: pikkuCLICommand({
    func: ref('cli:pikkuInfoFunctions'),
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
        func: ref('cli:pikkuInfoFunctions'),
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
        func: ref('cli:pikkuInfoTags'),
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
        func: ref('cli:pikkuInfoMiddleware'),
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
        func: ref('cli:pikkuInfoPermissions'),
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
})
