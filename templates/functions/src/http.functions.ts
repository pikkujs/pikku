import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * Welcome endpoint for Pikku application
 *
 * @summary Returns a welcome message introducing users to Pikku
 * @description This is a simple HTTP function that serves as the entry point
 * for a Pikku application. It demonstrates the basic structure of a sessionless
 * Pikku function and returns a friendly welcome message.
 */
export const welcomeToPikku = pikkuSessionlessFunc<void>(async () => {
  return 'Welcome to Pikku! This is a simple HTTP function that serves as a starting point for your Pikku application.'
})

/**
 * Hello World endpoint
 *
 * @summary Returns a classic "Hello world!" message
 * @description A minimal HTTP function demonstrating the simplest possible
 * Pikku endpoint implementation. Returns a basic greeting message.
 */
export const helloWorld = pikkuSessionlessFunc<void>(async () => {
  return 'Hello world!'
})
