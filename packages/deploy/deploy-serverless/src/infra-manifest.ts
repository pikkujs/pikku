/**
 * Generates an AWS-specific infrastructure manifest from a provider-agnostic
 * DeploymentManifest.
 *
 * Describes all AWS resources the project needs: SQS queues, S3 buckets,
 * EventBridge rules, WebSocket APIs. The serverless.yml generator reads
 * this to produce CloudFormation resources.
 */

import type {
  ServerlessInfraManifest,
  ServerlessUnitManifest,
} from './types.js'

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
): ServerlessInfraManifest {
  const projectId = manifest.projectId

  // SQS queues — one per explicit queue definition
  const sqsQueues: ServerlessInfraManifest['resources']['sqsQueues'] = []
  for (const q of manifest.queues) {
    sqsQueues.push({
      name: `${projectId}-${q.name}`,
      logicalName: toPascalCase(q.name),
      consumerUnit: q.consumerUnit,
    })
  }

  // S3 buckets — if any unit needs object-storage
  const needsStorage = manifest.units.some((u) =>
    u.services.some((s) => s.capability === 'object-storage')
  )
  const s3Buckets: ServerlessInfraManifest['resources']['s3Buckets'] =
    needsStorage ? [{ name: `${projectId}-storage`, binding: 'STORAGE' }] : []

  // EventBridge rules — from unit scheduled handlers
  const eventBridgeRules: ServerlessInfraManifest['resources']['eventBridgeRules'] =
    []
  for (const unit of manifest.units) {
    for (const handler of unit.handlers) {
      if (handler.type === 'scheduled') {
        eventBridgeRules.push({
          unit: unit.name,
          schedule: handler.schedule,
          name: handler.taskName,
        })
      }
    }
  }

  // WebSocket APIs — one per channel unit
  const websocketApis: ServerlessInfraManifest['resources']['websocketApis'] =
    []
  for (const unit of manifest.units) {
    if (unit.role === 'channel') {
      websocketApis.push({ unit: unit.name })
    }
  }

  // Per-unit manifest
  const units: Record<string, ServerlessUnitManifest> = {}
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
      sqsQueues,
      s3Buckets,
      eventBridgeRules,
      websocketApis,
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

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}
