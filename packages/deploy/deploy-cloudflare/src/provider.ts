// @ts-nocheck — Legacy provider, being replaced by deploy.ts orchestrator
/**
 * Cloudflare implementation of the DeployProvider interface.
 *
 * Bridges the generic plan/apply engine with the Cloudflare API client.
 */

import { CloudflareClient } from './client.js'
import {
  listWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
} from './workers.js'
import {
  listQueues,
  createQueue,
  deleteQueue,
  createConsumer,
} from './queues.js'
import { listDatabases, createDatabase, executeQuery } from './d1.js'
import { listBuckets, createBucket, deleteBucket } from './r2.js'
import { listSecrets, setSecret, deleteSecret } from './secrets.js'
import { setCronTriggers, getCronTriggers } from './cron.js'
import {
  deployContainer,
  deleteContainer,
  listContainers,
} from './containers.js'
import { generateCloudflareEntryFiles as generateEntryFiles } from './entry-generator.js'

interface PlanChange {
  action: 'create' | 'update' | 'delete' | 'drain'
  resourceType:
    | 'worker'
    | 'queue'
    | 'd1'
    | 'r2'
    | 'cron-trigger'
    | 'container'
    | 'secret'
    | 'variable'
  name: string
  reason: string
  details?: Record<string, unknown>
}

interface CurrentState {
  workers: Array<{
    name: string
    functionIds: string[]
    role: string
    scriptHash?: string
  }>
  queues: Array<{ name: string }>
  d1Databases: Array<{ name: string; id: string }>
  r2Buckets: Array<{ name: string }>
  cronTriggers: Array<{ workerName: string; cron: string }>
  containers: Array<{ name: string }>
  secrets: string[]
  variables: Record<string, string>
}

interface DeploymentManifest {
  projectId: string
  version: string
  workers: Array<{
    name: string
    role: string
    entryPoint: string
    routes: string[]
    bindings: Array<{ type: string; name: string; [key: string]: unknown }>
    functionIds: string[]
  }>
  queues: Array<{ name: string; consumerWorker: string }>
  d1Databases: Array<{ name: string; migrationsDir: string | null }>
  r2Buckets: Array<{ name: string }>
  cronTriggers: Array<{
    name: string
    schedule: string
    workerName: string
    functionId: string
  }>
  secrets: string[]
  variables: Record<string, string>
  containers: Array<{
    name: string
    functionIds: string[]
    dockerfile: string | null
  }>
}

interface CloudflareProviderOptions {
  accountId: string
  apiToken: string
  projectPrefix?: string
}

export class CloudflareDeployProvider {
  private client: CloudflareClient
  private prefix: string

  constructor(private options: CloudflareProviderOptions) {
    this.client = new CloudflareClient({
      accountId: options.accountId,
      apiToken: options.apiToken,
    })
    this.prefix = options.projectPrefix ?? ''
  }

  private workerName(name: string): string {
    return this.prefix ? `${this.prefix}-${name}` : name
  }

  async getCurrentState(projectId: string): Promise<CurrentState> {
    const prefix = this.prefix || projectId
    const workers: CurrentState['workers'] = []
    const queues: CurrentState['queues'] = []
    const d1Databases: CurrentState['d1Databases'] = []
    const r2Buckets: CurrentState['r2Buckets'] = []
    const cronTriggers: CurrentState['cronTriggers'] = []
    const containers: CurrentState['containers'] = []

    // Fetch workers
    try {
      const cfWorkers = await listWorkers(this.client)
      for (const w of cfWorkers) {
        if (w.id.startsWith(prefix + '-') || w.id === prefix) {
          workers.push({
            name: w.id,
            functionIds: [], // CF doesn't track this — we rely on manifest comparison
            role: 'http',
          })
        }
      }
    } catch {
      /* account may not have workers yet */
    }

    // Fetch queues
    try {
      const cfQueues = await listQueues(this.client)
      for (const q of cfQueues) {
        if (q.queue_name.startsWith(prefix + '-')) {
          queues.push({ name: q.queue_name })
        }
      }
    } catch {
      /* no queues */
    }

    // Fetch D1
    try {
      const cfDatabases = await listDatabases(this.client)
      for (const d of cfDatabases) {
        if (d.name.startsWith(prefix + '-')) {
          d1Databases.push({ name: d.name, id: d.uuid })
        }
      }
    } catch {
      /* no D1 */
    }

    // Fetch R2
    try {
      const cfBuckets = await listBuckets(this.client)
      for (const b of cfBuckets) {
        if (b.name.startsWith(prefix + '-')) {
          r2Buckets.push({ name: b.name })
        }
      }
    } catch {
      /* no R2 */
    }

    // Fetch containers
    try {
      const cfContainers = await listContainers(this.client)
      for (const c of cfContainers) {
        if (c.name?.startsWith(prefix + '-')) {
          containers.push({ name: c.name })
        }
      }
    } catch {
      /* no containers */
    }

    return {
      workers,
      queues,
      d1Databases,
      r2Buckets,
      cronTriggers,
      containers,
      secrets: [],
      variables: {},
    }
  }

