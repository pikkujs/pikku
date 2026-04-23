/**
 * Types for the Pikku esbuild bundling pipeline.
 * Imports DeploymentManifest from the analyzer — single source of truth.
 */

export type {
  DeploymentManifest,
  DeploymentUnit,
  DeploymentUnitRole,
} from '../analyzer/manifest.js'

export interface BundleResult {
  unitName: string
  bundlePath: string
  packageJsonPath: string
  exactDependenciesPath: string
  metafilePath: string
  bundleSizeBytes: number
  bundleHash: string
  exactDependenciesHash: string
  exactDependencies: Record<string, string>
  exactOptionalDependencies: Record<string, string>
}

export interface BundleError {
  unitName: string
  error: string
}

export interface BundleOutput {
  results: BundleResult[]
  errors: BundleError[]
}
