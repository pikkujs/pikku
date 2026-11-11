import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import { buildMeshHeaders } from '@pikku/core/mesh'
import { fetch } from '@pikku/core/http'
import {
  ConsoleLogger,
  InMemoryLeaseService,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import type { DeploymentService } from '@pikku/core/services'
import { InMemoryQueueService } from '@pikku/core/services/in-memory-queue'
import { InMemoryWorkflowService } from '@pikku/core/services/in-memory-workflow'
import { RecordingTracer } from '@pikku/core/testing'
import { JoseJWTService } from '@pikku/jose'
import { InMemorySchedulerService } from '@pikku/schedule'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const SIGNING_KEY = 'tracing-verifier-signing-key'

/** Every span the runner records while the verifier runs. */
export const tracer = new RecordingTracer()

export const createConfig = pikkuConfig(async () => ({}))

export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const secrets =
      existingServices?.secrets || new LocalSecretService(variables)
    const logger = existingServices?.logger || new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)
    const jwt = new JoseJWTService(
      async () => [{ id: 'tracing', value: SIGNING_KEY }],
      logger
    )
    await jwt.init()
    const queueService =
      existingServices?.queueService || new InMemoryQueueService()
    const workflowService = new InMemoryWorkflowService()

    /**
     * The mesh hop over the app's real route: the signed headers a deployment
     * service sends, into the generated `/mesh/rpc/:rpcName` wire.
     */
    const deploymentService: DeploymentService =
      existingServices?.deploymentService ?? {
        init: async () => {},
        start: async () => {},
        stop: async () => {},
        invoke: async (funcName, data, session, traceparent) => {
          const headers = await buildMeshHeaders(
            jwt,
            secrets,
            funcName,
            session,
            traceparent
          )
          const response = await fetch(
            new Request(`http://localhost/mesh/rpc/${funcName}`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ rpcName: funcName, data }),
            })
          )
          return await response.json()
        },
      }

    return {
      config,
      secrets,
      logger,
      tracer,
      variables,
      schema,
      jwt,
      queueService,
      deploymentService,
      leaseService:
        existingServices?.leaseService || new InMemoryLeaseService(),
      schedulerService:
        existingServices?.schedulerService || new InMemorySchedulerService(),
      workflowService,
      workflowRunService: workflowService,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => ({}))
