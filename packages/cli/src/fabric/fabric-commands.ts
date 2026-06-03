/**
 * Pikku addon entrypoint. Exports `fabricCommands` — a `defineCLICommands`
 * map intended to be nested under the parent pikku CLI's `fabric:` subcommand
 * group:
 *
 * ```ts
 * import { fabricCommands } from '@pikku/fabric-cli'
 *
 * wireCLI({
 *   program: 'pikku',
 *   commands: {
 *     // …existing commands…
 *     fabric: { description: 'PikkuFabric commands', subcommands: fabricCommands },
 *   },
 * })
 * ```
 *
 * There is only one `wireCLI` in the pikku binary — this package contributes
 * a typed command map, nothing more.
 */
import {
  defineCLICommands,
  pikkuCLICommand,
} from '../../.pikku/cli/pikku-cli-types.gen.js'
import { FabricLogin } from './functions/login.function.js'
import { FabricInit } from './functions/init.function.js'
import { FabricLink } from './functions/link.function.js'
import {
  FabricDeployPlan,
  FabricDeployApply,
  renderDeployPlan,
  renderDeployApply,
} from './functions/deploy.function.js'
import {
  FabricDeployList,
  renderDeployList,
} from './functions/deploy-list.function.js'
import {
  FabricDeployUnits,
  renderDeployUnits,
} from './functions/deploy-units.function.js'
import { FabricStatus, renderStatus } from './functions/status.function.js'
import { FabricErrors, renderErrors } from './functions/errors.function.js'
import {
  FabricDbSchema,
  renderDbSchema,
} from './functions/db-schema.function.js'
import { FabricRollback } from './functions/rollback.function.js'
import { FabricSecretsSet } from './functions/secrets-set.function.js'
import { FabricSecretsList } from './functions/secrets-list.function.js'
import { FabricLogs } from './functions/logs.function.js'
import { FabricMetrics } from './functions/metrics.function.js'
import { FabricTrace } from './functions/trace.function.js'
import { FabricDomainsList } from './functions/domains-list.function.js'
import { FabricDomainsAdd } from './functions/domains-add.function.js'
import { FabricDomainsRemove } from './functions/domains-remove.function.js'
import { FabricLLMKey, renderLLMKey } from './functions/llm-key.function.js'
import {
  FabricValidate,
  renderValidate,
} from './functions/validate.function.js'

