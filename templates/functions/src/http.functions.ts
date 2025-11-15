import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * @summary Welcome endpoint for new users
 * @description Returns a personalized welcome message that serves as the starting point for exploring the Pikku application
 */
export const welcomeToPikku = pikkuSessionlessFunc<void>(async () => {
  return 'Welcome to Pikku! This is a simple HTTP function that serves as a starting point for your Pikku application.'
})

/**
 * @summary Simple hello world endpoint
 * @description Basic HTTP endpoint that returns a hello world message for testing connectivity
 */
export const helloWorld = pikkuSessionlessFunc<void>(async () => {
  return 'Hello world!'
})
