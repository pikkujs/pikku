import '../../functions/.pikku/pikku-bootstrap.gen.js'

import { runFetch, runScheduled } from '@pikku/cloudflare'
import { setupServices } from './setup-services.js'
import { ExportedHandler, Response } from '@cloudflare/workers-types'
export { WebSocketHibernationServer } from './websocket-hibernation-server.js'

export default {
  async scheduled(controller, env) {
    await setupServices(env)
    await runScheduled(controller)
  },

  async fetch(request, env): Promise<Response> {
    const singletonServices = await setupServices(env)
    const websocketServerDurableObject: any = singletonServices.variables.get(
      'WEBSOCKET_HIBERNATION_SERVER'
    )
    const id = websocketServerDurableObject.idFromName('channel-name-goes-here')
    const webSocketHibernationServer = websocketServerDurableObject.get(id)
    return await runFetch(
      request as unknown as Request,
      webSocketHibernationServer
    )
  },
} satisfies ExportedHandler<Record<string, string>>
