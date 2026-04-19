/**
 * Cloudflare deploy orchestrator.
 *
 * Deploys a full project to Cloudflare using the API directly (not wrangler).
 * Reads the infra.json manifest and bundled workers from the build directory.
 *
 * Flow:
 * 1. Create shared resources (D1, R2, Queues) — idempotent, parallel
 * 2. Upload workers without service bindings first (parallel)
 * 3. Upload workers with service bindings (parallel, deps already exist)
 * 4. Wire queue consumers and cron triggers
 * 5. Enable workers.dev routes
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { CloudflareClient } from './client.js'
import { createWorker } from './workers.js'
import { createQueue, listQueues, createConsumer } from './queues.js'
import { createDatabase, listDatabases } from './d1.js'
import { createBucket, listBuckets } from './r2.js'
import { setCronTriggers } from './cron.js'
import type { CloudflareInfraManifest } from './infra-manifest.js'
import type { WorkerBinding } from './types.js'

export interface DeployOptions {
  accountId: string
  apiToken: string
  buildDir: string
  manifest: CloudflareInfraManifest
  onProgress?: (step: string, detail: string) => void
  dispatchNamespace?: string
}

export interface DeployResult {
  success: boolean
  resourcesCreated: string[]
  workersDeployed: string[]
  errors: Array<{ step: string; error: string }>
}

/** Tracks created resource IDs for binding resolution */
interface ResourceIds {
  d1: Map<string, string> // binding name -> database UUID
  queues: Map<string, string> // queue name -> queue ID
  r2: Map<string, string> // binding name -> bucket name
  kv: Map<string, string> // binding name -> namespace ID
}

/**
 * Sanitize a unit name into a valid CF Worker name.
 * CF requires: lowercase, alphanumeric, dashes only.
 */
