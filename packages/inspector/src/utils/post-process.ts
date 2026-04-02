import type {
  InspectorState,
  InspectorLogger,
  InspectorOptions,
  InspectorModelConfig,
  MiddlewareGroupMeta,
  InspectorDiagnostic,
} from '../types.js'
import type {
  FunctionServicesMeta,
  MiddlewareMetadata,
  PermissionMetadata,
} from '@pikku/core'
import { extractTypeKeys } from './type-utils.js'
import { collectInvokedRPCs } from '../add/add-workflow.js'
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

  // 6. Implicit platform services required by wiring types
  // Workflows need workflowService + workflowRunService + schedulerService + queueService.
  // Check workflow definitions, graph meta, AND helper functions (workflowStart:*, etc.)
  // that wrap workflow operations but don't destructure the services.
  const hasWorkflows =
    Object.keys(state.workflows.graphMeta).length > 0 ||
    Object.keys(state.workflows.meta).length > 0 ||
    Object.keys(state.functions.meta).some(
      (id) =>
        id.startsWith('workflowStart:') ||
        id.startsWith('workflowStatus:') ||
        id.startsWith('workflow:')
    )
  if (hasWorkflows) {
    requiredServices.add('workflowService')
    requiredServices.add('workflowRunService')
    requiredServices.add('schedulerService')
    requiredServices.add('queueService')
  }

  // AI agents need aiStorage + aiRunState + agentRunService + aiAgentRunner
  if (Object.keys(state.agents.agentsMeta).length > 0) {
    requiredServices.add('aiStorage')
    requiredServices.add('aiRunState')
    requiredServices.add('agentRunService')
    requiredServices.add('aiAgentRunner')
  }

  // Channels need eventHub for pub/sub
  if (Object.keys(state.channels.meta).length > 0) {
    requiredServices.add('eventHub')
  }

  // 7. Services that addons need from the parent project
  for (const service of state.addonRequiredParentServices ?? []) {
    requiredServices.add(service)
  }
}

/**
 * Inject auto-generated HTTP routes for exposed RPCs, workflows, and agents.
 * Adds routes to state.http.meta and synthetic function metadata so the
 * full codegen pipeline (types, schemas, HTTP map) works without generated files.
 */
