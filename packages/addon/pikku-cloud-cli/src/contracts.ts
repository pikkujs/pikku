import { defineCLICommands, pikkuCLICommand } from '#pikku/addon/cli'
import { CloudLogin } from './functions/login.function.js'
import { CloudLogout } from './functions/logout.function.js'
import { CloudAuthGit, renderAuthGit } from './functions/auth-git.function.js'
import { CloudGit, renderGit } from './functions/git.function.js'
import { CloudStatus, renderStatus } from './functions/status.function.js'
import { CloudInit } from './functions/init.function.js'
import { CloudLink } from './functions/link.function.js'
import {
  CloudDeployApply,
  renderDeployApply,
} from './functions/deploy.function.js'
import {
  CloudDeployList,
  renderDeployList,
} from './functions/deploy-list.function.js'
import {
  CloudDeployLogs,
  renderDeployLogs,
} from './functions/deploy-logs.function.js'
import {
  CloudDeployUnits,
  renderDeployUnits,
} from './functions/deploy-units.function.js'
import {
  CloudDeployAuto,
  renderDeployAuto,
} from './functions/deploy-auto.function.js'
import { CloudConfig, renderConfig } from './functions/config.function.js'
import {
  CloudProjectsList,
  renderProjectsList,
} from './functions/projects-list.function.js'
import { CloudErrors, renderErrors } from './functions/errors.function.js'
import {
  CloudDbSchema,
  renderDbSchema,
} from './functions/db-schema.function.js'
import { CloudRollback } from './functions/rollback.function.js'
import { CloudUserAdd } from './functions/user-add.function.js'
import { CloudSecretsSet } from './functions/secrets-set.function.js'
import { CloudSecretsList } from './functions/secrets-list.function.js'
import { CloudSecretsDelete } from './functions/secrets-delete.function.js'
import { CloudSecretsRotate } from './functions/secrets-rotate.function.js'
import { CloudVariablesSet } from './functions/variables-set.function.js'
import { CloudVariablesGet } from './functions/variables-get.function.js'
import {
  CloudStageLink,
  renderStageLink,
} from './functions/stage-link.function.js'
import {
  CloudStageVisibility,
  renderStageVisibility,
} from './functions/stage-visibility.function.js'
import { CloudLogs } from './functions/logs.function.js'
import { CloudMetrics } from './functions/metrics.function.js'
import { CloudTrace } from './functions/trace.function.js'
import { CloudDomainsList } from './functions/domains-list.function.js'
import { CloudDomainsAdd } from './functions/domains-add.function.js'
import { CloudDomainsRemove } from './functions/domains-remove.function.js'
import { CloudLLMKey, renderLLMKey } from './functions/llm-key.function.js'
import { CloudSmoke, renderSmoke } from './functions/smoke.function.js'
import { CloudPublish } from './functions/publish.function.js'
import { CloudAdd } from './functions/add.function.js'
import {
  CloudAddonSearch,
  renderAddonSearch,
} from './functions/addon-search.function.js'
import {
  CloudAddonGet,
  renderAddonGet,
} from './functions/addon-get.function.js'
import { CloudReport } from './functions/report.function.js'
import {
  CloudAddonVerify,
  renderAddonVerify,
} from './functions/addon-verify.function.js'

