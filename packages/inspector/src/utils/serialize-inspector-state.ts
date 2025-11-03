import { InspectorState } from '../types.js'
import { TypesMap } from '../types-map.js'

/**
 * Serializable version of InspectorState that can be saved to JSON
 * Omits typesLookup (contains non-serializable ts.Type objects) and converts Maps/Sets to arrays
 */
export interface SerializableInspectorState {
  rootDir: string
  singletonServicesTypeImportMap: Array<
    [
      string,
      { variable: string; type: string | null; typePath: string | null }[],
    ]
  >
  sessionServicesTypeImportMap: Array<
    [
      string,
      { variable: string; type: string | null; typePath: string | null }[],
    ]
  >
  userSessionTypeImportMap: Array<
    [
      string,
      { variable: string; type: string | null; typePath: string | null }[],
    ]
  >
  configTypeImportMap: Array<
    [
      string,
      { variable: string; type: string | null; typePath: string | null }[],
    ]
  >
  singletonServicesFactories: Array<
    [
      string,
      { variable: string; type: string | null; typePath: string | null }[],
    ]
  >
  sessionServicesFactories: Array<
    [
      string,
      { variable: string; type: string | null; typePath: string | null }[],
    ]
  >
  sessionServicesMeta: Array<[string, string[]]>
  configFactories: Array<
    [
      string,
      { variable: string; type: string | null; typePath: string | null }[],
    ]
  >
  filesAndMethods: InspectorState['filesAndMethods']
  filesAndMethodsErrors: Array<
    [
      string,
      Array<
        [
          string,
          { variable: string; type: string | null; typePath: string | null }[],
        ]
      >,
    ]
  >
  functions: {
    typesMap: {
      map: Array<[string, { originalName: string; path: string | null }]>
      customTypes: Array<[string, { type: string; references: string[] }]>
    }
    meta: InspectorState['functions']['meta']
    files: Array<[string, { path: string; exportedName: string }]>
  }
  http: {
    metaInputTypes: Array<
      [
        string,
        {
          query: string[] | undefined
          params: string[] | undefined
          body: string[] | undefined
        },
      ]
    >
    meta: InspectorState['http']['meta']
    files: string[]
    routeMiddleware: Array<
      [
        string,
        InspectorState['http']['routeMiddleware'] extends Map<string, infer V>
          ? V
          : never,
      ]
    >
    routePermissions: Array<
      [
        string,
        InspectorState['http']['routePermissions'] extends Map<string, infer V>
          ? V
          : never,
      ]
    >
  }
  channels: {
    files: string[]
    meta: InspectorState['channels']['meta']
  }
  scheduledTasks: {
    meta: InspectorState['scheduledTasks']['meta']
    files: string[]
  }
  queueWorkers: {
    meta: InspectorState['queueWorkers']['meta']
    files: string[]
  }
  workflows: {
    meta: InspectorState['workflows']['meta']
    files: string[]
  }
  rpc: {
    internalMeta: InspectorState['rpc']['internalMeta']
    internalFiles: Array<[string, { path: string; exportedName: string }]>
    exposedMeta: InspectorState['rpc']['exposedMeta']
    exposedFiles: Array<[string, { path: string; exportedName: string }]>
    invokedFunctions: string[]
  }
  mcpEndpoints: {
    resourcesMeta: InspectorState['mcpEndpoints']['resourcesMeta']
    toolsMeta: InspectorState['mcpEndpoints']['toolsMeta']
    promptsMeta: InspectorState['mcpEndpoints']['promptsMeta']
    files: string[]
  }
  cli: {
    meta: InspectorState['cli']['meta']
    files: string[]
  }
  middleware: {
    meta: InspectorState['middleware']['meta']
    tagMiddleware: Array<
      [
        string,
        InspectorState['middleware']['tagMiddleware'] extends Map<
          string,
          infer V
        >
          ? V
          : never,
      ]
    >
  }
  permissions: {
    meta: InspectorState['permissions']['meta']
    tagPermissions: Array<
      [
        string,
        InspectorState['permissions']['tagPermissions'] extends Map<
          string,
          infer V
        >
          ? V
          : never,
      ]
    >
  }
  serviceAggregation: {
    requiredServices: string[]
    usedFunctions: string[]
    usedMiddleware: string[]
    usedPermissions: string[]
    allSingletonServices: string[]
    allSessionServices: string[]
  }
}

