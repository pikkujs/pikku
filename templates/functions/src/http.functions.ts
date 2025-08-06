import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export const welcomeToPikku = pikkuSessionlessFunc<void>(async () => {
  return 'Welcome to Pikku! This is a simple HTTP function that serves as a starting point for your Pikku application.'
})

export const helloWorld = pikkuSessionlessFunc<void>(async () => {
  return 'Hello world!'
})
