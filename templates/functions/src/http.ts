import { addHTTPRoute, pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export const helloWorld = pikkuSessionlessFunc<void>(async () => {
  return 'Hello world!'
})

addHTTPRoute({
  auth: false,
  method: 'get',
  route: '/hello-world',
  func: helloWorld,
  tags: ['hello'],
})
