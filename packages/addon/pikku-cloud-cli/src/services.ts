import { pikkuAddonServices } from '#pikku/addon/setup'
import { createJoseKeyCrypto } from '@pikku/jose/keys'

// The only place that names the jose provider: functions take `keyCrypto` from services.
export const createSingletonServices = pikkuAddonServices(async () => ({
  keyCrypto: createJoseKeyCrypto(),
}))
