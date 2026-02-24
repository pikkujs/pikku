import { runFetch, runScheduled } from '@pikku/cloudflare'
import { setupServices } from './setup-services.js'
import { ExportedHandler, Response } from '@cloudflare/workers-types'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

export default {
  async scheduled(controller, env) {
    await setupServices(env)
    await runScheduled(controller)
  },

  async fetch(request, env): Promise<Response> {
    await setupServices(env)
    return await runFetch(request as unknown as Request)
  },
} satisfies ExportedHandler<Record<string, string>>
