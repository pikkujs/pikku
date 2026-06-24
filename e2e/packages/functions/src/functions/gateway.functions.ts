import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import type {
  GatewayInboundMessage,
  GatewayOutboundMessage,
} from '@pikku/core/gateway'

export const e2eGatewayResponder = pikkuSessionlessFunc<
  GatewayInboundMessage,
  GatewayOutboundMessage
>({
  title: 'E2E Gateway Responder',
  description: 'Responds to the e2e webhook gateway fixture',
  tags: ['e2e', 'gateway'],
  expose: true,
  func: async (_services, message) => {
    return { text: `E2E gateway received: ${message.text}` }
  },
})
