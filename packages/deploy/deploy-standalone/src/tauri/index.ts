/**
 * `@pikku/deploy-standalone/native` — generating and checking the Tauri project
 * a frontend's native app is built from. `pikku app native` is the only caller.
 */
export {
  NATIVE_APIS,
  nativeApiList,
  resolveNativeApis,
  type NativeApi,
  type NativeSupport,
} from './native.js'
export {
  defaultNativeIdentifier,
  nativeIdentifierProblems,
} from './identifier.js'
export {
  NATIVE_PROJECT_DIR,
  checkNativeProject,
  createNativeProject,
  installSidecar,
  nativeGrantUrl,
  nativePackageJson,
  nativeSpecProblems,
  syncNativeProject,
  type NativeMode,
  type NativePlatform,
  type NativeProblem,
  type NativeProjectSpec,
  type NativeWriteResult,
} from './project.js'
export {
  renderNativeNextSteps,
  type NativeNextStepsOptions,
} from './next-steps.js'
export { hostTargetTriple } from './target-triple.js'
