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
  wireServicesTypeImportMap: Array<
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
  wireServicesFactories: Array<
    [
      string,
      { variable: string; type: string | null; typePath: string | null }[],
    ]
  >
  wireServicesMeta: Array<[string, string[]]>
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
  schemaLookup: Array<
    [
      string,
      {
        variableName: string
        sourceFile: string
        vendor?: 'zod' | 'valibot' | 'arktype' | 'effect' | 'unknown'
      },
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
  triggers: {
    meta: InspectorState['triggers']['meta']
    sourceMeta: InspectorState['triggers']['sourceMeta']
    files: string[]
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
    files: Array<[string, { path: string; exportedName: string }]>
    graphMeta: InspectorState['workflows']['graphMeta']
    graphFiles: Array<[string, { path: string; exportedName: string }]>
  }
  rpc: {
    internalMeta: InspectorState['rpc']['internalMeta']
    internalFiles: Array<[string, { path: string; exportedName: string }]>
    exposedMeta: InspectorState['rpc']['exposedMeta']
    exposedFiles: Array<[string, { path: string; exportedName: string }]>
    invokedFunctions: string[]
    usedExternalPackages: string[]
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
  forgeNodes: {
    meta: InspectorState['forgeNodes']['meta']
    files: string[]
  }
  credentials: {
    definitions: InspectorState['credentials']['definitions']
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
    allWireServices: string[]
  }
  serviceMetadata: Array<{
    name: string
    summary: string
    description: string
    package: string
    path: string
    version: string
    interface: string
    expandedProperties: Record<string, string>
  }>
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
    wireServicesTypeImportMap: Array.from(
      state.wireServicesTypeImportMap.entries()
    ),
    userSessionTypeImportMap: Array.from(
      state.userSessionTypeImportMap.entries()
    ),
    configTypeImportMap: Array.from(state.configTypeImportMap.entries()),
    singletonServicesFactories: Array.from(
      state.singletonServicesFactories.entries()
    ),
    wireServicesFactories: Array.from(state.wireServicesFactories.entries()),
    wireServicesMeta: Array.from(state.wireServicesMeta.entries()),
    configFactories: Array.from(state.configFactories.entries()),
    filesAndMethods: state.filesAndMethods,
    filesAndMethodsErrors: Array.from(
      state.filesAndMethodsErrors.entries()
    ).map(([key, mapValue]) => [key, Array.from(mapValue.entries())] as const),
    schemaLookup: Array.from(state.schemaLookup.entries()),
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
    triggers: {
      meta: state.triggers.meta,
      sourceMeta: state.triggers.sourceMeta,
      files: Array.from(state.triggers.files),
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
      files: Array.from(state.workflows.files.entries()),
      graphMeta: state.workflows.graphMeta,
      graphFiles: Array.from(state.workflows.graphFiles.entries()),
    },
    rpc: {
      internalMeta: state.rpc.internalMeta,
      internalFiles: Array.from(state.rpc.internalFiles.entries()),
      exposedMeta: state.rpc.exposedMeta,
      exposedFiles: Array.from(state.rpc.exposedFiles.entries()),
      invokedFunctions: Array.from(state.rpc.invokedFunctions),
      usedExternalPackages: Array.from(state.rpc.usedExternalPackages),
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
    forgeNodes: {
      meta: state.forgeNodes.meta,
      files: Array.from(state.forgeNodes.files),
    },
    credentials: {
      definitions: state.credentials.definitions,
      files: Array.from(state.credentials.files),
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
      allWireServices: state.serviceAggregation.allWireServices,
    },
    serviceMetadata: state.serviceMetadata,
  }
}

/**
 * Deserializes JSON data back to InspectorState
 * Creates a partial state suitable for filtering/generation (without typesLookup)
 */
export function deserializeInspectorState(
  data: SerializableInspectorState
): Omit<InspectorState, 'typesLookup' | 'schemaLookup'> & {
  schemaLookup: Map<
    string,
    {
      variableName: string
      sourceFile: string
      vendor?: 'zod' | 'valibot' | 'arktype' | 'effect' | 'unknown'
    }
  >
} {
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
    wireServicesTypeImportMap: new Map(data.wireServicesTypeImportMap),
    userSessionTypeImportMap: new Map(data.userSessionTypeImportMap),
    configTypeImportMap: new Map(data.configTypeImportMap),
    singletonServicesFactories: new Map(data.singletonServicesFactories),
    wireServicesFactories: new Map(data.wireServicesFactories),
    wireServicesMeta: new Map(data.wireServicesMeta),
    configFactories: new Map(data.configFactories),
    filesAndMethods: data.filesAndMethods,
    filesAndMethodsErrors: new Map(
      data.filesAndMethodsErrors.map(([key, entries]) => [
        key,
        new Map(entries),
      ])
    ),
    schemaLookup: new Map(data.schemaLookup || []),
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
    triggers: {
      meta: data.triggers?.meta ?? {},
      sourceMeta: data.triggers?.sourceMeta ?? {},
      files: new Set(data.triggers?.files ?? []),
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
      files: new Map(data.workflows.files),
      graphMeta: data.workflows.graphMeta || {},
      graphFiles: new Map(data.workflows.graphFiles || []),
    },
    rpc: {
      internalMeta: data.rpc.internalMeta,
      internalFiles: new Map(data.rpc.internalFiles),
      exposedMeta: data.rpc.exposedMeta,
      exposedFiles: new Map(data.rpc.exposedFiles),
      invokedFunctions: new Set(data.rpc.invokedFunctions),
      usedExternalPackages: new Set(data.rpc.usedExternalPackages || []),
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
    forgeNodes: {
      meta: data.forgeNodes?.meta || {},
      files: new Set(data.forgeNodes?.files || []),
    },
    credentials: {
      definitions: data.credentials?.definitions || [],
      files: new Set(data.credentials?.files || []),
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
      allWireServices: data.serviceAggregation.allWireServices,
    },
    serviceMetadata: data.serviceMetadata || [],
  }
}
