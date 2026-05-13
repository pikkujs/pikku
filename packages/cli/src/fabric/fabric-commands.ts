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
import { FabricDeploy } from './functions/deploy.function.js'
import { FabricRollback } from './functions/rollback.function.js'
import { FabricSecretsSet } from './functions/secrets-set.function.js'
import { FabricSecretsList } from './functions/secrets-list.function.js'
import { FabricLogs } from './functions/logs.function.js'
import { FabricMetrics } from './functions/metrics.function.js'
import { FabricTrace } from './functions/trace.function.js'
import { FabricDomainsPlan } from './functions/domains-plan.function.js'
import { FabricDomainsApply } from './functions/domains-apply.function.js'

export const fabricCommands = defineCLICommands({
  login: pikkuCLICommand({
    parameters: '',
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
    parameters: '',
    func: FabricLink,
    description: 'Link the current dir to an existing fabric project',
    options: {
      project: {
        description: 'Project slug or name (skip the picker)',
        short: 'p',
      },
      force: { description: 'Replace existing link', default: false },
      apiUrl: {
        description: 'Override the fabric-api URL stored in fabric.config.json',
      },
    },
  }),
  deploy: pikkuCLICommand({
    parameters: '<stage> [ref]',
    func: FabricDeploy,
    description: 'Build + deploy a ref to a stage',
    options: {
      message: {
        description: 'Annotation stored on the deployment',
        short: 'm',
      },
      dryRun: { description: 'Plan without applying', default: false },
      yes: {
        description: 'Skip confirmation prompts',
        short: 'y',
        default: false,
      },
    },
  }),
  rollback: pikkuCLICommand({
    parameters: '<stage> [target]',
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
  secretsSet: pikkuCLICommand({
    parameters: '<name>',
    func: FabricSecretsSet,
    description: 'Set a stage-scoped secret',
    options: {
      stage: { description: 'Target stage', short: 's' },
      value: { description: 'Secret value (prompted if omitted)' },
      force: { description: 'Overwrite without confirmation', default: false },
    },
  }),
  secretsList: pikkuCLICommand({
    parameters: '',
    func: FabricSecretsList,
    description: 'List stage secrets',
    options: {
      stage: { description: 'Target stage', short: 's' },
      json: { description: 'Machine-readable output', default: false },
    },
  }),
  logs: pikkuCLICommand({
    parameters: '',
    func: FabricLogs,
    description: 'Stream or fetch logs',
    options: {
      stage: { description: 'Target stage', short: 's' },
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
    parameters: '',
    func: FabricMetrics,
    description: 'Show request rate / error rate / latency for a stage',
    options: {
      stage: { description: 'Target stage', short: 's' },
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
      stage: { description: 'Target stage', short: 's' },
      json: { description: 'Machine-readable output', default: false },
    },
  }),
  domainsPlan: pikkuCLICommand({
    parameters: '',
    func: FabricDomainsPlan,
    description: 'Show pending custom-hostname changes for the linked project',
    options: {
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  domainsApply: pikkuCLICommand({
    parameters: '',
    func: FabricDomainsApply,
    description: 'Apply custom-hostname changes for the linked project',
    options: {
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
})
