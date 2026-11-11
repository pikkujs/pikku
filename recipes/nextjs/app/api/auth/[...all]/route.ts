import { toNextJsAuthHandler } from '@pikku/next'
import { auth } from '../../../../../functions/src/auth.js'
import { createSingletonServices } from '../../../../../functions/src/services.js'
import { createConfig } from '../../../../../functions/src/config.js'

export const { GET, POST, PATCH, PUT, DELETE } = toNextJsAuthHandler(
  auth,
  createConfig,
  createSingletonServices
)
