/**
 * DeploymentManifest types.
 *
 * These describe the desired-state output of the project analyzer.
 * The plan/apply engine diffs a manifest against Cloudflare's current state
 * to produce a deployment plan.
 */

// ---------------------------------------------------------------------------
// Worker roles
// ---------------------------------------------------------------------------

export type WorkerRole =
  | 'http'
  | 'mcp'
  | 'queue-consumer'
  | 'cron'
  | 'agent'
  | 'remote'
  | 'workflow-step'
  | 'workflow-orchestrator'

// ---------------------------------------------------------------------------
// Bindings (Cloudflare Worker bindings)
// ---------------------------------------------------------------------------

export type Binding =
  | D1Binding
  | R2Binding
  | QueueBinding
  | ServiceBinding
  | SecretBinding
  | VariableBinding

export interface D1Binding {
  type: 'd1'
  name: string
  databaseName: string
}

export interface R2Binding {
  type: 'r2'
  name: string
  bucketName: string
}

export interface QueueBinding {
  type: 'queue'
  name: string
  queueName: string
}

export interface ServiceBinding {
  type: 'service'
  name: string
  service: string
}

export interface SecretBinding {
  type: 'secret'
  name: string
  secretName: string
}

export interface VariableBinding {
  type: 'variable'
  name: string
  value: string
}

// ---------------------------------------------------------------------------
// Resource specs
// ---------------------------------------------------------------------------

export interface WorkerSpec {
  name: string
  role: WorkerRole
  entryPoint: string
  routes: string[]
  bindings: Binding[]
  functionIds: string[]
}

export interface QueueSpec {
  name: string
  consumerWorker: string
}

export interface D1Spec {
  name: string
  migrationsDir: string | null
}

export interface R2Spec {
  name: string
}

export interface CronTriggerSpec {
  name: string
  schedule: string
  workerName: string
  functionId: string
}

export interface ContainerSpec {
  name: string
  functionIds: string[]
  dockerfile: string | null
}

export interface ChannelSpec {
  name: string
  functionId: string
}

// ---------------------------------------------------------------------------
// Top-level manifest
// ---------------------------------------------------------------------------

export interface DeploymentManifest {
  projectId: string
  version: string
  workers: WorkerSpec[]
  queues: QueueSpec[]
  d1Databases: D1Spec[]
  r2Buckets: R2Spec[]
  cronTriggers: CronTriggerSpec[]
  channels: ChannelSpec[]
  secrets: string[]
  variables: Record<string, string>
  containers: ContainerSpec[]
}
