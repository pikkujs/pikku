import { PikkuExpressServer } from '@pikku/express'
import { PikkuKysely, PgKyselyDeploymentService } from '@pikku/kysely-postgres'
import type { KyselyPikkuDB } from '@pikku/kysely-postgres'
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
    const logger = new ConsoleLogger()

    const pikkuKysely = new PikkuKysely<KyselyPikkuDB>(
      logger,
      process.env.DATABASE_URL ||
        'postgres://postgres:password@localhost:5432/pikku_remote_rpc'
    )
    await pikkuKysely.init()
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

    const deploymentService = new PgKyselyDeploymentService(
      { heartbeatInterval: 5000, heartbeatTtl: 15000 },
      pikkuKysely.kysely,
      jwt,
      secrets
    )

    await deploymentService.init()

    const singletonServices = await createSingletonServices(config, {
      logger,
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
      `Deployment registered: ${DEPLOYMENT_ID} (postgres)`
    )

    process.on('SIGTERM', async () => {
      singletonServices.logger.info('Shutting down...')
      await deploymentService.stop()
      await pikkuKysely.close()
      process.exit(0)
    })
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
