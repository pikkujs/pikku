/**
 * Azure Functions specific types for the deploy adapter.
 */

export interface AzureInfraManifest {
  projectId: string
  resources: {
    storageQueues: AzureQueueResource[]
    blobContainers: AzureBlobResource[]
    timerTriggers: AzureTimerResource[]
    webPubSub: AzureWebPubSubResource[]
  }
  secrets: Array<{ id: string; displayName: string; description?: string }>
  variables: Array<{ id: string; displayName: string; description?: string }>
  units: Record<string, AzureUnitManifest>
}

export interface AzureQueueResource {
  name: string
  consumerUnit: string
}

export interface AzureBlobResource {
  name: string
  binding: string
}

export interface AzureTimerResource {
  unit: string
  schedule: string
  name: string
}

export interface AzureWebPubSubResource {
  unit: string
}

export interface AzureUnitManifest {
  role: string
  handlerTypes: string[]
  routes: Array<{ method: string; route: string }>
  capabilities: string[]
  dependsOn: string[]
}