export function injectExposedRoutes(
  state: InspectorState,
  options?: { globalHTTPPrefix?: string }
): void {
  const prefix = options?.globalHTTPPrefix ?? ''

  const addRoute = (
    method: string,
    route: string,
    pikkuFuncId: string,
    inputType: string,
    outputType: string,
    extra?: { sse?: boolean; params?: string[] }
  ) => {
    if (!state.http.meta[method]) {
      state.http.meta[method] = {}
    }
    state.http.meta[method][route] = {
      pikkuFuncId,
      route,
      method,
      tags: ['pikku:public'],
      ...(extra?.sse && { sse: true }),
      ...(extra?.params && { params: extra.params }),
    }

    // Add synthetic function metadata if it doesn't exist
    if (!state.functions.meta[pikkuFuncId]) {
      state.functions.meta[pikkuFuncId] = {
        pikkuFuncId,
        functionType: 'helper',
        sessionless: true,
        name: route,
        inputSchemaName: null,
        outputSchemaName: null,
        inputs: inputType !== 'null' ? [inputType] : [],
        outputs: outputType !== 'null' ? [outputType] : [],
      }
    }

    // Add resolvedIOTypes so the HTTP map generator doesn't fail
    if (!state.resolvedIOTypes[pikkuFuncId]) {
      state.resolvedIOTypes[pikkuFuncId] = { inputType, outputType }
    }
  }

  // Exposed RPC functions: POST /rpc/{funcName}
  // These reuse the existing function's metadata — no synthetic function needed
  for (const [funcName, pikkuFuncId] of Object.entries(state.rpc.exposedMeta)) {
    const funcMeta = state.functions.meta[pikkuFuncId]
    const resolved = state.resolvedIOTypes[pikkuFuncId]
    if (!funcMeta || !resolved) continue

    if (!state.http.meta['post']) state.http.meta['post'] = {}
    state.http.meta['post'][`${prefix}/rpc/${funcName}`] = {
      pikkuFuncId,
      route: `${prefix}/rpc/${funcName}`,
      method: 'post',
      tags: ['pikku:public'],
    }
  }

  // Exposed workflows: start/run/status
  for (const [name, meta] of Object.entries(state.workflows.meta)) {
    if (!meta.expose) continue

    // Resolve input/output types from the workflow function
    const wfFuncId = meta.pikkuFuncId
    const wfResolved = state.resolvedIOTypes[wfFuncId]
    const inputType = wfResolved?.inputType ?? 'null'
    const outputType = wfResolved?.outputType ?? 'null'

    addRoute(
      'post',
      `${prefix}/workflow/${name}/start`,
      `workflowStart:${name}`,
      inputType,
      'null' // returns { runId: string } — handled by core
    )
    addRoute(
      'post',
      `${prefix}/workflow/${name}/run`,
      `workflow:${name}`,
      inputType,
      outputType
    )
    addRoute(
      'get',
      `${prefix}/workflow/${name}/status/:runId`,
      `workflowStatus:${name}`,
      'null',
      'null',
      { params: ['runId'] }
    )
  }

  // Agents: run/stream/approve/resume (per agent)
  for (const [agentName] of Object.entries(state.agents.agentsMeta)) {
    addRoute(
      'post',
      `${prefix}/rpc/agent/${agentName}`,
      `agentRun:${agentName}`,
      'null',
      'null'
    )
    addRoute(
      'post',
      `${prefix}/rpc/agent/${agentName}/stream`,
      `agentStream:${agentName}`,
      'null',
      'null',
      { sse: true }
    )
    addRoute(
      'post',
      `${prefix}/rpc/agent/${agentName}/approve/:runId`,
      `agentApprove:${agentName}`,
      'null',
      'null',
      { params: ['runId'] }
    )
    addRoute(
      'post',
      `${prefix}/rpc/agent/${agentName}/resume/:runId`,
      `agentResume:${agentName}`,
      'null',
      'null',
      { sse: true, params: ['runId'] }
    )
  }

  // Inject workflow queue workers.
  // Each workflow orchestrator gets its own queue: wf-{name}-orchestrator
  // Each non-inline step function gets its own queue: step-{rpcName}
  for (const [name, wfMeta] of Object.entries(state.workflows.meta)) {
    // Orchestrator queue for this workflow
    const orchQueueName = `wf-orchestrator-${name}`
    const orchFuncId = `pikkuWorkflowOrchestrator:${name}`
    state.queueWorkers.meta[orchQueueName] = {
      pikkuFuncId: orchFuncId,
      name: orchQueueName,
    }
    if (!state.functions.meta[orchFuncId]) {
      state.functions.meta[orchFuncId] = {
        pikkuFuncId: orchFuncId,
        functionType: 'helper',
        sessionless: true,
        name: orchFuncId,
        inputSchemaName: null,
        outputSchemaName: null,
        inputs: [],
        outputs: [],
      }
    }
    if (!state.resolvedIOTypes[orchFuncId]) {
      state.resolvedIOTypes[orchFuncId] = {
        inputType: 'null',
        outputType: 'null',
      }
    }

    // Step worker queues for non-inline steps — collect ALL RPC steps recursively
    if (wfMeta.inline !== true) {
      const rpcs = new Set<string>()
      collectInvokedRPCs(wfMeta.steps, rpcs)
      for (const rpcName of rpcs) {
        const stepQueueName = `wf-step-${rpcName}`
        const stepFuncId = `pikkuWorkflowWorker:${rpcName}`
        if (!state.queueWorkers.meta[stepQueueName]) {
          state.queueWorkers.meta[stepQueueName] = {
            pikkuFuncId: stepFuncId,
            name: stepQueueName,
          }
          if (!state.functions.meta[stepFuncId]) {
            state.functions.meta[stepFuncId] = {
              pikkuFuncId: stepFuncId,
              functionType: 'helper',
              sessionless: true,
              name: stepFuncId,
              inputSchemaName: null,
              outputSchemaName: null,
              inputs: [],
              outputs: [],
            }
          }
          if (!state.resolvedIOTypes[stepFuncId]) {
            state.resolvedIOTypes[stepFuncId] = {
              inputType: 'null',
              outputType: 'null',
            }
          }
        }
      }
    }
  }
}

