import {
  InspectorState,
  InspectorLogger,
  InspectorOptions,
  InspectorModelConfig,
  ExternalPackageConfig,
  MiddlewareGroupMeta,
} from '../types.js'
import {
  FunctionServicesMeta,
  MiddlewareMetadata,
  PermissionMetadata,
} from '@pikku/core'
import { extractTypeKeys } from './type-utils.js'
import { ErrorCode } from '../error-codes.js'

/**
 * Helper to extract wire-level middleware/permission names from metadata.
 * Only extracts type:'wire' variants (individual middleware/permissions).
 * Skips type:'http' and type:'tag' (reference groups, not individuals).
 */
export function extractWireNames(
  list?: MiddlewareMetadata[] | PermissionMetadata[]
): string[] {
  if (!list) return []
  return list
    .filter(
      (item): item is { type: 'wire'; name: string } => item.type === 'wire'
    )
    .map((item) => item.name)
}

/**
 * Helper to expand middleware/permission groups into individual names
 * and add their services to the aggregation.
 * This handles tag-based and HTTP-pattern-based middleware/permission groups.
 */
function expandAndAddGroupServices(
  list: MiddlewareMetadata[] | PermissionMetadata[] | undefined,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>,
  addServices: (services: FunctionServicesMeta | undefined) => void,
  isMiddleware: boolean
): void {
  if (!list) return

  for (const item of list) {
    if (item.type === 'tag') {
      // Expand tag-based group
      const groupMeta = isMiddleware
        ? state.middleware.tagMiddleware.get(item.tag)
        : state.permissions.tagPermissions.get(item.tag)

      if (groupMeta?.services) {
        addServices(groupMeta.services)
      }
    } else if (item.type === 'http' && 'route' in item) {
      // Expand HTTP-pattern-based group
      const groupMeta = isMiddleware
        ? state.http.routeMiddleware.get(item.route)
        : state.http.routePermissions.get(item.route)

      if (groupMeta?.services) {
        addServices(groupMeta.services)
      }
    }
  }
}

/**
 * Extracts all service names from SingletonServices and Services types.
 * This provides the complete list of available services for code generation.
 * Only runs if typesLookup is available (omitted in deserialized states).
 */
function extractAllServices(
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  // Skip if typesLookup is not available (e.g., deserialized state)
  if (!('typesLookup' in state)) {
    return
  }

  // Extract all singleton services from the SingletonServices type
  const singletonServicesTypes = state.typesLookup.get('SingletonServices')
  if (singletonServicesTypes && singletonServicesTypes.length > 0) {
    const singletonServiceNames = extractTypeKeys(singletonServicesTypes[0])
    state.serviceAggregation.allSingletonServices = singletonServiceNames.sort()
  }

  // Extract all services from the Services type
  const servicesTypes = state.typesLookup.get('Services')
  if (servicesTypes && servicesTypes.length > 0) {
    const allServiceNames = extractTypeKeys(servicesTypes[0])
    // Wire services are those in Services but not in SingletonServices
    const singletonSet = new Set(state.serviceAggregation.allSingletonServices)
    state.serviceAggregation.allWireServices = allServiceNames
      .filter((name) => !singletonSet.has(name))
      .sort()
  }
}

/**
 * Aggregates all required services from wired functions, middleware, and permissions.
 * Must be called after AST traversal completes.
 *
 * Note: usedFunctions, usedMiddleware, and usedPermissions are tracked directly
 * in the add-* methods during AST traversal for efficiency.
 */
