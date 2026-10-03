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
  FabricDeployLogs,
  renderDeployLogs,
} from './functions/deploy-logs.function.js'
import {
  FabricDeployUnits,
  renderDeployUnits,
} from './functions/deploy-units.function.js'
import {
  FabricDeployAuto,
  renderDeployAuto,
} from './functions/deploy-auto.function.js'
import { FabricStatus, renderStatus } from './functions/status.function.js'
import { FabricConfig, renderConfig } from './functions/config.function.js'
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
import { FabricUserAdd } from './functions/user-add.function.js'
import { FabricSecretsSet } from './functions/secrets-set.function.js'
import { FabricSecretsList } from './functions/secrets-list.function.js'
import { FabricSecretsDelete } from './functions/secrets-delete.function.js'
import { FabricSecretsRotate } from './functions/secrets-rotate.function.js'
import { FabricVariablesSet } from './functions/variables-set.function.js'
import { FabricVariablesGet } from './functions/variables-get.function.js'
import {
  FabricStageLink,
  renderStageLink,
} from './functions/stage-link.function.js'
import {
  FabricStageVisibility,
  renderStageVisibility,
} from './functions/stage-visibility.function.js'
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
  FabricChangesNext,
  renderChangesNext,
} from './functions/changes-next.function.js'
import {
  FabricChangesShow,
  renderChangesShow,
} from './functions/changes-show.function.js'
import {
  FabricChangesFile,
  renderChangesFile,
} from './functions/changes-file.function.js'
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
  FabricChangesReply,
  renderChangesReply,
} from './functions/changes-reply.function.js'
import {
  FabricChangesDone,
  renderChangesDone,
} from './functions/changes-done.function.js'
import {
  FabricChangesMerge,
  renderChangesMerge,
} from './functions/changes-merge.function.js'
import {
  FabricValidate,
  renderValidate,
} from './functions/validate.function.js'
import { FabricSmoke, renderSmoke } from './functions/smoke.function.js'
import { FabricPublish } from './functions/publish.function.js'
import { FabricAdd } from './functions/add.function.js'
import {
  FabricAddonSearch,
  renderAddonSearch,
} from './functions/addon-search.function.js'
import {
  FabricAddonGet,
  renderAddonGet,
} from './functions/addon-get.function.js'
import { FabricReport } from './functions/report.function.js'
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
      migrationsBase: {
        description:
          'Git ref whose migrations are frozen: a migration file on it may not be modified, deleted or renamed (default origin/main, or $PIKKU_MIGRATIONS_BASE)',
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
      organization: {
        description:
          'Organization to import into — slug, name or id (defaults to the one your session is in)',
      },
      force: {
        description:
          'Replace a link from FABRIC_PROJECT_ID (a git-remote link cannot be replaced)',
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
      organization: {
        description:
          'Organization to import into — slug, name or id (defaults to the one your session is in)',
      },
      apiUrl: {
        description: 'Override the fabric-api URL for this call',
      },
    },
  }),
  addon: {
    description: 'Search, publish and install Fabric community-registry addons',
    subcommands: {
      search: pikkuCLICommand({
        parameters: '<query>',
        func: FabricAddonSearch,
        render: renderAddonSearch,
        description:
          'Search the registry for an addon, or an OpenAPI spec to generate one from',
        options: {
          limit: {
            description: 'How many OpenAPI entries to return (default 20)',
          },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      get: pikkuCLICommand({
        parameters: '<name>',
        func: FabricAddonGet,
        render: renderAddonGet,
        description:
          'Look one entry up by name, in both the published-addon and OpenAPI catalogues',
        options: {
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
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
          reset: {
            description:
              'Wipe the stage database and rebuild it from the migrations and the dev seed as part of this deploy (never production; -y skips the prompt)',
            default: false,
          },
          timeout: {
            description: 'Seconds to wait for the deployment (default 900)',
          },
          migrationsBase: {
            description:
              'Git ref whose migrations are frozen for the migration check (default origin/main)',
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
      logs: pikkuCLICommand({
        parameters: '<deploymentId>',
        func: FabricDeployLogs,
        render: renderDeployLogs,
        description:
          "Print a deployment's build log (last lines by default; --full for all of it)",
        options: {
          tail: {
            description: 'Number of trailing lines to show (default 100)',
          },
          full: { description: 'Print the whole log', default: false },
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
      auto: pikkuCLICommand({
        parameters: '[state]',
        func: FabricDeployAuto,
        render: renderDeployAuto,
        description:
          'Show whether a push deploys without waiting for approval, or turn it on/off for a branch',
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
          value: {
            description:
              'Secret value (prompted if omitted, or read from stdin when piped)',
          },
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
  stage: {
    description:
      'Open a private stage: its access and changes links, and whether it is public',
    subcommands: {
      link: pikkuCLICommand({
        parameters: '<kind>',
        func: FabricStageLink,
        render: renderStageLink,
        description:
          'Print the access or changes link for a stage (kind: access, changes)',
        options: {
          branch: { description: 'Target branch', short: 'b' },
          route: { description: 'Path the link opens on, e.g. /login' },
        },
      }),
      visibility: pikkuCLICommand({
        parameters: '<visibility>',
        func: FabricStageVisibility,
        render: renderStageVisibility,
        description: 'Make a stage public or private',
        options: {
          branch: { description: 'Target branch', short: 'b' },
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
      'Report a finding — something about pikku that cost time — to the Pikku team. With no finding, asks about the ones held from this build',
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
      deployTarget: { description: 'The deploy target in use' },
      consent: {
        description:
          'The user\'s answer to "send them?": yes or no for what is held now, always or never to stop asking',
      },
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
  config: pikkuCLICommand({
    func: FabricConfig,
    render: renderConfig,
    parameters: '[assignments...]',
    description:
      'Show what this checkout resolves to — project, api url, frontends, settings — or change project settings: `pikku fabric config showcase.name="My app" showcase.tags=voice,realtime` (an empty value clears a key)',
    options: {
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
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
  user: {
    description: "Manage a stage's end-users",
    subcommands: {
      add: pikkuCLICommand({
        parameters: '<email>',
        func: FabricUserAdd,
        description:
          'Create a user on a deployed stage (the CLI form of the console Add user)',
        options: {
          branch: { description: 'Target branch', short: 'b' },
          password: {
            description:
              'Password (prompted if omitted; blank to auto-generate)',
          },
          name: { description: "The user's display name" },
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
      'The todo list filed from inside a deployed stage: read what is open, file what was decided elsewhere, claim a batch, ask what you need to know, reply without asking, and tick items off',
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
          stage: {
            description:
              'Only changes filed on this stage, by branch, url or id — e.g. develop',
            short: 's',
          },
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
      next: pikkuCLICommand({
        func: FabricChangesNext,
        render: renderChangesNext,
        description:
          'Wait until there is work — an item past its grace window, or an answer to a question you asked — then print it and exit. Run it in the background instead of polling. Exits 0 with work, 2 on --timeout/--once with none, 3 when the session is refused',
        options: {
          projectId: {
            description: 'Project to watch (defaults to the linked checkout)',
            short: 'p',
          },
          stage: {
            description:
              'Only changes filed on this stage, by branch, url or id — e.g. develop',
            short: 's',
          },
          route: {
            description: 'Only changes filed on this route, e.g. /checkout',
          },
          claim: {
            description:
              'Claim what it finds as one group before returning, so no other harness takes it',
            default: false,
          },
          claimedBy: {
            description:
              'Who you are, e.g. claude-code — needed with --claim, and wakes you when someone answers a question you asked',
          },
          title: { description: 'What to call the group --claim forms' },
          leaseMinutes: {
            description: 'Lease for --claim (default 30)',
            type: 'number',
          },
          interval: {
            description: 'Seconds between checks (default 15, minimum 5)',
            type: 'number',
          },
          timeout: {
            description: 'Give up after this many seconds and exit 2',
            type: 'number',
          },
          once: {
            description:
              'Check once without waiting; exit 2 if there is nothing',
            default: false,
          },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      show: pikkuCLICommand({
        parameters: '[changeId]',
        func: FabricChangesShow,
        render: renderChangesShow,
        description:
          'One change with its thread, its circled elements and the build it was filed against. Takes 2, #2 or the uuid',
        options: {
          changeId: {
            description: 'The change to read — 2, #2 or its uuid',
          },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      file: pikkuCLICommand({
        func: FabricChangesFile,
        render: renderChangesFile,
        description:
          'File an item from outside the panel — the words, without the screenshot the panel would have attached',
        options: {
          projectId: {
            description:
              'Project to file against (defaults to the linked checkout)',
            short: 'p',
          },
          stageId: {
            description: 'Stage to file against (defaults to the only stage)',
          },
          branch: {
            description: 'Resolve the stage from this branch instead',
          },
          title: {
            description: 'The requirement, in one line',
            short: 't',
          },
          body: { description: 'The detail, if a line is not enough' },
          bodyFile: {
            description:
              'Read the body from a file — use this when it has newlines',
          },
          route: {
            description: 'The route it is about, e.g. /admin/rota',
          },
          locale: { description: 'Locale it was seen in, e.g. de' },
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
            description:
              'The items to take — #2, 2 or uuids — comma-separated or repeated',
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
          creates: {
            description:
              'Tables this changeset creates — comma-separated; implies --needs-plan',
            type: 'string[]',
          },
          alters: {
            description:
              'Tables this changeset alters — comma-separated; implies --needs-plan',
            type: 'string[]',
          },
          reads: {
            description:
              'Tables this changeset reads — it waits for whichever changeset creates them',
            type: 'string[]',
          },
          needsPlan: {
            description: 'Whether the changeset is planned before it is built',
            type: 'boolean',
          },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      ask: pikkuCLICommand({
        parameters: '[changeId]',
        func: FabricChangesAsk,
        render: renderChangesAsk,
        description:
          'Ask the person who filed an item what you need to know. The question is parked, not blocking',
        options: {
          changeId: { description: 'The item the question is about' },
          question: {
            description:
              'One decision, in the filer’s vocabulary. Name the choices with --option, not as “(a) … (b) …” inside this text',
            short: 'q',
          },
          option: {
            description:
              'A choice the filer can click, repeatable — e.g. --option "Reprice them" --option "Leave them". Without these they have to type an answer',
            type: 'string[]',
          },
          authorName: { description: 'Who is asking, e.g. claude-code' },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      reply: pikkuCLICommand({
        func: FabricChangesReply,
        render: renderChangesReply,
        parameters: '[changeId]',
        description:
          'Say something on an item’s thread without asking (which parks it) or closing it (done --note) — e.g. why you are not doing it, or what it is blocked on',
        options: {
          changeId: { description: 'The item to reply on — 2, #2 or its uuid' },
          message: {
            description: 'What to say, in the filer’s vocabulary',
            short: 'm',
          },
          image: {
            description:
              'Path to a screenshot to attach as evidence, e.g. what you saw when you could not reproduce it',
          },
          imageLabel: {
            description: 'What to call the screenshot (default “screenshot”)',
          },
          contentType: {
            description:
              'image/png, image/jpeg or image/webp (inferred from --image)',
          },
          authorName: { description: 'Who is replying, e.g. claude-code' },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      shot: pikkuCLICommand({
        parameters: '[changeId]',
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
      merge: pikkuCLICommand({
        func: FabricChangesMerge,
        render: renderChangesMerge,
        description:
          'Merge a finished changeset into this branch as one --no-ff commit with a Changeset trailer',
        options: {
          projectId: {
            description: 'Project the changeset belongs to',
            short: 'p',
          },
          groupId: { description: 'The changeset to merge' },
          apiUrl: { description: 'Override the fabric-api URL for this call' },
        },
      }),
      done: pikkuCLICommand({
        parameters: '[changeId]',
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
