import type {
  InspectorState,
  InspectorLogger,
  InspectorOptions,
  MiddlewareGroupMeta,
  InspectorDiagnostic,
} from '../types.js'
import type {
  FunctionServicesMeta,
  MiddlewareMetadata,
  PermissionMetadata,
} from '@pikku/core'
import type ts from 'typescript'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractTypeKeys } from './type-utils.js'
import { ErrorCode } from '../error-codes.js'
import { isSecretBrokerFunction } from './secret-brokers.js'
import { findSecretAliasServices } from './secret-alias-services.js'
import { relative } from 'node:path'
import { AUTH_HANDLER_FUNC_ID } from '../add/add-auth.js'
import { flattenScopeDefinitions } from '@pikku/core/scope'
import type { WorkflowStepMeta } from '@pikku/core/workflow'
import { DYNAMIC_SCENARIO_STEP_TARGET } from './workflow/dsl/patterns.js'

/**
 * Stamp the inspected authorize/callbacks service set onto the generated auth
 * handler's function meta.
 *
 * The CLI generates `export const authHandler = pikkuSessionlessFunc({ func:
 * createAuthHandler(...).func })`. That `func` is an opaque property access, so
 * normal extraction records zero services for the handler — which would leave
 * the deployed auth worker without `kysely`/`variables`/`secrets` and break
 * `authorize` at runtime. `add-auth` already computed the real dependency set
 * (from the pikkuBetterAuth source) into `state.auth.definition.services`; copy it
 * onto the handler meta. Re-derived every inspect and ordered BEFORE
 * `aggregateRequiredServices` so it flows into `requiredServices`.
 */
export function stampAuthHandlerServices(
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  const definition = state.auth.definition
  if (!definition) return
  const handlerMeta = state.functions.meta[AUTH_HANDLER_FUNC_ID]
  if (!handlerMeta) return
  handlerMeta.services = {
    optimized: definition.services.optimized,
    services: [...definition.services.services],
  }
}

/**
 * Helper to extract wire-level middleware/permission names from metadata.
 * Only extracts type:'wire' variants (individual middleware/permissions).
 * Skips type:'http' and type:'tag' (reference groups, not individuals).
 */
export function extractWireNames(
  list?: Array<MiddlewareMetadata | PermissionMetadata>
): string[] {
  if (!list) return []
  return list
    .filter(
      (item): item is { type: 'wire'; name: string } => item.type === 'wire'
    )
    .map((item) => item.name)
}

/**
 * Helper to expand middleware groups into individual names and add their
 * services to the aggregation. Handles tag-based and HTTP-pattern-based
 * middleware groups. Permissions are function-scoped only and carry no groups.
 */
