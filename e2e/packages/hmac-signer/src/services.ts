import { pikkuAddonWireServices } from '#pikku'
import { ForbiddenError } from '@pikku/core/errors'
import { HmacSignerService } from './hmac-signer.service.js'

export const createWireServices = pikkuAddonWireServices(
  async (_services, wire) => {
    const cred = await wire.getCredential?.<{ secretKey: string }>('hmac-key')
    if (!cred?.secretKey) {
      throw new ForbiddenError('Missing hmac-key credential')
    }
    return {
      hmacSigner: new HmacSignerService(cred.secretKey),
    }
  }
)
