import { wireGateway } from '@pikku/core/gateway'
import type {
  GatewayAdapter,
  GatewayInboundMessage,
  GatewayOutboundMessage,
} from '@pikku/core/gateway'
import { e2eGatewayResponder } from '../functions/gateway.functions.js'

const e2eGatewayAdapter: GatewayAdapter = {
  name: 'e2e-webhook',
  parse: (data: unknown): GatewayInboundMessage | null => {
    if (!data || typeof data !== 'object') {
      return null
    }

    const record = data as Record<string, unknown>
    return {
      senderId:
        typeof record.senderId === 'string' ? record.senderId : 'e2e-user',
      text: typeof record.text === 'string' ? record.text : '',
      raw: data,
    }
  },
  send: async (_senderId: string, _message: GatewayOutboundMessage) => {},
  init: async () => {},
  close: async () => {},
}

wireGateway({
  name: 'e2e-webhook',
  type: 'webhook',
  route: '/webhooks/e2e-gateway',
  platform: 'e2e-webhook',
  adapter: e2eGatewayAdapter,
  func: e2eGatewayResponder,
  auth: false,
  tags: ['e2e', 'gateway'],
  summary: 'E2E webhook gateway',
  description: 'Webhook gateway fixture used by console e2e tests',
})