function expandAndAddGroupServices(
  list: MiddlewareMetadata[] | undefined,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>,
  addServices: (services: FunctionServicesMeta | undefined) => void
): void {
  if (!list) return

  for (const item of list) {
    if (item.type === 'tag') {
      const groupMeta = state.middleware.tagMiddleware.get(item.tag)
      if (groupMeta?.services) {
        addServices(groupMeta.services)
      }
    } else if (item.type === 'http' && 'route' in item) {
      const groupMeta = state.http.routeMiddleware.get(item.route)
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

  // 1b. Services the auth factory touches, read from the definition rather than
  // from the generated handler.
  //
  // `stampAuthHandlerServices` copies them onto that handler's meta, but on the
  // first run in a clean checkout the handler's file has not been written yet,
  // so there is nothing to stamp and nothing to aggregate — and the services map
  // comes out claiming `kysely` (or whatever else `authorize` reads) is unused.
  // The second run, with the file on disk, says the opposite. The definition is
  // inspected from hand-written source either way, so taking the answer from
  // there makes a clean build agree with an incremental one.
  if (state.auth?.definition) {
    addServices(state.auth.definition.services)
  }

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
      expandAndAddGroupServices(routeMeta.middleware, state, addServices)
    }
  }

  // Also check other wiring types (channels, queues, schedulers, MCP)
  for (const channelMeta of Object.values(state.channels.meta)) {
    expandAndAddGroupServices(channelMeta.middleware, state, addServices)
  }

  for (const queueMeta of Object.values(state.queueWorkers.meta)) {
    expandAndAddGroupServices(queueMeta.middleware, state, addServices)
  }

  for (const scheduleMeta of Object.values(state.scheduledTasks.meta)) {
    expandAndAddGroupServices(scheduleMeta.middleware, state, addServices)
  }

  for (const toolMeta of Object.values(state.mcpEndpoints.toolsMeta)) {
    expandAndAddGroupServices(toolMeta.middleware, state, addServices)
  }

  for (const promptMeta of Object.values(state.mcpEndpoints.promptsMeta)) {
    expandAndAddGroupServices(promptMeta.middleware, state, addServices)
  }

  for (const resourceMeta of Object.values(state.mcpEndpoints.resourcesMeta)) {
    expandAndAddGroupServices(resourceMeta.middleware, state, addServices)
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

  // 6b. Inject synthetic queue workers for workflow graph steps.
  // Each workflow gets an orchestrator queue and per-step queues.
  // Without these, the PikkuWorkflowService constructor can't find
  // per-workflow queue entries and falls back to shared queue names.
  for (const [, graph] of Object.entries(state.workflows.graphMeta)) {
    if (!graph.nodes || !graph.name) continue
    // A scenario is a workflow, but it only ever runs in-process under
    // `pikku scenario run` — no step of one is dispatched through a queue. The
    // synthetic entries were pure leakage: they put a
    // `wf-orchestrator-<scenario>` worker into the app's queue meta, which every
    // bundle imports and a provider then creates as a real production queue.
    if (graph.source === 'scenario') continue

    const toKebab = (s: string) =>
      s
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase()

    // Orchestrator queue
    const orchQueueName = `wf-orchestrator-${toKebab(graph.name)}`
    if (!state.queueWorkers.meta[orchQueueName]) {
      state.queueWorkers.meta[orchQueueName] = {
        name: orchQueueName,
        pikkuFuncId: `pikkuWorkflowOrchestrator:${graph.name}`,
      }
    }

    // Per-step queues — only for steps explicitly marked workflowQueued: true
    for (const node of Object.values(graph.nodes)) {
      if (!('rpcName' in node) || !node.rpcName) continue
      const rpcName = node.rpcName as string
      const funcId =
        state.rpc?.internalMeta?.[rpcName] ??
        state.rpc?.exposedMeta?.[rpcName] ??
        rpcName
      const funcMeta = (state.functions.meta[funcId] ??
        state.functions.meta[rpcName]) as { workflowQueued?: boolean }
      if (funcMeta?.workflowQueued !== true) continue
      const stepQueueName = `wf-step-${toKebab(rpcName)}`
      if (!state.queueWorkers.meta[stepQueueName]) {
        state.queueWorkers.meta[stepQueueName] = {
          name: stepQueueName,
          pikkuFuncId: `pikkuWorkflowWorker:${rpcName}`,
        }
      }
    }
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

  // 7. Services that consumed addons need from the parent project.
  const addonFnServices = new Map<string, string[] | undefined>()
  for (const [namespace, fns] of Object.entries(state.addonFunctions ?? {})) {
    for (const [id, meta] of Object.entries(fns)) {
      addonFnServices.set(
        `${namespace}:${id}`,
        (meta as { services?: FunctionServicesMeta })?.services?.services
      )
    }
  }
  const parentDeclared = state.addonRequiredParentServices ?? []
  const parentDeclaredSet = new Set(parentDeclared)
  const defaultServices = new Set([
    'config',
    'logger',
    'variables',
    'schema',
    'secrets',
  ])
  let usesAddonFn = false
  let addonFactoryNeeded = false
  for (const funcId of usedFunctions) {
    if (!addonFnServices.has(funcId)) continue
    usesAddonFn = true
    const services = addonFnServices.get(funcId)
    if (!services) {
      addonFactoryNeeded = true
      continue
    }
    for (const service of services) {
      if (parentDeclaredSet.has(service)) {
        requiredServices.add(service)
      } else if (
        !internalServices.has(service) &&
        !defaultServices.has(service)
      ) {
        addonFactoryNeeded = true
      }
    }
  }
  if (usesAddonFn && addonFactoryNeeded) {
    for (const service of parentDeclared) {
      requiredServices.add(service)
    }
  }
}

export function validateSecretOverrides(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  const { wireAddonDeclarations } = state.rpc
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) return

  // secretOverrides key on (and resolve to) SECRET IDs — the string the addon
  // passes to getSecret — so validate against secretId, falling back to name for
  // older meta without a secretId field.
  const secretIds = new Set(
    state.secrets.definitions.map((d: any) => d.secretId ?? d.name)
  )

  for (const [namespace, addonDecl] of wireAddonDeclarations.entries()) {
    if (!addonDecl.secretOverrides) continue

    for (const [logicalName, resolvedName] of Object.entries(
      addonDecl.secretOverrides
    )) {
      if (!secretIds.has(resolvedName)) {
        const availableSecrets = Array.from(secretIds)
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Secret override '${logicalName}' -> '${resolvedName}' in addon '${namespace}' (${addonDecl.package}) targets a secret that does not exist. Available secrets: ${availableSecrets.join(', ') || 'none'}`
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

    for (const [logicalName, resolvedName] of Object.entries(
      addonDecl.credentialOverrides
    )) {
      if (!credentialNames.has(resolvedName)) {
        const availableCredentials = Array.from(credentialNames)
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Credential override '${logicalName}' -> '${resolvedName}' in addon '${namespace}' (${addonDecl.package}) targets a credential that does not exist. Available credentials: ${availableCredentials.join(', ') || 'none'}`
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

  // variableOverrides key on (and resolve to) VARIABLE IDs, so validate against
  // variableId, falling back to name for older meta without a variableId field.
  const variableIds = new Set(
    state.variables.definitions.map((d: any) => d.variableId ?? d.name)
  )

  for (const [namespace, addonDecl] of wireAddonDeclarations.entries()) {
    if (!addonDecl.variableOverrides) continue

    for (const [logicalName, resolvedName] of Object.entries(
      addonDecl.variableOverrides
    )) {
      if (!variableIds.has(resolvedName)) {
        const availableVariables = Array.from(variableIds)
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Variable override '${logicalName}' -> '${resolvedName}' in addon '${namespace}' (${addonDecl.package}) targets a variable that does not exist. Available variables: ${availableVariables.join(', ') || 'none'}`
        )
      }
    }
  }
}

/**
 * A `wireRemoteAddon` package ships types only — its handlers run on the host —
 * so it MUST be a devDependency, not a production dependency (a prod dep would
 * drag in the runtime deps remote consumption exists to avoid). This is the
 * mirror image of `wireAddon`, which requires a production dependency.
 */
export function validateRemoteAddonDependencies(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  const { wireAddonDeclarations } = state.rpc
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) return

  const hasRemote = Array.from(wireAddonDeclarations.values()).some(
    (d) => d.remote
  )
  if (!hasRemote) return

  const pkgJsonPath = join(state.rootDir, 'package.json')
  if (!existsSync(pkgJsonPath)) return // no manifest to check (e.g. some tests)

  let pkgJson: {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  } catch (e: any) {
    logger.warn(
      `Could not read ${pkgJsonPath} to verify remote addon dependencies: ${e?.message ?? e}`
    )
    return
  }

  const prodDeps = pkgJson.dependencies ?? {}
  const devDeps = pkgJson.devDependencies ?? {}

  for (const [namespace, decl] of wireAddonDeclarations.entries()) {
    if (!decl.remote) continue
    if (decl.package in devDeps) continue // correct

    if (decl.package in prodDeps) {
      logger.critical(
        ErrorCode.REMOTE_ADDON_NOT_DEV_DEPENDENCY,
        `Remote addon '${namespace}' ('${decl.package}') is a production dependency, but wireRemoteAddon consumes it for types only — its handlers run on the host. Move '${decl.package}' from "dependencies" to "devDependencies".`
      )
    } else {
      logger.critical(
        ErrorCode.REMOTE_ADDON_NOT_DEV_DEPENDENCY,
        `Remote addon '${namespace}' ('${decl.package}') is wired with wireRemoteAddon but is not in "devDependencies". Add '${decl.package}' to "devDependencies" (types only).`
      )
    }
  }
}

/**
 * The auth a `wireRemoteAddon` consumer binds must reference a slot the consumer
 * actually declares: a `credentialId` must be a wired credential, a `secretId`
 * a wired secret. A custom `resolve()` and a public (omitted) surface are not
 * statically checkable and are left to runtime.
 */
export function validateRemoteAddonAuth(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  const { wireAddonDeclarations } = state.rpc
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) return

  const credentialNames = new Set(
    state.credentials?.definitions.map((d) => d.name) ?? []
  )
  const secretNames = new Set(state.secrets.definitions.map((d) => d.name))

  for (const [namespace, decl] of wireAddonDeclarations.entries()) {
    if (!decl.remote) continue

    if (decl.authCredentialId && !credentialNames.has(decl.authCredentialId)) {
      logger.critical(
        ErrorCode.REMOTE_ADDON_AUTH_UNRESOLVED,
        `Remote addon '${namespace}' binds auth.credentialId '${decl.authCredentialId}', but no such credential is wired. Available credentials: ${Array.from(credentialNames).join(', ') || 'none'}`
      )
    }
    if (decl.authSecretId && !secretNames.has(decl.authSecretId)) {
      logger.critical(
        ErrorCode.REMOTE_ADDON_AUTH_UNRESOLVED,
        `Remote addon '${namespace}' binds auth.secretId '${decl.authSecretId}', but no such secret is wired. Available secrets: ${Array.from(secretNames).join(', ') || 'none'}`
      )
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
      ...(meta.additionalRegistrations && {
        additionalRegistrations: meta.additionalRegistrations,
      }),
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
  state.permissionsGroupsMeta = {
    definitions: state.permissions.definitions,
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
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  for (const [, meta] of Object.entries(state.agents.agentsMeta)) {
    const model = meta.model
    if (!model) {
      logger.critical(
        ErrorCode.MISSING_MODEL,
        `AI agent '${meta.name}' is missing the 'model' property.`
      )
      continue
    }
    if (!model.includes('/')) {
      logger.critical(
        ErrorCode.INVALID_MODEL,
        `AI agent '${meta.name}' uses model '${model}', which must be provider-qualified as '<provider>/<model>' (e.g. 'openai/gpt-4').`
      )
    }
  }
}

/**
 * Scenarios are pure stories of remote RPCs (same rule as client-side CLI
 * renderers): the func may only destructure logger/config — everything else
 * must go through actor steps so the flow runs against the TARGET
 * environment, never local services.
 *
 * This runs in post-processing rather than in `addWorkflow` because
 * `addWorkflow` runs in the `visitSetup` pass, which completes before
 * `addFunctions` (`visitFunctions`) has populated `state.functions.meta` — so
 * the check read `undefined` there and never fired.
 */
export function validateScenarioServices(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  for (const [workflowName, meta] of Object.entries(state.workflows.meta)) {
    if (!meta.scenario) continue
    const funcMeta = state.functions.meta[meta.pikkuFuncId]
    if (!funcMeta?.services) continue
    const disallowed = funcMeta.services.services.filter(
      (svc) => svc !== 'logger' && svc !== 'config'
    )
    if (disallowed.length > 0) {
      logger.critical(
        ErrorCode.SCENARIO_HAS_SERVICES,
        `Scenario '${workflowName}' destructures services: ${disallowed.join(', ')}. ` +
          `Scenarios may only use 'logger'/'config' — drive everything else through ` +
          `actor steps (workflow.do(step, rpc, data, { actor: actors.x })) so the flow ` +
          `runs against the target environment.`
      )
    }
  }
}

/**
 * Walk every scenario step, wherever it is nested, and validate the two things
 * that can only be known once both the workflow meta and the function meta
 * exist:
 *
 * - the step target must be a static string literal (PKU678) — otherwise it
 *   can't be bundled, typed or drawn;
 * - a step declaring a `browser` binding must be given an actor (PKU677), since
 *   the browser context signs in as that persona. It is checked statically even
 *   though the binding only runs on a browser run: a step that can never be
 *   driven by a human is a latent failure, not a passing default run.
 * - a scenario written as a step ladder must assert something (PKU680).
 *
 * It also marks the step's function as used, so `scenario run` boots the
 * singletons the step actually needs.
 */
export function validateScenarioSteps(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  const phasesSeen = new Set<string>()

  const visit = (workflowName: string, steps: WorkflowStepMeta[]): void => {
    for (const step of steps) {
      if (step.type === 'scenarioStep') {
        phasesSeen.add(step.phase)
        if (step.stepFunc === DYNAMIC_SCENARIO_STEP_TARGET) {
          logger.critical(
            ErrorCode.SCENARIO_STEP_TARGET_NOT_STATIC,
            `Scenario '${workflowName}' calls step '${step.stepName}' with a target that isn't a string literal. ` +
              `A step target must be statically resolvable so it can be bundled, typed and drawn — ` +
              `loop over data sets instead of computing the step name.`
          )
          continue
        }
        state.serviceAggregation.usedFunctions.add(step.stepFunc)
        const stepMeta = state.functions.meta[step.stepFunc]
        if (
          stepMeta?.scenarioStepSurfaces?.includes('browser') &&
          !step.actor
        ) {
          logger.critical(
            ErrorCode.SCENARIO_BROWSER_STEP_NEEDS_ACTOR,
            `Scenario '${workflowName}' calls step '${step.stepFunc}', which declares a browser binding, without an actor. ` +
              `Pass { actor: actors.<name> } so the browser context signs in as that persona.`
          )
        }
        continue
      }
      if (step.type === 'branch') {
        for (const branch of step.branches) visit(workflowName, branch.steps)
        if (step.elseSteps) visit(workflowName, step.elseSteps)
      } else if (step.type === 'switch') {
        for (const c of step.cases ?? []) {
          if (c.steps) visit(workflowName, c.steps)
        }
        if (step.defaultSteps) visit(workflowName, step.defaultSteps)
      } else if (step.type === 'fanout' && step.body) {
        visit(workflowName, step.body as WorkflowStepMeta[])
      } else if (step.type === 'parallel' && step.children) {
        visit(workflowName, step.children as WorkflowStepMeta[])
      }
    }
  }

  for (const [workflowName, meta] of Object.entries(state.workflows.meta)) {
    phasesSeen.clear()
    visit(workflowName, meta.steps ?? [])
    // A scenario written as a step ladder but with no `then` proves only that
    // nothing threw. It is also invisible to witness coverage — it contributes
    // 0/0, so it can never lower the number — which makes an assertion-free
    // flow the cheapest way to make a suite look better covered than it is.
    if (phasesSeen.size > 0 && !phasesSeen.has('then')) {
      logger.critical(
        ErrorCode.SCENARIO_HAS_NO_ASSERTION,
        `Scenario '${workflowName}' has ${[...phasesSeen].join('/')} steps but never asserts. ` +
          `Add a scenario.then(...) naming what the actor should now see — a flow with no 'then' ` +
          `only proves nothing threw, and contributes nothing to witness coverage.`
      )
    }
  }
}

/**
 * A `pikkuWorkflowGraph` node that references the `graph:` namespace (e.g.
 * `graph:editFields`) needs @pikku/addon-graph wired — otherwise the RPC never
 * registers and codegen fails deep in type-checking with an opaque error. Fail
 * early with an actionable message pointing at `scaffold: { graph: true }`.
 */
export function validateWorkflowGraphAddons(
  logger: InspectorLogger,
  state: InspectorState
): void {
  const addonGraphWired = Array.from(
    state.rpc.wireAddonDeclarations.values()
  ).some((decl) => decl.package === '@pikku/addon-graph')
  if (addonGraphWired) {
    return
  }

  for (const [name, graph] of Object.entries(state.workflows.graphMeta)) {
    for (const node of Object.values(graph.nodes)) {
      if (!('rpcName' in node) || typeof node.rpcName !== 'string') {
        continue
      }
      if (!node.rpcName.startsWith('graph:')) {
        continue
      }
      if (state.functions.meta[node.rpcName]) {
        continue
      }
      logger.critical(
        ErrorCode.WORKFLOW_GRAPH_ADDON_NOT_WIRED,
        `Workflow graph '${name}' references '${node.rpcName}' but @pikku/addon-graph is not wired. ` +
          `Enable "scaffold": { "graph": true } in pikku.config.json (and install @pikku/addon-graph), ` +
          `or wire it manually with wireAddon({ name: 'graph', package: '@pikku/addon-graph' }).`
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

  // Middleware wirings (addHTTPMiddleware calls). A group can be registered
  // from more than one file, and every one of them is a wiring file.
  const addGroupFiles = (groups: Map<string, MiddlewareGroupMeta>) => {
    for (const meta of groups.values()) {
      wiringFiles.add(meta.sourceFile)
      for (const registration of meta.additionalRegistrations ?? []) {
        wiringFiles.add(registration.sourceFile)
      }
    }
  }
  addGroupFiles(state.http.routeMiddleware)
  addGroupFiles(state.middleware.tagMiddleware)

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

/** Marks the functions that keep the full `SecretService`. */
export function computeSecretBrokers(state: InspectorState): void {
  for (const [id, meta] of Object.entries(state.functions.meta)) {
    if (isSecretBrokerFunction(meta.pikkuFuncId ?? id)) {
      meta.secretBroker = true
    }
  }
}

/**
 * Refuses a singleton service that is a `SecretService` under another name.
 *
 * `secrets` is omitted from every function-facing services type, but
 * `pikkuServices(async ({ secrets }) => ({ cfg: secrets }))` re-exposes it under
 * a name the omit does not cover. A name-based rule misses this; the type does
 * not.
 */
export function validateNoSecretAliasServices(
  logger: InspectorLogger,
  checker: ts.TypeChecker,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  if (!('typesLookup' in state)) {
    return
  }
  const singletonServicesTypes = state.typesLookup.get('SingletonServices')
  if (!singletonServicesTypes?.length) {
    return
  }
  const aliases = findSecretAliasServices(singletonServicesTypes[0]!, checker)
  if (aliases.length === 0) {
    return
  }

  const report = (kind: string, id: string, services: string[]) => {
    const used = services.filter((service) => aliases.includes(service))
    if (used.length === 0) {
      return
    }
    logger.critical(
      ErrorCode.SECRET_SERVICE_ALIASED,
      `${kind} '${id}' receives ${used.map((s) => `'${s}'`).join(', ')}, which ${used.length === 1 ? 'is' : 'are'} a SecretService under another name. ` +
        `SecretService is confined to pikkuServices, pikkuWireServices, addon service factories and middleware — give a service the secret value when you construct it and expose only what the function needs.`
    )
  }

  for (const [id, meta] of Object.entries(state.functions.meta)) {
    if (meta.secretBroker) {
      continue
    }
    report('Function', id, meta.services?.services ?? [])
  }
  for (const [id, def] of Object.entries(state.permissions.definitions)) {
    report('Permission', id, def.services?.services ?? [])
  }
}

/**
 * Reports secret reads the catalogue does not account for.
 *
 * `getSecret('X')` with no matching `wireSecret` is a value that will be missing
 * at first request rather than at deploy; a non-literal key is a read the
 * manifest cannot cover, so a per-unit scope cannot be narrowed around it.
 */
export function validateSecretUsage(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  const declared = new Set(state.secrets.definitions.map((d) => d.secretId))
  for (const definition of state.secrets.definitions) {
    if (definition.oauth2?.tokenSecretId) {
      declared.add(definition.oauth2.tokenSecretId)
    }
  }

  for (const [file, usage] of state.secrets.usage) {
    const relativeFile = relative(state.rootDir, file)
    const undeclared = usage.keys.filter((key) => !declared.has(key))
    if (undeclared.length > 0) {
      logger.diagnostic({
        severity: 'warn',
        code: ErrorCode.SECRET_NOT_DECLARED,
        message: `${relativeFile} reads ${undeclared.map((k) => `'${k}'`).join(', ')}, which no wireSecret declares. Declare it so it is validated at deploy time and shown to whoever has to provision it.`,
      })
    }
    if (usage.dynamic.length > 0) {
      logger.diagnostic({
        severity: 'warn',
        code: ErrorCode.SECRET_KEY_NOT_STATIC,
        message: `${relativeFile} reads a secret with a non-literal key (${usage.dynamic.join(', ')}). The deployment cannot narrow its secret scope around a key it cannot see.`,
      })
    }
  }
}

export function computeDiagnostics(state: InspectorState): void {
  const diagnostics: InspectorDiagnostic[] = []

  for (const [id, meta] of Object.entries(state.functions.meta)) {
    // Skip framework-synthesized functions: generated wrappers (auth.gen.ts's
    // opaque authHandler, the cli channel's raw dispatcher) and synthetic route
    // bridges that reference addon functions (id `http:<method>:<route>`, no
    // source file). The user can't edit any of these, so a destructure lint
    // meant to nudge them about their own code must not fail the build over them.
    if (!meta.sourceFile || meta.sourceFile.endsWith('.gen.ts')) {
      continue
    }
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
    if (state.functions.dynamicImportIds.has(id)) {
      diagnostics.push({
        code: ErrorCode.FUNCTION_DYNAMIC_IMPORT,
        message: `Function '${id}' performs a runtime dynamic 'import(...)' in its body. Move the import to the top of the module (static import) or into your services/wireServices setup — function bodies run on every invocation, so a dynamic import there adds latency and defeats bundling/tree-shaking.`,
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

/**
 * Validates that every scope referenced by a function is declared via
 * `defineScope`. Runs after all visitors, so declaration order does not matter.
 *
 * A `*` suffix is a wildcard requirement: `admin:*` requires the `admin` scope
 * to be declared, and grants its whole subtree.
 */
export function validateScopeReferences(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  const declared = new Set(
    flattenScopeDefinitions(state.scopes.definitions).map((s) => s.id)
  )

  for (const [funcName, meta] of Object.entries(state.functions.meta)) {
    if (!meta.scopes?.length) continue

    for (const scope of meta.scopes) {
      // A trailing wildcard grants a subtree; the node it hangs off must exist.
      const declaredForm = scope.endsWith(':*') ? scope.slice(0, -2) : scope

      if (scope === '*') {
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Function '${funcName}' requires the bare wildcard scope '*'. A function must require a specific scope — '*' is only meaningful as a grant.`
        )
        continue
      }

      if (!declared.has(declaredForm)) {
        const available = Array.from(declared)
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Function '${funcName}' requires scope '${scope}' which is not declared. Declare it with defineScope. Available scopes: ${available.join(', ') || 'none'}`
        )
      }
    }
  }
}

/**
 * Resolves every `tools:` entry on every agent and reports the ones that do not
 * land on a real function, or that land on one with nothing to tell the model.
 *
 * `ref('todos:listTodos')` is a bare string to the inspector — `ref` is not
 * resolved, only unwrapped — so until now a reference to a function that never
 * existed generated cleanly and failed at agent-run time. Addon namespaces come
 * from `wireAddon`, and each addon's generated metadata is read off disk, which
 * is the only view of it this project has.
 *
 * The description check is separate and opt-in (`--strict-meta`), because the
 * description is what the model is told the tool does: without one, the tool is
 * offered to it under its own name (`ai-agent-prepare.ts`), which is a silent
 * quality loss rather than a failure. A title deliberately does not satisfy it —
 * a title labels a tool in a UI, it does not tell a model when to reach for it.
 */
export function validateAgentToolReferences(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>,
  options: InspectorOptions = {}
): void {
  const agents = Object.entries(state.agents.agentsMeta)
  if (agents.length === 0) return

  const { wireAddonDeclarations } = state.rpc

  for (const [agentKey, agent] of agents) {
    const where = agent.sourceFile ? ` (${agent.sourceFile})` : ''

    for (const tool of agent.tools ?? []) {
      // A workflow reference is resolved against the workflow map, not here.
      if (tool.startsWith('workflow:')) continue

      const separator = tool.indexOf(':')
      let meta: { description?: string; title?: string } | undefined

      if (separator === -1) {
        const funcId = state.rpc.internalMeta[tool] ?? tool
        meta = state.functions.meta[funcId]
        if (!meta) {
          logger.critical(
            ErrorCode.AGENT_TOOL_NOT_FOUND,
            `AI agent '${agentKey}'${where} references tool '${tool}', which is not a function in this project.`
          )
          continue
        }
      } else {
        const namespace = tool.slice(0, separator)
        const funcName = tool.slice(separator + 1)
        const addon = wireAddonDeclarations?.get(namespace)
        if (!addon) {
          const known = Array.from(wireAddonDeclarations?.keys() ?? [])
          logger.critical(
            ErrorCode.AGENT_TOOL_UNKNOWN_NAMESPACE,
            `AI agent '${agentKey}'${where} references tool '${tool}', but no addon is wired under the namespace '${namespace}'. ` +
              `Wired namespaces: ${known.join(', ') || 'none'}.`
          )
          continue
        }

        // An addon that has not been built yet contributed no metadata, which
        // is not the same as one whose function is missing.
        const addonMeta = state.addonFunctions[namespace]
        if (!addonMeta) continue

        meta = addonMeta[funcName]
        if (!meta) {
          logger.critical(
            ErrorCode.AGENT_TOOL_NOT_FOUND,
            `AI agent '${agentKey}'${where} references tool '${tool}', but addon '${namespace}' ('${addon.package}') exposes no function '${funcName}'.`
          )
          continue
        }
      }

      if (options.strictMeta && !meta.description) {
        logger.critical(
          ErrorCode.AGENT_TOOL_MISSING_DESCRIPTION,
          `AI agent '${agentKey}'${where} uses tool '${tool}', which has no description. ` +
            `An agent tool's description is what the model is told it does; without one it is offered the tool under its own name. ` +
            `Add a 'description' to '${tool}'${meta.title ? " (a 'title' does not count — it labels the tool, it does not explain it)" : ''}.`
        )
      }
    }
  }
}

/**
 * Validates that every scope granted by a system role is declared via
 * `defineScope`. Runs after all visitors, so declaration order does not matter.
 *
 * The same rule functions get, for a sharper reason: a role granting an
 * undeclared scope is not merely useless, it is *invisibly* useless. No
 * function checks the scope, so the role appears to work — every call a
 * persona holding it makes succeeds or fails for unrelated reasons, and the
 * authorization boundary it was written to describe is never exercised.
 *
 * A `*` suffix grants a subtree; the node it hangs off must exist.
 */
export function validateSystemRoleScopes(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  if (!state.systemRoles.definitions.length) {
    return
  }

  const declared = new Set(
    flattenScopeDefinitions(state.scopes.definitions).map((s) => s.id)
  )

  for (const role of state.systemRoles.definitions) {
    for (const scope of role.scopes) {
      if (scope === '*') {
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `System role '${role.name}' grants the bare wildcard scope '*'. Grant the roots it should cover instead — '*' hides what the role actually confers.`
        )
        continue
      }

      const declaredForm = scope.endsWith(':*') ? scope.slice(0, -2) : scope
      if (!declared.has(declaredForm)) {
        const available = Array.from(declared)
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `System role '${role.name}' grants scope '${scope}' which is not declared. Declare it with defineScope. Available scopes: ${available.join(', ') || 'none'}`
        )
      }
    }
  }
}

/**
 * Validates that every role a persona names is declared with
 * `defineSystemRole`. Runs after all visitors, so declaration order does not
 * matter.
 *
 * Custom roles are refused rather than tolerated. A role composed in the
 * console does not exist at build time and can be deleted after it, so a
 * persona pinned to one silently stops testing what it claims to — and the
 * symptom is a scatter of 403s that read like authorization findings rather
 * than like a deleted role.
 */
export function validatePersonaRoles(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  if (!state.personas.definitions.length) {
    return
  }

  const declared = new Set(state.systemRoles.definitions.map((r) => r.name))

  for (const persona of state.personas.definitions) {
    for (const role of persona.roles) {
      if (!declared.has(role)) {
        const available = Array.from(declared).sort()
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Persona '${persona.id}' holds role '${role}', which is not declared with defineSystemRole. ` +
            `A persona may only name a system role — a role composed in the console can be deleted, and the persona would go on claiming to test it. ` +
            `Declared roles: ${available.join(', ') || 'none'}`
        )
      }
    }
  }
}
