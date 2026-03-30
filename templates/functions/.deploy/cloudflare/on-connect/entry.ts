// Generated entry for "on-connect" (function)
import { createCloudflareHandler } from '@pikku/cloudflare'
import type { CloudflareEnv } from '@pikku/cloudflare'
import {
  CloudflareQueueService,
  CloudflareWorkflowService,
  CloudflareAIStorageService,
  CloudflareAgentRunService,
  CloudflareAIRunStateService,
} from '@pikku/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { ConsoleLogger } from '@pikku/core/services'
import { createConfig } from '../../../src/services.js'
import { createSingletonServices } from '../../../src/services.js'
import type { SingletonServices } from '../../../types/application-types.d.js'
import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'
import './.pikku/pikku-bootstrap.gen.js'

const createPlatformServices = async (
  env: CloudflareEnv
): Promise<Partial<SingletonServices>> => {
  const services: Partial<SingletonServices> = {}
  const logger = new ConsoleLogger()
  services.logger = logger
  services.schema = new CFWorkerSchemaService(logger)
  if (requiredSingletonServices.queueService) {
    services.queueService = new CloudflareQueueService(env)
  }
  if (requiredSingletonServices.workflowService && env.WORKFLOW_DB) {
    const workflowService = new CloudflareWorkflowService(
      env.WORKFLOW_DB as D1Database
    )
    await workflowService.init()
    services.workflowService = workflowService
  }
  if (requiredSingletonServices.aiStorage && env.DB) {
    const db = env.DB as D1Database
    const aiStorage = new CloudflareAIStorageService(db)
    await aiStorage.init()
    services.aiStorage = aiStorage
    services.agentRunService = new CloudflareAgentRunService(db)
    const aiRunState = new CloudflareAIRunStateService(db)
    await aiRunState.init()
    services.aiRunState = aiRunState
  }
  return services
}

export default createCloudflareHandler(
  {
    createConfig: createConfig,
    createSingletonServices: createSingletonServices,
    createPlatformServices,
  },
  ['fetch']
)
