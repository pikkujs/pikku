import * as ts from 'typescript'
import { performance } from 'perf_hooks'
import { dirname, relative, resolve } from 'path'
import { visitSetup, visitFunctions, visitRoutes } from './visit.js'
import { TypesMap } from './types-map.js'
import type {
  InspectorState,
  InspectorLogger,
  InspectorOptions,
} from './types.js'
import { findCommonAncestor } from './utils/find-root-dir.js'
import { createSourceFileCacheHost } from './source-file-cache.js'
import { createNestedProjectFilter } from './utils/nested-project-filter.js'
import { toProgramPath } from './utils/program-path.js'
import { resolveLatestVersions } from './utils/resolve-versions.js'
import { validateWebhookSourceTriggers } from './add/add-trigger.js'
import { generateAllSchemas } from './utils/schema-generator.js'
import { extractSecretUsage } from './utils/extract-secret-usage.js'
import {
  accumulateSurfaceUsage,
  surfaceUsageArea,
} from './utils/extract-surface-usage.js'
import { loadAddonFunctionsMeta } from './utils/load-addon-functions-meta.js'
import { resolveServiceTypes } from './utils/resolve-service-types.js'
import { finalizeInspectorState } from './finalize.js'

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

/**
 * The path mappings the inspector's program has to share with the project.
 *
 * The inspector builds its own program rather than reusing the project's, which
 * is what keeps a cold run affordable — but a project that reaches its generated
 * code through a tsconfig `paths` entry resolves that import through those
 * mappings and nothing else. Without them the factory an inspected function is
 * passed to resolves to `any`, so a function whose input type comes from the
 * factory's contextual type (rather than an explicit generic or a named schema)
 * silently records no input at all.
 *
 * Only resolution keys are copied. Type-inference options such as `strict` stay
 * the inspector's own, because changing those would change the recorded types.
 */
const readProjectPathMappings = (
  logger: InspectorLogger,
  tsconfig: string | undefined
): ts.CompilerOptions => {
  if (!tsconfig) {
    return {}
  }
  const configPath = resolve(tsconfig)
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error || !configFile.config) {
    logger.debug(
      `Could not read ${configPath} for path mappings; imports that rely on them will not resolve`
    )
    return {}
  }
  const { options: projectOptions } = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath)
  )
  const { baseUrl, paths, rootDirs, pathsBasePath } = projectOptions
  return {
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(paths !== undefined ? { paths } : {}),
    ...(rootDirs !== undefined ? { rootDirs } : {}),
    ...(pathsBasePath !== undefined ? { pathsBasePath } : {}),
  }
}

/**
 * The engine-specific half of an inspection: builds the program, walks it with
 * the checker and generates the schemas. What it returns is the pre-finalize
 * state that `finalizeInspectorState` completes.
 */
