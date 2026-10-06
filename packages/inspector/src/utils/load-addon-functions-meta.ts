import { existsSync } from 'fs'
import { readFile, readdir } from 'fs/promises'
import { join, dirname, parse, relative } from 'path'
import type {
  InspectorState,
  InspectorLogger,
  ScreensManifestMeta,
} from '../types.js'
import {
  addonResolutionDirs,
  createAddonResolver,
  type AddonResolver,
} from './addon-resolution.js'
import { ErrorCode } from '../error-codes.js'
import type { WebhookSourceMeta, WebhookSourcesMeta } from '@pikku/core/trigger'
import type { ScopeOrigin } from '@pikku/core/scope'
import type {
  ExportedChannelContractsMeta,
  ExportedHTTPRouteConfigMeta,
  ExportedHTTPRouteEntryMeta,
  ExportedHTTPRoutesGroupMeta,
  ExportedCLIContractsMeta,
  ExportedHTTPContractsMeta,
  ExportedHTTPRouteMapMeta,
} from '../types.js'

const isHTTPRouteConfig = (
  value: ExportedHTTPRouteEntryMeta
): value is ExportedHTTPRouteConfigMeta =>
  typeof value === 'object' &&
  value !== null &&
  'method' in value &&
  'func' in value &&
  'route' in value

const isHTTPRouteGroup = (
  value: ExportedHTTPRouteEntryMeta
): value is ExportedHTTPRoutesGroupMeta =>
  typeof value === 'object' &&
  value !== null &&
  'routes' in value &&
  !('method' in value)

const applyPackageToHTTPRouteMap = (
  routes: ExportedHTTPRouteMapMeta,
  packageName: string,
  namespace?: string
) => {
  for (const value of Object.values(routes)) {
    if (!value || typeof value !== 'object') continue
    if (isHTTPRouteConfig(value)) {
      if (!value.func.packageName) {
        value.func.packageName = packageName
      }
      if (namespace && !value.func.pikkuFuncId.includes(':')) {
        value.func.pikkuFuncId = `${namespace}:${value.func.pikkuFuncId}`
      }
      continue
    }
    if (isHTTPRouteGroup(value)) {
      applyPackageToHTTPRouteMap(value.routes, packageName, namespace)
      continue
    }
    applyPackageToHTTPRouteMap(
      value as ExportedHTTPRouteMapMeta,
      packageName,
      namespace
    )
  }
}

const applyPackageToHTTPContracts = (
  contracts: ExportedHTTPContractsMeta,
  packageName: string,
  namespace: string
) => {
  for (const contract of Object.values(contracts)) {
    applyPackageToHTTPRouteMap(contract.routes, packageName, namespace)
  }
}

const applyPackageToCLICommands = (
  commands: Record<string, any>,
  packageName: string,
  namespace?: string
) => {
  for (const command of Object.values(commands)) {
    if (command && typeof command === 'object') {
      if (!command.packageName && command.pikkuFuncId) {
        command.packageName = packageName
      }
      if (
        namespace &&
        typeof command.pikkuFuncId === 'string' &&
        !command.pikkuFuncId.includes(':')
      ) {
        command.pikkuFuncId = `${namespace}:${command.pikkuFuncId}`
      }
      if (command.subcommands) {
        applyPackageToCLICommands(command.subcommands, packageName, namespace)
      }
    }
  }
}

const applyPackageToCLIContracts = (
  contracts: ExportedCLIContractsMeta,
  packageName: string,
  namespace: string
) => {
  for (const commands of Object.values(contracts)) {
    applyPackageToCLICommands(commands, packageName, namespace)
  }
}

const applyPackageToChannelContracts = (
  contracts: ExportedChannelContractsMeta,
  packageName: string,
  namespace: string
) => {
  for (const routes of Object.values(contracts)) {
    for (const route of Object.values(routes)) {
      if (!route.packageName) {
        route.packageName = packageName
      }
      if (!route.pikkuFuncId.includes(':')) {
        route.pikkuFuncId = `${namespace}:${route.pikkuFuncId}`
      }
    }
  }
}

/**
 * Resolves an addon's generated metadata, preferring the verbose copy.
 *
 * An addon publishes both: the minimal one its own bootstrap imports, and the
 * verbose one for anything that needs the fields stripped out of it. A consumer
 * is squarely in the second category — it is reading the addon to describe it,
 * not to run it.
 */
