import { wireChannel } from './pikku-types.gen.js'
import {
  onConnect,
  onDisconnect,
  onMessage,
} from './functions/chat-handlers.function.js'

/**
 * Basic channel wiring
 * WebSocket endpoint at /chat
 *
 * The functions (onConnect, onDisconnect, onMessage) are defined in
 * ./functions/chat-handlers.function.ts using:
 * - pikkuChannelConnectionFunc
 * - pikkuChannelDisconnectionFunc
 * - pikkuChannelFunc
 */
wireChannel({
  // Unique channel name - used for typed client generation
  name: 'chat',

  // HTTP route that upgrades to WebSocket
  // e.g., ws://localhost:3000/chat?room=general
  route: '/chat',

  // Lifecycle handlers
  onConnect,
  onDisconnect,
  onMessage,

  // Require authentication by default
  auth: true,

  // Optional tags for deployment filtering
  tags: ['chat', 'realtime'],
})
