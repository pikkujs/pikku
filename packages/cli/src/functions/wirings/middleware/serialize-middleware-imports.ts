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
  // it lives only in `instances` keyed `global:*` — so the per-unit `--names`
  // filter leaves it out of every deployed unit (the `state.http.files`
  // fallback that add-middleware adds gets stripped by that filter). Emitting
  // it here, into the always-bootstrap-imported pikku-middleware.gen.ts,
  // guarantees global middleware registers in every unit. A duplicate import
  // in full builds is harmless — module bodies evaluate once.
  //
  // `isFactoryCall` is not consulted: it distinguishes `mw()` from `mw` as an
  // array element, not a deferred registration behind an exported factory, and
  // addGlobalMiddleware registers at module evaluation under either form.
  for (const [instanceId, instance] of Object.entries(
    middlewareState.instances
  )) {
    if (instanceId.startsWith('global:')) {
      directImports.add(
        getFileImportRelativePath(
          outputPath,
          instance.sourceFile,
          packageMappings
        )
      )
    }
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

  return [...serializedImports, ...serializedFactoryCalls].join('\n')
}
