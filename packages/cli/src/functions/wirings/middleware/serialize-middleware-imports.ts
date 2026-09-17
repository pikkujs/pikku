import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type {
  InspectorMiddlewareState,
  InspectorHTTPState,
  InspectorState,
  MiddlewareGroupMeta,
  MiddlewareRegistration,
} from '@pikku/inspector'

const collectFactories = (
  groupMap: Map<string, MiddlewareGroupMeta>,
  outputPath: string,
  packageMappings: Record<string, string>
): Map<string, { exportName: string; filePath: string }> => {
  const factories = new Map<string, { exportName: string; filePath: string }>()
  for (const [, groupMeta] of groupMap.entries()) {
    for (const registration of registrationsOf(groupMeta)) {
      if (registration.exportName && registration.isFactory) {
        const filePath = getFileImportRelativePath(
          outputPath,
          registration.sourceFile,
          packageMappings
        )
        factories.set(registration.exportName, {
          exportName: registration.exportName,
          filePath,
        })
      }
    }
  }
  return factories
}

/**
 * Every `add*Middleware` call recorded under one pattern or tag.
 *
 * A group is keyed by its pattern, and more than one file may register for the
 * same one. Emitting only the primary registration meant the other file was
 * never imported, so its middleware never registered — which for a session
 * bridge or an auth gate fails open and fails silently.
 */
const registrationsOf = (
  groupMeta: MiddlewareGroupMeta
): MiddlewareRegistration[] => [
  groupMeta,
  ...(groupMeta.additionalRegistrations ?? []),
]

export const serializeMiddlewareImports = (
  outputPath: string,
  middlewareState: InspectorMiddlewareState,
  httpState: InspectorHTTPState,
  packageMappings: Record<string, string> = {},
  fullState?: InspectorState
) => {
  const serializedImports: string[] = []
  const serializedFactoryCalls: string[] = []

  const httpFactories = collectFactories(
    httpState.routeMiddleware,
    outputPath,
    packageMappings
  )
  const tagFactories = collectFactories(
    middlewareState.tagMiddleware,
    outputPath,
    packageMappings
  )

  const channelMiddlewareFactories = fullState
    ? collectFactories(
        fullState.channelMiddleware.tagMiddleware,
        outputPath,
        packageMappings
      )
    : new Map()

  // Collect direct (non-factory) side-effect imports
  const directImports = new Set<string>()
  const collectDirectImports = (groupMap: Map<string, MiddlewareGroupMeta>) => {
    for (const [, groupMeta] of groupMap.entries()) {
      for (const registration of registrationsOf(groupMeta)) {
        if (!registration.isFactory) {
          const filePath = getFileImportRelativePath(
            outputPath,
            registration.sourceFile,
            packageMappings
          )
          directImports.add(filePath)
        }
      }
    }
  }

  collectDirectImports(httpState.routeMiddleware)
  collectDirectImports(middlewareState.tagMiddleware)
  if (fullState) {
    collectDirectImports(fullState.channelMiddleware.tagMiddleware)
  }

  // Global middleware (addGlobalMiddleware) is registered by a top-level call
  // at module evaluation, so a side-effect import of its source file runs the
  // registration. Unlike tag/http middleware it has no associated wire group —
  // the inspector records it as a source file in `globalFiles` (and as
  // `global:*` entries in `instances`) — so the per-unit `--names` filter
  // leaves it out of every deployed unit (the `state.http.files` fallback that
  // add-middleware adds gets stripped by that filter). Emitting it here, into
  // the always-bootstrap-imported pikku-middleware.gen.ts, guarantees global
  // middleware registers in every unit. A duplicate import in full builds is
  // harmless — module bodies evaluate once.
  //
  // `isFactoryCall` is not consulted: it distinguishes `mw()` from `mw` as an
  // array element, not a deferred registration behind an exported factory, and
  // addGlobalMiddleware registers at module evaluation under either form.
  //
  // `globalFiles` is the primary source: it is a plain set of file names, where
  // `instances` is a map whose keys an unrelated registration could once
  // collide with. The `global:*` sweep stays as well, so a state serialized by
  // an older inspector (no `globalFiles`) still emits its imports.
  const globalSourceFiles = new Set<string>(middlewareState.globalFiles ?? [])
  for (const [instanceId, instance] of Object.entries(
    middlewareState.instances
  )) {
    if (instanceId.startsWith('global:')) {
      globalSourceFiles.add(instance.sourceFile)
    }
  }
  const globalImportPaths = new Map<string, string>()
  for (const sourceFile of globalSourceFiles) {
    const filePath = getFileImportRelativePath(
      outputPath,
      sourceFile,
      packageMappings
    )
    globalImportPaths.set(sourceFile, filePath)
    directImports.add(filePath)
  }

  const allFactories = new Map([
    ...httpFactories,
    ...tagFactories,
    ...channelMiddlewareFactories,
  ])

  // Add direct side-effect imports (non-factory addHTTPMiddleware / addMiddleware calls)
  if (directImports.size > 0) {
    serializedImports.push(
      '/* Side-effect imports for direct middleware registration calls */'
    )
    for (const filePath of directImports) {
      serializedImports.push(`import '${filePath}'`)
    }
  }

  if (allFactories.size > 0) {
    serializedImports.push(
      '/* Call middleware group factories to register at module evaluation */'
    )

    for (const [exportName, { filePath }] of allFactories) {
      serializedImports.push(`import { ${exportName} } from '${filePath}'`)
    }

    for (const [exportName] of allFactories) {
      serializedFactoryCalls.push(`${exportName}()`)
    }
  }

  const output = [...serializedImports, ...serializedFactoryCalls].join('\n')

  assertGlobalMiddlewareImported(outputPath, output, globalImportPaths)

  return output
}

/**
 * Fail the build if a file that calls `addGlobalMiddleware` has no side-effect
 * import in the generated middleware file.
 *
 * Auth commonly lives in global middleware, and a deployed unit that misses its
 * import does not fail to build — it serves every authenticated route a 401
 * with a clean build log. Checking the emitted text (rather than the set it was
 * built from) is what makes this a check and not a restatement: it fails if the
 * emit is ever dropped, put behind a condition, or handed a path the import
 * list does not actually carry. It cannot fire on a build that does emit the
 * import.
 */
export const assertGlobalMiddlewareImported = (
  outputPath: string,
  output: string,
  globalImportPaths: Map<string, string>
) => {
  const missing = [...globalImportPaths.entries()].filter(
    ([, filePath]) => !output.includes(`import '${filePath}'`)
  )
  if (missing.length === 0) {
    return
  }
  throw new Error(
    `Global middleware would not be registered in ${outputPath}.\n` +
      `These files call addGlobalMiddleware() but no side-effect import for them was emitted:\n` +
      missing.map(([sourceFile]) => `  - ${sourceFile}`).join('\n') +
      `\n\nGlobal middleware — auth gates included — only runs if its module is imported, so ` +
      `this build would start up with it silently missing. Re-run \`pikku all\`; if it persists, ` +
      `register the middleware from a file that also makes a wire registration ` +
      `(e.g. addHTTPMiddleware) and report this as a pikku bug.`
  )
}
