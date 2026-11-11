import { pikkuSessionlessFunc } from '#pikku/function'

export const progressiveEnhancementExample = pikkuSessionlessFunc<
  void,
  { state: 'initial' | 'pending' | 'done' }
>(async ({}, _, { channel }) => {
  if (channel) {
    setTimeout(() => {
      void channel?.send({ state: 'pending' })
    }, 2500)
    setTimeout(() => {
      void channel?.send({ state: 'done' })
    }, 5000)
  }
  return { state: 'initial' }
})
