import { PikkuExpressServer } from '@pikku/express'
import { PikkuKysely, PgKyselyDeploymentService } from '@pikku/kysely-postgres'
import type { KyselyPikkuDB } from '@pikku/kysely-postgres'
import { ConsoleLogger } from '@pikku/core/services'
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

    const pikkuKysely = new PikkuKysely<KyselyPikkuDB>(logger,
      process.env.DATABASE_URL ||
        'postgres://postgres:password@localhost:5432/pikku_remote_rpc'
    )
    await pikkuKysely.init()
    const deploymentService = new PgKyselyDeploymentService(
      { heartbeatInterval: 5000, heartbeatTtl: 15000 },
      pikkuKysely.kysely
    )

    await deploymentService.init()

    const singletonServices = await createSingletonServices(config, {
      logger,
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
