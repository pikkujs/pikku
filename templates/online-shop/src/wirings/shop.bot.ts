import {
  pikkuAgent,
  agent,
  agentStream,
} from '#pikku/agent/pikku-agent-types.gen.js'
import { wireHTTP } from '#pikku/http'
import {
  countAgentCharacters,
  traceAgentStream,
} from '../middleware/agent.middleware.js'
import { listCategories } from '../functions/categories/list-categories.function.js'
import { listItems } from '../functions/items/list-items.function.js'
import { getItem } from '../functions/items/get-item.function.js'
import { getBasket } from '../functions/basket/get-basket.function.js'
import { addToBasket } from '../functions/basket/add-to-basket.function.js'
import { removeFromBasket } from '../functions/basket/remove-from-basket.function.js'
import { listOrders } from '../functions/orders/list-orders.function.js'
import { getOrder } from '../functions/orders/get-order.function.js'
import { cancelOrder } from '../functions/orders/cancel-order.function.js'

// @snippet start aiAgent
export const shopAssistant = pikkuAgent({
  name: 'shop-assistant',
  description: 'Helps customers browse the catalogue and manage their basket.',
  goal: 'Help users find products, manage their basket, and answer questions about shop items.',
  model: 'openai/gpt-4o-mini',
  tools: [
    listCategories,
    listItems,
    getItem,
    getBasket,
    addToBasket,
    removeFromBasket,
  ],
  memory: { storage: 'aiStorage', lastMessages: 20 },
  maxSteps: 10,
  channelMiddleware: [traceAgentStream],
  agentMiddleware: [countAgentCharacters],
})
// @snippet end aiAgent

// @snippet start aiAgentInvoke
// Wire the agent as a standard HTTP endpoint — non-streaming, returns the full response.
wireHTTP({
  method: 'post',
  route: '/agents/shop',
  func: agent('shopAssistant'),
  auth: true,
})
// @snippet end aiAgentInvoke

// @snippet start aiAgentStream
// Streaming endpoint — sends text-delta, tool-call, and usage events as they arrive.
wireHTTP({
  method: 'post',
  route: '/agents/shop/stream',
  func: agentStream('shopAssistant'),
  auth: true,
})
// @snippet end aiAgentStream

export const opsAgent = pikkuAgent({
  name: 'ops-agent',
  description: 'Manages orders; automates repeat ops tasks.',
  goal: 'Manage orders and automate recurring ops as durable workflows.',
  model: 'openai/gpt-4o-mini',
  tools: [listOrders, getOrder, cancelOrder],
  maxSteps: 8,
})

// A focused checkout assistant — delegates browsing to the shop assistant.
export const checkoutAssistant = pikkuAgent({
  name: 'checkout-assistant',
  description: 'Guides authenticated users through checkout.',
  goal: 'Help users review their basket and complete their purchase. Delegate product questions to the shop assistant.',
  model: 'openai/gpt-4o-mini',
  tools: [getBasket, getItem],
  agents: [shopAssistant],
  maxSteps: 5,
})

// The other two agents, wired the same way. They existed as declarations with no
// route and no screen — an ops agent that could cancel orders and a checkout
// assistant that delegates to the shop assistant, neither reachable by anything.
wireHTTP({
  method: 'post',
  route: '/agents/ops',
  func: agent('opsAgent'),
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/agents/checkout',
  func: agent('checkoutAssistant'),
  auth: true,
})
