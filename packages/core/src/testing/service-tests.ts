import type { ChannelStore } from '../wirings/channel/channel-store.js'
import type { EventHubStore } from '../wirings/channel/eventhub-store.js'
import type { PikkuWorkflowService } from '../wirings/workflow/pikku-workflow-service.js'
import type { WorkflowRunService } from '../wirings/workflow/workflow.types.js'
import type { DeploymentService } from '../services/deployment-service.js'
import type { AIStorageService } from '../services/ai-storage-service.js'
import type { AIRunStateService } from '../services/ai-run-state-service.js'
import type { SecretService } from '../services/secret-service.js'
import type { CredentialService } from '../services/credential-service.js'
import type { AgentRunService } from '../wirings/ai-agent/ai-agent.types.js'
import type { SessionStore } from '../services/session-store.js'

export interface ServiceTestConfig {
  name: string
  services: {
    channelStore?: () => Promise<ChannelStore>
    eventHubStore?: () => Promise<EventHubStore<Record<string, any>>>
    workflowService?: () => Promise<PikkuWorkflowService>
    workflowRunService?: () => Promise<WorkflowRunService>
    deploymentService?: () => Promise<
      DeploymentService & { stop(): Promise<void> }
    >
    aiStorageService?: () => Promise<AIStorageService & AIRunStateService>
    agentRunService?: () => Promise<AgentRunService>
    secretService?: (config: {
      key: string
      keyVersion?: number
      previousKey?: string
    }) => Promise<SecretService & { rotateKEK?(): Promise<number> }>
    credentialService?: (config: {
      key: string
      keyVersion?: number
      previousKey?: string
    }) => Promise<CredentialService & { rotateKEK?(): Promise<number> }>
    sessionStore?: () => Promise<SessionStore>
  }
}

import { defineChannelStoreTests } from './service-tests/channel-store-tests.js'
import { defineEventHubStoreTests } from './service-tests/event-hub-store-tests.js'
import { defineWorkflowServiceTests } from './service-tests/workflow-service-tests.js'
import { defineWorkflowRunServiceTests } from './service-tests/workflow-run-service-tests.js'
import { defineAiStorageServiceTests } from './service-tests/ai-storage-service-tests.js'
import { defineDeploymentServiceTests } from './service-tests/deployment-service-tests.js'
import { defineSecretServiceTests } from './service-tests/secret-service-tests.js'
import { defineCredentialServiceTests } from './service-tests/credential-service-tests.js'
import { defineAgentRunServiceTests } from './service-tests/agent-run-service-tests.js'
import { defineSessionStoreTests } from './service-tests/session-store-tests.js'

/**
 * The shared conformance suite every storage backend runs.
 *
 * One module per service so a backend author can read the contract for the one
 * they implement; this dispatches to whichever the caller supplied.
 */
export function defineServiceTests(config: ServiceTestConfig): void {
  const { name, services } = config

  if (services.channelStore) {
    defineChannelStoreTests(name, services.channelStore)
  }
  if (services.eventHubStore) {
    defineEventHubStoreTests(name, services.eventHubStore)
  }
  if (services.workflowService) {
    defineWorkflowServiceTests(name, services.workflowService)
  }
  if (services.workflowRunService) {
    defineWorkflowRunServiceTests(name, services.workflowRunService)
  }
  if (services.aiStorageService) {
    defineAiStorageServiceTests(name, services.aiStorageService)
  }
  if (services.deploymentService) {
    defineDeploymentServiceTests(name, services.deploymentService)
  }
  if (services.secretService) {
    defineSecretServiceTests(name, services.secretService)
  }
  if (services.credentialService) {
    defineCredentialServiceTests(name, services.credentialService)
  }
  if (services.agentRunService) {
    defineAgentRunServiceTests(
      name,
      services.agentRunService,
      services.aiStorageService
    )
  }
  if (services.sessionStore) {
    defineSessionStoreTests(name, services.sessionStore)
  }
}
