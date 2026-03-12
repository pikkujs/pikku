import { pikkuAddonWireServices } from '#pikku'
import { HmacSignerService } from './hmac-signer.service.js'

export const createWireServices = pikkuAddonWireServices(
  async (_services, wire) => {
    const credentials = wire.getCredentials()
    const hmacCred = credentials['hmac-key'] as
      | { secretKey: string }
      | undefined
    if (!hmacCred?.secretKey) {
      throw new Error('Missing hmac-key credential')
    }
    return {
      hmacSigner: new HmacSignerService(hmacCred.secretKey),
    }
  }
)
