/**
 * HTTP wirings for Zod-based functions
 */
import { wireHTTP } from '../.pikku/pikku-types.gen.js'
import {
  greetWithZod,
  calculateWithZod,
  updateProfileWithZod,
} from './zod.functions.js'

// Public endpoint - no auth required
wireHTTP({
  method: 'post',
  route: '/zod/greet',
  func: greetWithZod,
  auth: false,
  tags: ['zod-example'],
})

// Public endpoint - no auth required
wireHTTP({
  method: 'post',
  route: '/zod/calculate',
  func: calculateWithZod,
  auth: false,
  tags: ['zod-example'],
})

// Protected endpoint - requires authentication
wireHTTP({
  method: 'post',
  route: '/zod/profile',
  func: updateProfileWithZod,
  auth: true,
  tags: ['zod-example'],
})
