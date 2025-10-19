import { wireChannel } from './pikku-types.gen.js'
import {
  onConnect,
  onDisconnect,
  authenticate,
  subscribe,
  unsubscribe,
  defaultHandler,
} from './functions/events-handlers.function.js'

/**
 * Channel with action routing (message multiplexing)
 *
 * This channel expects messages with an "action" property:
 * { "action": "authenticate", "apiKey": "..." }
 * { "action": "subscribe", "topic": "updates" }
 * { "action": "unsubscribe", "topic": "updates" }
 *
 * The functions are defined in ./functions/events-handlers.function.ts
 */
wireChannel({
  name: 'events',
  route: '/',

  // Lifecycle handlers
  onConnect,
  onDisconnect,

  // Fallback message handler if no action matches
  onMessage: defaultHandler,

  // Action routing table
  // Messages must include { action: "authenticate" | "subscribe" | "unsubscribe", ... }
  onMessageWiring: {
    action: {
      authenticate: { func: authenticate, auth: false }, // No auth required for authenticate action
      subscribe: { func: subscribe }, // Inherits auth: true
      unsubscribe, // Shorthand reference, inherits auth: true
    },
  },

  // Require authentication by default (except for authenticate action)
  auth: true,
  tags: ['events', 'pubsub'],
})
