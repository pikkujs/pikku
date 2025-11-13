import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export const progressiveEnhancementExample = pikkuSessionlessFunc<
  void,
  { state: 'initial' | 'pending' | 'done' }
>(async ({}, { channel }) => {
  if (channel) {
    setTimeout(() => {
      channel?.send({ state: 'pending' })
    }, 2500)
    setTimeout(() => {
      channel?.send({ state: 'done' })
    }, 5000)
  }
  return { state: 'initial' }
})
