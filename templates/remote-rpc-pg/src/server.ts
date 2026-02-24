import { PikkuExpressServer } from '@pikku/express'
import { PgDeploymentService } from '@pikku/pg'
import postgres from 'postgres'
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

    const sql = postgres(
      process.env.DATABASE_URL ||
        'postgres://postgres:password@localhost:5432/pikku_remote_rpc'
    )
    const deploymentService = new PgDeploymentService(
      { heartbeatInterval: 5000, heartbeatTtl: 15000 },
      sql
    )

    await deploymentService.init()

    const singletonServices = await createSingletonServices(config, {
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
      await sql.end()
      process.exit(0)
    })
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
