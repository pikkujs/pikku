import { PikkuExpressServer } from '@pikku/express'
import { RedisDeploymentService } from '@pikku/redis'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { JoseJWTService } from '@pikku/jose'
import {
  createConfig,
  createSingletonServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

const PORT = parseInt(process.env.PORT || '3001', 10)
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID || `server-${PORT}`

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    const variables = new LocalVariablesService({
      PIKKU_REMOTE_SECRET: 'dev-remote-secret-at-least-32-characters-long',
    })
    const secrets = new LocalSecretService(variables)
    const jwt = new JoseJWTService(async () => [
      {
        id: 'remote-key',
        value: 'dev-remote-secret-at-least-32-characters-long',
      },
    ])
    await jwt.init()

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    const deploymentService = new RedisDeploymentService(
      { heartbeatInterval: 5000, heartbeatTtl: 15000 },
      redisUrl,
      'pikku',
      jwt,
      secrets
    )

    await deploymentService.init()

    const singletonServices = await createSingletonServices(config, {
      secrets,
      jwt,
      deploymentService,
    })

    const appServer = new PikkuExpressServer(
      { ...config, port: PORT, hostname: 'localhost' },
      singletonServices.logger
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
