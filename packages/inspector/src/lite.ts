/**
 * The inspector's exports that never load the TypeScript compiler.
 *
 * `@pikku/inspector` itself pulls in `typescript` and `ts-json-schema-generator`
 * at module load, which costs a CLI command that only wants an error code or a
 * serializer most of its startup time, and costs the native engine the
 * compiler's memory for nothing. Everything a consumer of an `InspectorState`
 * needs is here and safe to import eagerly; `lite.test.ts` fails if anything
 * reachable from this file imports `typescript`.
 */
export { getInitialInspectorState } from './initial-state.js'
export { TypesMap } from './types-map.js'
export { ErrorCode } from './error-codes.js'
export type { DiagnosticSeverity, CodedDiagnostic } from './error-codes.js'
export { AUTH_HANDLER_FUNC_ID } from './utils/inspector-constants.js'
export {
  SCENARIO_INSTRUMENTATION_FUNCTIONS,
  isScenarioInstrumentationFunction,
} from './add/scenario-instrumentation.js'
export {
  serializeInspectorState,
  deserializeInspectorState,
} from './utils/serialize-inspector-state.js'
export { filterInspectorState } from './utils/filter-inspector-state.js'
export {
  incompatibleServicesFor,
  resolveDeployTarget,
} from './utils/resolve-deploy-target.js'
export {
  customTypeNames,
  generateCustomTypes,
  sanitizeTypeName,
} from './utils/custom-types-generator.js'
export { unresolvedSchemaReferences } from './utils/post-process.js'
export {
  computeContractHash,
  createEmptyManifest,
  serializeManifest,
} from './utils/contract-hashes.js'
export { serializeMCPJson } from './utils/serialize-mcp-json.js'
export {
  deserializeDslWorkflow,
  deserializeGraphWorkflow,
  deserializeAllDslWorkflows,
} from './utils/workflow/dsl/deserialize-dsl-workflow.js'
export { resolveFunctionMeta } from './utils/resolve-function-meta.js'
export { resolveCoreType } from './utils/resolve-core-type.js'
export {
  addonResolutionDirs,
  createAddonResolver,
} from './utils/addon-resolution.js'
export {
  ADDONS_LOCK_FILE,
  REMOTE_SDK_DIR,
  SDK_INTEGRITY_MARKER,
  checkLockedSdk,
  emptyAddonsLock,
  parseRemoteAddonPackage,
  readAddonsLock,
  readSdkManifest,
  remoteSdkDir,
  serializeAddonsLock,
} from './utils/remote-addon-sdk.js'
export type {
  AddonsLock,
  AddonsLockEntry,
  RemoteAddonSdkManifest,
  RemoteAddonPackageSpec,
  LockedSdk,
} from './utils/remote-addon-sdk.js'
