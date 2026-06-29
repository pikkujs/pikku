export { BaseBundler } from './bundler.js'
export { NodeBundler } from './node-bundler.js'
export { BunBundler } from './bun-bundler.js'
export type { Bundler, BundleUnitsOptions } from './bundler.interface.js'
export {
  extractDependencies,
  extractExternalPackages,
  resolveExternalVersions,
  parsePackageName,
  generateMinimalPackageJson,
} from './dep-extractor.js'
export type {
  BundleResult,
  BundleError,
  BundleOutput,
  DeploymentUnit,
  DeploymentUnitRole,
} from './types.js'
