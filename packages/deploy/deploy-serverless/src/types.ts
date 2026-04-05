/**
 * AWS / Serverless Framework specific types for the deploy adapter.
 */

export interface ServerlessInfraManifest {
  projectId: string
  resources: {
    sqsQueues: SQSQueueResource[]
    s3Buckets: S3BucketResource[]
    eventBridgeRules: EventBridgeRuleResource[]
    websocketApis: WebSocketApiResource[]
  }
  secrets: Array<{ id: string; displayName: string; description?: string }>
  variables: Array<{ id: string; displayName: string; description?: string }>
  units: Record<string, ServerlessUnitManifest>
}

export interface SQSQueueResource {
  name: string
  logicalName: string
  consumerUnit: string
}

export interface S3BucketResource {
  name: string
  binding: string
}

export interface EventBridgeRuleResource {
  unit: string
  schedule: string
  name: string
}

export interface WebSocketApiResource {
  unit: string
}

export interface ServerlessUnitManifest {
  role: string
  handlerTypes: string[]
  routes: Array<{ method: string; route: string }>
  capabilities: string[]
  dependsOn: string[]
}
