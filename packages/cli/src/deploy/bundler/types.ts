/**
 * Types for the Pikku esbuild bundling pipeline.
 * Imports DeploymentManifest from the analyzer — single source of truth.
 */

export type {
  DeploymentManifest,
  WorkerSpec,
  WorkerRole,
} from '../analyzer/manifest.js'

export interface BundleResult {
  workerName: string
  bundlePath: string
  packageJsonPath: string
  metafilePath: string
  bundleSizeBytes: number
  externalPackages: Record<string, string>
}

export interface BundleError {
  workerName: string
  error: string
}

export interface BundleOutput {
  results: BundleResult[]
  errors: BundleError[]
}