export const cloudCommands = defineCLICommands({
  login: pikkuCLICommand({
    func: CloudLogin,
    description: 'Authenticate against cloud API',
    options: {
      apiKey: { description: 'Use a static API key instead of browser flow' },
      token: {
        description: 'Use an existing cloud token instead of browser flow',
      },
      apiUrl: { description: 'Override the cloud API URL for this login' },
      consoleUrl: { description: 'Override the console URL the browser opens' },
      browser: {
        description:
          'Open the sign-in link automatically (--no-browser to just print it)',
        default: true,
      },
    },
  }),
  logout: pikkuCLICommand({
    func: CloudLogout,
    description: 'Forget the saved cloud token and the git credential helper',
    options: {
      apiUrl: { description: 'Override the cloud API URL to log out of' },
    },
  }),
  git: pikkuCLICommand({
    func: CloudGit,
    render: renderGit,
    description:
      'Show where the linked project’s repo lives, or move it between GitHub and cloud’s Gitea with --move-to',
    options: {
      moveTo: {
        description:
          'Where to move the repo: gitea, github (with --repo), or the URL of an existing repo',
      },
      repo: {
        description:
          'The GitHub repo to move to, as owner/name or a full URL (create it on github.com first)',
      },
      dryRun: {
        description: 'Print what cloud would do and change nothing',
        default: false,
      },
      apiUrl: { description: 'Override the cloud API URL for this call' },
    },
  }),
  auth: {
    description: 'Credential helpers registered by login',
    hidden: true,
    subcommands: {
      git: pikkuCLICommand({
        parameters: '<operation>',
        func: CloudAuthGit,
        render: renderAuthGit,
        description: 'Git credential helper for the cloud git server',
        hidden: true,
      }),
    },
  },
  status: pikkuCLICommand({
    func: CloudStatus,
    render: renderStatus,
    description: 'Show the linked project status (active + in-flight deploy)',
  }),
  smoke: pikkuCLICommand({
    func: CloudSmoke,
    render: renderSmoke,
    description:
      'Run a clean-room Pikku Studio Cloud smoke test: temp worktree, install, codegen, migrate, and verify pikku dev startup',
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
  init: pikkuCLICommand({
    parameters: '<repo>',
    func: CloudInit,
    description: 'Adopt an existing git repo as a cloud project',
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
          'Replace a link from PIKKUSTUDIO_PROJECT_ID (a git-remote link cannot be replaced)',
        default: false,
      },
      apiUrl: { description: 'Override the cloud API URL for this call' },
    },
  }),
  link: pikkuCLICommand({
    func: CloudLink,
    description:
      'Register the current git repo as a cloud project and queue an initial deploy',
    options: {
      github: {
        description:
          'Assert the repo is on github.com (fails if origin points elsewhere)',
        default: false,
      },
      gitea: {
        description:
          "Host the repo on cloud's git server — creates and pushes to it when there is no origin",
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
        description: 'Override the cloud API URL for this call',
      },
    },
  }),
  addon: {
    description:
      'Search, publish and install Pikku Studio Cloud community-registry addons',
    subcommands: {
      search: pikkuCLICommand({
        parameters: '<query>',
        func: CloudAddonSearch,
        render: renderAddonSearch,
        description:
          'Search the registry for an addon, or an OpenAPI spec to generate one from',
        options: {
          limit: {
            description: 'How many OpenAPI entries to return (default 20)',
          },
          apiUrl: { description: 'Override the cloud API URL for this call' },
        },
      }),
      get: pikkuCLICommand({
        parameters: '<name>',
        func: CloudAddonGet,
        render: renderAddonGet,
        description:
          'Look one entry up by name, in both the published-addon and OpenAPI catalogues',
        options: {
          apiUrl: { description: 'Override the cloud API URL for this call' },
        },
      }),
      verify: pikkuCLICommand({
        parameters: '[dir]',
        func: CloudAddonVerify,
        description:
          'Verify an addon directory is correctly built and ready to publish',
        render: renderAddonVerify,
      }),
      publish: pikkuCLICommand({
        parameters: '[dir]',
        func: CloudPublish,
        render: renderAddonVerify,
        description:
          'Publish the addon in this directory to the community registry (pack + upload)',
        options: {
          apiUrl: { description: 'Override the cloud API URL for this call' },
        },
      }),
      add: pikkuCLICommand({
        parameters: '<id>',
        func: CloudAdd,
        description:
          'Install an addon from the community registry into addons/ (shadcn-style)',
        options: {
          dir: {
            description:
              'Addon dir (overrides pikku.config.json addons.addonDir, default addons/)',
          },
          apiUrl: { description: 'Override the cloud API URL for this call' },
        },
      }),
    },
  },
  deploy: {
    description: 'Apply and inspect deploys for a named branch or production',
    subcommands: {
      apply: pikkuCLICommand({
        parameters: '[branch]',
        func: CloudDeployApply,
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
        func: CloudDeployList,
        render: renderDeployList,
        description: 'List recent deployments for a branch',
        options: {
          branch: { description: 'Target branch', short: 'b' },
        },
      }),
      logs: pikkuCLICommand({
        parameters: '<deploymentId>',
        func: CloudDeployLogs,
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
        func: CloudDeployUnits,
        render: renderDeployUnits,
        description: 'List the deployed worker units (topology) for a branch',
        options: {
          branch: { description: 'Target branch', short: 'b' },
        },
      }),
      auto: pikkuCLICommand({
        parameters: '[state]',
        func: CloudDeployAuto,
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
    func: CloudRollback,
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
        func: CloudSecretsSet,
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
        func: CloudSecretsList,
        description: 'List stage secrets',
        options: {
          branch: { description: 'Target branch', short: 'b' },
          json: { description: 'Machine-readable output', default: false },
        },
      }),
      delete: pikkuCLICommand({
        parameters: '<name>',
        func: CloudSecretsDelete,
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
        func: CloudSecretsRotate,
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
        func: CloudVariablesSet,
        description: 'Set a stage-scoped variable',
        options: {
          branch: { description: 'Target branch', short: 'b' },
          value: { description: 'Variable value, read as JSON when it parses' },
        },
      }),
      get: pikkuCLICommand({
        parameters: '<name>',
        func: CloudVariablesGet,
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
        func: CloudStageLink,
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
        func: CloudStageVisibility,
        render: renderStageVisibility,
        description: 'Make a stage public or private',
        options: {
          branch: { description: 'Target branch', short: 'b' },
        },
      }),
    },
  },
  logs: pikkuCLICommand({
    func: CloudLogs,
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
    func: CloudReport,
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
    func: CloudMetrics,
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
    func: CloudTrace,
    description: 'Print every event for a single trace across the stage',
    options: {
      branch: { description: 'Target branch', short: 'b' },
      json: { description: 'Machine-readable output', default: false },
    },
  }),
  config: pikkuCLICommand({
    func: CloudConfig,
    render: renderConfig,
    parameters: '[assignments...]',
    description:
      'Show what this checkout resolves to — project, api url, frontends, settings — or change project settings: `pikku cloud config showcase.name="My app" showcase.tags=voice,realtime` (an empty value clears a key)',
    options: {
      apiUrl: { description: 'Override the cloud API URL for this call' },
    },
  }),
  projects: pikkuCLICommand({
    func: CloudProjectsList,
    render: renderProjectsList,
    description:
      'List the projects in your organization, with their ids (works unlinked)',
  }),
  errors: pikkuCLICommand({
    func: CloudErrors,
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
        func: CloudDbSchema,
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
        func: CloudUserAdd,
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
        func: CloudDomainsList,
        description: 'List custom domains for the linked project',
        options: {
          apiUrl: { description: 'Override the cloud API URL for this call' },
        },
      }),
      add: pikkuCLICommand({
        parameters: '<hostname>',
        func: CloudDomainsAdd,
        description: 'Add a custom domain to the production stage',
        options: {
          target: {
            description:
              'Route target: api (Backend API) or app (Frontend App)',
            default: 'api',
          },
          apiUrl: { description: 'Override the cloud API URL for this call' },
        },
      }),
      remove: pikkuCLICommand({
        parameters: '<hostname>',
        func: CloudDomainsRemove,
        description: 'Remove a custom domain from the production stage',
        options: {
          apiUrl: { description: 'Override the cloud API URL for this call' },
        },
      }),
    },
  },
  llm: {
    description: 'Pikku Studio Cloud AI gateway developer key commands',
    subcommands: {
      key: pikkuCLICommand({
        func: CloudLLMKey,
        render: renderLLMKey,
        description:
          'Mint or reuse a developer-scoped Pikku Studio Cloud AI gateway key',
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