  async applyChange(
    change: PlanChange,
    manifest: DeploymentManifest
  ): Promise<void> {
    switch (change.resourceType) {
      case 'worker':
        await this.applyWorkerChange(change, manifest)
        break
      case 'queue':
        await this.applyQueueChange(change, manifest)
        break
      case 'd1':
        await this.applyD1Change(change, manifest)
        break
      case 'r2':
        await this.applyR2Change(change)
        break
      case 'cron-trigger':
        await this.applyCronChange(change, manifest)
        break
      case 'secret':
        await this.applySecretChange(change)
        break
      case 'variable':
        // Variables are set as part of worker bindings, not separately
        break
      case 'container':
        await this.applyContainerChange(change)
        break
    }
  }

  async hasActiveWork(
    _resourceName: string
  ): Promise<{ active: boolean; pendingCount: number }> {
    // TODO: Query D1 for active workflow runs targeting this worker
    return { active: false, pendingCount: 0 }
  }

  /** Generate Cloudflare-specific entry points for all workers */
  async generateEntries(
    manifest: DeploymentManifest,
    outputDir: string
  ): Promise<Map<string, string>> {
    return generateEntryFiles(manifest.workers, outputDir)
  }

  // ── Private: per-resource apply methods ──────────────────────

  private async applyWorkerChange(
    change: PlanChange,
    manifest: DeploymentManifest
  ): Promise<void> {
    const name = this.workerName(change.name)

    if (change.action === 'delete' || change.action === 'drain') {
      await deleteWorker(this.client, name)
      return
    }

    const workerSpec = manifest.workers.find((w) => w.name === change.name)
    if (!workerSpec) {
      throw new Error(`Worker "${change.name}" not found in manifest`)
    }

    // Read the bundled script
    // The bundle path is set during the bundling step — for now we use entryPoint
    const script = `// Placeholder — real bundle will be uploaded\nexport default { fetch() { return new Response('ok') } }`

    const bindings = workerSpec.bindings.map((b) => {
      switch (b.type) {
        case 'd1':
          return { type: 'D1' as const, name: b.name, id: '' } // ID resolved at deploy time
        case 'r2':
          return {
            type: 'R2' as const,
            name: b.name,
            bucket_name: String(b.bucketName ?? b.name),
          }
        case 'queue':
          return {
            type: 'Queue' as const,
            name: b.name,
            queue_name: String(b.queueName ?? b.name),
          }
        case 'service':
          return {
            type: 'Service' as const,
            name: b.name,
            service: String(b.service ?? b.name),
          }
        case 'secret':
          return { type: 'SecretText' as const, name: b.name, text: '' } // Set separately
        case 'variable':
          return {
            type: 'PlainText' as const,
            name: b.name,
            text: String(b.value ?? ''),
          }
        default:
          return { type: 'PlainText' as const, name: b.name, text: '' }
      }
    })

    if (change.action === 'create') {
      await createWorker(this.client, name, script, bindings)
    } else {
      await updateWorker(this.client, name, script, bindings)
    }
  }

  private async applyQueueChange(
    change: PlanChange,
    manifest: DeploymentManifest
  ): Promise<void> {
    const name = this.workerName(change.name)

    if (change.action === 'delete') {
      await deleteQueue(this.client, name)
      return
    }

    await createQueue(this.client, name)

    // Bind consumer worker if specified
    const queueSpec = manifest.queues.find((q) => q.name === change.name)
    if (queueSpec) {
      const consumerName = this.workerName(queueSpec.consumerWorker)
      await createConsumer(this.client, name, consumerName)
    }
  }

  private async applyD1Change(
    change: PlanChange,
    _manifest: DeploymentManifest
  ): Promise<void> {
    const name = this.workerName(change.name)

    if (change.action === 'delete') {
      // Need the database ID — would need to look it up
      // For now, skip deletion of D1 databases (they contain data)
      return
    }

    await createDatabase(this.client, name)
  }

  private async applyR2Change(change: PlanChange): Promise<void> {
    const name = this.workerName(change.name)

    if (change.action === 'delete') {
      await deleteBucket(this.client, name)
      return
    }

    await createBucket(this.client, name)
  }

  private async applyCronChange(
    change: PlanChange,
    manifest: DeploymentManifest
  ): Promise<void> {
    if (change.action === 'delete') {
      const workerName = this.workerName(change.name)
      await setCronTriggers(this.client, workerName, [])
      return
    }

    const cronSpec = manifest.cronTriggers.find((c) => c.name === change.name)
    if (!cronSpec) return

    const workerName = this.workerName(cronSpec.workerName)
    await setCronTriggers(this.client, workerName, [
      { cron: cronSpec.schedule },
    ])
  }

  private async applySecretChange(change: PlanChange): Promise<void> {
    // Secrets need values — the plan only has names
    // The actual values come from the environment secrets store
    // For now, this is a no-op — secrets are set separately via the console
    if (change.action === 'delete') {
      // Would need to know which worker(s) have this secret
    }
  }

  private async applyContainerChange(change: PlanChange): Promise<void> {
    const name = this.workerName(change.name)

    if (change.action === 'delete') {
      await deleteContainer(this.client, name)
      return
    }

    await deployContainer(this.client, {
      name,
      image: '', // Would come from a container build step
      env: {},
    })
  }
}
