/**
 * Pikku Fabric esbuild bundling pipeline.
 *
 * Bundles each worker in a DeploymentManifest into an independent ESM bundle
 * with a minimal package.json containing only its required external dependencies.
 *
 * Architecture: per-function Workers on Cloudflare.
 * See docs/architecture/FABRIC-ARCHITECTURE.md section 7 for details.
 */

export { bundleWorkers } from './bundler.js'
export { generateEntryFiles, generateEntrySource } from './entry-generator.js'
export {
  extractDependencies,
  extractExternalPackages,
  parsePackageName,
  generateMinimalPackageJson,
} from './dep-extractor.js'
export type {
  DeploymentManifest,
  WorkerSpec,
  WorkerRole,
  BundleResult,
  BundleError,
  BundleOutput,
  Binding,
  QueueSpec,
  D1Spec,
  R2Spec,
  CronTriggerSpec,
  ContainerSpec,
} from './types.js'
