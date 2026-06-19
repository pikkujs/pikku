import { toNextJsAuthHandler } from '@pikku/next'
import { auth } from '../../../../../functions/src/auth.js'
import {
  createConfig,
  createSingletonServices,
} from '../../../../../functions/src/services.js'

export const { GET, POST, PATCH, PUT, DELETE } = toNextJsAuthHandler(
  auth,
  createConfig,
  createSingletonServices
)
