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
          const existing = state.secrets.definitions.find(
            (d: any) => d.name === key
          )
          if (!existing) {
            state.secrets.definitions.push(def)
            logger.debug(`Loaded addon secret '${key}' from ${decl.package}`)
          }
        }
      } catch {
        // No secrets meta — that's fine
      }

      // Load addon variables meta
      try {
        const variablesMetaPath = require.resolve(
          `${decl.package}/.pikku/variables/pikku-variables-meta.gen.json`
        )
        const variablesRaw = await readFile(variablesMetaPath, 'utf-8')
        const variablesMeta = JSON.parse(variablesRaw)
        for (const [key, def] of Object.entries<any>(variablesMeta)) {
          const existing = state.variables.definitions.find(
            (d: any) => d.name === key
          )
          if (!existing) {
            state.variables.definitions.push(def)
            logger.debug(`Loaded addon variable '${key}' from ${decl.package}`)
          }
        }
      } catch {
        // No variables meta — that's fine
      }
      // Load addon serverlessIncompatible service names from pikku-addon-meta.gen.json
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
      } catch {
        // No addon meta or no serverlessIncompatible declared — that's fine
      }

      // Load addon required parent services from pikku-services.gen
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
      } catch {
        // No services gen — addon may not have requiredParentServices
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
