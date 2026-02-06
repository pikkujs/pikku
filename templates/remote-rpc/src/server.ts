import { PikkuExpressServer } from '@pikku/express'
import type { DeploymentService } from '@pikku/core'
import { PgDeploymentService } from '@pikku/pg'
import { RedisDeploymentService } from '@pikku/redis'
import postgres from 'postgres'
import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

const PORT = parseInt(process.env.PORT || '3001', 10)
const DEPLOYMENT_BACKEND = process.env.DEPLOYMENT_BACKEND || 'postgres'
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID || `server-${PORT}`

function getPostgresDeploymentService(): {
  deploymentService: DeploymentService
  close: () => Promise<void>
} {
  const sql = postgres(
    process.env.DATABASE_URL ||
      'postgres://postgres:password@localhost:5432/pikku_remote_rpc'
  )
  const deploymentService = new PgDeploymentService(
    { heartbeatInterval: 5000, heartbeatTtl: 15000 },
    sql
  )
  return { deploymentService, close: () => sql.end() }
}

function getRedisDeploymentService(): {
  deploymentService: DeploymentService
  close: () => Promise<void>
} {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  const deploymentService = new RedisDeploymentService(
    { heartbeatInterval: 5000, heartbeatTtl: 15000 },
    redisUrl
  )
  return { deploymentService, close: () => Promise.resolve() }
}

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    const { deploymentService, close } =
      DEPLOYMENT_BACKEND === 'redis'
        ? getRedisDeploymentService()
        : getPostgresDeploymentService()

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
      `Deployment registered: ${DEPLOYMENT_ID} (${DEPLOYMENT_BACKEND})`
    )

    process.on('SIGTERM', async () => {
      singletonServices.logger.info('Shutting down...')
      await deploymentService.stop()
      await close()
      process.exit(0)
    })
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