function toWorkerName(projectId: string, unitName: string): string {
  return `${projectId}-${unitName}`
    .replace(/[/:]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export async function deploy(options: DeployOptions): Promise<DeployResult> {
  const { accountId, apiToken, buildDir, manifest, onProgress, dispatchNamespace } = options
  const client = new CloudflareClient({ accountId, apiToken })
  const log = onProgress ?? (() => {})
  const projectId = manifest.projectId

  const result: DeployResult = {
    success: true,
    resourcesCreated: [],
    workersDeployed: [],
    errors: [],
  }

  const resourceIds: ResourceIds = {
    d1: new Map(),
    queues: new Map(),
    r2: new Map(),
    kv: new Map(),
  }

  // Step 1: Create shared resources in parallel
  log('resources', 'Creating shared resources...')
  await createSharedResources(client, manifest, resourceIds, result, log)

  // Step 2+3: Upload workers — dependency-free first, then those with service bindings
  log('workers', 'Uploading workers...')
  await uploadWorkersInOrder(
    client,
    projectId,
    buildDir,
    manifest,
    resourceIds,
    result,
    log,
    dispatchNamespace
  )

  // Step 4: Wire consumers and cron triggers
  log('wiring', 'Wiring consumers and triggers...')
  await wireConsumersAndTriggers(
    client,
    projectId,
    manifest,
    resourceIds,
    result,
    log
  )

  // Step 5: Enable workers.dev routes
  log('routes', 'Enabling workers.dev routes...')
  await enableWorkersDevRoutes(client, projectId, manifest, result, log)

  result.success = result.errors.length === 0
  return result
}

async function createSharedResources(
  client: CloudflareClient,
  manifest: CloudflareInfraManifest,
  resourceIds: ResourceIds,
  result: DeployResult,
  log: (step: string, detail: string) => void
): Promise<void> {
  const [existingDatabases, existingBuckets, existingQueues] =
    await Promise.all([
      manifest.resources.d1.length > 0
        ? listDatabases(client)
        : Promise.resolve([]),
      manifest.resources.r2.length > 0
        ? listBuckets(client)
        : Promise.resolve([]),
      manifest.resources.queues.length > 0
        ? listQueues(client)
        : Promise.resolve([]),
    ])

  const tasks: Array<Promise<void>> = []

  for (const db of manifest.resources.d1) {
    tasks.push(
      (async () => {
        try {
          const found = existingDatabases.find((d) => d.name === db.name)
          if (found) {
            resourceIds.d1.set(db.binding, found.uuid)
            log('resources', `D1 "${db.name}" exists`)
          } else {
            const created = await createDatabase(client, db.name)
            resourceIds.d1.set(db.binding, created.uuid)
            result.resourcesCreated.push(`d1:${db.name}`)
            log('resources', `Created D1 "${db.name}"`)
          }
        } catch (err) {
          result.errors.push({
            step: `d1:${db.name}`,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    )
  }

  for (const bucket of manifest.resources.r2) {
    tasks.push(
      (async () => {
        try {
          const found = existingBuckets.find((b) => b.name === bucket.name)
          if (found) {
            resourceIds.r2.set(bucket.binding, bucket.name)
            log('resources', `R2 "${bucket.name}" exists`)
          } else {
            await createBucket(client, bucket.name)
            resourceIds.r2.set(bucket.binding, bucket.name)
            result.resourcesCreated.push(`r2:${bucket.name}`)
            log('resources', `Created R2 "${bucket.name}"`)
          }
        } catch (err) {
          result.errors.push({
            step: `r2:${bucket.name}`,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    )
  }

  for (const queue of manifest.resources.queues) {
    tasks.push(
      (async () => {
        try {
          const found = existingQueues.find((q) => q.queue_name === queue.name)
          if (found) {
            resourceIds.queues.set(queue.name, found.queue_id)
            log('resources', `Queue "${queue.name}" exists`)
          } else {
            const created = await createQueue(client, queue.name)
            resourceIds.queues.set(queue.name, created.queue_id)
            result.resourcesCreated.push(`queue:${queue.name}`)
            log('resources', `Created queue "${queue.name}"`)
          }
        } catch (err) {
          result.errors.push({
            step: `queue:${queue.name}`,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    )
  }

  await Promise.all(tasks)
}

function resolveUnitBindings(
  bindings: string[],
  resourceIds: ResourceIds,
  projectId: string
): WorkerBinding[] {
  const resolved: WorkerBinding[] = []

  for (const binding of bindings) {
    const colonIdx = binding.indexOf(':')
    if (colonIdx === -1) continue
    const type = binding.slice(0, colonIdx)
    const name = binding.slice(colonIdx + 1)

    switch (type) {
      case 'd1': {
        const dbId = resourceIds.d1.get(name)
        if (dbId) {
          resolved.push({ type: 'd1', name, id: dbId })
        }
        break
      }
      case 'r2': {
        const bucketName = resourceIds.r2.get(name)
        if (bucketName) {
          resolved.push({ type: 'r2_bucket', name, bucket_name: bucketName })
        }
        break
      }
      case 'queue': {
        const queueFullName = `${projectId}-${name}`
        resolved.push({
          type: 'queue',
          name: name.toUpperCase().replace(/-/g, '_'),
          queue_name: queueFullName,
        })
        break
      }
      case 'service': {
        const workerName = toWorkerName(projectId, name)
        resolved.push({
          type: 'service',
          name: name.toUpperCase().replace(/-/g, '_'),
          service: workerName,
        })
        break
      }
      case 'ai': {
        resolved.push({ type: 'ai', name })
        break
      }
      case 'kv': {
        const nsId = resourceIds.kv.get(name)
        if (nsId) {
          resolved.push({ type: 'kv_namespace', name, namespace_id: nsId })
        }
        break
      }
    }
  }

  return resolved
}

/**
 * Upload workers in dependency order using topological sort.
 * Workers without service bindings go first, then each layer of
 * dependencies is deployed before the workers that depend on them.
 */
async function uploadWorkersInOrder(
  client: CloudflareClient,
  projectId: string,
  buildDir: string,
  manifest: CloudflareInfraManifest,
  resourceIds: ResourceIds,
  result: DeployResult,
  log: (step: string, detail: string) => void,
  dispatchNamespace?: string
): Promise<void> {
  // Build dependency graph: unit -> set of service binding targets
  const deps = new Map<string, Set<string>>()
  for (const [unitName, unitManifest] of Object.entries(manifest.units)) {
    const serviceDeps = new Set<string>()
    for (const b of unitManifest.bindings) {
      if (b.startsWith('service:')) {
        serviceDeps.add(b.slice('service:'.length))
      }
    }
    deps.set(unitName, serviceDeps)
  }

  // Topological sort into layers
  const deployed = new Set<string>()
  const remaining = new Set(deps.keys())
  let phase = 1

  while (remaining.size > 0) {
    // Find units whose deps are all deployed (or have no deps)
    const ready: Array<[string, (typeof manifest.units)[string]]> = []
    for (const unitName of remaining) {
      const unitDeps = deps.get(unitName)!
      const allDepsReady = [...unitDeps].every(
        (d) => deployed.has(d) || !remaining.has(d)
      )
      if (allDepsReady) {
        ready.push([unitName, manifest.units[unitName]])
      }
    }

    if (ready.length === 0) {
      log(
        'workers',
        `Circular dependency detected among: ${[...remaining].join(', ')}`
      )
      for (const unitName of remaining) {
        ready.push([unitName, manifest.units[unitName]])
      }
    }

    log('workers', `Phase ${phase}: ${ready.length} workers...`)
    await deployWorkerBatch(
      client,
      projectId,
      buildDir,
      ready,
      resourceIds,
      result,
      log,
      dispatchNamespace
    )

    for (const [unitName] of ready) {
      deployed.add(unitName)
      remaining.delete(unitName)
    }
    phase++
  }
}

async function deployWorkerBatch(
  client: CloudflareClient,
  projectId: string,
  buildDir: string,
  units: Array<[string, { bindings: string[]; role: string }]>,
  resourceIds: ResourceIds,
  result: DeployResult,
  log: (step: string, detail: string) => void,
  dispatchNamespace?: string
): Promise<void> {
  const tasks = units.map(async ([unitName, unitManifest]) => {
    const workerName = toWorkerName(projectId, unitName)
    const bundlePath = join(buildDir, unitName, 'bundle.js')

    try {
      const script = await readFile(bundlePath, 'utf-8')
      const bindings = resolveUnitBindings(
        unitManifest.bindings,
        resourceIds,
        projectId
      )

      await createWorker(
        client,
        workerName,
        script,
        bindings,
        [],
        undefined,
        dispatchNamespace
      )
      result.workersDeployed.push(workerName)
      log('workers', `Deployed "${workerName}"`)
    } catch (err) {
      result.errors.push({
        step: `worker:${workerName}`,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  await Promise.all(tasks)
}

async function wireConsumersAndTriggers(
  client: CloudflareClient,
  projectId: string,
  manifest: CloudflareInfraManifest,
  resourceIds: ResourceIds,
  result: DeployResult,
  log: (step: string, detail: string) => void
): Promise<void> {
  const tasks: Array<Promise<void>> = []

  // Wire queue consumers
  for (const queue of manifest.resources.queues) {
    const queueId = resourceIds.queues.get(queue.name)
    if (!queueId || !queue.consumer) continue

    const consumerWorkerName = toWorkerName(projectId, queue.consumer)
    tasks.push(
      (async () => {
        try {
          await createConsumer(client, queueId, consumerWorkerName)
          log('wiring', `Queue "${queue.name}" → "${consumerWorkerName}"`)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          // Ignore "already has a consumer" (idempotent) and
          // "worker not found" (consumer worker not deployed yet)
          if (msg.includes('already has a consumer')) {
            log('wiring', `Queue "${queue.name}" consumer already exists`)
          } else if (msg.includes('not exist') || msg.includes('not found')) {
            log(
              'wiring',
              `Queue "${queue.name}" consumer worker not deployed — skipping`
            )
          } else {
            result.errors.push({
              step: `queue-consumer:${queue.name}`,
              error: msg,
            })
          }
        }
      })()
    )
  }

  // Set cron triggers
  for (const cron of manifest.resources.cronTriggers) {
    const workerName = toWorkerName(projectId, cron.worker)
    tasks.push(
      (async () => {
        try {
          await setCronTriggers(client, workerName, [{ cron: cron.schedule }])
          log('wiring', `Cron "${cron.schedule}" → "${workerName}"`)
        } catch (err) {
          result.errors.push({
            step: `cron:${workerName}`,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    )
  }

  await Promise.all(tasks)
}

async function enableWorkersDevRoutes(
  client: CloudflareClient,
  projectId: string,
  manifest: CloudflareInfraManifest,
  result: DeployResult,
  log: (step: string, detail: string) => void
): Promise<void> {
  const tasks = Object.keys(manifest.units).map(async (unitName) => {
    const workerName = toWorkerName(projectId, unitName)
    // Workers with names > 54 chars can't have previews enabled
    const enablePreviews = workerName.length <= 54
    try {
      await client.request(
        'POST',
        `/workers/scripts/${encodeURIComponent(workerName)}/subdomain`,
        { enabled: true, previews_enabled: enablePreviews }
      )
    } catch {
      // Non-fatal — only affects workers.dev route, not service bindings
    }
  })

  await Promise.all(tasks)
  log(
    'routes',
    `Enabled workers.dev for ${Object.keys(manifest.units).length} workers`
  )
}
