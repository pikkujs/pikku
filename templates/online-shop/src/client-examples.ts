/**
 * Client-side usage examples for the shop, typed by the generated clients.
 */

import { pikkuFetch } from '@sdk/api/pikku-fetch.gen.js'
import { pikkuRPC } from '@sdk/api/pikku-rpc.gen.js'

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
export async function agentStreamExamples(signal?: AbortSignal) {
  pikkuRPC.setServerUrl('http://localhost:4000')
  pikkuRPC.setAuthorizationJWT('user-jwt-token')

  let reply = ''
  // A RUN_ERROR from the server throws here; aborting `signal` ends the request.
  for await (const event of pikkuRPC.agent.stream(
    'shopAssistant',
    {
      message: 'Add the cheapest USB hub to my basket',
      threadId: 'thread-123',
      resourceId: 'user-456',
    },
    { signal }
  )) {
    if (event.type === 'TEXT_MESSAGE_CONTENT') {
      reply += event.delta
    }
    if (event.type === 'CUSTOM' && event.name === 'pikku:approval-request') {
      const { runId, toolCallId } = event.value
      await pikkuRPC.agent.approve('shopAssistant', {
        runId,
        approvals: [{ toolCallId, approved: true }],
      })
    }
    if (event.type === 'RUN_FINISHED') {
      console.log(event.usage)
    }
  }
  return reply
}
// @snippet end aiAgentStreamClient

// @snippet start contentBrowserUpload
export async function uploadDamagePhoto(
  orderId: string,
  photo: File,
  contentType: 'image/jpeg' | 'image/png' | 'image/webp'
) {
  pikkuFetch.setServerUrl('http://localhost:4000')
  pikkuFetch.setAuthorizationJWT('user-jwt-token')

  const upload = await pikkuFetch.post('/orders/:orderId/damage-photo/upload', {
    orderId,
    fileName: photo.name,
    contentType,
  })

  // The file itself is the body, sent without the session: the URL is the
  // grant. `uploadFile` resolves a relative URL against the server URL, and
  // throws if the upload fails, so the key is only saved once the bytes landed.
  const { fileKey } = await pikkuFetch.uploadFile(upload, photo, contentType)

  await pikkuFetch.post('/orders/:orderId/damage-photo', {
    orderId,
    fileKey,
    contentType,
  })

  // A fresh URL per view: it expires, the key does not. <img src={url} />
  const { url } = await pikkuFetch.get('/orders/:orderId/damage-photo', {
    orderId,
  })
  // `url` may be relative to the API server; absolute URLs pass through.
  return new URL(url, serverUrl).toString()
}
// @snippet end contentBrowserUpload
