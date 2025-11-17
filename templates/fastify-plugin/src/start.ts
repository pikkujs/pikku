import Fastify from 'fastify'
import '../../functions/.pikku/pikku-bootstrap.gen.js'
import {
  createInteractionServices,
  createSingletonServices,
  createConfig,
} from '../../functions/src/services.js'
import { PikkuTaskScheduler } from '@pikku/schedule'
import pikkuFastifyPlugin from '@pikku/fastify-plugin'

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)
  const app = Fastify({})

  app.get('/health-check', async () => ({ status: 'ok' }))

  app.register(pikkuFastifyPlugin, {
    pikku: {
      singletonServices,
      createInteractionServices,
    },
  })

  await app.listen({ port: 4002, host: 'localhost' })
  singletonServices.logger.info(`server started`)

  const scheduler = new PikkuTaskScheduler(singletonServices)
  scheduler.startAll()
}

main()
