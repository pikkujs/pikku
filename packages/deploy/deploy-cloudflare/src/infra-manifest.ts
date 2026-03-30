/**
 * Generates a Cloudflare-specific infrastructure manifest (infra.json)
 * from a provider-agnostic DeploymentManifest.
 *
 * This file describes all the resources the project needs — queues, D1,
 * R2, cron triggers, durable objects, etc. The deploy orchestrator reads
 * it and provisions everything in order.
 */

interface DeploymentUnit {
  name: string
  role: string
  functionIds: string[]
  services: Array<{ capability: string; sourceServiceName: string }>
  httpRoutes: Array<{ method: string; route: string }>
  tags: string[]
}

interface DeploymentManifest {
  projectId: string
  units: DeploymentUnit[]
  queues: Array<{
    name: string
    consumerUnit: string
    consumerFunctionId: string
  }>
  scheduledTasks: Array<{
    name: string
    schedule: string
    unitName: string
    functionId: string
  }>
  channels: Array<{ name: string; route: string; unitName: string }>
  agents: Array<{ name: string; unitName: string; model: string }>
  mcpEndpoints: Array<{ unitName: string }>
  workflows: Array<{ name: string; orchestratorUnit: string }>
  secrets: Array<{
    secretId: string
    displayName: string
    description?: string
  }>
  variables: Array<{
    variableId: string
    displayName: string
    description?: string
  }>
}

export interface CloudflareInfraManifest {
  projectId: string
  resources: {
    d1: Array<{ name: string; binding: string }>
    r2: Array<{ name: string; binding: string }>
    kv: Array<{ name: string; binding: string }>
    queues: Array<{ name: string; consumer: string }>
    cronTriggers: Array<{ worker: string; schedule: string; name: string }>
    durableObjects: Array<{
      worker: string
      className: string
      binding: string
    }>
  }
  secrets: Array<{ id: string; displayName: string; description?: string }>
  variables: Array<{ id: string; displayName: string; description?: string }>
  units: Record<string, CloudflareUnitManifest>
}

export interface CloudflareUnitManifest {
  role: string
  bindings: string[]
  routes: Array<{ method: string; route: string }>
}

export function generateInfraManifest(
  manifest: DeploymentManifest
): CloudflareInfraManifest {
  const projectId = manifest.projectId

  // Collect unique resource requirements across all units
  const needsDatabase = manifest.units.some((u) =>
    u.services.some((s) => s.capability === 'database')
  )
  const needsWorkflowState = manifest.units.some((u) =>
    u.services.some((s) => s.capability === 'workflow-state')
  )
  const needsR2 = manifest.units.some((u) =>
    u.services.some((s) => s.capability === 'object-storage')
  )
  const needsKV = manifest.units.some((u) =>
    u.services.some((s) => s.capability === 'kv')
  )

  // D1 databases — user data + workflow state (separate DBs)
  const d1: CloudflareInfraManifest['resources']['d1'] = []
  if (needsDatabase) {
    d1.push({ name: `${projectId}-db`, binding: 'DB' })
  }
  if (needsWorkflowState) {
    d1.push({ name: `${projectId}-workflow-db`, binding: 'WORKFLOW_DB' })
  }

  const r2: CloudflareInfraManifest['resources']['r2'] = needsR2
    ? [{ name: `${projectId}-storage`, binding: 'STORAGE' }]
    : []

  const kv: CloudflareInfraManifest['resources']['kv'] = needsKV
    ? [{ name: `${projectId}-kv`, binding: 'KV' }]
    : []

  // Queues — explicit (from wireQueueWorker) + implicit (single workflow dispatch queue)
  const queues: CloudflareInfraManifest['resources']['queues'] = []

  // Explicit queues
  for (const q of manifest.queues) {
    queues.push({
      name: `${projectId}-${q.name}`,
      consumer: q.consumerUnit,
    })
  }

  // Single shared workflow dispatch queue — messages include workflow/step name
  // for routing. Consumer is a workflow dispatcher worker.
  if (manifest.workflows.length > 0) {
    queues.push({
      name: `${projectId}-workflow-dispatch`,
      consumer: 'workflow-dispatcher',
    })
  }

  // Cron triggers
  const cronTriggers = manifest.scheduledTasks.map((t) => ({
    worker: t.unitName,
    schedule: t.schedule,
    name: t.name,
  }))

  // Durable objects (channels need WebSocket hibernation, workflows need state)
  const durableObjects: CloudflareInfraManifest['resources']['durableObjects'] =
    []

  for (const channel of manifest.channels) {
    durableObjects.push({
      worker: channel.unitName,
      className: 'WebSocketHibernationServer',
      binding: 'WEBSOCKET_HIBERNATION_SERVER',
    })
  }

  for (const unit of manifest.units) {
    if (
      unit.role === 'workflow-orchestrator' &&
      unit.services.some((s) => s.capability === 'workflow-state')
    ) {
      durableObjects.push({
        worker: unit.name,
        className: 'WorkflowState',
        binding: 'WORKFLOW_STATE',
      })
    }
  }

  // Per-unit binding summary
  const units: Record<string, CloudflareUnitManifest> = {}
  for (const unit of manifest.units) {
    const bindings: string[] = []
    const capabilities = new Set(unit.services.map((s) => s.capability))

    if (capabilities.has('database')) bindings.push('d1:DB')
    if (capabilities.has('workflow-state')) bindings.push('d1:WORKFLOW_DB')
    if (capabilities.has('object-storage')) bindings.push('r2:STORAGE')
    if (capabilities.has('kv')) bindings.push('kv:KV')
    if (capabilities.has('queue')) {
      for (const q of manifest.queues) {
        bindings.push(`queue:${q.name}`)
      }
      if (manifest.workflows.length > 0) {
        bindings.push('queue:workflow-dispatch')
      }
    }
    if (capabilities.has('ai-model')) bindings.push('ai:AI')

    units[unit.name] = {
      role: unit.role,
      bindings,
      routes: unit.httpRoutes.map((r) => ({
        method: r.method,
        route: r.route,
      })),
    }
  }

  return {
    projectId,
    resources: {
      d1,
      r2,
      kv,
      queues,
      cronTriggers,
      durableObjects,
    },
    secrets: manifest.secrets.map((s) => ({
      id: s.secretId,
      displayName: s.displayName,
      description: s.description,
    })),
    variables: manifest.variables.map((v) => ({
      id: v.variableId,
      displayName: v.displayName,
      description: v.description,
    })),
    units,
  }
}
