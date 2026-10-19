/**
 * Client-side usage examples for the shop, typed by the generated clients.
 */

import { pikkuFetch } from '#pikku/pikku-fetch.gen.js'
import { pikkuRPC } from '#pikku/pikku-rpc.gen.js'

// @snippet start fetchClient
export async function shopApiExamples() {
  pikkuFetch.setServerUrl('http://localhost:4000')

  const categories = await pikkuFetch.get('/categories')
  const item = await pikkuFetch.get('/items/:itemId', { itemId: 'item-001' })

  pikkuFetch.setAuthorizationJWT('user-jwt-token')
  const order = await pikkuFetch.post('/orders', {
    basketId: 'basket-123',
    shippingAddress: {
      line1: '1 High St',
      city: 'London',
      postcode: 'SW1A 1AA',
      country: 'GB',
    },
  })

  return { categories, item, order }
}
// @snippet end fetchClient

// @snippet start rpcClient
export async function rpcExamples() {
  pikkuRPC.setServerUrl('http://localhost:4000')

  const availability = await pikkuRPC.invoke('checkItemAvailability', {
    itemId: 'item-001',
  })
  console.log(availability.available, availability.stock)

  pikkuRPC.setAuthorizationJWT('user-jwt-token')
  const basket = await pikkuRPC.invoke('getBasket', {
    sessionId: 'session-123',
  })
  return { availability, basket }
}
// @snippet end rpcClient

// @snippet start aiAgentInvokeClient
export async function agentExamples() {
  pikkuRPC.setServerUrl('http://localhost:4000')
  pikkuRPC.setAuthorizationJWT('user-jwt-token')

  const result = await pikkuRPC.agent.run('shopAssistant', {
    message: 'What USB hubs do you have under £50?',
    threadId: 'thread-123',
    resourceId: 'user-456',
  })
  console.log(result.result, result.usage)
  return result
}
// @snippet end aiAgentInvokeClient

// @snippet start aiAgentStreamClient
export async function agentStreamExamples() {
  pikkuRPC.setServerUrl('http://localhost:4000')
  pikkuRPC.setAuthorizationJWT('user-jwt-token')

  const stream = await pikkuRPC.agent.stream('shopAssistant', {
    message: 'Add the cheapest USB hub to my basket',
    threadId: 'thread-123',
    resourceId: 'user-456',
  })
  return stream
}
// @snippet end aiAgentStreamClient
