import { runFetch, runScheduled } from '@pikku/cloudflare'
import { setupServices } from './setup-services.js'
import { ExportedHandler, Response } from '@cloudflare/workers-types'
import { createWireServices } from '../../functions/src/services.js'
import '#pikku/pikku-bootstrap.gen.js'

export default {
  async scheduled(controller, env) {
    const singletonServices = await setupServices(env)
    await runScheduled(controller, singletonServices)
  },

  async fetch(request, env): Promise<Response> {
    const singletonServices = await setupServices(env)
    return await runFetch(
      request as unknown as Request,
      singletonServices,
      createWireServices
    )
  },
} satisfies ExportedHandler<Record<string, string>>
