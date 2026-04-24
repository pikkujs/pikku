export { bundleUnits } from './bundler.js'
export {
  extractDependencies,
  extractExternalPackages,
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
