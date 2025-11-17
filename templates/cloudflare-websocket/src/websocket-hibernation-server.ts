import { CloudflareWebSocketHibernationServer } from '@pikku/cloudflare'
import { setupServices } from './setup-services.js'
import { CloudflareEventHubService } from '@pikku/cloudflare'
import { SingletonServices } from '../../functions/types/application-types.d.js'
import { createInteractionServices } from '../../functions/src/services.js'

export class WebSocketHibernationServer extends CloudflareWebSocketHibernationServer {
  private singletonServices: SingletonServices | undefined

  protected async getParams() {
    if (!this.singletonServices) {
      this.singletonServices = await setupServices(this.env)
      this.singletonServices.eventHub = new CloudflareEventHubService(
        this.singletonServices.logger,
        this.ctx
      )
    }
    return {
      singletonServices: this.singletonServices,
      createInteractionServices,
    }
  }
}

export default {
  fetch,
  durable_objects: {
    WEBSOCKET_HIBERNATION_SERVER: WebSocketHibernationServer,
  },
}
