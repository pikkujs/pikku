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
  FabricChangesList,
  renderChangesList,
} from './functions/changes-list.function.js'
import {
  FabricChangesShow,
  renderChangesShow,
} from './functions/changes-show.function.js'
import {
  FabricChangesClaim,
  renderChangesClaim,
} from './functions/changes-claim.function.js'
import {
  FabricChangesAsk,
  renderChangesAsk,
} from './functions/changes-ask.function.js'
import {
  FabricChangesShot,
  renderChangesShot,
} from './functions/changes-shot.function.js'
import {
  FabricChangesDone,
  renderChangesDone,
} from './functions/changes-done.function.js'
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
      github: {
        description:
          'Assert the repo is on github.com (fails if origin points elsewhere)',
        default: false,
      },
      gitea: {
        description:
          "Host the repo on fabric's git server — creates and pushes to it when there is no origin",
        default: false,
      },
      repoName: {
        description:
          'Name for a repo created by --gitea (defaults to the directory name)',
      },
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
        parameters: '[branch]',
        func: FabricDeployApply,
        render: renderDeployApply,
        description:
          'Build + deploy a named branch or production (main), or attach to an existing deployment',
        options: {
          production: {
            description: 'Deploy production (always main)',
            default: false,
          },
          ref: {
            description: 'Deploy a specific ref instead of the branch head',
          },
          deploymentId: {
            description:
              'Attach to an existing deployment instead of creating one (not with a branch/--production)',
          },
          detach: {
            description:
              'Queue the deployment and exit without waiting, reporting nothing about whether it landed',
            default: false,
          },
          autoApprove: {
            description:
              'Answer the confirmation prompt and publish a plan parked at the approval gate',
            short: 'y',
            default: false,
          },
          allowDestructive: {
            description:
              'Approve a plan whose migrations drop or rewrite data (-y alone will not)',
            default: false,
          },
          timeout: {
            description: 'Seconds to wait for the deployment (default 900)',
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
  changes: {
    description:
      'The todo list filed from inside a deployed stage: read what is open, claim a batch, ask what you need to know, and tick items off',
    subcommands: {
      list: pikkuCLICommand({
        func: FabricChangesList,
        render: renderChangesList,
        description:
          'Open changes for a project, grouped the way they will be worked',
        options: {
          projectId: {
            description: 'Project to read (defaults to the linked checkout)',
            short: 'p',
          },
          stageId: { description: 'Only changes filed on this stage' },
          route: {
            description: 'Only changes filed on this route, e.g. /checkout',
          },
          groupId: { description: 'Only changes in this group' },
          pickupOnly: {
            description:
              'Skip items still held for the person who just filed them',
            default: false,
          },
          includeDone: {
            description: 'Also return done and dismissed items',
            default: false,
          },
          limit: {
            description: 'How many to return (default 50, max 200)',
            type: 'number',
          },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      show: pikkuCLICommand({
        func: FabricChangesShow,
        render: renderChangesShow,
        description:
          'One change with its thread, its circled elements and the build it was filed against',
        options: {
          changeId: {
            description: 'The change to read, from `pikku fabric changes list`',
          },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      claim: pikkuCLICommand({
        func: FabricChangesClaim,
        render: renderChangesClaim,
        description:
          'Take a batch of items as one job under a lease. Naming items without a group creates the group',
        options: {
          projectId: {
            description: 'Project the items belong to',
            short: 'p',
          },
          groupId: {
            description: 'Claim an existing group instead of forming one',
          },
          changeIds: {
            description: 'The items to take, comma-separated or repeated',
            type: 'string[]',
          },
          title: { description: 'What to call the group being formed' },
          claimedBy: {
            description:
              'Who is taking it — shown in the panel while the lease is held',
          },
          leaseMinutes: {
            description:
              'How long to hold it before it returns to the queue (default 30)',
            type: 'number',
          },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      ask: pikkuCLICommand({
        func: FabricChangesAsk,
        render: renderChangesAsk,
        description:
          'Ask the person who filed an item what you need to know. The question is parked, not blocking',
        options: {
          changeId: { description: 'The item the question is about' },
          question: {
            description:
              'One decision, in the filer’s vocabulary, with the options named',
            short: 'q',
          },
          authorName: { description: 'Who is asking, e.g. claude-code' },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      shot: pikkuCLICommand({
        func: FabricChangesShot,
        render: renderChangesShot,
        description:
          'Attach a rendered option to an item’s thread. The panel turns a set of them into a pick-one',
        options: {
          changeId: { description: 'The item the options belong to' },
          label: {
            description:
              'What to call this variant in the picker, e.g. “Grouped totals”',
          },
          image: { description: 'Path to the image file to attach' },
          imageBase64: {
            description: 'The image itself, base64, instead of --image',
          },
          contentType: {
            description:
              'image/png, image/jpeg or image/webp (inferred from --image)',
          },
          kind: {
            description:
              'option (a variant to choose between) or evidence (something to look at)',
            default: 'option',
          },
          authorName: { description: 'Who rendered it, e.g. claude-code' },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      done: pikkuCLICommand({
        func: FabricChangesDone,
        render: renderChangesDone,
        description:
          'Tick an item off, recording the branch and commit that closed it so the panel can strike it through',
        options: {
          changeId: { description: 'The item that is done' },
          branch: {
            description: 'Branch the fix landed on (defaults to this checkout)',
          },
          headCommit: {
            description: 'Commit that closed it (defaults to this checkout)',
          },
          note: {
            description: 'What was done, for whoever reads the thread later',
          },
          authorName: { description: 'Who did it, e.g. claude-code' },
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