export function validateSecretOverrides(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  const { wireAddonDeclarations } = state.rpc
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) return

  const secretNames = new Set(state.secrets.definitions.map((d) => d.name))

  for (const [namespace, addonDecl] of wireAddonDeclarations.entries()) {
    if (!addonDecl.secretOverrides) continue

    for (const secretKey of Object.keys(addonDecl.secretOverrides)) {
      if (!secretNames.has(secretKey)) {
        const availableSecrets = Array.from(secretNames)
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Secret override '${secretKey}' in addon '${namespace}' (${addonDecl.package}) does not exist. Available secrets: ${availableSecrets.join(', ') || 'none'}`
        )
      }
    }
  }
}

export function validateCredentialOverrides(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  const { wireAddonDeclarations } = state.rpc
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) return

  const credentialNames = new Set(
    state.credentials?.definitions.map((d) => d.name) ?? []
  )

  for (const [namespace, addonDecl] of wireAddonDeclarations.entries()) {
    if (!addonDecl.credentialOverrides) continue

    for (const credentialKey of Object.keys(addonDecl.credentialOverrides)) {
      if (!credentialNames.has(credentialKey)) {
        const availableCredentials = Array.from(credentialNames)
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Credential override '${credentialKey}' in addon '${namespace}' (${addonDecl.package}) does not exist. Available credentials: ${availableCredentials.join(', ') || 'none'}`
        )
      }
    }
  }
}

