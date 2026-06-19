import { toNextJsAuthHandler } from '@pikku/next'
import { auth } from '../../../../src/auth.js'
import {
  createConfig,
  createSingletonServices,
} from '../../../../src/services.js'

export const { GET, POST, PATCH, PUT, DELETE } = toNextJsAuthHandler(
  auth,
  createConfig,
  createSingletonServices
)
