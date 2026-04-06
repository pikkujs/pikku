/**
 * Generates an Azure-specific infrastructure manifest from a provider-agnostic
 * DeploymentManifest.
 */

import type { AzureInfraManifest, AzureUnitManifest } from './types.js'

type DeploymentHandler =
  | {
      type: 'fetch'
      routes: Array<{ method: string; route: string; pikkuFuncId: string }>
    }
  | { type: 'queue'; queueName: string }
  | { type: 'scheduled'; schedule: string; taskName: string }

interface DeploymentUnit {
  name: string
  role: string
  functionIds: string[]
  services: Array<{ capability: string; sourceServiceName: string }>
  dependsOn: string[]
  handlers: DeploymentHandler[]
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

export function generateInfraManifest(
  manifest: DeploymentManifest
): AzureInfraManifest {
  const projectId = manifest.projectId

  // Storage queues
  const storageQueues: AzureInfraManifest['resources']['storageQueues'] = []
  for (const q of manifest.queues) {
    storageQueues.push({
      name: q.name,
      consumerUnit: q.consumerUnit,
    })
  }

  // Blob containers — if any unit needs object-storage
  const needsStorage = manifest.units.some((u) =>
    u.services.some((s) => s.capability === 'object-storage')
  )
  const blobContainers: AzureInfraManifest['resources']['blobContainers'] =
    needsStorage ? [{ name: `${projectId}-storage`, binding: 'STORAGE' }] : []

  // Timer triggers
  const timerTriggers: AzureInfraManifest['resources']['timerTriggers'] = []
  for (const unit of manifest.units) {
    for (const handler of unit.handlers) {
      if (handler.type === 'scheduled') {
        timerTriggers.push({
          unit: unit.name,
          schedule: handler.schedule,
          name: handler.taskName,
        })
      }
    }
  }

  // Web PubSub — one per channel unit
  const webPubSub: AzureInfraManifest['resources']['webPubSub'] = []
  for (const unit of manifest.units) {
    if (unit.role === 'channel') {
      webPubSub.push({ unit: unit.name })
    }
  }

  // Per-unit manifest
  const units: Record<string, AzureUnitManifest> = {}
  for (const unit of manifest.units) {
    const capabilities = unit.services.map((s) => s.capability)

    const routes: Array<{ method: string; route: string }> = []
    for (const handler of unit.handlers) {
      if (handler.type === 'fetch') {
        for (const r of handler.routes) {
          routes.push({ method: r.method, route: r.route })
        }
      }
    }

    const handlerTypes = [...new Set(unit.handlers.map((h) => h.type))]

    units[unit.name] = {
      role: unit.role,
      handlerTypes,
      routes,
      capabilities,
      dependsOn: unit.dependsOn,
    }
  }

  return {
    projectId,
    resources: {
      storageQueues,
      blobContainers,
      timerTriggers,
      webPubSub,
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
