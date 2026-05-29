import { pikkuSessionlessFunc } from '#pikku'

export const welcomeToPikku = pikkuSessionlessFunc<void>({
  expose: true,
  func: async () => {
    return 'Welcome to Pikku! This is a simple HTTP function that serves as a starting point for your Pikku application.'
  },
})

export const helloWorld = pikkuSessionlessFunc<void>({
  expose: true,
  func: async () => {
    return 'Hello world!'
  },
})
