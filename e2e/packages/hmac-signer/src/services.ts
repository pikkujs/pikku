import { pikkuAddonWireServices } from '#pikku'
import { HmacSignerService } from './hmac-signer.service.js'

export const createWireServices = pikkuAddonWireServices(
  async (_services, wire) => {
    const cred = await wire.getCredential?.<{ secretKey: string }>('hmac-key')
    if (!cred?.secretKey) {
      throw new Error('Missing hmac-key credential')
    }
    return {
      hmacSigner: new HmacSignerService(cred.secretKey),
    }
  }
)
