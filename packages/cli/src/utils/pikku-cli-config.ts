import { join, dirname, resolve, isAbsolute, parse as parsePath } from 'path'
import { readdir, readFile } from 'fs/promises'
import type {
  PikkuCLIConfig,
  PikkuCLIInput,
  PikkuScaffoldFeature,
} from '../../types/config.js'
import { resolveScaffoldFeature } from './resolve-scaffold-feature.js'
import type { CLILogger } from '../services/cli-logger.service.js'
import { setScaffoldWriteGuard } from './file-writer.js'
import { PikkuCLIConfigError } from './pikku-cli-config-error.js'

const CLIENT_FILE_KEYS = [
  'fetchFile',
  'websocketFile',
  'realtimeFile',
  'rpcWiringsFile',
  'reactQueryFile',
  'queueWiringsFile',
  'mcpJsonFile',
  'nextBackendFile',
  'nextHTTPFile',
  'tanstackStartFile',
  'scopesFile',
] as const

export const getPikkuCLIConfig = async (
  logger: CLILogger,
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  exitProcess: boolean = false,
  outDirOverride?: string
): Promise<PikkuCLIConfig> => {
  const config = await _getPikkuCLIConfig(
    logger,
    configFile,
    requiredFields,
    exitProcess,
    outDirOverride
  )
  return config
}

/**
 * Like `getPikkuCLIConfig`, but returns null when the project has no config at
 * all rather than throwing.
 *
 * Some commands are meant to run *outside* a Pikku project: `pikku skills
 * install` seeds a repo's agent skills, which is something you do before there
 * is a pikku.config.json to read. Requiring one to find out there isn't one is
 * a chicken-and-egg. A config that exists but is broken still throws — that is
 * a real error, and staying quiet about it would hide it.
 */
export const tryGetPikkuCLIConfig = async (
  logger: CLILogger,
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  outDirOverride?: string
): Promise<PikkuCLIConfig | null> => {
  const resolved = configFile ?? (await findConfigFileOrNull())
  if (!resolved) {
    return null
  }
  return await getPikkuCLIConfig(
    logger,
    resolved,
    requiredFields,
    false,
    outDirOverride
  )
}

async function findConfigFileOrNull(): Promise<string | null> {
  let dir = process.cwd()
  const { root } = parsePath(dir)
  while (true) {
    const files = await readdir(dir)
    const match = files.find((f) => /pikku\.config\.(ts|js|json)$/.test(f))
    if (match) return join(dir, match)
    // Stop if we've reached the git repo root or the filesystem root
    const hasGit = files.includes('.git')
    if (hasGit || dir === root) break
    dir = dirname(dir)
  }
  return null
}

async function findConfigFile(): Promise<string> {
  const configFile = await findConfigFileOrNull()
  if (!configFile) {
    throw new Error('Config file pikku.config.json not found')
  }
  return configFile
}

export { PikkuCLIConfigError }

/**
 * The two schema registers must be two directories.
 *
 * `saveSchemas` owns whatever directory it is given: it writes `register.gen.ts`
 * and prunes every schema file that its own required-set does not name. Point the
 * scenario write at `schemaDirectory` and the second call overwrites the app's
 * register with the scenario-only one and deletes the app's schema files — the
 * exact leak the split exists to prevent, silently, and only in a deployed
 * bundle. Nothing downstream can detect it, so it is rejected here.
 */
export const assertSchemaDirectoriesAreDistinct = (
  config: Pick<PikkuCLIConfig, 'schemaDirectory' | 'scenarioSchemaDirectory'>
) => {
  const { schemaDirectory, scenarioSchemaDirectory } = config
  if (!schemaDirectory || !scenarioSchemaDirectory) {
    return
  }
  if (resolve(schemaDirectory) === resolve(scenarioSchemaDirectory)) {
    throw new PikkuCLIConfigError(
      `scenarioSchemaDirectory must not be the same directory as schemaDirectory (both resolve to ${resolve(schemaDirectory)}). Scenario schemas are written with their own register, which would replace the application one.`
    )
  }
}

/**
 * The `locale` a project gets when its config does not name one.
 *
 * English, and it stays English for almost every project — the field changes
 * what the Console reads back to a human, not who the product is for.
 */
export const DEFAULT_LOCALE = 'en'

/**
 * `locale` is handed on to codegen and the Console as a language tag, so a
 * value they cannot interpret is worse than none: it degrades quietly to "some
 * language" a long way from the line that is wrong. `Intl.getCanonicalLocales`
 * is the BCP-47 grammar Node already ships, and it catches the mistake people
 * actually make — `de_DE` with a POSIX underscore where BCP-47 wants `de-DE`.
 *
 * It returns the canonical spelling rather than what was typed, so `EN-gb` and
 * `en-GB` are one value downstream instead of two that never compare equal.
 */
export const normalizeLocale = (locale: unknown): string => {
  if (locale === undefined || locale === null) {
    return DEFAULT_LOCALE
  }

  if (typeof locale === 'string') {
    try {
      const [canonical] = Intl.getCanonicalLocales(locale.trim())
      if (canonical) {
        return canonical
      }
    } catch {
      // Falls through to the shared error below — the reader needs the same
      // explanation whether the tag was malformed or the wrong type entirely.
    }
  }

  throw new PikkuCLIConfigError(
    `locale in pikku.config.json is not a language tag: ${JSON.stringify(locale)}. ` +
      `Use a BCP-47 code — "en", "de", "pt-BR" — with a hyphen rather than an underscore. ` +
      `It sets the language of the meta the Console renders back to your team (function and step descriptions, feature and scenario names). ` +
      `Identifiers stay English regardless, and the language the app speaks to its users is defaultLocale in active.json, not this.`
  )
}

