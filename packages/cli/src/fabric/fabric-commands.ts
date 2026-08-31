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
  FabricDeployApply,
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
import {
  FabricProjectsList,
  renderProjectsList,
} from './functions/projects-list.function.js'
import { FabricErrors, renderErrors } from './functions/errors.function.js'
import {
  FabricDbSchema,
  renderDbSchema,
} from './functions/db-schema.function.js'
import { FabricRollback } from './functions/rollback.function.js'
import { FabricSecretsSet } from './functions/secrets-set.function.js'
import { FabricSecretsList } from './functions/secrets-list.function.js'
import { FabricSecretsDelete } from './functions/secrets-delete.function.js'
import { FabricSecretsRotate } from './functions/secrets-rotate.function.js'
import { FabricVariablesSet } from './functions/variables-set.function.js'
import { FabricVariablesGet } from './functions/variables-get.function.js'
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
import { FabricSmoke, renderSmoke } from './functions/smoke.function.js'
import { FabricPublish } from './functions/publish.function.js'
import { FabricAdd } from './functions/add.function.js'
import { FabricReport } from './functions/report.function.js'
import {
  FabricFindingsList,
  renderFindingsList,
} from './functions/findings-list.function.js'
import { FabricFindingsFlush } from './functions/findings-flush.function.js'
import { FabricFindingsClear } from './functions/findings-clear.function.js'
import {
  FabricAddonVerify,
  renderAddonVerify,
} from './functions/addon-verify.function.js'

