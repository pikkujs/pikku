import { PikkuExpressServer } from '@pikku/express'
import { RedisDeploymentService } from '@pikku/redis'
import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

const PORT = parseInt(process.env.PORT || '3001', 10)
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID || `server-${PORT}`

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    const deploymentService = new RedisDeploymentService(
      { heartbeatInterval: 5000, heartbeatTtl: 15000 },
      redisUrl
    )

    await deploymentService.init()

    const singletonServices = await createSingletonServices(config, {
      deploymentService,
    })

    const appServer = new PikkuExpressServer(
      { ...config, port: PORT, hostname: 'localhost' },
      singletonServices,
      createWireServices
    )
    appServer.enableExitOnSigInt()
    await appServer.init()
    await appServer.start()

    await deploymentService.start({
      deploymentId: DEPLOYMENT_ID,
      endpoint: `http://localhost:${PORT}`,
    })

    singletonServices.logger.info(
      `Deployment registered: ${DEPLOYMENT_ID} (redis)`
    )

    process.on('SIGTERM', async () => {
      singletonServices.logger.info('Shutting down...')
      await deploymentService.stop()
      process.exit(0)
    })
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