export function validateVariableOverrides(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  const { wireAddonDeclarations } = state.rpc
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) return

  const variableNames = new Set(state.variables.definitions.map((d) => d.name))

  for (const [namespace, addonDecl] of wireAddonDeclarations.entries()) {
    if (!addonDecl.variableOverrides) continue

    for (const variableKey of Object.keys(addonDecl.variableOverrides)) {
      if (!variableNames.has(variableKey)) {
        const availableVariables = Array.from(variableNames)
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Variable override '${variableKey}' in addon '${namespace}' (${addonDecl.package}) does not exist. Available variables: ${availableVariables.join(', ') || 'none'}`
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

    if (meta.inputSchemaName && inputType !== 'null') {
      meta.inputSchemaName = inputType
    }
    if (meta.outputSchemaName && outputType !== 'null') {
      meta.outputSchemaName = outputType
    }
    if (meta.inputs) {
      meta.inputs = meta.inputs.map((name) => {
        try {
          return functions.typesMap.getTypeMeta(name).uniqueName
        } catch {
          return name
        }
      })
    }
    if (meta.outputs) {
      meta.outputs = meta.outputs.map((name) => {
        try {
          return functions.typesMap.getTypeMeta(name).uniqueName
        } catch {
          return name
        }
      })
    }
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
      .flatMap(({ inputs, outputs }) => {
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

/**
 * Validates that Zod schemas and wiring side-effects (wireHTTPRoutes,
 * addPermission, addHTTPMiddleware, etc.) do not coexist in the same file.
 *
 * The CLI uses tsImport to extract Zod schemas at runtime, which executes
 * all top-level code in the file. Wiring calls crash during this process
 * because the pikku state metadata doesn't exist in the CLI context.
 */
export function validateSchemaWiringSeparation(
  logger: InspectorLogger,
  state: InspectorState
): void {
  // Collect files that contain schemas
  const schemaFiles = new Set<string>()
  for (const ref of state.schemaLookup.values()) {
    schemaFiles.add(ref.sourceFile)
  }

  // Collect files that contain wiring side-effects
  const wiringFiles = new Set<string>()

  // HTTP route wirings
  for (const file of state.http.files) {
    wiringFiles.add(file)
  }

  // Permission wirings (addPermission calls)
  for (const meta of state.permissions.tagPermissions.values()) {
    wiringFiles.add(meta.sourceFile)
  }
  for (const meta of state.http.routePermissions.values()) {
    wiringFiles.add(meta.sourceFile)
  }

  // Middleware wirings (addHTTPMiddleware calls)
  for (const meta of state.http.routeMiddleware.values()) {
    wiringFiles.add(meta.sourceFile)
  }
  for (const meta of state.middleware.tagMiddleware.values()) {
    wiringFiles.add(meta.sourceFile)
  }

  // Check for overlap
  for (const file of schemaFiles) {
    if (wiringFiles.has(file)) {
      const schemas = Array.from(state.schemaLookup.entries())
        .filter(([, ref]) => ref.sourceFile === file)
        .map(([name]) => name)

      logger.critical(
        ErrorCode.SCHEMA_AND_WIRING_COLOCATED,
        `File '${file}' contains both Zod schemas (${schemas.join(', ')}) and wiring calls (wireHTTPRoutes, addPermission, etc.). ` +
          `These must be in separate files because the CLI imports schema files at runtime, which triggers wiring side-effects that crash without server context. ` +
          `Move the route/wiring definitions to a dedicated wiring file.`
      )
    }
  }
}

export function computeDiagnostics(state: InspectorState): void {
  const diagnostics: InspectorDiagnostic[] = []

  for (const [id, meta] of Object.entries(state.functions.meta)) {
    if (meta.services && !meta.services.optimized) {
      diagnostics.push({
        code: ErrorCode.SERVICES_NOT_DESTRUCTURED,
        message: `Function '${id}' does not destructure its services parameter, preventing tree-shaking optimization.`,
        sourceFile: meta.pikkuFuncId,
        position: 0,
      })
    }
    if (meta.wires && !meta.wires.optimized) {
      diagnostics.push({
        code: ErrorCode.WIRES_NOT_DESTRUCTURED,
        message: `Function '${id}' does not destructure its wires parameter, preventing tree-shaking optimization.`,
        sourceFile: meta.pikkuFuncId,
        position: 0,
      })
    }
  }

  for (const [id, def] of Object.entries(state.middleware.definitions)) {
    if (def.services && !def.services.optimized) {
      diagnostics.push({
        code: ErrorCode.SERVICES_NOT_DESTRUCTURED,
        message: `Middleware '${id}' does not destructure its services parameter, preventing tree-shaking optimization.`,
        sourceFile: def.sourceFile,
        position: def.position,
      })
    }
    if (def.wires && !def.wires.optimized) {
      diagnostics.push({
        code: ErrorCode.WIRES_NOT_DESTRUCTURED,
        message: `Middleware '${id}' does not destructure its wires parameter, preventing tree-shaking optimization.`,
        sourceFile: def.sourceFile,
        position: def.position,
      })
    }
  }

  for (const [id, def] of Object.entries(state.permissions.definitions)) {
    if (def.services && !def.services.optimized) {
      diagnostics.push({
        code: ErrorCode.SERVICES_NOT_DESTRUCTURED,
        message: `Permission '${id}' does not destructure its services parameter, preventing tree-shaking optimization.`,
        sourceFile: def.sourceFile,
        position: def.position,
      })
    }
    if (def.wires && !def.wires.optimized) {
      diagnostics.push({
        code: ErrorCode.WIRES_NOT_DESTRUCTURED,
        message: `Permission '${id}' does not destructure its wires parameter, preventing tree-shaking optimization.`,
        sourceFile: def.sourceFile,
        position: def.position,
      })
    }
  }

  state.diagnostics = diagnostics
}