/**
 * Fill in the mount defaults and make `dir` absolute.
 *
 * The trailing slash is stripped because a mount matches with
 * `pathname === prefix || pathname.startsWith(prefix + '/')`, under which a
 * stored `/app/` matches nothing at all — a frontend that silently never
 * appears rather than an error anyone can act on.
 */
export const resolveFrontendConfig = (
  frontend: NonNullable<PikkuCLIInput['frontend']>,
  configDir: string
): NonNullable<PikkuCLIConfig['frontend']> => {
  if (!frontend.dir) {
    throw new PikkuCLIConfigError(
      `frontend.dir is required — it names the directory your frontend's build already wrote, since pikku serves that output rather than building it`
    )
  }

  const urlPrefix = frontend.urlPrefix ?? '/'
  if (!urlPrefix.startsWith('/')) {
    throw new PikkuCLIConfigError(
      `frontend.urlPrefix must start with "/" — got "${urlPrefix}"`
    )
  }

  return {
    dir: isAbsolute(frontend.dir)
      ? frontend.dir
      : join(configDir, frontend.dir),
    urlPrefix: urlPrefix === '/' ? '/' : urlPrefix.replace(/\/+$/, ''),
    spaFallback: frontend.spaFallback ?? true,
  }
}

const _getPikkuCLIConfig = async (
  logger: CLILogger,
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  exitProcess: boolean = false,
  outDirOverride?: string
): Promise<PikkuCLIConfig> => {
  if (!configFile) {
    configFile = await findConfigFile()
  }

  try {
    let result: PikkuCLIConfig
    const file = await readFile(configFile, 'utf-8')
    const configDir = dirname(configFile)
    const config: PikkuCLIConfig = JSON.parse(file)
    if (config.extends) {
      const extendedConfig = await getPikkuCLIConfig(
        logger,
        resolve(configDir, config.extends),
        [],
        exitProcess
      )
      result = {
        ...extendedConfig,
        ...config,
        configDir,
        packageMappings: {
          ...extendedConfig.packageMappings,
          ...config.packageMappings,
        },
        ignoreFiles: config.ignoreFiles ??
          extendedConfig.ignoreFiles ?? [
            '**/*.test.ts',
            '**/*.spec.ts',
            '**/node_modules/**',
            '**/dist/**',
          ],
        schema: {
          additionalProperties: false,
          supportsImportAttributes: true,
          ...extendedConfig.schema,
          ...config.schema,
        },
      }
    } else {
      result = {
        ...config,
        configDir,
        packageMappings: config.packageMappings || {},
        rootDir: config.rootDir
          ? resolve(configDir, config.rootDir)
          : configDir,
        ignoreFiles: config.ignoreFiles ?? [
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/node_modules/**',
          '**/dist/**',
        ],
        schema: {
          additionalProperties: false,
          supportsImportAttributes: true,
          ...config.schema,
        },
      }
    }

    if (result.outDir && !isAbsolute(result.outDir)) {
      result.outDir = resolve(configDir, result.outDir)
    }

    // Override outDir if provided via CLI flag (must happen before derived paths)
    if (outDirOverride) {
      result.outDir = isAbsolute(outDirOverride)
        ? outDirOverride
        : resolve(result.rootDir, outDirOverride)
    }

    // An addon's whole generated tree roots one level down, so every leaf it
    // authors is reached as `#pikku/addon/<leaf>`. tsconfig `paths` are global
    // to a tsx process rather than scoped to the package that declared them, so
    // a linked addon's `#pikku/function` would otherwise match the *host
    // application's* flat leaf and type the addon's functions against the
    // host's services. An application generates nothing at this depth, so the
    // pattern finds no candidate and resolution falls back to Node's
    // per-package `imports`, which is package-scoped by definition.
    if (result.addon) {
      result.outDir = join(result.outDir, 'addon')
    }

    // Create transport/event directories
    const functionDir = join(result.outDir, 'function')
    const httpDir = join(result.outDir, 'http')
    const channelDir = join(result.outDir, 'channel')
    const rpcDir = join(result.outDir, 'rpc')
    const schedulerDir = join(result.outDir, 'scheduler')
    const queueDir = join(result.outDir, 'queue')
    const workflowDir = join(result.outDir, 'workflow')
    const mcpDir = join(result.outDir, 'mcp')
    const cliDir = join(result.outDir, 'cli')
    const middlewareDir = join(result.outDir, 'middleware')

    // Create directories if they don't exist (will be done lazily when files are written)

    if (!result.schemaDirectory) {
      result.schemaDirectory = join(result.outDir, 'schemas')
    }

    // Functions
    if (!result.functionsFile) {
      result.functionsFile = join(functionDir, 'pikku-functions.gen.ts')
    }
    if (!result.functionsMetaFile) {
      result.functionsMetaFile = join(
        functionDir,
        'pikku-functions-meta.gen.ts'
      )
    }
    if (!result.functionsMetaJsonFile) {
      result.functionsMetaJsonFile = join(
        functionDir,
        'pikku-functions-meta.gen.json'
      )
    }
    if (!result.functionTypesFile) {
      result.functionTypesFile = join(
        functionDir,
        'pikku-function-types.gen.ts'
      )
    }

    if (!result.middlewareTypesFile) {
      result.middlewareTypesFile = join(
        middlewareDir,
        'pikku-middleware-types.gen.ts'
      )
    }

    const setupDir = join(result.outDir, 'setup')
    if (!result.setupTypesFile) {
      result.setupTypesFile = join(setupDir, 'pikku-setup-types.gen.ts')
    }
    if (!result.addonSetupTypesFile) {
      result.addonSetupTypesFile = join(
        setupDir,
        'pikku-addon-setup-types.gen.ts'
      )
    }

    // Sits in the same directory as the better-auth wrapper so both reach the
    // reader as `#pikku/auth`, but is written unconditionally: every project
    // decides who may call a function, only some projects use better-auth.
    if (!result.authGuardsFile) {
      result.authGuardsFile = join(
        result.outDir,
        'auth',
        'pikku-auth-types.gen.ts'
      )
    }

    // HTTP
    if (!result.httpWiringsFile) {
      result.httpWiringsFile = join(httpDir, 'pikku-http-wirings.gen.ts')
    }
    if (!result.httpWiringMetaFile) {
      result.httpWiringMetaFile = join(
        httpDir,
        'pikku-http-wirings-meta.gen.ts'
      )
    }
    if (!result.httpWiringMetaJsonFile) {
      result.httpWiringMetaJsonFile = join(
        httpDir,
        'pikku-http-wirings-meta.gen.json'
      )
    }
    if (!result.httpContractsMetaJsonFile) {
      result.httpContractsMetaJsonFile = join(
        httpDir,
        'pikku-http-contracts-meta.gen.json'
      )
    }
    if (!result.httpContractsMetaFile) {
      result.httpContractsMetaFile = join(
        httpDir,
        'pikku-http-contracts-meta.gen.ts'
      )
    }
    if (!result.httpMapDeclarationFile) {
      result.httpMapDeclarationFile = join(
        httpDir,
        'pikku-http-wirings-map.gen.d.ts'
      )
    }
    if (!result.httpTypesFile) {
      result.httpTypesFile = join(httpDir, 'pikku-http-types.gen.ts')
    }

    // Gateways
    const gatewayDir = join(result.outDir, 'gateway')
    if (!result.gatewaysTypesFile) {
      result.gatewaysTypesFile = join(gatewayDir, 'pikku-gateway-types.gen.ts')
    }
    if (!result.gatewaysWiringFile) {
      result.gatewaysWiringFile = join(
        gatewayDir,
        'pikku-gateway-wirings.gen.ts'
      )
    }
    if (!result.gatewaysWiringMetaFile) {
      result.gatewaysWiringMetaFile = join(
        gatewayDir,
        'pikku-gateway-wirings-meta.gen.ts'
      )
    }
    if (!result.gatewaysWiringMetaJsonFile) {
      result.gatewaysWiringMetaJsonFile = join(
        gatewayDir,
        'pikku-gateway-wirings-meta.gen.json'
      )
    }

    // Channels/WebSocket
    if (!result.channelsWiringFile) {
      result.channelsWiringFile = join(channelDir, 'pikku-channels.gen.ts')
    }
    if (!result.channelsWiringMetaFile) {
      result.channelsWiringMetaFile = join(
        channelDir,
        'pikku-channels-meta.gen.ts'
      )
    }
    if (!result.channelsWiringMetaJsonFile) {
      result.channelsWiringMetaJsonFile = join(
        channelDir,
        'pikku-channels-meta.gen.json'
      )
    }
    if (!result.channelContractsMetaJsonFile) {
      result.channelContractsMetaJsonFile = join(
        channelDir,
        'pikku-channel-contracts-meta.gen.json'
      )
    }
    if (!result.channelContractsMetaFile) {
      result.channelContractsMetaFile = join(
        channelDir,
        'pikku-channel-contracts-meta.gen.ts'
      )
    }
    if (!result.channelsMapDeclarationFile) {
      result.channelsMapDeclarationFile = join(
        channelDir,
        'pikku-channels-map.gen.d.ts'
      )
    }
    if (!result.channelsTypesFile) {
      result.channelsTypesFile = join(channelDir, 'pikku-channel-types.gen.ts')
    }

    // RPC (internal and addon)
    if (!result.rpcInternalWiringMetaFile) {
      result.rpcInternalWiringMetaFile = join(
        rpcDir,
        'pikku-rpc-wirings-meta.internal.gen.ts'
      )
    }

    if (!result.rpcInternalWiringMetaJsonFile) {
      result.rpcInternalWiringMetaJsonFile = join(
        rpcDir,
        'pikku-rpc-wirings-meta.internal.gen.json'
      )
    }

    if (!result.rpcInternalMapDeclarationFile) {
      result.rpcInternalMapDeclarationFile = join(
        rpcDir,
        'pikku-rpc-wirings-map.internal.gen.d.ts'
      )
    }

    if (!result.rpcMapDeclarationFile) {
      result.rpcMapDeclarationFile = join(
        rpcDir,
        'pikku-rpc-wirings-map.gen.d.ts'
      )
    }

    if (!result.rpcRemoteMapDeclarationFile) {
      result.rpcRemoteMapDeclarationFile = join(
        rpcDir,
        'pikku-rpc-wirings-map.remote.gen.d.ts'
      )
    }

    // Scaffold directory for auto-generated wiring files. Default it beside the
    // first source directory (so a monorepo's scaffold lands in the functions
    // package where its deps — e.g. zod — resolve), not rootDir-relative
    // `src/scaffold`, which silently mis-places it in a monorepo layout.
    const defaultScaffoldDir = result.srcDirectories?.[0]
      ? join(result.srcDirectories[0], 'scaffold')
      : 'src/scaffold'
    const scaffoldDir = result.scaffold?.pikkuDir ?? defaultScaffoldDir
    const resolvedScaffoldDir = isAbsolute(scaffoldDir)
      ? scaffoldDir
      : join(result.rootDir, scaffoldDir)

    // Per-unit deploy codegen re-runs the whole of `pikku all` with `--outDir`
    // pointed at one unit's `.pikku`. It needs the `.pikku` artifacts and
    // nothing else — the scaffold is project source, and regenerating it under
    // a redirected outDir rewrites the developer's imports to point inside
    // `.deploy/`. Read straight from the environment rather than through the
    // variables service: that service JSON-parses, so `'1'` arrives as the
    // number 1 and every `=== '1'` check against it silently never matched.
    setScaffoldWriteGuard(
      process.env.PIKKU_DEPLOY_CODEGEN === '1' ? resolvedScaffoldDir : undefined
    )

    // Read every scaffold feature once, here, so a malformed value fails at
    // load rather than downstream where it has already been coerced into
    // something plausible.
    //
    // An explicit `path` is written onto the feature's output field before the
    // derivations below run. Each of those is guarded by `!result.<field>`, so
    // setting it here wins and the pikkuDir-derived default is skipped.
    const SCAFFOLD_OUTPUT_FIELDS: Record<string, string> = {
      rpc: 'publicRpcFile',
      agent: 'publicAgentFile',
      console: 'consoleFunctionsFile',
      scenarios: 'scenariosFunctionsFile',
      userAdmin: 'userAdminFunctionsFile',
      virtualUser: 'virtualUserFunctionsFile',
      workflow: 'workflowRoutesFile',
      events: 'eventsChannelFile',
      remoteRpc: 'remoteRpcWorkersFile',
    }
    const scaffoldBlock = result.scaffold as
      Record<string, PikkuScaffoldFeature> | undefined
    for (const [feature, outputField] of Object.entries(
      SCAFFOLD_OUTPUT_FIELDS
    )) {
      const resolved = resolveScaffoldFeature(feature, scaffoldBlock?.[feature])
      if (!resolved.enabled || !resolved.path) continue
      ;(result as unknown as Record<string, unknown>)[outputField] = isAbsolute(
        resolved.path
      )
        ? resolved.path
        : join(result.rootDir, resolved.path)
    }

    if (result.scaffold?.remoteRpc && !result.remoteRpcWorkersFile) {
      result.remoteRpcWorkersFile = join(
        resolvedScaffoldDir,
        'rpc',
        'rpc-remote.gen.ts'
      )
    }
    if (result.scaffold?.remoteRpc && !result.remoteRpcSchemasFile) {
      result.remoteRpcSchemasFile = join(
        resolvedScaffoldDir,
        'rpc',
        'rpc-remote.schemas.gen.ts'
      )
    }
    if (result.scaffold?.graph && !result.graphWiringsFile) {
      result.graphWiringsFile = join(
        resolvedScaffoldDir,
        'graph',
        'graph.wirings.gen.ts'
      )
    }
    if (result.scaffold?.webhook && !result.webhookWorkersFile) {
      result.webhookWorkersFile = join(
        resolvedScaffoldDir,
        'webhook',
        'webhook.gen.ts'
      )
    }
    if (result.scaffold?.webhook && !result.webhookSchemasFile) {
      result.webhookSchemasFile = join(
        resolvedScaffoldDir,
        'webhook',
        'webhook.schemas.gen.ts'
      )
    }
    if (result.scaffold?.workflow && !result.workflowRoutesFile) {
      result.workflowRoutesFile = join(
        resolvedScaffoldDir,
        'workflow',
        'workflow-routes.gen.ts'
      )
    }
    if (result.scaffold?.workflow && !result.workflowRoutesSchemasFile) {
      result.workflowRoutesSchemasFile = join(
        resolvedScaffoldDir,
        'workflow',
        'workflow-routes.schemas.gen.ts'
      )
    }
    if (result.scaffold?.rpc && !result.publicRpcFile) {
      result.publicRpcFile = join(
        resolvedScaffoldDir,
        'rpc',
        'rpc-public.gen.ts'
      )
    }
    if (result.scaffold?.rpc && !result.publicRpcSchemasFile) {
      result.publicRpcSchemasFile = join(
        resolvedScaffoldDir,
        'rpc',
        'rpc-public.schemas.gen.ts'
      )
    }
    if (result.scaffold?.agent && !result.publicAgentFile) {
      result.publicAgentFile = join(
        resolvedScaffoldDir,
        'agent',
        'agent.gen.ts'
      )
    }
    if (result.scaffold?.agent && !result.publicAgentSchemasFile) {
      result.publicAgentSchemasFile = join(
        resolvedScaffoldDir,
        'agent',
        'agent.schemas.gen.ts'
      )
    }
    if (result.scaffold?.console && !result.consoleFunctionsFile) {
      result.consoleFunctionsFile = join(
        resolvedScaffoldDir,
        'console',
        'console.gen.ts'
      )
    }
    if (result.scaffold?.console && !result.consoleSchemasFile) {
      result.consoleSchemasFile = join(
        resolvedScaffoldDir,
        'console',
        'console.schemas.gen.ts'
      )
    }
    if (result.scaffold?.userAdmin && !result.userAdminFunctionsFile) {
      result.userAdminFunctionsFile = join(
        resolvedScaffoldDir,
        'admin',
        'user-admin.gen.ts'
      )
    }
    if (result.scaffold?.userAdmin && !result.userAdminSchemasFile) {
      result.userAdminSchemasFile = join(
        resolvedScaffoldDir,
        'admin',
        'user-admin.schemas.gen.ts'
      )
    }
    if (result.scaffold?.virtualUser && !result.virtualUserFunctionsFile) {
      result.virtualUserFunctionsFile = join(
        resolvedScaffoldDir,
        'virtual-user',
        'virtual-user.gen.ts'
      )
    }
    if (result.scaffold?.virtualUser && !result.virtualUserSchemasFile) {
      result.virtualUserSchemasFile = join(
        resolvedScaffoldDir,
        'virtual-user',
        'virtual-user.schemas.gen.ts'
      )
    }
    if (result.scaffold?.scenarios && !result.scenariosFunctionsFile) {
      result.scenariosFunctionsFile = join(
        resolvedScaffoldDir,
        'scenarios',
        'scenarios.gen.ts'
      )
    }
    if (result.scaffold?.scenarios && !result.scenariosSchemasFile) {
      result.scenariosSchemasFile = join(
        resolvedScaffoldDir,
        'scenarios',
        'scenarios.schemas.gen.ts'
      )
    }
    if (!result.authFile) {
      result.authFile = join(resolvedScaffoldDir, 'auth', 'auth.gen.ts')
    }
    if (!result.authTypesFile) {
      result.authTypesFile = join(result.outDir, 'auth', 'auth.types.ts')
    }
    if (!result.authMetaJsonFile) {
      result.authMetaJsonFile = join(
        result.outDir,
        'auth',
        'pikku-auth-meta.gen.json'
      )
    }
    if (result.scaffold?.events && !result.eventsChannelFile) {
      result.eventsChannelFile = join(
        resolvedScaffoldDir,
        'realtime',
        'events.gen.ts'
      )
    }
    if (result.scaffold?.events && !result.eventsSchemasFile) {
      result.eventsSchemasFile = join(
        resolvedScaffoldDir,
        'realtime',
        'events.schemas.gen.ts'
      )
    }
    if (
      result.scaffold?.events &&
      result.clientFiles?.fetchFile &&
      !result.clientFiles.realtimeFile
    ) {
      result.clientFiles.realtimeFile = join(
        dirname(result.clientFiles.fetchFile),
        'realtime.gen.ts'
      )
    }
    const triggerDir = join(result.outDir, 'trigger')
    if (!result.triggersTypesFile) {
      result.triggersTypesFile = join(triggerDir, 'pikku-trigger-types.gen.ts')
    }
    if (!result.triggersWiringFile) {
      result.triggersWiringFile = join(
        triggerDir,
        'pikku-trigger-wirings.gen.ts'
      )
    }
    if (!result.triggersWiringMetaFile) {
      result.triggersWiringMetaFile = join(
        triggerDir,
        'pikku-trigger-wirings-meta.gen.ts'
      )
    }
    if (!result.triggersWiringMetaJsonFile) {
      result.triggersWiringMetaJsonFile = join(
        triggerDir,
        'pikku-trigger-wirings-meta.gen.json'
      )
    }
    if (!result.triggerSourcesMetaFile) {
      result.triggerSourcesMetaFile = join(
        triggerDir,
        'pikku-trigger-sources-meta.gen.ts'
      )
    }
    if (!result.triggerSourcesMetaJsonFile) {
      result.triggerSourcesMetaJsonFile = join(
        triggerDir,
        'pikku-trigger-sources-meta.gen.json'
      )
    }

    // Scheduler
    if (!result.schedulersWiringFile) {
      result.schedulersWiringFile = join(
        schedulerDir,
        'pikku-schedulers-wirings.gen.ts'
      )
    }
    if (!result.schedulersWiringMetaFile) {
      result.schedulersWiringMetaFile = join(
        schedulerDir,
        'pikku-schedulers-wirings-meta.gen.ts'
      )
    }
    if (!result.schedulersWiringMetaJsonFile) {
      result.schedulersWiringMetaJsonFile = join(
        schedulerDir,
        'pikku-schedulers-wirings-meta.gen.json'
      )
    }
    if (!result.schedulersTypesFile) {
      result.schedulersTypesFile = join(
        schedulerDir,
        'pikku-scheduler-types.gen.ts'
      )
    }

    // Queue
    if (!result.queueWorkersWiringFile) {
      result.queueWorkersWiringFile = join(
        queueDir,
        'pikku-queue-workers-wirings.gen.ts'
      )
    }
    if (!result.queueWorkersWiringMetaFile) {
      result.queueWorkersWiringMetaFile = join(
        queueDir,
        'pikku-queue-workers-wirings-meta.gen.ts'
      )
    }
    if (!result.queueWorkersWiringMetaJsonFile) {
      result.queueWorkersWiringMetaJsonFile = join(
        queueDir,
        'pikku-queue-workers-wirings-meta.gen.json'
      )
    }
    if (!result.queueMapDeclarationFile) {
      result.queueMapDeclarationFile = join(
        queueDir,
        'pikku-queue-workers-wirings-map.gen.d.ts'
      )
    }
    if (!result.queueTypesFile) {
      result.queueTypesFile = join(queueDir, 'pikku-queue-types.gen.ts')
    }

    // Workflows
    if (!result.workflowsWiringFile) {
      result.workflowsWiringFile = join(
        workflowDir,
        'pikku-workflow-wirings.gen.ts'
      )
    }
    if (!result.workflowsWiringMetaFile) {
      result.workflowsWiringMetaFile = join(
        workflowDir,
        'pikku-workflow-wirings-meta.gen.ts'
      )
    }
    if (!result.workflowsWorkersFile) {
      result.workflowsWorkersFile = join(
        workflowDir,
        'pikku-workflow-workers.gen.ts'
      )
    }
    if (!result.workflowMapDeclarationFile) {
      result.workflowMapDeclarationFile = join(
        workflowDir,
        'pikku-workflow-map.gen.d.ts'
      )
    }
    if (!result.scenarioStepMapDeclarationFile) {
      result.scenarioStepMapDeclarationFile = join(
        workflowDir,
        'pikku-scenario-step-map.gen.d.ts'
      )
    }
    if (!result.workflowTypesFile) {
      result.workflowTypesFile = join(
        workflowDir,
        'pikku-workflow-types.gen.ts'
      )
    }

    // Workflow meta directory (individual JSON files for each workflow)
    if (!result.workflowMetaDir) {
      result.workflowMetaDir = join(workflowDir, 'meta')
    }

    // Scenarios
    const scenarioDir = join(result.outDir, 'scenarios')
    if (!result.scenarioTypesFile) {
      result.scenarioTypesFile = join(
        scenarioDir,
        'pikku-scenario-types.gen.ts'
      )
    }
    // The actors a scenario drives. Sat under `workflow/` beside a different
    // file of the same name — `scopes/pikku-personas.gen.ts` declares personas,
    // this one types them at runtime — which made the pair impossible to tell
    // apart by import path.
    if (!result.personasWiringFile) {
      result.personasWiringFile = join(scenarioDir, 'pikku-personas.gen.ts')
    }
    if (!result.scenarioStepsFile) {
      result.scenarioStepsFile = join(
        scenarioDir,
        'pikku-scenario-functions.gen.ts'
      )
    }
    if (!result.scenarioStepsMetaFile) {
      result.scenarioStepsMetaFile = join(
        scenarioDir,
        'pikku-scenario-functions-meta.gen.ts'
      )
    }
    if (!result.scenarioStepsMetaJsonFile) {
      result.scenarioStepsMetaJsonFile = join(
        scenarioDir,
        'pikku-scenario-functions-meta.gen.json'
      )
    }
    if (!result.scenarioWiringsFile) {
      result.scenarioWiringsFile = join(
        scenarioDir,
        'pikku-scenario-wirings.gen.ts'
      )
    }
    if (!result.scenarioWiringsMetaFile) {
      result.scenarioWiringsMetaFile = join(
        scenarioDir,
        'pikku-scenario-wirings-meta.gen.ts'
      )
    }
    if (!result.scenarioMetaDir) {
      result.scenarioMetaDir = join(scenarioDir, 'meta')
    }
    // Schemas only a scenario or a step validates against. They live here rather
    // than in `schemaDirectory` because the app's `register.gen.ts` is imported
    // by every deployed bundle, and a test-only schema has no business in one.
    if (!result.scenarioSchemaDirectory) {
      result.scenarioSchemaDirectory = join(scenarioDir, 'schemas')
    }
    if (!result.scenarioBootstrapFile) {
      result.scenarioBootstrapFile = join(
        result.outDir,
        'pikku-bootstrap-scenarios.gen.ts'
      )
    }

    // Services
    if (!result.servicesFile) {
      result.servicesFile = join(result.outDir, 'pikku-services.gen.ts')
    }

    // Middleware
    if (!result.middlewareFile) {
      result.middlewareFile = join(middlewareDir, 'pikku-middleware.gen.ts')
    }
    if (!result.middlewareGroupsMetaJsonFile) {
      result.middlewareGroupsMetaJsonFile = join(
        middlewareDir,
        'pikku-middleware-groups-meta.gen.json'
      )
    }

    // Permissions
    const permissionsDir = join(result.outDir, 'permissions')
    if (!result.permissionsFile) {
      result.permissionsFile = join(permissionsDir, 'pikku-permissions.gen.ts')
    }
    if (!result.permissionsGroupsMetaJsonFile) {
      result.permissionsGroupsMetaJsonFile = join(
        permissionsDir,
        'pikku-permissions-groups-meta.gen.json'
      )
    }

    // Bootstrap files
    if (!result.bootstrapFile) {
      result.bootstrapFile = join(result.outDir, 'pikku-bootstrap.gen.ts')
    }

    // MCP
    if (!result.mcpWiringsMetaFile) {
      result.mcpWiringsMetaFile = join(mcpDir, 'pikku-mcp-wirings-meta.gen.ts')
    }
    if (!result.mcpWiringsMetaJsonFile) {
      result.mcpWiringsMetaJsonFile = join(
        mcpDir,
        'pikku-mcp-wirings-meta.gen.json'
      )
    }
    if (!result.mcpWiringsFile) {
      result.mcpWiringsFile = join(mcpDir, 'pikku-mcp-wirings.gen.ts')
    }
    if (!result.mcpTypesFile) {
      result.mcpTypesFile = join(mcpDir, 'pikku-mcp-types.gen.ts')
    }
    if (!result.mcpJsonFile) {
      result.mcpJsonFile = join(mcpDir, 'mcp.gen.json')
    }

    // AI Agent
    const agentDir = join(result.outDir, 'agent')
    if (!result.agentWiringsFile) {
      result.agentWiringsFile = join(agentDir, 'pikku-agent-wirings.gen.ts')
    }
    if (!result.agentWiringMetaFile) {
      result.agentWiringMetaFile = join(
        agentDir,
        'pikku-agent-wirings-meta.gen.ts'
      )
    }
    if (!result.agentWiringMetaJsonFile) {
      result.agentWiringMetaJsonFile = join(
        agentDir,
        'pikku-agent-wirings-meta.gen.json'
      )
    }
    if (!result.modelAliasesFile) {
      result.modelAliasesFile = join(agentDir, 'pikku-model-aliases.gen.ts')
    }
    if (!result.agentTypesFile) {
      result.agentTypesFile = join(agentDir, 'pikku-agent-types.gen.ts')
    }
    if (!result.agentMapDeclarationFile) {
      result.agentMapDeclarationFile = join(
        agentDir,
        'pikku-agent-map.gen.d.ts'
      )
    }

    // AI Scorer — the same directory as agents: a scorer exists to grade one.
    if (!result.scorerWiringsFile) {
      result.scorerWiringsFile = join(agentDir, 'pikku-scorer-wirings.gen.ts')
    }
    if (!result.scorerWiringMetaFile) {
      result.scorerWiringMetaFile = join(
        agentDir,
        'pikku-scorer-wirings-meta.gen.ts'
      )
    }
    if (!result.scorerWiringMetaJsonFile) {
      result.scorerWiringMetaJsonFile = join(
        agentDir,
        'pikku-scorer-wirings-meta.gen.json'
      )
    }
    if (!result.scorerNamesDeclarationFile) {
      result.scorerNamesDeclarationFile = join(
        agentDir,
        'pikku-scorer-names.gen.d.ts'
      )
    }

    // CLI
    if (!result.cliWiringsFile) {
      result.cliWiringsFile = join(cliDir, 'pikku-cli-wirings.gen.ts')
    }
    if (!result.cliWiringMetaFile) {
      result.cliWiringMetaFile = join(cliDir, 'pikku-cli-wirings-meta.gen.ts')
    }
    if (!result.cliWiringMetaJsonFile) {
      result.cliWiringMetaJsonFile = join(
        cliDir,
        'pikku-cli-wirings-meta.gen.json'
      )
    }
    if (!result.cliContractsMetaJsonFile) {
      result.cliContractsMetaJsonFile = join(
        cliDir,
        'pikku-cli-contracts-meta.gen.json'
      )
    }
    if (!result.cliContractsMetaFile) {
      result.cliContractsMetaFile = join(
        cliDir,
        'pikku-cli-contracts-meta.gen.ts'
      )
    }
    if (!result.cliBootstrapFile) {
      result.cliBootstrapFile = join(cliDir, 'pikku-cli-bootstrap.gen.ts')
    }
    if (!result.cliTypesFile) {
      result.cliTypesFile = join(cliDir, 'pikku-cli-types.gen.ts')
    }

    const consoleDir = join(result.outDir, 'console')
    if (!result.addonMetaJsonFile) {
      result.addonMetaJsonFile = join(consoleDir, 'pikku-addon-meta.gen.json')
    }

    const addonDir = join(result.outDir, 'addon')
    if (!result.packageFile) {
      result.packageFile = join(
        result.addon ? result.outDir : addonDir,
        'pikku-package.gen.ts'
      )
    }
    if (!result.addonTypesFile) {
      result.addonTypesFile = join(addonDir, 'pikku-addon-types.gen.ts')
    }
    const errorDir = join(result.outDir, 'error')
    if (!result.errorTypesFile) {
      result.errorTypesFile = join(errorDir, 'pikku-error-types.gen.ts')
    }

    // Secrets (typed wrapper for SecretService)
    const secretsDir = join(result.outDir, 'secrets')
    if (!result.secretTypesFile) {
      result.secretTypesFile = join(secretsDir, 'pikku-secret-types.gen.ts')
    }
    if (!result.secretsFile) {
      result.secretsFile = join(secretsDir, 'pikku-secrets.gen.ts')
    }
    if (!result.secretsMetaJsonFile) {
      result.secretsMetaJsonFile = join(
        secretsDir,
        'pikku-secrets-meta.gen.json'
      )
    }

    // Credentials (typed wrapper for CredentialService)
    const credentialsDir = join(result.outDir, 'credentials')
    if (!result.credentialsFile) {
      result.credentialsFile = join(credentialsDir, 'pikku-credentials.gen.ts')
    }
    if (!result.credentialsMetaJsonFile) {
      result.credentialsMetaJsonFile = join(
        credentialsDir,
        'pikku-credentials-meta.gen.json'
      )
    }

    // Scopes (ScopeId union + declared scope set)
    const scopesDir = join(result.outDir, 'scopes')
    if (!result.scopeTypesFile) {
      result.scopeTypesFile = join(scopesDir, 'pikku-scope-types.gen.ts')
    }
    if (!result.scopesFile) {
      result.scopesFile = join(scopesDir, 'pikku-scopes.gen.ts')
    }
    if (!result.scopesMetaJsonFile) {
      result.scopesMetaJsonFile = join(scopesDir, 'pikku-scopes-meta.gen.json')
    }

    // System roles (SystemRoleName union + declared role set). Kept beside the
    // scopes they are composed from — a role is unreadable without them.
    if (!result.rolesFile) {
      result.rolesFile = join(scopesDir, 'pikku-roles.gen.ts')
    }
    if (!result.rolesMetaJsonFile) {
      result.rolesMetaJsonFile = join(scopesDir, 'pikku-roles-meta.gen.json')
    }

    // Personas. Beside the roles they are checked against, for the same reason
    // roles sit beside their scopes.
    if (!result.personasFile) {
      result.personasFile = join(scopesDir, 'pikku-personas.gen.ts')
    }
    if (!result.personasMetaJsonFile) {
      result.personasMetaJsonFile = join(
        scopesDir,
        'pikku-personas-meta.gen.json'
      )
    }

    // Variables (typed wrapper for VariablesService)
    const variablesDir = join(result.outDir, 'variables')
    if (!result.variableTypesFile) {
      result.variableTypesFile = join(
        variablesDir,
        'pikku-variable-types.gen.ts'
      )
    }
    if (!result.variablesFile) {
      result.variablesFile = join(variablesDir, 'pikku-variables.gen.ts')
    }
    if (!result.variablesMetaJsonFile) {
      result.variablesMetaJsonFile = join(
        variablesDir,
        'pikku-variables-meta.gen.json'
      )
    }

    result.globalHTTPPrefix = result.globalHTTPPrefix
      ? result.globalHTTPPrefix.replace(/\/+$/, '')
      : ''

    if (requiredFields.length > 0) {
      validateCLIConfig(result, requiredFields)
    }

    for (const objectKey of Object.keys(result)) {
      if (
        objectKey.endsWith('File') ||
        objectKey.endsWith('Directory') ||
        objectKey.endsWith('Dir')
      ) {
        // Only normalize string values to avoid corrupting nested objects
        if (result[objectKey] && typeof result[objectKey] === 'string') {
          if (!isAbsolute(result[objectKey])) {
            result[objectKey] = join(result.rootDir, result[objectKey])
          }
        }
      }
    }

    // Resolve clientFiles paths relative to configDir
    if (result.clientFiles) {
      if ('startServerFnsFile' in result.clientFiles) {
        throw new PikkuCLIConfigError(
          `clientFiles.startServerFnsFile is now clientFiles.tanstackStartFile — rename it in ${result.configDir}/pikku.config.json`
        )
      }
      for (const key of CLIENT_FILE_KEYS) {
        const val = result.clientFiles[key]
        if (val && typeof val === 'string' && !isAbsolute(val)) {
          result.clientFiles[key] = join(result.configDir, val)
        }
      }
    }

    if (result.frontend) {
      result.frontend = resolveFrontendConfig(result.frontend, result.configDir)
    }

    if (result.emailTemplatesDir && !isAbsolute(result.emailTemplatesDir)) {
      result.emailTemplatesDir = join(
        result.configDir,
        result.emailTemplatesDir
      )
    }

    if (result.authFile && !isAbsolute(result.authFile)) {
      result.authFile = join(result.configDir, result.authFile)
    }

    if (result.authTypesFile && !isAbsolute(result.authTypesFile)) {
      result.authTypesFile = join(result.configDir, result.authTypesFile)
    }

    if (!isAbsolute(result.tsconfig)) {
      result.tsconfig = join(result.rootDir, result.tsconfig)
    }

    result.locale = normalizeLocale(result.locale)

    assertSchemaDirectoriesAreDistinct(result)

    if (result.addon) {
      const packageJsonPath = join(result.rootDir, 'package.json')
      try {
        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
        const packageJson = JSON.parse(packageJsonContent)

        if (
          !packageJson.name ||
          typeof packageJson.name !== 'string' ||
          packageJson.name.trim() === ''
        ) {
          throw new Error(
            `package.json at ${packageJsonPath} is missing a valid "name" field`
          )
        }

        result.addonName = packageJson.name
      } catch (e: any) {
        throw new Error(
          `addon is true but could not read or parse package.json at ${packageJsonPath}: ${e.message}`
        )
      }
    }

    return result
  } catch (e: any) {
    // A config that parsed but is contradictory is not a missing config, and
    // saying so sends the reader looking for the wrong problem.
    if (e instanceof PikkuCLIConfigError) {
      throw e
    }
    logger.error(e)
    // The file was found and read; it is the loading that failed. Reporting
    // that as "not found" sends the reader hunting for a file that is there.
    throw new Error(`Failed to load config file: ${configFile}`)
  }
}

export const validateCLIConfig = (
  cliConfig: PikkuCLIConfig,
  required: Array<keyof PikkuCLIConfig>
) => {
  let errors: string[] = []
  for (const key of required) {
    if (!cliConfig[key]) {
      errors.push(key)
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.join(', ')} ${errors.length === 1 ? 'is' : 'are'} required in pikku.config.json`
    )
  }
}
