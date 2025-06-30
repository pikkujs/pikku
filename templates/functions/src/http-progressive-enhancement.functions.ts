import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

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
