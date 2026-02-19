import Fastify from 'fastify'
import '../../functions/.pikku/pikku-bootstrap.gen.js'
import {
  createWireServices,
  createSingletonServices,
  createConfig,
} from '../../functions/src/services.js'
import { InMemorySchedulerService } from '@pikku/schedule'
import { createFunctionRunner } from '@pikku/core'
import pikkuFastifyPlugin from '@pikku/fastify-plugin'

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)
  const app = Fastify({})

  app.get('/health-check', async () => ({ status: 'ok' }))

  app.register(pikkuFastifyPlugin, {
    pikku: {
      singletonServices,
      createWireServices,
    },
  })

  await app.listen({ port: 4002, host: 'localhost' })
  singletonServices.logger.info(`server started`)

  const scheduler = new InMemorySchedulerService(singletonServices.logger)
  scheduler.setPikkuFunctionRunner(
    createFunctionRunner(singletonServices, createWireServices)
  )
  await scheduler.start()
}

main()
