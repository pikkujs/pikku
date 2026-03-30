/**
 * Resolves abstract ServiceCapability requirements into concrete
 * Cloudflare WorkerBinding[] for the script upload API.
 *
 * This is the API-side equivalent of the wrangler.toml generator —
 * same capability-to-resource mapping, different output format.
 */

import type { WorkerBinding } from './types.js'

export interface ResourceState {
  d1DatabaseId: string | null
  d1DatabaseName: string
  r2BucketName: string
  kvNamespaceId: string | null
  queueNames: Map<string, string>
}

export interface DeploymentUnit {
  name: string
  role: string
  services: Array<{ capability: string; sourceServiceName: string }>
}

export interface QueueDefinition {
  name: string
  consumerUnit: string
}

export interface ScheduledTaskDefinition {
  name: string
  schedule: string
  unitName: string
}

export function resolveBindings(
  unit: DeploymentUnit,
  queues: QueueDefinition[],
  resources: ResourceState
): WorkerBinding[] {
  const bindings: WorkerBinding[] = []
  const capabilities = new Set(unit.services.map((s) => s.capability))

  if (capabilities.has('database') && resources.d1DatabaseId) {
    bindings.push({
      type: 'd1',
      name: 'DB',
      id: resources.d1DatabaseId,
    })
  }

  if (capabilities.has('object-storage')) {
    bindings.push({
      type: 'r2_bucket',
      name: 'STORAGE',
      bucket_name: resources.r2BucketName,
    })
  }

  if (capabilities.has('kv') && resources.kvNamespaceId) {
    bindings.push({
      type: 'plain_text',
      name: 'KV_NAMESPACE_ID',
      text: resources.kvNamespaceId,
    })
  }

  // Queue producer bindings
  if (capabilities.has('queue')) {
    for (const queue of queues) {
      const queueName = resources.queueNames.get(queue.name) ?? queue.name
      bindings.push({
        type: 'queue',
        name: toScreamingSnake(queue.name),
        queue_name: queueName,
      })
    }
  }

  return bindings
}

function toScreamingSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase()
}