/**
 * Serializes InspectorState to a JSON-compatible format
 * Omits typesLookup (not needed for filtering/generation) and converts Maps/Sets to arrays
 */
export function serializeInspectorState(
  state: InspectorState
): SerializableInspectorState {
  // Helper to serialize TypesMap
  const serializeTypesMap = (
    typesMap: TypesMap
  ): {
    map: Array<[string, { originalName: string; path: string | null }]>
    customTypes: Array<[string, { type: string; references: string[] }]>
  } => {
    // Access private map via type assertion
    const mapEntries: Array<
      [string, { originalName: string; path: string | null }]
    > = Array.from((typesMap as any).map.entries())
    const customTypesEntries: Array<
      [string, { type: string; references: string[] }]
    > = Array.from(typesMap.customTypes.entries())

    return {
      map: mapEntries,
      customTypes: customTypesEntries,
    }
  }

  return {
    rootDir: state.rootDir,
    singletonServicesTypeImportMap: Array.from(
      state.singletonServicesTypeImportMap.entries()
    ),
    sessionServicesTypeImportMap: Array.from(
      state.sessionServicesTypeImportMap.entries()
    ),
    userSessionTypeImportMap: Array.from(
      state.userSessionTypeImportMap.entries()
    ),
    configTypeImportMap: Array.from(state.configTypeImportMap.entries()),
    singletonServicesFactories: Array.from(
      state.singletonServicesFactories.entries()
    ),
    sessionServicesFactories: Array.from(
      state.sessionServicesFactories.entries()
    ),
    sessionServicesMeta: Array.from(state.sessionServicesMeta.entries()),
    configFactories: Array.from(state.configFactories.entries()),
    filesAndMethods: state.filesAndMethods,
    filesAndMethodsErrors: Array.from(
      state.filesAndMethodsErrors.entries()
    ).map(([key, mapValue]) => [key, Array.from(mapValue.entries())] as const),
    functions: {
      typesMap: serializeTypesMap(state.functions.typesMap),
      meta: state.functions.meta,
      files: Array.from(state.functions.files.entries()),
    },
    http: {
      metaInputTypes: Array.from(state.http.metaInputTypes.entries()),
      meta: state.http.meta,
      files: Array.from(state.http.files),
      routeMiddleware: Array.from(state.http.routeMiddleware.entries()),
      routePermissions: Array.from(state.http.routePermissions.entries()),
    },
    channels: {
      files: Array.from(state.channels.files),
      meta: state.channels.meta,
    },
    scheduledTasks: {
      meta: state.scheduledTasks.meta,
      files: Array.from(state.scheduledTasks.files),
    },
    queueWorkers: {
      meta: state.queueWorkers.meta,
      files: Array.from(state.queueWorkers.files),
    },
    workflows: {
      meta: state.workflows.meta,
      files: Array.from(state.workflows.files),
    },
    rpc: {
      internalMeta: state.rpc.internalMeta,
      internalFiles: Array.from(state.rpc.internalFiles.entries()),
      exposedMeta: state.rpc.exposedMeta,
      exposedFiles: Array.from(state.rpc.exposedFiles.entries()),
      invokedFunctions: Array.from(state.rpc.invokedFunctions),
    },
    mcpEndpoints: {
      resourcesMeta: state.mcpEndpoints.resourcesMeta,
      toolsMeta: state.mcpEndpoints.toolsMeta,
      promptsMeta: state.mcpEndpoints.promptsMeta,
      files: Array.from(state.mcpEndpoints.files),
    },
    cli: {
      meta: state.cli.meta,
      files: Array.from(state.cli.files),
    },
    middleware: {
      meta: state.middleware.meta,
      tagMiddleware: Array.from(state.middleware.tagMiddleware.entries()),
    },
    permissions: {
      meta: state.permissions.meta,
      tagPermissions: Array.from(state.permissions.tagPermissions.entries()),
    },
    serviceAggregation: {
      requiredServices: Array.from(state.serviceAggregation.requiredServices),
      usedFunctions: Array.from(state.serviceAggregation.usedFunctions),
      usedMiddleware: Array.from(state.serviceAggregation.usedMiddleware),
      usedPermissions: Array.from(state.serviceAggregation.usedPermissions),
      allSingletonServices: state.serviceAggregation.allSingletonServices,
      allSessionServices: state.serviceAggregation.allSessionServices,
    },
  }
}