export function aggregateRequiredServices(
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  // First, extract all available services from types
  extractAllServices(state)

  const { requiredServices, usedFunctions, usedMiddleware, usedPermissions } =
    state.serviceAggregation

  // Internal services (always excluded from tree-shaking)
  const internalServices = new Set(['rpc', 'mcp', 'channel', 'userSession'])

  const addServices = (services: FunctionServicesMeta | undefined) => {
    if (!services || !services.services) return
    services.services.forEach((service) => {
      if (!internalServices.has(service)) {
        requiredServices.add(service)
      }
    })
  }

  // 1. Services from used functions
  usedFunctions.forEach((funcName) => {
    const funcMeta = state.functions.meta[funcName]
    if (funcMeta?.services) {
      addServices(funcMeta.services)
    }
  })

  // 2. Services from used middleware (individual + groups)
  usedMiddleware.forEach((middlewareName) => {
    const middlewareMeta = state.middleware.definitions[middlewareName]
    if (middlewareMeta?.services) {
      addServices(middlewareMeta.services)
    }
  })

  // 3. Services from used permissions (individual + groups)
  usedPermissions.forEach((permissionName) => {
    const permissionMeta = state.permissions.definitions[permissionName]
    if (permissionMeta?.services) {
      addServices(permissionMeta.services)
    }
  })

  // 4. Services from middleware/permission groups used in wirings
  // We need to check all wirings and expand any tag/HTTP-pattern groups they use
  for (const method of [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'head',
    'options',
  ] as const) {
    for (const routeMeta of Object.values(state.http.meta[method])) {
      expandAndAddGroupServices(routeMeta.middleware, state, addServices, true)
      expandAndAddGroupServices(
        routeMeta.permissions,
        state,
        addServices,
        false
      )
    }
  }

  // Also check other wiring types (channels, queues, schedulers, MCP)
  for (const channelMeta of Object.values(state.channels.meta)) {
    expandAndAddGroupServices(channelMeta.middleware, state, addServices, true)
    expandAndAddGroupServices(
      channelMeta.permissions,
      state,
      addServices,
      false
    )
  }

  for (const queueMeta of Object.values(state.queueWorkers.meta)) {
    expandAndAddGroupServices(queueMeta.middleware, state, addServices, true)
    // expandAndAddGroupServices(queueMeta.permissions, state, addServices, false)
  }

  for (const scheduleMeta of Object.values(state.scheduledTasks.meta)) {
    expandAndAddGroupServices(scheduleMeta.middleware, state, addServices, true)
    // expandAndAddGroupServices(scheduleMeta.permissions, state, addServices, false)
  }

  for (const toolMeta of Object.values(state.mcpEndpoints.toolsMeta)) {
    expandAndAddGroupServices(toolMeta.middleware, state, addServices, true)
    expandAndAddGroupServices(toolMeta.permissions, state, addServices, false)
  }

  for (const promptMeta of Object.values(state.mcpEndpoints.promptsMeta)) {
    expandAndAddGroupServices(promptMeta.middleware, state, addServices, true)
    expandAndAddGroupServices(promptMeta.permissions, state, addServices, false)
  }

  for (const resourceMeta of Object.values(state.mcpEndpoints.resourcesMeta)) {
    expandAndAddGroupServices(resourceMeta.middleware, state, addServices, true)
    expandAndAddGroupServices(
      resourceMeta.permissions,
      state,
      addServices,
      false
    )
  }

  // 5. Services from session service factories
  for (const singletonServices of state.wireServicesMeta.values()) {
    singletonServices.forEach((service) => {
      if (!internalServices.has(service)) {
        requiredServices.add(service)
      }
    })
  }
}

