import { wireChannel, defineChannelRoutes } from '#pikku'
import {
  onConnect,
  onDisconnect,
  subscribe,
  unsubscribe,
} from './channel.functions.js'

// Define channel message routes externally using defineChannelRoutes
export const subscriptionRoutes = defineChannelRoutes({
  subscribe: {
    func: subscribe,
  },
  unsubscribe,
})

// Wire a channel that uses the externally-defined routes as a wiring value
wireChannel({
  name: 'external-events',
  route: '/external',
  onConnect,
  onDisconnect,
  auth: false,
  onMessageWiring: {
    // Use externally-defined routes as the value for a channel key
    subscription: subscriptionRoutes,
  },
  tags: ['external-events'],
})
