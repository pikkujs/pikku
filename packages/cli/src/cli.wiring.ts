import { pikkuSchemas } from './functions/wirings/functions/schemas.js'
import { pikkuFetch } from './functions/runtimes/fetch/index.js'
import { pikkuWebSocketTyped } from './functions/runtimes/websocket/pikku-command-websocket-typed.js'
import { pikkuRPCClient } from './functions/wirings/rpc/pikku-command-rpc-client.js'
import { pikkuReactQuery } from './functions/wirings/rpc/pikku-command-react-query.js'
import { pikkuTanStackStart } from './functions/runtimes/tanstack-start/pikku-command-tanstack-start.js'
import { pikkuQueueService } from './functions/wirings/queue/pikku-command-queue-service.js'
import { pikkuOpenAPI } from './functions/wirings/http/pikku-command-openapi.js'
import { pikkuNext } from './functions/runtimes/nextjs/pikku-command-nextjs.js'
import { pikkuEmails } from './functions/wirings/emails/pikku-command-emails.js'
import { pikkuCLICommand, wireCLI } from '../.pikku/cli/pikku-cli-types.gen.js'
import { fabricCommands } from './fabric/fabric-commands.js'
import { all } from './functions/commands/all.js'
import { bootstrap } from './functions/commands/bootstrap.js'
import { watch } from './functions/commands/watch.js'
import { login, logout, whoami } from './functions/commands/login.js'
import { dev } from './functions/commands/dev.js'
import { serve } from './functions/commands/serve.js'
import { dbMigrate } from './functions/commands/db-migrate.js'
import { dbGenerate } from './functions/commands/db-generate.js'
import { dbSeed } from './functions/commands/db-seed.js'
import { dbReset } from './functions/commands/db-reset.js'
import { dbAudit } from './functions/commands/db-audit.js'
import { pikkuAudit } from './functions/commands/audit.js'
import {
  workspaceValidate,
  renderWorkspaceValidate,
} from './functions/commands/workspace-validate.js'
import { scenarioRun, scenarioList } from './functions/commands/scenario.js'
import { pikkuVersionsInit } from './functions/commands/versions-init.js'
import { pikkuEmailsInit } from './functions/commands/emails-init.js'
import { pikkuVersionsCheck } from './functions/commands/versions-check.js'
import { pikkuVersionsUpdate } from './functions/commands/versions-update.js'
import { pikkuNewFunction } from './functions/commands/new-function.js'
import { pikkuNewWiring } from './functions/commands/new-wiring.js'
import { pikkuNewMiddleware } from './functions/commands/new-middleware.js'
import { pikkuNewPermission } from './functions/commands/new-permission.js'
import { pikkuNewAddon } from './functions/commands/new-addon.js'
import { pikkuImportN8n } from './functions/commands/import-n8n.js'
import {
  pikkuInfoFunctions,
  pikkuInfoTags,
  pikkuInfoMiddleware,
  pikkuInfoPermissions,
} from './functions/commands/info.js'
import {
  enableRpc,
  enableConsole,
  enableScenarios,
  enableAgent,
  enableWorkflow,
  enableEvents,
  enableRemoteRpc,
} from './functions/commands/enable.js'
import { pikkuRealtime } from './functions/wirings/realtime/pikku-command-realtime.js'
import { binary } from './functions/commands/binary.js'
import { deployPlan } from './functions/commands/deploy-plan.js'
import { deployApply } from './functions/commands/deploy-apply.js'
import { deployInfo } from './functions/commands/deploy-info.js'
import {
  pikkuSkillsInstall,
  pikkuSkillsList,
} from './functions/commands/skills.js'
import {
  pikkuMetaFunctionsGet,
  pikkuMetaFunctionsList,
  pikkuMetaSchemasGet,
  pikkuMetaSchemasList,
  pikkuMetaMiddlewareGet,
  pikkuMetaMiddlewareList,
  pikkuMetaPermissionsGet,
  pikkuMetaPermissionsList,
  pikkuMetaWiresList,
  pikkuMetaWiresHttp,
  pikkuMetaWiresScheduler,
  pikkuMetaWiresQueue,
  pikkuMetaWiresChannel,
  pikkuMetaWiresTrigger,
  pikkuMetaWiresType,
  pikkuMetaWorkflowsGet,
  pikkuMetaWorkflowsList,
  pikkuMetaContext,
  pikkuMetaClients,
} from './functions/commands/meta.js'
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
      default: 'info' as const,
      short: 'l',
    },
    output: {
      description: 'Output format (json emits NDJSON)',
      choices: ['text', 'json'] as const,
      default: 'text' as const,
    },
    json: {
      description: 'Alias for --output json',
      default: false,
      short: 'j',
    },
    security: {
      description:
        'Run the data-classification security lint (scans function return types for Private/Pii/Secret leaks). Off by default — it forces expensive return-type inference on every function. Combine with --fail-on-error to gate a build/CI.',
      default: false,
    },
    failOnError: {
      description:
        'Fail the build on error-severity diagnostics (e.g. data-classification leaks). Default: only critical diagnostics fail.',
      default: false,
    },
    failOnWarn: {
      description:
        'Fail the build on warn-severity diagnostics (implies --fail-on-error).',
      default: false,
    },
    failOnCritical: {
      description:
        'Fail the build on critical diagnostics. Always on; accepted for symmetry with --fail-on-error/--fail-on-warn.',
      default: true,
    },
    tsc: {
      description:
        "After codegen, run a real tsc --noEmit over the project's tsconfig and fail on type errors. Prints full diagnostics with code frames. Off by default.",
      default: false,
    },
    tscSummary: {
      description:
        'Like --tsc but prints a compact one-line-per-error summary (no code frames, node_modules filtered, capped) — cheap for AI agents / CI. Fails on type errors.',
      default: false,
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
    outDir: {
      description:
        'Override output directory (default: from pikku.config.json)',
      short: 'o',
    },
  },
  commands: {
    all: pikkuCLICommand({
      func: all,
      description: 'Generate all Pikku files (types, schemas, wirings, etc.)',
      isDefault: true,
      options: {
        diff: {
          description:
            'On success, emit a structural diff of the generated .pikku meta (what this run added/removed/changed) as a PIKKU_DIFF <json> line on stdout. Only emitted on exit 0.',
          default: false,
        },
        filter: {
          description:
            'Named filter(s) from pikku.config.json filters map (comma-separated)',
        },
        tags: {
          description: 'Include functions by tags (comma-separated)',
          short: 't',
        },
        wires: {
          description: 'Filter direct wirings by category (comma-separated)',
        },
        excludeWires: {
          description: 'Exclude direct wirings by category (comma-separated)',
        },
        excludeTags: {
          description: 'Exclude functions by tags (comma-separated)',
        },
        directories: {
          description: 'Include functions by directories (comma-separated)',
          short: 'd',
        },
        excludeDirectories: {
          description: 'Exclude functions by directories (comma-separated)',
        },
        httpMethods: {
          description: 'Include HTTP routes by methods (comma-separated)',
        },
        excludeHttpMethods: {
          description: 'Exclude HTTP routes by methods (comma-separated)',
        },
        httpRoutes: {
          description:
            'Include HTTP routes by route patterns (comma-separated)',
        },
        excludeHttpRoutes: {
          description:
            'Exclude HTTP routes by route patterns (comma-separated)',
        },
        names: {
          description:
            'Include functions by name patterns (supports wildcards)',
          short: 'n',
        },
        excludeNames: {
          description:
            'Exclude functions by name patterns (supports wildcards)',
        },
        target: {
          description:
            'Include functions by deploy target (comma-separated: serverless, server)',
        },
        excludeTarget: {
          description:
            'Exclude functions by deploy target (comma-separated: serverless, server)',
        },
        forceRelativeImports: {
          description:
            'Emit relative imports even when packageMappings would apply (used by per-unit deploy codegen)',
          default: false,
        },
      },
    }),
    bootstrap: pikkuCLICommand({
      func: bootstrap,
      description: 'Generate only type files (setup phase only)',
    }),
    audit: pikkuCLICommand({
      func: pikkuAudit,
      description:
        'Audit dependencies for security advisories (always) and available updates (--outdated); writes .pikku/audit.json',
      options: {
        outdated: {
          description: 'Also report available dependency updates',
          default: false,
        },
      },
    }),
    watch: pikkuCLICommand({
      func: watch,
      description: 'Watch for file changes and regenerate automatically',
      options: {
        hmr: {
          description: 'Enable hot module reload for registered functions',
          default: false,
        },
      },
    }),
    dev: pikkuCLICommand({
      func: dev,
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
        coverage: {
          description:
            'Collect V8 precise coverage in-process; snapshot/reset via the console coverage RPCs',
          default: false,
        },
        test: {
          description:
            'Test mode: record service calls for scenario assertions and set PIKKU_TEST_RUN for isTestRun()',
          default: false,
        },
      },
    }),
    serve: pikkuCLICommand({
      func: serve,
      description:
        'Start a server using the bundled bun or node runner (no watch, no codegen)',
      options: {
        port: {
          description: 'Port for the server',
          default: '3000',
          short: 'p',
        },
        console: {
          description: 'Also serve the Pikku Console same-origin at /console',
          default: false,
        },
      },
    }),
    login: pikkuCLICommand({
      func: login,
      description:
        'Authenticate the CLI against a pikku server (device-authorization flow)',
      options: {
        url: {
          description: 'Server base URL (default: http://localhost:3000)',
          short: 'u',
        },
        clientId: {
          description: 'Client identifier sent to the device flow',
          default: 'pikku-cli',
        },
        scope: {
          description: 'Optional space-separated scopes to request',
        },
        authPath: {
          description: "better-auth base path (default: '/auth')",
        },
        open: {
          description: 'Open the verification URL in a browser',
          default: true,
        },
      },
    }),
    logout: pikkuCLICommand({
      func: logout,
      description: 'Remove a stored CLI session',
      options: {
        url: {
          description: 'Server base URL to log out of (default: current)',
          short: 'u',
        },
      },
    }),
    whoami: pikkuCLICommand({
      func: whoami,
      description: 'Show the current CLI session',
      options: {
        url: {
          description: 'Server base URL to inspect (default: current)',
          short: 'u',
        },
      },
    }),
    schemas: pikkuCLICommand({
      func: pikkuSchemas,
      description: 'Generate JSON schemas for function input/output types',
    }),
    emails: {
      description: 'Email template generation commands',
      subcommands: {
        init: pikkuCLICommand({
          func: pikkuEmailsInit,
          description:
            'Scaffold emailTemplatesDir with starter locales, theme, partials, and a hello-world email',
          options: {
            force: {
              description: 'Overwrite an existing email scaffold',
            },
          },
        }),
        generate: pikkuCLICommand({
          func: pikkuEmails,
          description:
            'Generate typed email renderers and metadata from emailTemplatesDir in pikku.config.json',
        }),
      },
    },
    db: {
      description: 'Local development database commands',
      subcommands: {
        migrate: pikkuCLICommand({
          func: dbMigrate,
          description:
            'Apply pending SQL migrations and regenerate db/schema.gen.ts',
        }),
        generate: pikkuCLICommand({
          func: dbGenerate,
          description: 'Generate SQL migrations from detected schema changes',
        }),
        seed: pikkuCLICommand({
          func: dbSeed,
          description: 'Apply db/seed.sql to the dev database',
        }),
        reset: pikkuCLICommand({
          func: dbReset,
          description: 'Wipe and recreate the dev database (migrate + seed)',
        }),
        audit: pikkuCLICommand({
          func: dbAudit,
          description:
            'Report column classifications from the manifest and flag columns with no anonymize strategy',
        }),
      },
    },
    workspace: {
      description: 'Workspace-level validation and maintenance commands',
      subcommands: {
        validate: pikkuCLICommand({
          func: workspaceValidate,
          render: renderWorkspaceValidate,
          description:
            'Check the project structure for Pikku workspace compatibility',
        }),
      },
    },
    scenario: {
      description: 'Run and inspect scenarios (pikkuScenario)',
      subcommands: {
        run: pikkuCLICommand({
          func: scenarioRun,
          description:
            'Run scenarios against a configured environment (scenarios.environments in pikku.config.json). Actor secret comes from SCENARIO_ACTOR_SECRET.',
          parameters: '<environment>',
          options: {
            flows: {
              description: 'Comma-separated flow names to run (default: all)',
              short: 'f',
            },
            tags: {
              description: 'Comma-separated tags — run flows matching any',
              short: 't',
            },
            coverage: {
              description:
                'Reset/snapshot server coverage per scenario (target must run with --coverage); writes coverage/scenario-coverage.json',
              default: false,
            },
          },
        }),
        list: pikkuCLICommand({
          func: scenarioList,
          description: 'List scenarios with names and descriptions',
        }),
      },
    },
    fabric: {
      description:
        'PikkuFabric commands (login, link, deploy, domains, secrets, logs, …)',
      subcommands: fabricCommands,
    },
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
    'react-query': pikkuCLICommand({
      func: pikkuReactQuery,
      description: 'Generate React Query hooks from RPC map',
    }),
    'tanstack-start': pikkuCLICommand({
      func: pikkuTanStackStart,
      description: 'Generate the TanStack Start server-function shim (makeApi)',
    }),
    realtime: pikkuCLICommand({
      func: pikkuRealtime,
      description:
        'Generate the typed realtime client (PikkuRealtime websocket + SSE helper)',
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
            noAuth: {
              description: 'Disable auth requirement',
              default: false,
            },
          },
        }),
        console: pikkuCLICommand({
          func: enableConsole,
          description: 'Enable console functions',
          options: {
            noAuth: {
              description: 'Disable auth requirement',
              default: false,
            },
          },
        }),
        scenarios: pikkuCLICommand({
          func: enableScenarios,
          description: 'Enable scenario instrumentation functions',
          options: {
            noAuth: {
              description: 'Disable auth requirement',
              default: false,
            },
          },
        }),
        agent: pikkuCLICommand({
          func: enableAgent,
          description: 'Enable public agent endpoints',
          options: {
            noAuth: {
              description: 'Disable auth requirement',
              default: false,
            },
          },
        }),
        workflow: pikkuCLICommand({
          func: enableWorkflow,
          description: 'Enable workflow workers',
          options: {
            noAuth: {
              description: 'Disable auth requirement',
              default: false,
            },
          },
        }),
        events: pikkuCLICommand({
          func: enableEvents,
          description:
            'Enable the realtime events channel + SSE stream (scaffolds events.gen.ts)',
          options: {
            noAuth: {
              description: 'Disable auth requirement',
              default: false,
            },
          },
        }),
        'remote-rpc': pikkuCLICommand({
          func: enableRemoteRpc,
          description:
            'Enable the remote internal RPC queue worker + HTTP endpoint (scaffolds rpc-remote.gen.ts)',
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
            authConfig: {
              description:
                'Path to an auth-config JSON overriding the spec (custom auth header, delegated login)',
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
    import: {
      description: 'Import workflows from other systems',
      subcommands: {
        n8n: pikkuCLICommand({
          func: pikkuImportN8n,
          description:
            'Import an n8n workflow JSON export into a Pikku workflow graph + stub functions',
          parameters: '<file>',
          options: {
            out: {
              description:
                'Output directory (defaults to scaffold.functionDir or cwd)',
              short: 'o',
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
          description: 'Initialize the version manifest (versions.pikku.json)',
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
    binary: pikkuCLICommand({
      func: binary,
      description:
        'Compile a TypeScript entrypoint to a self-contained native binary using bun build --compile',
      options: {
        compileTarget: {
          description:
            'Override compilation target (e.g. bun-linux-x64). Defaults to targets in pikku.config.json.',
        },
      },
    }),
    deploy: {
      description: 'Deploy Pikku project to cloud infrastructure',
      subcommands: {
        plan: pikkuCLICommand({
          func: deployPlan,
          description:
            'Show deployment plan (what will be created, updated, deleted)',
          options: {
            provider: {
              description: 'Deployment provider (cloudflare, aws)',
              default: 'cloudflare',
              short: 'p',
            },
            runtime: {
              description:
                'Server runtime for the standalone provider: node (bundle.js) or bun (compiled executable)',
              default: 'node',
            },
            resultFile: {
              description:
                'Write structured JSON plan result to this file path',
            },
          },
        }),
        apply: pikkuCLICommand({
          func: deployApply,
          description: 'Execute the deployment plan',
          options: {
            provider: {
              description: 'Deployment provider (cloudflare, aws)',
              default: 'cloudflare',
              short: 'p',
            },
            runtime: {
              description:
                'Server runtime for the standalone provider: node (bundle.js) or bun (compiled executable)',
              default: 'node',
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
          func: deployInfo,
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
    skills: {
      description:
        'Install bundled agent skills (Claude Code today; Codex/Gemini coming soon)',
      subcommands: {
        list: pikkuCLICommand({
          func: pikkuSkillsList,
          description:
            'List skills bundled with @pikku/cli and which are installed',
        }),
        install: pikkuCLICommand({
          func: pikkuSkillsInstall,
          description: 'Copy bundled skills into the current project',
          options: {
            agent: {
              description:
                'Target agent (claude | opencode | codex | gemini). Default: claude',
              default: 'claude',
            },
            only: {
              description:
                'Comma-separated list of skill names to install (default: all)',
            },
            core: {
              description:
                'Install skills whose frontmatter includes installGroups: [core]',
              default: false,
            },
            fabric: {
              description:
                'Install skills whose frontmatter includes installGroups: [fabric]',
              default: false,
            },
            update: {
              description: 'Overwrite existing skills if already installed',
              default: false,
            },
          },
        }),
      },
    },
    meta: {
      description: 'Inspect project metadata in machine-readable form',
      subcommands: {
        context: pikkuCLICommand({
          func: pikkuMetaContext,
          description:
            'Bulk project context for planners (functions, wires, middleware, permissions, workflows, capabilities, layout) in one call',
        }),
        clients: pikkuCLICommand({
          func: pikkuMetaClients,
          description:
            'Frontend-targeted metadata: exposed RPCs, workflows, channels with their input/output type names and descriptions',
        }),
        functions: {
          func: pikkuMetaFunctionsList,
          description: 'Inspect function metadata',
          subcommands: {
            list: pikkuCLICommand({
              func: pikkuMetaFunctionsList,
              description: 'List available functions (lightweight index)',
            }),
            get: pikkuCLICommand({
              func: pikkuMetaFunctionsGet,
              description: 'Get full metadata for a function id',
              parameters: '<functionId>',
            }),
          },
        },
        schemas: {
          func: pikkuMetaSchemasList,
          description: 'Inspect generated JSON schemas',
          subcommands: {
            list: pikkuCLICommand({
              func: pikkuMetaSchemasList,
              description: 'List generated JSON schema names',
            }),
            get: pikkuCLICommand({
              func: pikkuMetaSchemasGet,
              description: 'Get one generated JSON schema by name',
              parameters: '<schemaName>',
            }),
          },
        },
        workflows: {
          func: pikkuMetaWorkflowsList,
          description: 'Inspect workflow metadata',
          subcommands: {
            list: pikkuCLICommand({
              func: pikkuMetaWorkflowsList,
              description: 'List available workflows (lightweight index)',
            }),
            get: pikkuCLICommand({
              func: pikkuMetaWorkflowsGet,
              description: 'Get full metadata for a workflow id',
              parameters: '<workflowId>',
            }),
          },
        },
        middleware: {
          func: pikkuMetaMiddlewareList,
          description: 'Inspect middleware metadata',
          subcommands: {
            list: pikkuCLICommand({
              func: pikkuMetaMiddlewareList,
              description: 'List available middleware (lightweight index)',
            }),
            get: pikkuCLICommand({
              func: pikkuMetaMiddlewareGet,
              description: 'Get full metadata for a middleware id',
              parameters: '<middlewareId>',
            }),
          },
        },
        permissions: {
          func: pikkuMetaPermissionsList,
          description: 'Inspect permission metadata',
          subcommands: {
            list: pikkuCLICommand({
              func: pikkuMetaPermissionsList,
              description: 'List available permissions (lightweight index)',
            }),
            get: pikkuCLICommand({
              func: pikkuMetaPermissionsGet,
              description: 'Get full metadata for a permission id',
              parameters: '<permissionId>',
            }),
          },
        },
        wires: {
          func: pikkuMetaWiresList,
          description: 'Inspect wire metadata',
          subcommands: {
            list: pikkuCLICommand({
              func: pikkuMetaWiresList,
              description: 'List available wire types and counts',
            }),
            http: pikkuCLICommand({
              func: pikkuMetaWiresHttp,
              description: 'List HTTP wire entries',
            }),
            scheduler: pikkuCLICommand({
              func: pikkuMetaWiresScheduler,
              description: 'List scheduler wire entries',
            }),
            queue: pikkuCLICommand({
              func: pikkuMetaWiresQueue,
              description: 'List queue wire entries',
            }),
            channel: pikkuCLICommand({
              func: pikkuMetaWiresChannel,
              description: 'List channel wire entries',
            }),
            trigger: pikkuCLICommand({
              func: pikkuMetaWiresTrigger,
              description: 'List trigger wire entries',
            }),
            get: pikkuCLICommand({
              func: pikkuMetaWiresType,
              description: 'Get wire entries for a type',
              parameters: '<type>',
            }),
          },
        },
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