const resolveAddonMeta = (
  require: AddonResolver,
  packageName: string,
  baseName: string
): string | null => {
  for (const suffix of ['-verbose.gen.json', '.gen.json']) {
    try {
      return require.resolve(`${packageName}/.pikku/${baseName}${suffix}`)
    } catch {
      continue
    }
  }
  return null
}

const findInstalledPackageDir = (
  dirs: string[],
  packageName: string
): string | null => {
  for (const start of dirs) {
    const root = parse(start).root
    let dir = start
    while (dir) {
      const candidate = join(dir, 'node_modules', packageName)
      if (existsSync(join(candidate, 'package.json'))) return candidate
      if (dir === root) break
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

export const describeMissingAddonMeta = (
  namespace: string,
  packageName: string,
  dirs: string[],
  declFile?: string
): string => {
  const caller = declFile
    ? relative(dirs[dirs.length - 1], declFile) || declFile
    : undefined
  const declaredIn = caller ? ` (declared in ${caller})` : ''
  const packageDir = findInstalledPackageDir(dirs, packageName)
  if (!packageDir) {
    const declaringPackage = dirs[0]
    return (
      `wireAddon('${namespace}')${declaredIn} names ${packageName}, which is not installed where it can be resolved — tried ${dirs.join(', ')}. ` +
      `Add "${packageName}": "workspace:*" (or a version) to the dependencies of ${join(declaringPackage, 'package.json')} and run install.`
    )
  }
  return (
    `wireAddon('${namespace}')${declaredIn}: ${packageName} is installed at ${packageDir} but has not been built — ` +
    `its dist/.pikku/addon/function/pikku-functions-meta.gen.json does not exist. Run the addon's build (pikku all && tsc && pikku dist) in ${packageDir}.`
  )
}

/**
 * Give the addon's input/output type names a declaration file to be imported
 * from, so a wiring that references an addon function can name its contract.
 *
 * Without this the only thing that knows where `GetScenarioArtifactInput` lives
 * is the type checker, and it only knows once the consumer's *own* rpc map has
 * already been generated with the addon's routes in it — which is to say on the
 * second run. A first, cold run resolved `ref('console:getScenarioArtifact')`
 * against a map that did not mention it yet and fell back to the whole
 * `FlattenedRPCMap`, so the same source produced a different http-map depending
 * on whether `.pikku` happened to be there. The addon publishes these types at a
 * fixed subpath; reading them from the metadata makes the first run agree with
 * the second.
 */
const registerAddonTypes = (
  state: InspectorState,
  metaPath: string,
  meta: Record<string, any>
): void => {
  // Derived from the metadata's own location rather than resolved as a package
  // subpath: the addon exports that declaration under a `types`-only condition,
  // which `require.resolve` will not follow.
  const typesPath = join(
    dirname(metaPath),
    '..',
    'rpc',
    'pikku-rpc-wirings-map.internal.gen.d.ts'
  )
  if (!existsSync(typesPath)) return

  for (const funcMeta of Object.values(meta)) {
    for (const name of [funcMeta.inputSchemaName, funcMeta.outputSchemaName]) {
      if (!name || state.functions.typesMap.exists(name, typesPath)) continue
      state.functions.typesMap.addType(name, typesPath)
    }
  }
}

/**
 * The webhook sources an addon declares, as the app mounts them. The source is
 * named after the addon's namespace, so two instances of one addon get a
 * route each; an addon declaring several suffixes each with its own name.
 * Every source starts off: the app turns one on at runtime.
 */
export const namespaceAddonWebhookSources = (
  sources: WebhookSourcesMeta,
  namespace: string
): WebhookSourcesMeta => {
  const declared = Object.values(sources)
  const namespaced: WebhookSourcesMeta = {}
  for (const source of declared) {
    const name =
      declared.length === 1 ? namespace : `${namespace}-${source.name}`
    const meta: WebhookSourceMeta = {
      ...source,
      name,
      route: `/webhooks/${name}`,
    }
    for (const step of ['receive', 'check', 'setup', 'teardown'] as const) {
      const funcId = source[step]
      if (funcId && !funcId.includes(':')) meta[step] = `${namespace}:${funcId}`
    }
    namespaced[name] = meta
  }
  return namespaced
}

/**
 * After the setup sweep discovers wireAddon() declarations, load each addon
 * package's function metadata so that wiring handlers (channels, HTTP routes,
 * schedules, etc.) can look up addon function types during the routes sweep.
 */
const loadScreensManifest = async (
  require: AddonResolver,
  packageName: string
): Promise<ScreensManifestMeta | null> => {
  const path = resolveAddonMeta(
    require,
    packageName,
    'screens/pikku-screens-meta'
  )
  if (!path) return null
  return JSON.parse(await readFile(path, 'utf-8')) as ScreensManifestMeta
}

const readAddonNeeds = async (
  dirs: string[],
  packageName: string
): Promise<string[]> => {
  const dir = findInstalledPackageDir(dirs, packageName)
  if (!dir) return []
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf-8'))
    const uses = pkg?.pikku?.uses
    return Array.isArray(uses)
      ? uses.filter((u): u is string => typeof u === 'string')
      : []
  } catch {
    return []
  }
}

export async function loadAddonFunctionsMeta(
  logger: InspectorLogger,
  state: InspectorState
): Promise<void> {
  const { wireAddonDeclarations } = state.rpc
  if (wireAddonDeclarations.size === 0) return

  for (const [namespace, decl] of wireAddonDeclarations) {
    // Remote addons (wireRemoteAddon) ship as a devDependency: types only.
    // Their functions, secrets, variables, schemas and services live on the
    // HOST that runs them — never load or require any of that here.
    if (decl.remote) continue
    const dirs = addonResolutionDirs(state.rootDir, decl.file)
    const require = createAddonResolver(dirs)
    try {
      for (const needed of await readAddonNeeds(dirs, decl.package)) {
        if (!decl.uses?.[needed]) {
          logger.critical(
            ErrorCode.ADDON_NEEDS_NOT_MAPPED,
            `${decl.package} needs ${needed}, but wireAddon('${namespace}') does not map it. Wire ${needed} and add uses: { '${needed}': '<name>' } to this wireAddon.`
          )
        }
      }
      if (decl.ui) {
        let manifest: Awaited<ReturnType<typeof loadScreensManifest>>
        try {
          manifest = await loadScreensManifest(require, decl.package)
        } catch (e) {
          logger.critical(
            ErrorCode.ADDON_UI_HAS_NO_SCREENS,
            `wireAddon('${namespace}') sets ui: true, but the screens manifest of ${decl.package} could not be read: ${e instanceof Error ? e.message : e}`
          )
          continue
        }
        if (!manifest || manifest.screens.length === 0) {
          logger.critical(
            ErrorCode.ADDON_UI_HAS_NO_SCREENS,
            `wireAddon('${namespace}') sets ui: true, but ${decl.package} declares no screens. Add a defineScreens call to the package, or drop ui.`
          )
        } else {
          ;(state.addonScreens ??= {})[namespace] = {
            ...manifest,
            scopes: [
              ...new Set([...(manifest.scopes ?? []), ...(decl.scopes ?? [])]),
            ].sort(),
          }
        }
      }

      // Verbose first. `description` is one of the fields stripped from the
      // minimal copy, and it is what an addon's function is offered to a model
      // under — both as an MCP tool below and as an agent tool. Read the minimal
      // one and every addon function looks undescribed.
      const metaPath = resolveAddonMeta(
        require,
        decl.package,
        'function/pikku-functions-meta'
      )
      if (!metaPath) {
        logger.warn(
          describeMissingAddonMeta(namespace, decl.package, dirs, decl.file)
        )
        continue
      }
      const raw = await readFile(metaPath, 'utf-8')
      const meta = JSON.parse(raw)
      state.addonFunctions[namespace] = meta
      logger.debug(
        `Loaded ${Object.keys(meta).length} addon functions for '${namespace}' from ${decl.package}`
      )
      registerAddonTypes(state, metaPath, meta)

      // `mcp: true` offers what the addon declared as tools; `mcp: [...]` names
      // the functions to offer, whatever the addon declared — the consuming app
      // decides which of the addon's functions a model gets to see.
      if (decl.mcp) {
        const selected = Array.isArray(decl.mcp) ? new Set(decl.mcp) : null
        // `mcpEndpoint` gives this instance an endpoint to itself, which is
        // what lets one project expose several connectors: a client pointed at
        // one surface lists that surface's tools and no others. Unset keeps
        // the tools on the project's single endpoint.
        const surface = decl.mcpEndpoint ? namespace : undefined
        if (surface) {
          state.mcpEndpoints.surfaces[surface] =
            typeof decl.mcpEndpoint === 'string'
              ? decl.mcpEndpoint
              : `/mcp/${namespace}`
        }
        for (const [funcName, funcMeta] of Object.entries<any>(meta)) {
          if (selected ? !selected.has(funcName) : !funcMeta.mcp) {
            continue
          }
          const toolName = `${namespace}:${funcName}`
          state.mcpEndpoints.toolsMeta[toolName] = {
            pikkuFuncId: `${namespace}:${funcName}`,
            name: toolName,
            description: funcMeta.description || funcMeta.title || funcName,
            inputSchema: funcMeta.inputSchemaName ?? null,
            outputSchema: funcMeta.outputSchemaName ?? null,
            tags: funcMeta.tags,
            ...(surface ? { surface } : {}),
          }
        }
        // A name the addon does not publish is a tool the app believes it
        // offers and never does, so it fails the build rather than silently
        // offering one tool fewer than the list says.
        for (const funcName of selected ?? []) {
          if (!(funcName in meta)) {
            logger.critical(
              ErrorCode.ADDON_MCP_FUNCTION_NOT_FOUND,
              `wireAddon('${namespace}') lists '${funcName}' under mcp, but ${decl.package} publishes no such function.`
            )
          }
        }
      }
      // Same reasoning as mcp: a listed name the addon does not publish is a
      // function the app believes callable and never is.
      if (Array.isArray(decl.expose)) {
        for (const funcName of decl.expose) {
          if (!Object.hasOwn(meta, funcName)) {
            logger.critical(
              ErrorCode.ADDON_EXPOSE_FUNCTION_NOT_FOUND,
              `wireAddon('${namespace}') lists '${funcName}' under expose, but ${decl.package} publishes no such function.`
            )
          }
        }
      }
      // Load addon secrets meta
      try {
        const secretsMetaPath = require.resolve(
          `${decl.package}/.pikku/secrets/pikku-secrets-meta.gen.json`
        )
        const secretsRaw = await readFile(secretsMetaPath, 'utf-8')
        const secretsMeta = JSON.parse(secretsRaw)
        for (const [key, def] of Object.entries<any>(secretsMeta)) {
          // secretOverrides key on the SECRET ID (the string the addon passes to
          // getSecret — its typed map is keyed by secretId, e.g.
          // `getSecret('MAILGUN_CREDENTIALS')`), NOT the logical meta key, so the
          // runtime aliaser (which also keys on secretId) and this merge agree.
          // The resolved id is the real project secret; the addon's secretId is
          // the default when no override is given. Two instances with different
          // overrides therefore surface two distinct project secrets. `key` is
          // the fallback for older meta that predates the secretId field.
          const secretId = def.secretId ?? key
          const resolvedSecretId = decl.secretOverrides?.[secretId] ?? secretId
          const existing = state.secrets.definitions.find(
            (d: any) => (d.secretId ?? d.name) === resolvedSecretId
          )
          if (!existing) {
            state.secrets.definitions.push({
              ...def,
              secretId: resolvedSecretId,
            })
            logger.debug(
              `Loaded addon secret '${resolvedSecretId}' from ${decl.package}`
            )
          }
        }
      } catch {
        // No secrets meta — that's fine
      }

      // Load addon scopes meta. Without this an addon's own scopes never reach
      // the host's ScopeId union or its declared set, so the pikku_scopes FK
      // would refuse to grant one.
      try {
        const scopesMetaPath = require.resolve(
          `${decl.package}/.pikku/scopes/pikku-scopes-meta.gen.json`
        )
        const scopesRaw = await readFile(scopesMetaPath, 'utf-8')
        const scopesMeta = JSON.parse(scopesRaw)
        for (const [key, def] of Object.entries<any>(scopesMeta)) {
          const existing = state.scopes.definitions.find(
            (d: any) => d.name === key
          )
          if (!existing) {
            // The addon's build stamped its own name on the trees it declared;
            // the package it was installed as is the one this host knows.
            const origin: ScopeOrigin = {
              kind: 'addon',
              package: decl.package,
              displayName:
                def.origin?.kind === 'addon'
                  ? def.origin.displayName
                  : undefined,
            }
            state.scopes.definitions.push({ ...def, origin })
            logger.debug(`Loaded addon scope '${key}' from ${decl.package}`)
          }
        }
      } catch {
        // No scopes meta — that's fine
      }

      // Load addon variables meta
      try {
        const variablesMetaPath = require.resolve(
          `${decl.package}/.pikku/variables/pikku-variables-meta.gen.json`
        )
        const variablesRaw = await readFile(variablesMetaPath, 'utf-8')
        const variablesMeta = JSON.parse(variablesRaw)
        for (const [key, def] of Object.entries<any>(variablesMeta)) {
          // variableOverrides key on the VARIABLE ID (the string the addon reads
          // via its typed map, keyed by variableId), same as secretOverrides key
          // on secretId — so the runtime aliaser and this merge agree. `key` is
          // the fallback for older meta without a variableId field.
          const variableId = def.variableId ?? key
          const resolvedVariableId =
            decl.variableOverrides?.[variableId] ?? variableId
          const existing = state.variables.definitions.find(
            (d: any) => (d.variableId ?? d.name) === resolvedVariableId
          )
          if (!existing) {
            state.variables.definitions.push({
              ...def,
              variableId: resolvedVariableId,
            })
            logger.debug(
              `Loaded addon variable '${resolvedVariableId}' from ${decl.package}`
            )
          }
        }
      } catch {
        // No variables meta — that's fine
      }

      // Load addon credentials meta. Without this an addon's OAuth2/wire
      // credentials never reach the consuming app's CREDENTIAL_OAUTH2_CONFIGS,
      // so the credential-oauth provider and BetterAuthCredentialService can't
      // resolve them — the addon's Connect flow and status silently no-op.
      try {
        const credentialsMetaPath = require.resolve(
          `${decl.package}/.pikku/credentials/pikku-credentials-meta.gen.json`
        )
        const credentialsRaw = await readFile(credentialsMetaPath, 'utf-8')
        const credentialsMeta = JSON.parse(credentialsRaw)
        for (const [key, def] of Object.entries<any>(credentialsMeta)) {
          // Each instance's credentialOverrides remap the addon's logical
          // credential name to a project credential — same mechanic as secrets
          // and variables above. The credential name doubles as the better-auth
          // providerId (accounts keyed by providerId+userId), so two instances
          // with different overrides surface two distinct OAuth providers rather
          // than sharing one account pool. The logical name is the default when
          // no override is given.
          const resolvedName = decl.credentialOverrides?.[key] ?? key
          const existing = state.credentials.definitions.find(
            (d: any) => d.name === resolvedName
          )
          if (!existing) {
            state.credentials.definitions.push({ ...def, name: resolvedName })
            logger.debug(
              `Loaded addon credential '${resolvedName}' from ${decl.package}`
            )
          }
        }
      } catch {
        // No credentials meta — that's fine
      }
      // Load addon serverlessIncompatible service names from pikku-addon-meta.gen.json
      let loadedParentServices = false
      try {
        const addonMetaPath = require.resolve(
          `${decl.package}/.pikku/console/pikku-addon-meta.gen.json`
        )
        const addonMetaRaw = await readFile(addonMetaPath, 'utf-8')
        const addonMeta = JSON.parse(addonMetaRaw)
        if (
          Array.isArray(addonMeta.serverlessIncompatible) &&
          addonMeta.serverlessIncompatible.length > 0
        ) {
          state.addonServerlessIncompatible.set(
            namespace,
            addonMeta.serverlessIncompatible
          )
          logger.debug(
            `Addon '${namespace}' marks [${addonMeta.serverlessIncompatible.join(', ')}] as serverless-incompatible`
          )
        }
        if (
          Array.isArray(addonMeta.requiredParentServices) &&
          addonMeta.requiredParentServices.length > 0
        ) {
          for (const service of addonMeta.requiredParentServices) {
            state.addonRequiredParentServices.push(service)
          }
          loadedParentServices = true
          logger.debug(
            `Loaded ${addonMeta.requiredParentServices.length} required parent services for '${namespace}' from addon meta`
          )
        }
      } catch {}

      if (!loadedParentServices) {
        try {
          const servicesGenPath = require.resolve(
            `${decl.package}/.pikku/pikku-services.gen.js`
          )
          const servicesModule = await import(servicesGenPath)
          if (
            servicesModule.requiredParentServices &&
            Array.isArray(servicesModule.requiredParentServices)
          ) {
            for (const service of servicesModule.requiredParentServices) {
              state.addonRequiredParentServices.push(service)
            }
            logger.debug(
              `Loaded ${servicesModule.requiredParentServices.length} required parent services for '${namespace}' from ${decl.package}`
            )
          }
        } catch {}
      }

      try {
        const webhookSourcesPath = require.resolve(
          `${decl.package}/.pikku/webhooks/pikku-webhook-sources-meta.gen.json`
        )
        const sources = namespaceAddonWebhookSources(
          JSON.parse(await readFile(webhookSourcesPath, 'utf-8')),
          namespace
        )
        for (const [name, source] of Object.entries(sources)) {
          if (state.triggers.webhookSourceMeta[name]) continue
          state.triggers.webhookSourceMeta[name] = source
          for (const step of [
            'receive',
            'check',
            'setup',
            'teardown',
          ] as const) {
            const funcId = source[step]
            if (funcId) state.serviceAggregation.usedFunctions.add(funcId)
          }
        }
      } catch {
        // No addon webhook sources
      }

      try {
        const httpContractsPath = require.resolve(
          `${decl.package}/.pikku/http/pikku-http-contracts-meta.gen.json`
        )
        const httpContractsRaw = await readFile(httpContractsPath, 'utf-8')
        const httpContracts = JSON.parse(
          httpContractsRaw
        ) as ExportedHTTPContractsMeta
        applyPackageToHTTPContracts(httpContracts, decl.package, namespace)
        state.exportedContracts.addonHttp[namespace] = httpContracts
      } catch {
        // No addon HTTP contracts metadata
      }

      try {
        const cliContractsPath = require.resolve(
          `${decl.package}/.pikku/cli/pikku-cli-contracts-meta.gen.json`
        )
        const cliContractsRaw = await readFile(cliContractsPath, 'utf-8')
        const cliContracts = JSON.parse(
          cliContractsRaw
        ) as ExportedCLIContractsMeta
        applyPackageToCLIContracts(cliContracts, decl.package, namespace)
        state.exportedContracts.addonCli[namespace] = cliContracts
      } catch {
        // No addon CLI contracts metadata
      }

      try {
        const channelContractsPath = require.resolve(
          `${decl.package}/.pikku/channel/pikku-channel-contracts-meta.gen.json`
        )
        const channelContractsRaw = await readFile(
          channelContractsPath,
          'utf-8'
        )
        const channelContracts = JSON.parse(
          channelContractsRaw
        ) as ExportedChannelContractsMeta
        applyPackageToChannelContracts(
          channelContracts,
          decl.package,
          namespace
        )
        state.exportedContracts.addonChannel[namespace] = channelContracts
      } catch {
        // No addon channel contracts metadata
      }
    } catch (error: any) {
      logger.warn(
        `Failed to load addon function metadata for '${namespace}' (${decl.package}): ${error.message}`
      )
    }
  }
}

/**
 * Load addon schemas into state.schemas. Called after generateAllSchemas
 * to ensure addon schemas aren't overwritten.
 */
export async function loadAddonSchemas(
  logger: InspectorLogger,
  state: InspectorState
): Promise<void> {
  const { wireAddonDeclarations } = state.rpc
  if (wireAddonDeclarations.size === 0) return

  for (const [namespace, decl] of wireAddonDeclarations) {
    // Remote addons carry no local schemas — their funcs run on the host.
    if (decl.remote) continue
    const require = createAddonResolver(
      addonResolutionDirs(state.rootDir, decl.file)
    )
    try {
      const metaPath = require.resolve(
        `${decl.package}/.pikku/function/pikku-functions-meta.gen.json`
      )
      const schemasDir = join(dirname(metaPath), '..', 'schemas', 'schemas')
      try {
        const schemaFiles = await readdir(schemasDir)
        for (const file of schemaFiles) {
          if (!file.endsWith('.schema.json')) continue
          const schemaName = file.replace('.schema.json', '')
          if (!state.schemas[schemaName]) {
            const schemaRaw = await readFile(join(schemasDir, file), 'utf-8')
            state.schemas[schemaName] = JSON.parse(schemaRaw)
          }
        }
      } catch {
        // No schemas directory — that's fine
      }
    } catch (error: any) {
      if (
        error?.code === 'MODULE_NOT_FOUND' ||
        error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
      ) {
        continue
      }
      logger.warn(
        `Failed to load addon schemas for '${namespace}' (${decl.package}): ${error.message}`
      )
    }
  }
}
