import '#pikku/pikku-bootstrap.gen.js'
import {
  createWireServices,
  createSingletonServices,
  createConfig,
} from '../../functions/src/services.js'
import { PikkuTaskScheduler } from '@pikku/schedule'
import express from 'express'
import { pikkuExpressMiddleware } from '@pikku/express-middleware'

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)
  const app = express()

  app.use(express.json())

  app.use(
    pikkuExpressMiddleware(singletonServices, createWireServices, {
      logRoutes: true,
    })
  )

  app.listen(4002, 'localhost', () =>
    singletonServices.logger.info(`server started`)
  )

  const scheduler = new PikkuTaskScheduler(singletonServices)
  scheduler.startAll()
}

main()
