import {
  addRoute,
  pikkuFunc,
  pikkuSessionlessFunc
} from '../.pikku/pikku-types.gen.js'

export const helloWorld = pikkuSessionlessFunc(async () => {
  return 'Hello world!'
})

export const helloWorld2 = pikkuFunc<{ same: string }>(async () => {
  return 'Hello world!' as const
})

addRoute({
  auth: false,
  method: 'get',
  route: '/hello-world',
  func: helloWorld,
  tags: ['hello'],
})
