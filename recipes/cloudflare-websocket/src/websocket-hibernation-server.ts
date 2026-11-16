import { CloudflareWebSocketHibernationServer } from '@pikku/cloudflare'
import { setupServices } from './setup-services.js'
import type { SingletonServices } from '../../functions/types/application-types.d.js'
import { createWireServices } from '../../functions/src/services.js'

export class WebSocketHibernationServer extends CloudflareWebSocketHibernationServer {
  private singletonServices: SingletonServices | undefined

  protected async getParams() {
    if (!this.singletonServices) {
      this.singletonServices = await setupServices(this.env)
    }
    return {
      singletonServices: this.singletonServices,
      createWireServices,
    }
  }
}

export default {
  fetch,
  durable_objects: {
    WEBSOCKET_HIBERNATION_SERVER: WebSocketHibernationServer,
  },
}