export function validateSecretOverrides(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>,
  externalPackages?: Record<string, ExternalPackageConfig>
): void {
  if (!externalPackages) return

  const secretNames = new Set(state.secrets.definitions.map((d) => d.name))

  for (const [namespace, pkgConfig] of Object.entries(externalPackages)) {
    if (!pkgConfig.secretOverrides) continue

    for (const secretKey of Object.keys(pkgConfig.secretOverrides)) {
      if (!secretNames.has(secretKey)) {
        const availableSecrets = Array.from(secretNames)
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Secret override '${secretKey}' in external package '${namespace}' (${pkgConfig.package}) does not exist. Available secrets: ${availableSecrets.join(', ') || 'none'}`
        )
      }
    }
  }
}

export function computeResolvedIOTypes(state: InspectorState): void {
  const { functions } = state
  for (const [pikkuFuncId, meta] of Object.entries(functions.meta)) {
    const input = meta.inputs?.[0]
    const output = meta.outputs?.[0]

    let inputType = 'null'
    if (input) {
      try {
        inputType = functions.typesMap.getTypeMeta(input).uniqueName
      } catch {
        inputType = input
      }
    }

    let outputType = 'null'
    if (output) {
      try {
        outputType = functions.typesMap.getTypeMeta(output).uniqueName
      } catch {
        outputType = output
      }
    }

    state.resolvedIOTypes[pikkuFuncId] = { inputType, outputType }
  }
}

const serializeGroupMap = (
  groupMap: Map<string, MiddlewareGroupMeta>
): Record<string, MiddlewareGroupMeta> => {
  const result: Record<string, MiddlewareGroupMeta> = {}
  for (const [key, meta] of groupMap.entries()) {
    result[key] = {
      exportName: meta.exportName,
      sourceFile: meta.sourceFile,
      position: meta.position,
      services: meta.services,
      count: meta.count,
      instanceIds: meta.instanceIds,
      isFactory: meta.isFactory,
    }
  }
  return result
}

export function computeMiddlewareGroupsMeta(state: InspectorState): void {
  state.middlewareGroupsMeta = {
    definitions: state.middleware.definitions,
    instances: state.middleware.instances,
    httpGroups: serializeGroupMap(state.http.routeMiddleware),
    tagGroups: serializeGroupMap(state.middleware.tagMiddleware),
    channelMiddleware: {
      definitions: state.channelMiddleware.definitions,
      instances: state.channelMiddleware.instances,
      tagGroups: serializeGroupMap(state.channelMiddleware.tagMiddleware),
    },
  }
}

export function computePermissionsGroupsMeta(state: InspectorState): void {
  const httpGroups: Record<string, any> = {}
  for (const [pattern, meta] of state.http.routePermissions.entries()) {
    httpGroups[pattern] = {
      exportName: meta.exportName,
      sourceFile: meta.sourceFile,
      position: meta.position,
      services: meta.services,
      count: meta.count,
      instanceIds: meta.instanceIds,
      isFactory: meta.isFactory,
    }
  }

  const tagGroups: Record<string, any> = {}
  for (const [tag, meta] of state.permissions.tagPermissions.entries()) {
    tagGroups[tag] = {
      exportName: meta.exportName,
      sourceFile: meta.sourceFile,
      position: meta.position,
      services: meta.services,
      count: meta.count,
      instanceIds: meta.instanceIds,
      isFactory: meta.isFactory,
    }
  }

  state.permissionsGroupsMeta = {
    definitions: state.permissions.definitions,
    httpGroups,
    tagGroups,
  }
}

const PRIMITIVE_TYPES = new Set([
  'boolean',
  'string',
  'number',
  'null',
  'undefined',
  'void',
  'any',
  'unknown',
  'never',
])

export function computeRequiredSchemas(
  state: InspectorState,
  options: InspectorOptions
): void {
  const { functions, schemaLookup } = state
  const schemasFromTypes = options.schemaConfig?.schemasFromTypes

  state.requiredSchemas = new Set<string>([
    ...Object.values(functions.meta)
      .map(({ inputs, outputs }) => {
        const types: (string | undefined)[] = []
        if (inputs?.[0]) {
          try {
            types.push(functions.typesMap.getUniqueName(inputs[0]))
          } catch {
            types.push(inputs[0])
          }
        }
        if (outputs?.[0]) {
          try {
            types.push(functions.typesMap.getUniqueName(outputs[0]))
          } catch {
            types.push(outputs[0])
          }
        }
        return types
      })
      .flat()
      .filter((s): s is string => !!s && !PRIMITIVE_TYPES.has(s)),
    ...functions.typesMap.customTypes.keys(),
    ...(schemasFromTypes || []),
    ...Array.from(schemaLookup.keys()),
  ])
}

export function validateAgentModels(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>,
  modelConfig?: InspectorModelConfig
): void {
  const aliases = modelConfig?.models ?? {}

  for (const [, meta] of Object.entries(state.agents.agentsMeta)) {
    const model = meta.model
    if (!model) {
      logger.critical(
        ErrorCode.MISSING_MODEL,
        `AI agent '${meta.name}' is missing the 'model' property.`
      )
      continue
    }
    if (model.includes('/')) continue
    if (!aliases[model]) {
      const available = Object.keys(aliases)
      logger.critical(
        ErrorCode.INVALID_MODEL,
        `AI agent '${meta.name}' uses model alias '${model}' which is not defined in pikku.config.json models. ` +
          `Available aliases: ${available.join(', ') || 'none'}`
      )
    }
  }
}

export function validateAgentOverrides(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>,
  modelConfig?: InspectorModelConfig
): void {
  const overrides = modelConfig?.agentOverrides ?? {}
  const aliases = modelConfig?.models ?? {}
  const agentNames = new Set(
    Object.values(state.agents.agentsMeta).map((m) => m.name)
  )

  for (const [agentName, override] of Object.entries(overrides)) {
    if (!agentNames.has(agentName)) {
      logger.warn(`agentOverrides references unknown agent '${agentName}'`)
    }
    if (
      override.model &&
      !override.model.includes('/') &&
      !aliases[override.model]
    ) {
      logger.critical(
        ErrorCode.INVALID_MODEL,
        `agentOverrides['${agentName}'].model uses alias '${override.model}' which is not defined in models.`
      )
    }
  }
}