export const fabricCommands = defineCLICommands({
  validate: pikkuCLICommand({
    func: FabricValidate,
    render: renderValidate,
    description:
      'Check the project structure for fabric compatibility — prints all missing or misconfigured items with fix hints',
  }),
  login: pikkuCLICommand({
    func: FabricLogin,
    description: 'Authenticate against fabric-api',
    options: {
      apiKey: { description: 'Use a static API key instead of browser flow' },
      token: {
        description: 'Use an existing fabric token instead of browser flow',
      },
      apiUrl: { description: 'Override the fabric-api URL for this login' },
      consoleUrl: { description: 'Override the console URL the browser opens' },
    },
  }),
  init: pikkuCLICommand({
    parameters: '<repo>',
    func: FabricInit,
    description: 'Adopt an existing git repo as a fabric project',
    options: {
      name: {
        description:
          'Override the project display name (defaults to repo name)',
      },
      branch: { description: 'Default branch (defaults to main)' },
      force: {
        description: 'Replace existing fabric.config.json',
        default: false,
      },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  link: pikkuCLICommand({
    func: FabricLink,
    description:
      'Register the current git repo as a fabric project and queue an initial deploy',
    options: {
      apiUrl: {
        description: 'Override the fabric-api URL stored in fabric.config.json',
      },
    },
  }),
  deploy: {
    description: 'Plan and apply deploys for a named branch or production',
    subcommands: {
      plan: pikkuCLICommand({
        func: FabricDeployPlan,
        render: renderDeployPlan,
        description: 'Resolve the target ref and report what a deploy would do',
        options: {
          branch: { description: 'Target branch to deploy', short: 'b' },
          production: {
            description: 'Plan production (always main)',
            default: false,
          },
        },
      }),
      apply: pikkuCLICommand({
        func: FabricDeployApply,
        render: renderDeployApply,
        description: 'Build + deploy a named branch or production (main)',
        options: {
          branch: { description: 'Target branch to deploy', short: 'b' },
          production: {
            description: 'Deploy production (always main)',
            default: false,
          },
          message: {
            description: 'Annotation stored on the deployment',
            short: 'm',
          },
          autoApply: {
            description: 'Deploy without the confirmation prompt',
            default: false,
          },
        },
      }),
      list: pikkuCLICommand({
        func: FabricDeployList,
        render: renderDeployList,
        description: 'List recent deployments for a branch',
        options: {
          branch: { description: 'Target branch', short: 'b' },
        },
      }),
      units: pikkuCLICommand({
        func: FabricDeployUnits,
        render: renderDeployUnits,
        description: 'List the deployed worker units (topology) for a branch',
        options: {
          branch: { description: 'Target branch', short: 'b' },
        },
      }),
    },
  },
  rollback: pikkuCLICommand({
    parameters: '<branch> [target]',
    func: FabricRollback,
    description: 'Roll live back to a previous deployment artifact',
    options: {
      list: { description: 'List rollback candidates', default: false },
      dryRun: {
        description: 'Show schema-compat result without switching',
        default: false,
      },
      yes: {
        description: 'Skip confirmation prompts',
        short: 'y',
        default: false,
      },
    },
  }),
  secrets: {
    description: 'Manage stage-scoped secrets',
    subcommands: {
      set: pikkuCLICommand({
        parameters: '<name>',
        func: FabricSecretsSet,
        description: 'Set a stage-scoped secret',
        options: {
          branch: { description: 'Target branch', short: 'b' },
          value: { description: 'Secret value (prompted if omitted)' },
          force: {
            description: 'Overwrite without confirmation',
            default: false,
          },
        },
      }),
      list: pikkuCLICommand({
        func: FabricSecretsList,
        description: 'List stage secrets',
        options: {
          branch: { description: 'Target branch', short: 'b' },
          json: { description: 'Machine-readable output', default: false },
        },
      }),
    },
  },
  logs: pikkuCLICommand({
    func: FabricLogs,
    description: 'Stream or fetch logs',
    options: {
      branch: { description: 'Target branch', short: 'b' },
      deployment: { description: 'Specific deployment id' },
      level: { description: 'Minimum level (debug/info/warn/error)' },
      since: { description: 'Time window (e.g. 15m, 2h)' },
      follow: {
        description: 'Stream new logs (SSE)',
        short: 'f',
        default: false,
      },
      json: { description: 'Machine-readable output', default: false },
    },
  }),
  metrics: pikkuCLICommand({
    func: FabricMetrics,
    description: 'Show request rate / error rate / latency for a stage',
    options: {
      branch: { description: 'Target branch', short: 'b' },
      hours: { description: 'Lookback window in hours (default 24)' },
      function: { description: 'Filter by wire id (e.g. function name)' },
      json: { description: 'Machine-readable output', default: false },
    },
  }),
  trace: pikkuCLICommand({
    parameters: '<traceId>',
    func: FabricTrace,
    description: 'Print every event for a single trace across the stage',
    options: {
      branch: { description: 'Target branch', short: 'b' },
      json: { description: 'Machine-readable output', default: false },
    },
  }),
  status: pikkuCLICommand({
    func: FabricStatus,
    render: renderStatus,
    description: 'Show the linked project status (active + in-flight deploy)',
  }),
  errors: pikkuCLICommand({
    func: FabricErrors,
    render: renderErrors,
    description: 'Show recent error-level events for a branch (with traceIds)',
    options: {
      branch: { description: 'Target branch', short: 'b' },
      function: { description: 'Filter by function name' },
    },
  }),
  db: {
    description: 'Inspect the stage database',
    subcommands: {
      schema: pikkuCLICommand({
        func: FabricDbSchema,
        render: renderDbSchema,
        description: 'Show the live database schema (tables + columns)',
        options: {
          branch: { description: 'Target branch', short: 'b' },
        },
      }),
    },
  },
  domains: {
    description: 'Manage custom domains for the production stage',
    subcommands: {
      list: pikkuCLICommand({
        func: FabricDomainsList,
        description: 'List custom domains for the linked project',
        options: {
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      add: pikkuCLICommand({
        parameters: '<hostname>',
        func: FabricDomainsAdd,
        description: 'Add a custom domain to the production stage',
        options: {
          target: {
            description:
              'Route target: api (Backend API) or app (Frontend App)',
            default: 'api',
          },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      remove: pikkuCLICommand({
        parameters: '<hostname>',
        func: FabricDomainsRemove,
        description: 'Remove a custom domain from the production stage',
        options: {
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
    },
  },
  llm: {
    description: 'Fabric AI gateway developer key commands',
    subcommands: {
      key: pikkuCLICommand({
        func: FabricLLMKey,
        render: renderLLMKey,
        description: 'Mint or reuse a developer-scoped Fabric AI gateway key',
        options: {
          shell: {
            description: 'Print shell export lines',
            default: false,
          },
          env: {
            description: 'Print .env-style key-value lines',
            default: false,
          },
          json: {
            description: 'Print machine-readable JSON',
            default: false,
          },
        },
      }),
    },
  },
})
