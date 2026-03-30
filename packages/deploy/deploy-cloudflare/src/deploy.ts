/**
 * Cloudflare deploy orchestrator.
 *
 * Deploys a full DeploymentManifest to Cloudflare using the API directly
 * (not wrangler). This is the fast path — all resource creation and worker
 * uploads happen in parallel.
 *
 * Flow:
 * 1. Create shared resources (D1, R2, Queues) in parallel
 * 2. Upload all worker scripts with bindings in parallel
 * 3. Wire queue consumers and cron triggers in parallel
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { CloudflareClient } from './client.js'
import { createWorker, updateWorker, getWorker } from './workers.js'
import { createQueue, listQueues, createConsumer } from './queues.js'
import { createDatabase, listDatabases } from './d1.js'
import { createBucket, listBuckets } from './r2.js'
import { setCronTriggers } from './cron.js'
import { resolveBindings } from './binding-resolver.js'
import type { ResourceState } from './binding-resolver.js'
import type { WorkerBinding } from './types.js'

interface DeploymentManifest {
  projectId: string
  units: Array<{
    name: string
    role: string
    services: Array<{ capability: string; sourceServiceName: string }>
  }>
  queues: Array<{ name: string; consumerUnit: string }>
  scheduledTasks: Array<{
    name: string
    schedule: string
    unitName: string
  }>
  secrets: Array<{ secretId: string }>
  variables: Array<{ variableId: string }>
}

export interface DeployOptions {
  accountId: string
  apiToken: string
  projectId: string
  buildDir: string
  manifest: DeploymentManifest
  onProgress?: (step: string, detail: string) => void
}

export interface DeployResult {
  success: boolean
  resourcesCreated: string[]
  workersDeployed: string[]
  errors: Array<{ step: string; error: string }>
}

export async function deploy(options: DeployOptions): Promise<DeployResult> {
  const { accountId, apiToken, projectId, buildDir, manifest, onProgress } =
    options
  const client = new CloudflareClient({ accountId, apiToken })
  const log = onProgress ?? (() => {})

  const result: DeployResult = {
    success: true,
    resourcesCreated: [],
    workersDeployed: [],
    errors: [],
  }

  // Step 1: Create shared resources in parallel
  log('resources', 'Creating shared resources...')
  const resources = await createSharedResources(
    client,
    projectId,
    manifest,
    result,
    log
  )

  // Step 2: Upload all worker scripts in parallel
  log('workers', 'Uploading workers...')
  await uploadWorkers(
    client,
    projectId,
    buildDir,
    manifest,
    resources,
    result,
    log
  )

  // Step 3: Wire consumers and cron triggers in parallel
  log('wiring', 'Wiring consumers and triggers...')
  await wireConsumersAndTriggers(
    client,
    projectId,
    manifest,
    resources,
    result,
    log
  )

  result.success = result.errors.length === 0
  return result
}

async function createSharedResources(
  client: CloudflareClient,
  projectId: string,
  manifest: DeploymentManifest,
  result: DeployResult,
  log: (step: string, detail: string) => void
): Promise<ResourceState> {
  const resources: ResourceState = {
    d1DatabaseId: null,
    d1DatabaseName: `${projectId}-db`,
    r2BucketName: `${projectId}-storage`,
    kvNamespaceId: null,
    queueNames: new Map(),
  }

  const needsDatabase = manifest.units.some((u) =>
    u.services.some((s) => s.capability === 'database')
  )
  const needsStorage = manifest.units.some((u) =>
    u.services.some((s) => s.capability === 'object-storage')
  )

  const tasks: Array<Promise<void>> = []

  // D1 database
  if (needsDatabase) {
    tasks.push(
      (async () => {
        try {
          const existing = await listDatabases(client)
          const found = existing.find(
            (d) => d.name === resources.d1DatabaseName
          )
          if (found) {
            resources.d1DatabaseId = found.uuid
            log('resources', `D1 "${resources.d1DatabaseName}" already exists`)
          } else {
            const db = await createDatabase(client, resources.d1DatabaseName)
            resources.d1DatabaseId = db.uuid
            result.resourcesCreated.push(`d1:${resources.d1DatabaseName}`)
            log('resources', `Created D1 "${resources.d1DatabaseName}"`)
          }
        } catch (err) {
          result.errors.push({
            step: 'd1-create',
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    )
  }

  // R2 bucket
  if (needsStorage) {
    tasks.push(
      (async () => {
        try {
          const existing = await listBuckets(client)
          const found = existing.find((b) => b.name === resources.r2BucketName)
          if (found) {
            log('resources', `R2 "${resources.r2BucketName}" already exists`)
          } else {
            await createBucket(client, resources.r2BucketName)
            result.resourcesCreated.push(`r2:${resources.r2BucketName}`)
            log('resources', `Created R2 "${resources.r2BucketName}"`)
          }
        } catch (err) {
          result.errors.push({
            step: 'r2-create',
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    )
  }

  // Queues
  for (const queue of manifest.queues) {
    const queueName = `${projectId}-${queue.name}`
    tasks.push(
      (async () => {
        try {
          const existing = await listQueues(client)
          const found = existing.find((q) => q.queue_name === queueName)
          if (found) {
            resources.queueNames.set(queue.name, queueName)
            log('resources', `Queue "${queueName}" already exists`)
          } else {
            await createQueue(client, queueName)
            resources.queueNames.set(queue.name, queueName)
            result.resourcesCreated.push(`queue:${queueName}`)
            log('resources', `Created queue "${queueName}"`)
          }
        } catch (err) {
          result.errors.push({
            step: `queue-create:${queueName}`,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    )
  }

  await Promise.all(tasks)
  return resources
}

async function uploadWorkers(
  client: CloudflareClient,
  projectId: string,
  buildDir: string,
  manifest: DeploymentManifest,
  resources: ResourceState,
  result: DeployResult,
  log: (step: string, detail: string) => void
): Promise<void> {
  const tasks = manifest.units.map(async (unit) => {
    const workerName = `${projectId}-${unit.name}`
    const bundlePath = join(buildDir, unit.name, 'bundle.js')

    try {
      const script = await readFile(bundlePath, 'utf-8')
      const bindings: WorkerBinding[] = resolveBindings(
        unit,
        manifest.queues,
        resources
      )

      const existing = await getWorker(client, workerName)
      if (existing) {
        await updateWorker(client, workerName, script, bindings)
        log('workers', `Updated "${workerName}"`)
      } else {
        await createWorker(client, workerName, script, bindings)
        log('workers', `Created "${workerName}"`)
      }
      result.workersDeployed.push(workerName)
    } catch (err) {
      result.errors.push({
        step: `worker-upload:${workerName}`,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  await Promise.all(tasks)
}

async function wireConsumersAndTriggers(
  client: CloudflareClient,
  projectId: string,
  manifest: DeploymentManifest,
  resources: ResourceState,
  result: DeployResult,
  log: (step: string, detail: string) => void
): Promise<void> {
  const tasks: Array<Promise<void>> = []

  // Wire queue consumers
  for (const queue of manifest.queues) {
    const queueName = resources.queueNames.get(queue.name)
    if (!queueName) continue

    const consumerWorkerName = `${projectId}-${queue.consumerUnit}`
    tasks.push(
      (async () => {
        try {
          await createConsumer(client, queueName, consumerWorkerName)
          log(
            'wiring',
            `Bound consumer "${consumerWorkerName}" to queue "${queueName}"`
          )
        } catch (err) {
          result.errors.push({
            step: `queue-consumer:${queueName}`,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    )
  }

  // Set cron triggers
  for (const task of manifest.scheduledTasks) {
    const workerName = `${projectId}-${task.unitName}`
    tasks.push(
      (async () => {
        try {
          await setCronTriggers(client, workerName, [{ cron: task.schedule }])
          log('wiring', `Set cron "${task.schedule}" on "${workerName}"`)
        } catch (err) {
          result.errors.push({
            step: `cron-trigger:${workerName}`,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    )
  }

  await Promise.all(tasks)
}
