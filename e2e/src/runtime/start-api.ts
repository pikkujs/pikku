import { createFunctionRunner, stopSingletonServices } from '@pikku/core'
import { PikkuExpressServer } from '@pikku/express'
import {
  createConfig,
  createInfrastructure,
  createSingletonServices,
  createWireServices,
} from '../services.js'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const port = Number(process.env.E2E_HTTP_PORT || 4210)
const hostname = process.env.E2E_HTTP_HOST || '127.0.0.1'
const generatedDir = process.env.E2E_GENERATED_DIR || '.pikku'

async function main(): Promise<void> {
  const bootstrapPath = path.resolve(generatedDir, 'pikku-bootstrap.gen.js')
  await import(pathToFileURL(bootstrapPath).href)

  const config = await createConfig()
  const infrastructure = await createInfrastructure()
  const queueService = infrastructure.queueService as any
  const singletonServices = await createSingletonServices(config, {
    queueService,
  })
  const schedulerService = infrastructure.createSchedulerService?.(
    singletonServices.logger
  )
  const workflowService = infrastructure.createWorkflowService?.({
    logger: singletonServices.logger,
    queueService,
    schedulerService,
    workflow: config.workflow,
  })
  await workflowService?.init?.()
  singletonServices.workflowService = workflowService as any
  singletonServices.schedulerService = schedulerService as any
  const runFunction = createFunctionRunner(
    singletonServices,
    createWireServices
  )

  schedulerService?.setPikkuFunctionRunner(runFunction)
  workflowService?.setPikkuFunctionRunner(runFunction)

  const appServer = new PikkuExpressServer(
    { ...config, port, hostname },
    singletonServices,
    createWireServices
  )
  appServer.enableExitOnSigInt()
  await appServer.init()
  await appServer.start()

  singletonServices.logger.info(`E2E_API_READY http://${hostname}:${port}`)

  const shutdown = async () => {
    await infrastructure.close()
    await stopSingletonServices(singletonServices)
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
