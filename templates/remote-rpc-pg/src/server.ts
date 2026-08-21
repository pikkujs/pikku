import { PikkuExpressServer } from '@pikku/express'
import { PikkuKysely, PgKyselyDeploymentService } from '@pikku/kysely-postgres'
import type { KyselyPikkuDB } from '@pikku/kysely-postgres'
import { ConsoleLogger } from '@pikku/core/services'
import { createSingletonServices } from '../../functions/src/services.js'
import { createConfig, connectionString } from './config.js'
import '#pikku/pikku-bootstrap.gen.js'

const PORT = parseInt(process.env.PORT || '3001', 10)
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID || `server-${PORT}`

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const logger = new ConsoleLogger()

    const pikkuKysely = new PikkuKysely<KyselyPikkuDB>(logger, connectionString)
    await pikkuKysely.init()

    // Create singleton services first to get jwt + secrets
    const singletonServices = await createSingletonServices(config, {
      logger,
    })

    const deploymentService = new PgKyselyDeploymentService(
      { heartbeatInterval: 5000, heartbeatTtl: 15000 },
      pikkuKysely.kysely,
      singletonServices.jwt,
      singletonServices.secrets
    )

    await deploymentService.init()

    // Re-create with deploymentService included
    const services = await createSingletonServices(config, {
      ...singletonServices,
      deploymentService,
    })

    const appServer = new PikkuExpressServer(
      { ...config, port: PORT, hostname: 'localhost' },
      services.logger
    )
    appServer.enableExitOnSigInt()
    await appServer.init()
    await appServer.start()

    await deploymentService.start({
      deploymentId: DEPLOYMENT_ID,
      endpoint: `http://localhost:${PORT}`,
    })

    services.logger.info(`Deployment registered: ${DEPLOYMENT_ID} (postgres)`)

    process.on('SIGTERM', async () => {
      services.logger.info('Shutting down...')
      await deploymentService.stop()
      await pikkuKysely.close()
      process.exit(0)
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.toString() : String(e)
    console.error(msg)
    process.exit(1)
  }
}

main()
