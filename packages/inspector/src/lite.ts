/**
 * The inspector's exports that never load the TypeScript compiler.
 *
 * `@pikku/inspector` itself pulls in `typescript` and `ts-json-schema-generator`
 * at module load, which costs a CLI command that only wants an error code or a
 * serializer most of its startup time. Everything here is safe to import
 * eagerly; `lite.test.ts` fails if anything reachable from this file imports
 * `typescript`.
 */
export { ErrorCode } from './error-codes.js'
export type { DiagnosticSeverity, CodedDiagnostic } from './error-codes.js'
export { AUTH_HANDLER_FUNC_ID } from './add/auth-handler-id.js'
export {
  serializeInspectorState,
  deserializeInspectorState,
} from './utils/serialize-inspector-state.js'
export {
  incompatibleServicesFor,
  resolveDeployTarget,
} from './utils/resolve-deploy-target.js'
export {
  generateCustomTypes,
  sanitizeTypeName,
} from './utils/custom-types-generator.js'
export {
  createEmptyManifest,
  serializeManifest,
} from './utils/contract-hashes.js'
export { serializeMCPJson } from './utils/serialize-mcp-json.js'
export { resolveFunctionMeta } from './utils/resolve-function-meta.js'
export { resolveCoreType } from './utils/resolve-core-type.js'
export {
  addonResolutionDirs,
  createAddonResolver,
} from './utils/addon-resolution.js'