export const fabricCommands = defineCLICommands({
  validate: pikkuCLICommand({
    func: FabricValidate,
    render: renderValidate,
    description:
      'Check the project structure for fabric compatibility — prints all missing or misconfigured items with fix hints',
    options: {
      skipTypecheck: {
        description:
          'Skip the frontend type-check the build container runs (structural checks only)',
        default: false,
      },
    },
  }),
  smoke: pikkuCLICommand({
    func: FabricSmoke,
    render: renderSmoke,
    description:
      'Run a clean-room Fabric smoke test: temp worktree, install, codegen, migrate, and verify pikku dev startup',
    options: {
      keepTemp: {
        description: 'Keep the temp worktree even on success',
        default: false,
      },
      timeoutSeconds: {
        description: 'Per-step timeout for install/build/codegen commands',
      },
      startupTimeoutSeconds: {
        description: 'Timeout for waiting on pikku dev /health-check',
      },
      port: {
        description: 'Port to use for the temporary pikku dev startup check',
      },
    },
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
      browser: {
        description:
          'Open the sign-in link automatically (--no-browser to just print it)',
        default: true,
      },
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
  addon: {
    description: 'Publish and install Fabric community-registry addons',
    subcommands: {
      verify: pikkuCLICommand({
        parameters: '[dir]',
        func: FabricAddonVerify,
        description:
          'Verify an addon directory is correctly built and ready to publish',
        render: renderAddonVerify,
      }),
      publish: pikkuCLICommand({
        parameters: '[dir]',
        func: FabricPublish,
        render: renderAddonVerify,
        description:
          'Publish the addon in this directory to the community registry (pack + upload)',
        options: {
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      add: pikkuCLICommand({
        parameters: '<id>',
        func: FabricAdd,
        description:
          'Install an addon from the community registry into addons/ (shadcn-style)',
        options: {
          dir: {
            description:
              'Addon dir (overrides pikku.config.json addons.addonDir, default addons/)',
          },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
    },
  },
  deploy: {
    description: 'Apply and inspect deploys for a named branch or production',
    subcommands: {
      apply: pikkuCLICommand({
        func: FabricDeployApply,
        render: renderDeployApply,
        description:
          'Build + deploy a named branch or production (main), or attach to an existing deployment',
        options: {
          branch: { description: 'Target branch to deploy', short: 'b' },
          production: {
            description: 'Deploy production (always main)',
            default: false,
          },
          ref: {
            description: 'Deploy a specific ref instead of the branch head',
          },
          deploymentId: {
            description:
              'Attach to an existing deployment instead of creating one (not with --branch/--production)',
          },
          sync: {
            description:
              'Wait for the deployment to finish and exit non-zero unless it went live',
            default: false,
          },
          autoApprove: {
            description:
              'Answer the confirmation prompt and publish a plan parked at the approval gate',
            default: false,
          },
          allowDestructive: {
            description:
              'Approve a plan whose migrations drop or rewrite data (--auto-approve alone will not)',
            default: false,
          },
          timeout: {
            description: 'Seconds to wait under --sync (default 900)',
          },
          json: {
            description: 'Machine-readable output (NDJSON)',
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
      delete: pikkuCLICommand({
        parameters: '<name>',
        func: FabricSecretsDelete,
        description: 'Delete a single stage-scoped secret',
        options: {
          branch: { description: 'Target branch', short: 'b' },
          force: {
            description: 'Delete without confirmation',
            default: false,
          },
        },
      }),
      rotate: pikkuCLICommand({
        func: FabricSecretsRotate,
        description: "Retire a stage's sealing key (secrets must be set again)",
        options: {
          branch: { description: 'Target branch', short: 'b' },
          force: {
            description: 'Confirm that existing secrets become unreadable',
            default: false,
          },
        },
      }),
    },
  },
  variables: {
    description: 'Manage stage-scoped variables',
    subcommands: {
      set: pikkuCLICommand({
        parameters: '<name>',
        func: FabricVariablesSet,
        description: 'Set a stage-scoped variable',
        options: {
          branch: { description: 'Target branch', short: 'b' },
          value: { description: 'Variable value, read as JSON when it parses' },
        },
      }),
      get: pikkuCLICommand({
        parameters: '<name>',
        func: FabricVariablesGet,
        description: 'Read a stage-scoped variable back',
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
  report: pikkuCLICommand({
    parameters: '[title]',
    func: FabricReport,
    description:
      'Report a finding — something about pikku that cost time — to fabric',
    options: {
      stdin: {
        description:
          'Read the whole finding as JSON on stdin instead of from flags (prose survives the shell intact)',
        default: false,
      },
      kind: {
        description:
          'product (fix pikku) or harness (fix the skill that misled you)',
      },
      model: { description: 'The model that hit this' },
      expected: { description: 'What you expected pikku to do' },
      actual: { description: 'What it did instead' },
      skill: {
        description: 'For a harness finding, the skill that misled you',
      },
      passage: { description: 'The passage in that skill it contradicts' },
      command: { description: 'The command you ran' },
      error: { description: "The error's message line, verbatim" },
      repro: { description: 'The shortest way to reach it again' },
      workaround: { description: 'What you did instead, inside the app' },
      proposal: {
        description:
          'What pikku should do — named file and function, mechanism, suggested change',
      },
      tried: {
        description:
          'For an unresolved finding, what you tried and how each attempt failed',
      },
      unresolved: {
        description: 'No workaround was found — a blocker, not a tax',
        default: false,
      },
      area: { description: 'The part of pikku this is about' },
      surface: { description: 'Where it showed up: local, deployed or both' },
      cost: { description: 'What it cost, measured or estimated' },
      run: { description: 'Run id, to group findings from one build' },
      deployTarget: { description: 'The deploy target in use' },
    },
  }),
  findings: {
    description:
      'Inspect the findings held locally because they could not be sent',
    subcommands: {
      list: pikkuCLICommand({
        func: FabricFindingsList,
        render: renderFindingsList,
        description: 'List the findings queued locally, waiting to be sent',
      }),
      flush: pikkuCLICommand({
        func: FabricFindingsFlush,
        description: 'Send every finding queued locally',
        options: {
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      clear: pikkuCLICommand({
        func: FabricFindingsClear,
        description: 'Discard every queued finding without sending it',
      }),
    },
  },
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
  projects: pikkuCLICommand({
    func: FabricProjectsList,
    render: renderProjectsList,
    description:
      'List the projects in your organization, with their ids (works unlinked)',
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