/**
 * Deserializes JSON data back to InspectorState
 * Creates a partial state suitable for filtering/generation (without typesLookup)
 */
export function deserializeInspectorState(
  data: SerializableInspectorState
): Omit<InspectorState, 'typesLookup'> {
  // Helper to deserialize TypesMap
  const deserializeTypesMap = (
    serialized: SerializableInspectorState['functions']['typesMap']
  ): TypesMap => {
    const typesMap = new TypesMap()

    // Restore private map
    ;(typesMap as any).map = new Map(serialized.map)

    // Restore public customTypes
    typesMap.customTypes = new Map(serialized.customTypes)

    return typesMap
  }

  return {
    rootDir: data.rootDir,
    singletonServicesTypeImportMap: new Map(
      data.singletonServicesTypeImportMap
    ),
    sessionServicesTypeImportMap: new Map(data.sessionServicesTypeImportMap),
    userSessionTypeImportMap: new Map(data.userSessionTypeImportMap),
    configTypeImportMap: new Map(data.configTypeImportMap),
    singletonServicesFactories: new Map(data.singletonServicesFactories),
    sessionServicesFactories: new Map(data.sessionServicesFactories),
    sessionServicesMeta: new Map(data.sessionServicesMeta),
    configFactories: new Map(data.configFactories),
    filesAndMethods: data.filesAndMethods,
    filesAndMethodsErrors: new Map(
      data.filesAndMethodsErrors.map(([key, entries]) => [
        key,
        new Map(entries),
      ])
    ),
    functions: {
      typesMap: deserializeTypesMap(data.functions.typesMap),
      meta: data.functions.meta,
      files: new Map(data.functions.files),
    },
    http: {
      metaInputTypes: new Map(data.http.metaInputTypes),
      meta: data.http.meta,
      files: new Set(data.http.files),
      routeMiddleware: new Map(data.http.routeMiddleware),
      routePermissions: new Map(data.http.routePermissions),
    },
    channels: {
      files: new Set(data.channels.files),
      meta: data.channels.meta,
    },
    scheduledTasks: {
      meta: data.scheduledTasks.meta,
      files: new Set(data.scheduledTasks.files),
    },
    queueWorkers: {
      meta: data.queueWorkers.meta,
      files: new Set(data.queueWorkers.files),
    },
    workflows: {
      meta: data.workflows.meta,
      files: new Set(data.workflows.files),
    },
    rpc: {
      internalMeta: data.rpc.internalMeta,
      internalFiles: new Map(data.rpc.internalFiles),
      exposedMeta: data.rpc.exposedMeta,
      exposedFiles: new Map(data.rpc.exposedFiles),
      invokedFunctions: new Set(data.rpc.invokedFunctions),
    },
    mcpEndpoints: {
      resourcesMeta: data.mcpEndpoints.resourcesMeta,
      toolsMeta: data.mcpEndpoints.toolsMeta,
      promptsMeta: data.mcpEndpoints.promptsMeta,
      files: new Set(data.mcpEndpoints.files),
    },
    cli: {
      meta: data.cli.meta,
      files: new Set(data.cli.files),
    },
    middleware: {
      meta: data.middleware.meta,
      tagMiddleware: new Map(data.middleware.tagMiddleware),
    },
    permissions: {
      meta: data.permissions.meta,
      tagPermissions: new Map(data.permissions.tagPermissions),
    },
    serviceAggregation: {
      requiredServices: new Set(data.serviceAggregation.requiredServices),
      usedFunctions: new Set(data.serviceAggregation.usedFunctions),
      usedMiddleware: new Set(data.serviceAggregation.usedMiddleware),
      usedPermissions: new Set(data.serviceAggregation.usedPermissions),
      allSingletonServices: data.serviceAggregation.allSingletonServices,
      allSessionServices: data.serviceAggregation.allSessionServices,
    },
  }
}
