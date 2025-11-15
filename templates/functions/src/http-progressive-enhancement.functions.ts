import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * @summary Progressive enhancement demo
 * @description Demonstrates progressive enhancement by returning initial state immediately and streaming subsequent state changes through channel
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
