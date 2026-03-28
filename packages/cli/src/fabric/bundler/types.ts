/**
 * Types for the Pikku Fabric esbuild bundling pipeline.
 *
 * These types mirror the architecture doc's DeploymentManifest / WorkerSpec
 * but are scoped to what the bundler needs to operate.
 */

export type WorkerRole =
  | 'http'
  | 'mcp'
  | 'queue-consumer'
  | 'cron'
  | 'agent'
  | 'remote'
  | 'workflow-step'

export interface Binding {
  type: string
  name: string
  [key: string]: unknown
}

export interface WorkerSpec {
  name: string
  role: WorkerRole
  entryPoint: string
  routes: string[]
  bindings: Binding[]
  bundleMetafile: string
  functionIds: string[]
}

export interface QueueSpec {
  name: string
  consumerWorker: string
}

export interface D1Spec {
  name: string
  migrationsDir?: string
}

export interface R2Spec {
  name: string
}

export interface CronTriggerSpec {
  schedule: string
  workerName: string
}

export interface ContainerSpec {
  name: string
  dockerfile: string
  functionIds: string[]
}

export interface DeploymentManifest {
  projectId: string
  version: string
  workers: WorkerSpec[]
  queues: QueueSpec[]
  d1Databases: D1Spec[]
  r2Buckets: R2Spec[]
  cronTriggers: CronTriggerSpec[]
  secrets: string[]
  variables: Record<string, string>
  containers: ContainerSpec[]
}

export interface BundleResult {
  workerName: string
  role: WorkerRole
  bundlePath: string
  packageJsonPath: string
  metafilePath: string
  bundleSizeBytes: number
  externalPackages: Record<string, string>
}

export interface BundleError {
  workerName: string
  role: WorkerRole
  error: string
}

export interface BundleOutput {
  results: BundleResult[]
  errors: BundleError[]
}
