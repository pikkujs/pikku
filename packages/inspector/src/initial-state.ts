import { TypesMap } from './types-map.js'
import type { InspectorState } from './types.js'

/**
 * Creates an initial/empty inspector state with all required properties initialized
 * @param rootDir - The root directory for the project
 * @returns A fresh InspectorState with empty collections
 */
export function getInitialInspectorState(rootDir: string): InspectorState {
  return {
    rootDir,
    singletonServicesTypeImportMap: new Map(),
    wireServicesTypeImportMap: new Map(),
    userSessionTypeImportMap: new Map(),
    configTypeImportMap: new Map(),
    singletonServicesFactories: new Map(),
    wireServicesFactories: new Map(),
    wireServicesMeta: new Map(),
    addonRequiredParentServices: [],
    addonCreatedServices: [],
    addonServicesFactorySeen: false,
    addonServerlessIncompatible: new Map(),
    configFactories: new Map(),
    serverLifecycleFactories: new Map(),
    filesAndMethods: {},
    filesAndMethodsErrors: new Map(),
    typesLookup: new Map(),
    schemaLookup: new Map(),
    schemas: {},
    functions: {
      typesMap: new TypesMap(),
      meta: {},
      files: new Map(),
      approvalDescriptions: {},
      dynamicImportIds: new Set(),
    },
    http: {
      metaInputTypes: new Map(),
      meta: {
        get: {},
        post: {},
        put: {},
        delete: {},
        head: {},
        patch: {},
        options: {},
      },
      files: new Set(),
      routeMiddleware: new Map(),
    },
    channels: {
      files: new Set(),
      meta: {},
    },
    gateways: {
      meta: {},
      files: new Set(),
    },
    triggers: {
      meta: {},
      sourceMeta: {},
      webhookSourceMeta: {},
      files: new Set(),
    },
    scheduledTasks: {
      meta: {},
      files: new Set(),
    },
    queueWorkers: {
      meta: {},
      files: new Set(),
    },
    workflows: {
      meta: {},
      files: new Map(),
      graphMeta: {},
      graphFiles: new Map(),
      featureFiles: new Map(),
      invokedWorkflows: new Set(),
    },
    rpc: {
      internalMeta: {},
      internalFiles: new Map(),
      exposedMeta: {},
      exposedFiles: new Map(),
      remoteMeta: {},
      remoteFiles: new Map(),
      invokedFunctions: new Set(),
      invokedFunctionsByFile: new Map(),
      usedAddons: new Set(),
      wireAddonDeclarations: new Map(),
      wireAddonFiles: new Set(),
    },
    mcpEndpoints: {
      resourcesMeta: {},
      toolsMeta: {},
      promptsMeta: {},
      files: new Set(),
      surfaces: {},
    },
    agents: {
      agentsMeta: {},
      files: new Map(),
      invokedAgentsByFile: new Map(),
    },
    scorers: {
      scorersMeta: {},
      files: new Map(),
    },
    cli: {
      meta: {
        programs: {},
        renderers: {},
      },
      files: new Set(),
    },
    nodes: {
      meta: {},
      files: new Set(),
    },
    auth: {
      providers: [],
      plugins: [],
      files: new Set(),
      definition: null,
    },
    secrets: {
      definitions: [],
      files: new Set(),
      usage: new Map(),
    },
    surfaceUsage: {},
    credentials: {
      definitions: [],
      files: new Set(),
    },
    scopes: {
      definitions: [],
      files: new Set(),
    },
    systemRoles: {
      definitions: [],
      files: new Set(),
    },
    featureFlags: {
      definitions: [],
      files: new Set(),
    },
    virtualUsers: {
      definitions: [],
      files: new Set(),
    },
    variables: {
      definitions: [],
      files: new Set(),
    },
    manifest: {
      initial: null,
      current: null,
      errors: [],
    },
    middleware: {
      definitions: {},
      instances: {},
      tagMiddleware: new Map(),
      globalFiles: new Set(),
    },
    channelMiddleware: {
      definitions: {},
      instances: {},
      tagMiddleware: new Map(),
    },
    agentMiddleware: {
      definitions: {},
    },
    permissions: {
      definitions: {},
      instances: {},
    },
    serviceAggregation: {
      requiredServices: new Set(),
      usedFunctions: new Set(),
      usedMiddleware: new Set(),
      usedPermissions: new Set(),
      allSingletonServices: [],
      allWireServices: [],
    },
    resolvedIOTypes: {},
    middlewareGroupsMeta: {
      definitions: {},
      instances: {},
      httpGroups: {},
      tagGroups: {},
      channelMiddleware: {
        definitions: {},
        instances: {},
        tagGroups: {},
      },
    },
    permissionsGroupsMeta: {
      definitions: {},
    },
    requiredSchemas: new Set(),
    openAPISpec: null,
    diagnostics: [],
    addonFunctions: {},
    exportedContracts: {
      http: {},
      cli: {},
      channel: {},
      addonHttp: {},
      addonCli: {},
      addonChannel: {},
    },
    program: null,
  }
}
