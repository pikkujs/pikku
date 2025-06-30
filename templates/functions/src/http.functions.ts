import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export const helloWorld = pikkuSessionlessFunc<void>(async () => {
  return 'Hello world!'
})
