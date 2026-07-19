import { readFile, readdir } from 'fs/promises'
import { createRequire } from 'module'
import { join, dirname } from 'path'
import type { InspectorState, InspectorLogger } from '../types.js'
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
 * After the setup sweep discovers wireAddon() declarations, load each addon
 * package's function metadata so that wiring handlers (channels, HTTP routes,
 * schedules, etc.) can look up addon function types during the routes sweep.
 */
export async function loadAddonFunctionsMeta(
  logger: InspectorLogger,
  state: InspectorState
): Promise<void> {
  const { wireAddonDeclarations } = state.rpc
  if (wireAddonDeclarations.size === 0) return

  const require = createRequire(join(state.rootDir, 'package.json'))

  for (const [namespace, decl] of wireAddonDeclarations) {
    // Remote addons (wireRemoteAddon) ship as a devDependency: types only.
    // Their functions, secrets, variables, schemas and services live on the
    // HOST that runs them — never load or require any of that here.
    if (decl.remote) continue
    try {
      const metaPath = require.resolve(
        `${decl.package}/.pikku/function/pikku-functions-meta.gen.json`
      )
      const raw = await readFile(metaPath, 'utf-8')
      const meta = JSON.parse(raw)
      state.addonFunctions[namespace] = meta
      logger.debug(
        `Loaded ${Object.keys(meta).length} addon functions for '${namespace}' from ${decl.package}`
      )

      // If wireAddon has mcp: true, expose addon functions with mcp: true as MCP tools
      if (decl.mcp) {
        for (const [funcName, funcMeta] of Object.entries<any>(meta)) {
          if (funcMeta.mcp) {
            const toolName = `${namespace}:${funcName}`
            state.mcpEndpoints.toolsMeta[toolName] = {
              pikkuFuncId: `${namespace}:${funcName}`,
              name: toolName,
              description: funcMeta.description || funcMeta.title || funcName,
              inputSchema: funcMeta.inputSchemaName ?? null,
              outputSchema: funcMeta.outputSchemaName ?? null,
              tags: funcMeta.tags,
            }
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
            state.scopes.definitions.push(def)
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

  const require = createRequire(join(state.rootDir, 'package.json'))

  for (const [namespace, decl] of wireAddonDeclarations) {
    // Remote addons carry no local schemas — their funcs run on the host.
    if (decl.remote) continue
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
      logger.warn(
        `Failed to load addon schemas for '${namespace}' (${decl.package}): ${error.message}`
      )
    }
  }
}
