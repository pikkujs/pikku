import { pikkuFunc, pikkuSubscribeFunc, wireChannel, wireHTTP } from './core.js'

type OrderTopic = `order:${string}`

// A template literal topic wired as an SSE route: a session is required.
export const orderEvents = pikkuSubscribeFunc<{ orderId: string }, `order:${string}`>({
  scopes: ['orders:read'],
  func: async (_services, data) => `order:${data.orderId}`,
})
wireHTTP({ method: 'get', route: '/orders/events', func: orderEvents, sse: true })

// The topic shape may be an alias.
export const aliasedEvents = pikkuSubscribeFunc<{ orderId: string }, OrderTopic>({
  func: async (_services, data) => `order:${data.orderId}` as OrderTopic,
})
wireHTTP({ method: 'get', route: '/orders/aliased', func: aliasedEvents, sse: true })

// A literal topic wired with auth: false is public.
export const newsEvents = pikkuSubscribeFunc<void, 'news'>({
  func: async () => 'news',
})
wireHTTP({ method: 'get', route: '/news', func: newsEvents, sse: true, auth: false })

// A bare string says nothing about which topics exist.
export const bareEvents = pikkuSubscribeFunc<void, string>({
  func: async () => 'anything',
})
wireHTTP({ method: 'get', route: '/bare', func: bareEvents, sse: true })

// A subscribe function is wired as a stream, nothing else.
export const plainGetEvents = pikkuSubscribeFunc<void, 'plain'>({
  func: async () => 'plain',
})
wireHTTP({ method: 'get', route: '/plain', func: plainGetEvents })

export const connectEvents = pikkuSubscribeFunc<void, 'connect'>({
  func: async () => 'connect',
})
export const messageEvents = pikkuSubscribeFunc<{ id: string }, `board:${string}`>({
  func: async (_services, data) => `board:${data.id}`,
})
export const ordinary = pikkuFunc<void, void>({ func: async () => {} })
wireChannel({
  name: 'live',
  route: '/live',
  onConnect: connectEvents,
  onMessageWiring: { action: { subscribeToBoard: messageEvents, ordinary } },
})

// Written inline in its wiring, it is still a subscribe function.
wireHTTP({
  method: 'get',
  route: '/inline',
  sse: true,
  func: pikkuSubscribeFunc<void, 'inline'>({ func: async () => 'inline' }),
})