export const analyzeProgram = async (
  logger: InspectorLogger,
  routeFiles: string[],
  options: InspectorOptions = {}
): Promise<InspectorState> => {
  const normalizedRouteFiles = routeFiles.map((file) => resolve(file))
  const compilerOptions: ts.CompilerOptions = {
    ...readProjectPathMappings(logger, options.tsconfig),
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.Node16,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    types: [],
    allowJs: false,
    checkJs: false,
  }
  const cpuStart = process.cpuUsage()
  const startProgram = performance.now()
  const host = createSourceFileCacheHost(compilerOptions)
  const program = ts.createProgram(
    normalizedRouteFiles,
    compilerOptions,
    host,
    options.oldProgram
  )
  host.prune(program)
  const filesReused = host.reused()
  logger.debug(
    `Created program in ${(performance.now() - startProgram).toFixed(0)}ms (${normalizedRouteFiles.length} files, ${filesReused} source files reused)`
  )

  const startChecker = performance.now()
  const checker = program.getTypeChecker()
  logger.debug(
    `Got type checker in ${(performance.now() - startChecker).toFixed(2)}ms`
  )

  // Use provided rootDir or infer from source files
  const rootDir = toProgramPath(
    options.rootDir || findCommonAncestor(normalizedRouteFiles)
  )

  const startSourceFiles = performance.now()
  // node_modules under rootDir (e.g. a locally-installed addon) is a
  // dependency, not project source — scanning it double-counts the addon's
  // own application types (CoreConfig/Services/SingletonServices). Nested
  // pikku projects (a workspace addon at packages/<addon>) are the same case:
  // TS resolves the node_modules symlink to its realpath under rootDir, so
  // the node_modules check alone misses them.
  // Sort by file name so the sweeps populate state in a stable order. The
  // program's own file order depends on glob + import-graph resolution, which
  // varies run to run — leaving generated meta keys (and anything serialized
  // in insertion order) non-reproducible across identical `pikku all` runs.
  // Safe because function registration is a dedicated pass (visitFunctions)
  // that completes before any order-sensitive wiring resolution in visitRoutes.
  const isNestedProjectFile = createNestedProjectFilter(rootDir)
  const sourceFiles = program
    .getSourceFiles()
    .filter(
      (sf) =>
        sf.fileName.startsWith(rootDir) &&
        !sf.fileName.includes('/node_modules/') &&
        !isNestedProjectFile(sf.fileName)
    )
    .sort((a, b) =>
      a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0
    )
  logger.debug(
    `Got source files in ${(performance.now() - startSourceFiles).toFixed(2)}ms`
  )

  const state = getInitialInspectorState(rootDir)

  const surfaceAreaCache = new Map<string, string | null>()
  for (const sourceFile of sourceFiles) {
    const usage = extractSecretUsage(sourceFile)
    if (usage.keys.length > 0 || usage.dynamic.length > 0) {
      state.secrets.usage.set(sourceFile.fileName, usage)
    }
    // Counted in the sweep that already has this file open. The public surface
    // is documentation, and documentation may not cost a project a second pass
    // over its source.
    accumulateSurfaceUsage(
      sourceFile,
      {
        area: surfaceUsageArea(sourceFile.fileName, rootDir, surfaceAreaCache),
        file: relative(rootDir, sourceFile.fileName),
      },
      state.surfaceUsage
    )
  }

  // First sweep: add all functions
  const startSetup = performance.now()
  for (const sourceFile of sourceFiles) {
    const sourceOptions = { ...options, sourceFile }
    ts.forEachChild(sourceFile, (child) =>
      visitSetup(logger, checker, child, state, sourceOptions)
    )
  }
  logger.debug(
    `Visit setup phase completed in ${(performance.now() - startSetup).toFixed(0)}ms`
  )

  // Load addon function metadata so wirings can reference addon functions
  await loadAddonFunctionsMeta(logger, state)

  if (!options.setupOnly) {
    // Function sweep: register every function before transports/wirings resolve
    // them, so resolution doesn't depend on source-file order.
    const startFunctions = performance.now()
    for (const sourceFile of sourceFiles) {
      const sourceOptions = { ...options, sourceFile }
      ts.forEachChild(sourceFile, (child) =>
        visitFunctions(logger, checker, child, state, sourceOptions)
      )
    }
    logger.debug(
      `Visit functions phase completed in ${(performance.now() - startFunctions).toFixed(0)}ms`
    )

    // Transport sweep: add all transports/wirings
    const startRoutes = performance.now()
    for (const sourceFile of sourceFiles) {
      const sourceOptions = { ...options, sourceFile }
      ts.forEachChild(sourceFile, (child) =>
        visitRoutes(logger, checker, child, state, sourceOptions)
      )
    }
    logger.debug(
      `Visit routes phase completed in ${(performance.now() - startRoutes).toFixed(0)}ms`
    )

    validateWebhookSourceTriggers(logger, state)

    resolveLatestVersions(state, logger)

    if (options.schemaConfig) {
      const startSchemas = performance.now()
      state.schemas = await generateAllSchemas(
        logger,
        options.schemaConfig,
        state
      )
      logger.debug(
        `generateAllSchemas took ${(performance.now() - startSchemas).toFixed(0)}ms`
      )
    }
  }

  // On a setup-only pass too: the CLI reads the singleton service names off
  // a setup-only state to decide whether workflows have a workflowService.
  state.serviceTypes = resolveServiceTypes(state, checker)

  const cpu = process.cpuUsage(cpuStart)
  state.stats = {
    files: program.getSourceFiles().length,
    projectFiles: sourceFiles.length,
    filesReused,
    types: program.getTypeCount(),
    instantiations: program.getInstantiationCount(),
    symbols: program.getSymbolCount(),
    cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    wallMs: Math.round(performance.now() - startProgram),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576),
  }
  state.program = program

  return state
}

export const inspect = async (
  logger: InspectorLogger,
  routeFiles: string[],
  options: InspectorOptions = {}
): Promise<InspectorState> => {
  const cpuStart = process.cpuUsage()
  const start = performance.now()
  const state = await analyzeProgram(logger, routeFiles, options)
  await finalizeInspectorState(logger, state, options)
  const cpu = process.cpuUsage(cpuStart)
  state.stats = {
    ...state.stats!,
    cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    wallMs: Math.round(performance.now() - start),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576),
  }
  return state
}
