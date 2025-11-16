import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * Progressive enhancement example with real-time updates
 *
 * @summary Demonstrates progressive enhancement pattern using channels for real-time updates
 * @description This function showcases how to implement progressive enhancement in Pikku.
 * It returns an initial state immediately, then sends progressive updates through a channel
 * connection if available. The state transitions from 'initial' → 'pending' (after 2.5s) →
 * 'done' (after 5s). This pattern allows the same endpoint to work both as a standard HTTP
 * request and as a streaming response.
 */
export const progressiveEnhancementExample = pikkuSessionlessFunc<
  void,
  { state: 'initial' | 'pending' | 'done' }
>(async (services) => {
  if (services?.channel) {
    setTimeout(() => {
      services.channel?.send({ state: 'pending' })
    }, 2500)
    setTimeout(() => {
      services.channel?.send({ state: 'done' })
    }, 5000)
  }
  return { state: 'initial' }
})
